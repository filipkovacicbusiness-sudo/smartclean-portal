-- ════════════════════════════════════════════════════════════════════════
--  71_dokumenti_varnost.sql — Dokumenti: dostop, zaklep in mape v bazi
--
--  Pregled 21. 10. 2026:
--  1) Pravilo documents_staff (in dokumenti_staff_* na shrambi) je preverjalo
--     profiles.is_staff brez »active« — izklopljen član osebja je dokumente še
--     lahko bral, nalagal in brisal. Ostanejo le pravila z app.is_staff()
--     (aktiven račun) + lastnik po prijavnem žetonu.
--  2) Zaklep mape je veljal samo v portalu. Zdaj ga preverja baza:
--     zaklenjene mape in vsebine v njej ni mogoče izbrisati, premakniti ali
--     preimenovati (dovoljeno je le odkleniti mapo in obnoviti iz koša).
--  3) Preimenovanje/premik mape popravi poti vseh podrejenih v ENI transakciji
--     (tudi tistih v košu) — prej po en zahtevek na element, ob napaki so
--     elementi »izginili«.
--  4) Imena: brez »/« in »\«, ne samo pike; v isti mapi ni dveh enakih imen.
--  5) Bucket »dokumenti«: zasebno, največ 25 MB na datoteko.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. dostop ───────────────────────────────────────────────────────────
drop policy if exists documents_staff on public.documents;
drop policy if exists documents_lastnik on public.documents;
create policy documents_lastnik on public.documents to authenticated
  using (app.je_lastnik()) with check (app.je_lastnik());

drop policy if exists dokumenti_staff_read on storage.objects;
drop policy if exists dokumenti_staff_write on storage.objects;
drop policy if exists dokumenti_staff_delete on storage.objects;
drop policy if exists dokumenti_select on storage.objects;
drop policy if exists dokumenti_insert on storage.objects;
drop policy if exists dokumenti_delete on storage.objects;
create policy dokumenti_select on storage.objects for select to authenticated
  using (bucket_id = 'dokumenti' and (app.is_staff() or app.je_lastnik()));
create policy dokumenti_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumenti' and (app.is_staff() or app.je_lastnik()));
create policy dokumenti_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dokumenti' and (app.is_staff() or app.je_lastnik()));

update storage.buckets set public = false, file_size_limit = 26214400 where id = 'dokumenti';

-- ── 2. pot mape in zaklep ───────────────────────────────────────────────
create or replace function app.dok_pot(p_mapa text, p_ime text)
returns text language sql immutable as $$
  select case when coalesce(p_mapa, '') = '' then p_ime else p_mapa || '/' || p_ime end
$$;

-- je element (ali katera od njegovih nadrejenih map) zaklenjen?
create or replace function app.dok_zaklenjeno(p_id uuid, p_mapa text, p_je_mapa boolean, p_zakl boolean)
returns boolean language sql stable security definer set search_path to 'public', 'app' as $$
  select (coalesce(p_je_mapa, false) and coalesce(p_zakl, false)) or exists (
    select 1 from public.documents f
    where f.je_mapa and f.zaklenjeno and f.deleted_at is null and f.id <> p_id
      and (coalesce(p_mapa, '') = app.dok_pot(f.mapa, f.ime)
           or left(coalesce(p_mapa, ''), length(app.dok_pot(f.mapa, f.ime)) + 1) = app.dok_pot(f.mapa, f.ime) || '/'))
$$;
revoke all on function app.dok_zaklenjeno(uuid, text, boolean, boolean) from public;
grant execute on function app.dok_zaklenjeno(uuid, text, boolean, boolean) to authenticated;   -- kliče ga sprožilec (z uporabnikovimi pravicami)

