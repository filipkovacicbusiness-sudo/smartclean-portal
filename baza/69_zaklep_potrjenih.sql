-- ════════════════════════════════════════════════════════════════════════
--  69_zaklep_potrjenih.sql — potrjen spremni list zaklene baza sama
--
--  app_shrani_list (65) potrjenega lista ne spremeni, neposreden zapis prek
--  REST (npr. starejša različica aplikacije ali kateri koli odjemalec) pa ga je
--  še lahko. Potrjeni listi so podlaga za fakture.
--
--  Zdaj:
--  · Potrjenemu listu (ki ni v košu) se vsebina ne more spremeniti; dovoljeno je
--    le odpotrditi, premakniti v koš, zapisek osebja, interna opomba in dnevnik
--    popravkov. Postavk potrjenega lista ni mogoče dodati, spremeniti ali
--    odstraniti.
--  · Izjema je app_shrani_list(..., p_tudi_potrjen := true) — popravek osebja
--    v portalu (urejanje, reševanje prekrivanj, uvoz). p_tudi_potrjen sme
--    uporabiti le osebje (ne naprava/tablica).
--  · Napaka ima hint »potrjen« (kot pri app_shrani_list) — aplikacija jo pozna.
--  · Brez prijavljenega uporabnika (SQL Editor, service_role) zaklep ne velja.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create or replace function app.zaklep_potrjenega()
returns trigger
language plpgsql
set search_path to 'public', 'app'
as $$
declare
  -- »number« je izračunan stolpec: v sprožilcu BEFORE je NEW.number še prazen (številko varujeta doc_year/doc_seq)
  prosto text[] := array['potrjeno', 'deleted_at', 'opomba', 'opomba_avtor', 'opomba_at',
                         'opomba_evidenca', 'popravil', 'popravljeno_at', 'popravki', 'number'];
begin
  if auth.uid() is not null
     and OLD.potrjeno and NEW.potrjeno and OLD.deleted_at is null
     and coalesce(current_setting('app.potrjen_dovoli', true), '') <> '1'
     and (to_jsonb(NEW) - prosto) is distinct from (to_jsonb(OLD) - prosto) then
    raise exception 'spremni list je potrjen' using errcode = 'P0001', hint = 'potrjen';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_zaklep_potrjenega on public.delivery_notes;
create trigger trg_zaklep_potrjenega
  before update on public.delivery_notes
  for each row execute function app.zaklep_potrjenega();

create or replace function app.zaklep_postavk()
returns trigger
language plpgsql
set search_path to 'public', 'app'
as $$
declare
  zaklenjen boolean;
begin
  if auth.uid() is null or coalesce(current_setting('app.potrjen_dovoli', true), '') = '1' then
    return coalesce(NEW, OLD);
  end if;
  select exists (
    select 1 from public.delivery_notes d
    where d.potrjeno and d.deleted_at is null
      and d.id in (case when TG_OP = 'DELETE' then OLD.note_id else NEW.note_id end,
                   case when TG_OP = 'UPDATE' then OLD.note_id end)
  ) into zaklenjen;
  if zaklenjen then
    raise exception 'spremni list je potrjen' using errcode = 'P0001', hint = 'potrjen';
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_zaklep_postavk on public.delivery_note_items;
create trigger trg_zaklep_postavk
  before insert or update or delete on public.delivery_note_items
  for each row execute function app.zaklep_postavk();

-- ── app_shrani_list: p_tudi_potrjen odpre zaklep (le za osebje) ─────────
create or replace function public.app_shrani_list(
  p_id uuid,
  p_list jsonb,
  p_postavke jsonb,
  p_tudi_potrjen boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_potrjeno boolean;
  r public.delivery_notes;
begin
  p_list := coalesce(p_list, '{}'::jsonb);
  r := jsonb_populate_record(null::public.delivery_notes, p_list);

  if coalesce(p_tudi_potrjen, false) then
    if not (app.is_staff() or app.je_lastnik() or exists (
              select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin)) then
      raise exception 'Potrjen spremni list lahko popravi le osebje.' using errcode = '42501';
    end if;
    perform set_config('app.potrjen_dovoli', '1', true);
  end if;

  if v_id is null and coalesce(r.legacy_id, '') <> '' then
    select id into v_id from public.delivery_notes where legacy_id = r.legacy_id;
  end if;

  if v_id is null then
    insert into public.delivery_notes (
      org_id, doc_year, doc_seq, doc_date, issued_name, weight_kg, transport, source,
      legacy_id, popravil, popravljeno_at, popravki, opomba_stranka, opomba_evidenca)
    values (
      r.org_id, r.doc_year, r.doc_seq, r.doc_date, r.issued_name, r.weight_kg,
      coalesce(r.transport, 'redni'), coalesce(r.source, 'portal'),
      r.legacy_id, r.popravil, r.popravljeno_at, r.popravki, r.opomba_stranka, r.opomba_evidenca)
    returning id into v_id;
  else
    select potrjeno into v_potrjeno from public.delivery_notes where id = v_id for update;
    if not found then
      raise exception 'spremnega lista % ni', v_id using errcode = 'P0002';
    end if;
    if v_potrjeno and not coalesce(p_tudi_potrjen, false) then
      raise exception 'spremni list je potrjen' using errcode = 'P0001', hint = 'potrjen';
    end if;
    update public.delivery_notes d set
      org_id          = case when p_list ? 'org_id'          then r.org_id          else d.org_id end,
      doc_year        = case when p_list ? 'doc_year'        then r.doc_year        else d.doc_year end,
      doc_seq         = case when p_list ? 'doc_seq'         then r.doc_seq         else d.doc_seq end,
      doc_date        = case when p_list ? 'doc_date'        then r.doc_date        else d.doc_date end,
      issued_name     = case when p_list ? 'issued_name'     then r.issued_name     else d.issued_name end,
      weight_kg       = case when p_list ? 'weight_kg'       then r.weight_kg       else d.weight_kg end,
      transport       = case when p_list ? 'transport'       then coalesce(r.transport, 'redni') else d.transport end,
      legacy_id       = case when p_list ? 'legacy_id'       then r.legacy_id       else d.legacy_id end,
      popravil        = case when p_list ? 'popravil'        then r.popravil        else d.popravil end,
      popravljeno_at  = case when p_list ? 'popravljeno_at'  then r.popravljeno_at  else d.popravljeno_at end,
      popravki        = case when p_list ? 'popravki'        then r.popravki        else d.popravki end,
      opomba_stranka  = case when p_list ? 'opomba_stranka'  then r.opomba_stranka  else d.opomba_stranka end,
      opomba_evidenca = case when p_list ? 'opomba_evidenca' then r.opomba_evidenca else d.opomba_evidenca end
    where d.id = v_id;
  end if;

  perform public.app_zamenjaj_postavke(v_id, p_postavke);
  return v_id;
end;
$$;

revoke all on function public.app_shrani_list(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.app_shrani_list(uuid, jsonb, jsonb, boolean) to authenticated;