create or replace function app.dok_zaklep()
returns trigger language plpgsql set search_path to 'public', 'app' as $$
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;   -- service_role / SQL Editor
  if TG_OP = 'DELETE' then
    if OLD.deleted_at is not null then return OLD; end if;          -- dokončno brisanje iz koša
    if app.dok_zaklenjeno(OLD.id, OLD.mapa, OLD.je_mapa, OLD.zaklenjeno) then
      raise exception 'Mapa je zaklenjena.' using errcode = 'P0001', hint = 'zaklenjeno';
    end if;
    return OLD;
  end if;
  -- premik nadrejene mape (dok_premakni) prepiše poti podrejenih: to je dovoljeno
  if coalesce(current_setting('app.dok_premik', true), '') = '1'
     and (to_jsonb(NEW) - 'mapa') = (to_jsonb(OLD) - 'mapa') then
    return NEW;
  end if;
  -- obnova iz koša je dovoljena
  if OLD.deleted_at is not null and NEW.deleted_at is null
     and (to_jsonb(NEW) - 'deleted_at') = (to_jsonb(OLD) - 'deleted_at') then
    return NEW;
  end if;
  if app.dok_zaklenjeno(OLD.id, OLD.mapa, OLD.je_mapa, OLD.zaklenjeno)
     and (to_jsonb(NEW) - 'zaklenjeno') is distinct from (to_jsonb(OLD) - 'zaklenjeno') then
    raise exception 'Mapa je zaklenjena.' using errcode = 'P0001', hint = 'zaklenjeno';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_dok_zaklep on public.documents;
create trigger trg_dok_zaklep before update or delete on public.documents
  for each row execute function app.dok_zaklep();

-- ── 3. premik / preimenovanje (ena transakcija, tudi podrejeni v košu) ──
create or replace function public.dok_premakni(p_id uuid, p_mapa text, p_ime text)
returns void language plpgsql security invoker set search_path to 'public', 'app' as $$
declare
  r public.documents;
  star text; nov text;
begin
  select * into r from public.documents where id = p_id for update;
  if not found then raise exception 'Elementa ni.' using errcode = 'P0002'; end if;
  p_ime := btrim(coalesce(p_ime, ''));
  p_mapa := coalesce(p_mapa, '');
  if p_ime = '' or p_ime ~ '[/\\]' or p_ime ~ '^\.+$' then
    raise exception 'Neveljavno ime.' using errcode = '22023';
  end if;
  if p_mapa <> '' and not exists (select 1 from public.documents f where f.je_mapa and f.deleted_at is null and app.dok_pot(f.mapa, f.ime) = p_mapa) then
    raise exception 'Ciljne mape ni.' using errcode = 'P0002';
  end if;
  if r.je_mapa then
    star := app.dok_pot(r.mapa, r.ime); nov := app.dok_pot(p_mapa, p_ime);
    if p_mapa = star or left(p_mapa, length(star) + 1) = star || '/' then
      raise exception 'Mape ni mogoče premakniti vase.' using errcode = '22023';
    end if;
  end if;
  update public.documents set mapa = p_mapa, ime = p_ime where id = p_id;
  if r.je_mapa and star <> nov then
    perform set_config('app.dok_premik', '1', true);
    update public.documents set mapa = nov || substr(mapa, length(star) + 1)
     where id <> p_id and (mapa = star or left(mapa, length(star) + 1) = star || '/');
    perform set_config('app.dok_premik', '', true);
  end if;
end $$;
revoke all on function public.dok_premakni(uuid, text, text) from public, anon;
grant execute on function public.dok_premakni(uuid, text, text) to authenticated;

-- ── 4. imena ────────────────────────────────────────────────────────────
alter table public.documents drop constraint if exists documents_ime_veljavno;
alter table public.documents add constraint documents_ime_veljavno
  check (ime is null or (ime !~ '[/\\]' and btrim(ime) !~ '^\.*$' and length(ime) <= 200)) not valid;

do $$
begin
  if not exists (
    select 1 from public.documents where deleted_at is null and ime is not null
    group by coalesce(mapa, ''), lower(ime), je_mapa having count(*) > 1
  ) then
    execute 'create unique index if not exists documents_ime_v_mapi on public.documents (coalesce(mapa, ''''), lower(ime), je_mapa) where deleted_at is null and ime is not null';
  else
    raise notice 'documents: podvojena imena v isti mapi — indeks ni ustvarjen';
  end if;
end $$;
