-- ════════════════════════════════════════════════════════════════════════
--  80: VARNOST POVABIL IN LASTNIKA (pregled 4.84)
--
--  1) Povabila: skrbniki jih vidijo (manjkala je pravica SELECT — seznam je
--     bil prazen); kode po e-pošti in omejitve le service_role; brez TRUNCATE.
--  2) Koda iz e-pošte: poskus atomarno (zaklep vrstice), največ 5 na kodo in
--     10 napačnih na e-naslov v 24 urah (vzporedni poskusi ne obidejo meje).
--  3) Povabilo za admina ustvari le lastnik; ob registraciji mora biti
--     ustvarjalec še skrbnik; poraba, pravice in stranka v eni transakciji.
--  4) Lastnik: pravic mu ne spremeni in profila ne izbriše nihče drug; svoje
--     pravice sme spreminjati; v pravilih je vedno osebje.
--  5) Slike profila: največ 2 MB, le JPEG/PNG/WebP; naslov slike le iz
--     lastne mape v shrambi (brez tujih ali zunanjih naslovov).
--  6) Po novem geslu (pozabljeno geslo) se odjavijo vse seje.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. pravice ─────────────────────────────────────────────────────────
grant select on public.povabila to authenticated;
revoke truncate, references, trigger, maintain on public.povabila from anon, authenticated;
revoke all on public.eposta_kode, public.omejitve from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'axon_readonly') then
    execute 'revoke all on public.povabila, public.eposta_kode, public.omejitve from axon_readonly';
  end if;
end $$;
-- nove tabele: odjemalci ne dobijo TRUNCATE in podobnih pravic samodejno (glej 62 §4)
alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from authenticated;

-- ── 2. poskus kode iz e-pošte ──────────────────────────────────────────
drop index if exists public.eposta_kode_email;
create index if not exists eposta_kode_email_namen on public.eposta_kode (email, namen, ustvarjeno desc);

create or replace function public.reg_poskus(p_email text, p_namen text, p_hash text)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  z public.eposta_kode;
  napak int;
begin
  select * into z from public.eposta_kode where email = e and namen = p_namen order by ustvarjeno desc limit 1 for update;
  if z.id is null then return json_build_object('napaka', 'ni'); end if;
  -- šteje se po zaklepu: vzporedni poskus vidi prejšnjega
  select count(*) into napak from public.omejitve where kljuc = 'otp-napaka:' || e and cas > now() - interval '24 hours';
  if napak >= 10 then return json_build_object('napaka', 'zaklenjeno'); end if;
  if z.velja_do < now() then return json_build_object('napaka', 'poteklo'); end if;
  if z.poskusi >= 5 then return json_build_object('napaka', 'poskusi'); end if;
  if z.koda_hash is distinct from p_hash then
    update public.eposta_kode set poskusi = poskusi + 1 where id = z.id;
    insert into public.omejitve (kljuc) values ('otp-napaka:' || e);
    return json_build_object('napaka', case when z.poskusi + 1 >= 5 or napak + 1 >= 10 then 'poskusi' else 'koda' end);
  end if;
  return json_build_object('ok', true, 'id', z.id, 'ime', z.ime, 'povabilo_id', z.povabilo_id);
end $$;
revoke all on function public.reg_poskus(text, text, text) from public, anon, authenticated;
grant execute on function public.reg_poskus(text, text, text) to service_role;

-- ── 3. povabila ────────────────────────────────────────────────────────
create or replace function public.povabilo_ustvari(p_vloga text, p_org uuid default null, p_rfid boolean default false, p_opomba text default null)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare v public.povabila; poskus int := 0;
begin
  if not app.sme_vabiti() then raise exception 'Za povabila nimate pravic.' using errcode = '42501'; end if;
  if p_vloga is null or p_vloga not in ('admin', 'osebje', 'zaposleni', 'stranka') then raise exception 'Neznana vloga.' using errcode = 'P0001'; end if;
  if p_vloga = 'admin' and not app.je_lastnik() then raise exception 'Povabilo za admina lahko ustvari le lastnik.' using errcode = '42501'; end if;
  if p_vloga = 'stranka' and (p_org is null or not exists (select 1 from public.orgs o where o.id = p_org and o.deleted_at is null)) then
    raise exception 'Izberite stranko.' using errcode = 'P0001';
  end if;
  loop
    poskus := poskus + 1;
    begin
      insert into public.povabila (koda, vloga, org_id, rfid_dostop, opomba, ustvaril)
      values (app.povabilo_koda(), p_vloga, case when p_vloga = 'stranka' then p_org end,
              coalesce(p_rfid, false) and p_vloga <> 'stranka', nullif(left(btrim(coalesce(p_opomba, '')), 80), ''), auth.uid())
      returning * into v;
      exit;
    exception when unique_violation then
      if poskus >= 5 then raise; end if;
    end;
  end loop;
  return json_build_object('id', v.id, 'koda', v.koda, 'velja_do', v.velja_do);
end $$;

-- preklic: pove, ali je bilo povabilo res preklicano (porabljenega ni mogoče)
drop function if exists public.povabilo_preklici(uuid);
create function public.povabilo_preklici(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_vabiti() then raise exception 'Za povabila nimate pravic.' using errcode = '42501'; end if;
  update public.povabila set preklicano = now() where id = p_id and porabljeno is null and preklicano is null;
  return found;
end $$;
revoke all on function public.povabilo_preklici(uuid) from public, anon;
grant execute on function public.povabilo_preklici(uuid) to authenticated;

-- registracija: poraba povabila, pravice in stranka hkrati; ustvarjalec mora biti še skrbnik
create or replace function public.reg_dokoncaj(p_povabilo uuid, p_user uuid, p_ime text)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare v public.povabila; c public.profiles; lastnik boolean;
begin
  select * into v from public.povabila where id = p_povabilo for update;
  if v.id is null or v.porabljeno is not null or v.preklicano is not null or v.velja_do <= now() then
    return json_build_object('napaka', 'neveljavno');
  end if;
  select * into c from public.profiles where id = v.ustvaril;
  lastnik := lower(coalesce(c.email, '')) = 'filip@eflitte.si';
  if not (lastnik or (coalesce(c.active, false) and coalesce(c.super_admin, false) and v.vloga <> 'admin')) then
    return json_build_object('napaka', 'ustvarjalec');
  end if;
  if v.vloga = 'stranka' and not exists (select 1 from public.orgs o where o.id = v.org_id and o.deleted_at is null) then
    return json_build_object('napaka', 'stranka');
  end if;
  update public.povabila set porabljeno = now(), porabil = p_user where id = v.id;
  update public.profiles set full_name = coalesce(nullif(btrim(coalesce(p_ime, '')), ''), full_name),
    is_staff = v.vloga in ('osebje', 'admin'), super_admin = v.vloga = 'admin', zaposleni = v.vloga = 'zaposleni',
    rfid_dostop = v.rfid_dostop, active = true
   where id = p_user;
  if not found then raise exception 'Profil novega računa ne obstaja.' using errcode = 'P0001'; end if;
  if v.vloga = 'stranka' then
    insert into public.memberships (user_id, org_id, role) values (p_user, v.org_id, 'owner');
  end if;
  return json_build_object('ok', true, 'vloga', v.vloga, 'org', v.org_id, 'ustvaril', v.ustvaril);
end $$;
revoke all on function public.reg_dokoncaj(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reg_dokoncaj(uuid, uuid, text) to service_role;

-- prejšnja poraba brez preverjanja ustvarjalca (nadomešča jo reg_dokoncaj)
drop function if exists public.reg_porabi(uuid, uuid);

-- ── 4. lastnik ─────────────────────────────────────────────────────────
create or replace function app.is_staff()
returns boolean language sql stable security definer set search_path to 'public', 'app' as $$
  select app.je_lastnik() or coalesce((select p.is_staff and p.active from profiles p where p.id = auth.uid()), false)
$$;

create or replace function app.profiles_zascita_pravic()
returns trigger language plpgsql set search_path to 'public', 'app' as $$
declare
  sme boolean;
begin
  -- Brez prijavljenega uporabnika gre za service_role (Edge funkciji »uporabniki«
  -- in »registracija«, ki pravice preverjata sami), SQL Editor ali psql.
  if auth.uid() is null then
    return NEW;
  end if;

  -- id je vez na prijavo (auth.users): z zamenjavo id bi kdo prevzel tuj profil.
  if NEW.id is distinct from OLD.id then
    raise exception 'Uporabnika ni mogoče zamenjati.' using errcode = '42501';
  end if;

  -- E-pošta je identiteta (po njej jo prepoznajo pravila in Edge funkcije).
  if NEW.email is distinct from OLD.email then
    raise exception 'E-pošte ni mogoče spremeniti tukaj.' using errcode = '42501';
  end if;

  if (NEW.is_staff    is distinct from OLD.is_staff)
  or (NEW.super_admin is distinct from OLD.super_admin)
  or (NEW.zaposleni   is distinct from OLD.zaposleni)
  or (NEW.active      is distinct from OLD.active)
  or (NEW.web_dostop  is distinct from OLD.web_dostop)
  or (NEW.rfid_dostop is distinct from OLD.rfid_dostop)
  or (NEW.is_device   is distinct from OLD.is_device)
  or (NEW.is_tablet   is distinct from OLD.is_tablet)
  then
    -- Lastnikove pravice spreminja le lastnik (tudi admin ne).
    if lower(coalesce(OLD.email, '')) = 'filip@eflitte.si' and not app.je_lastnik() then
      raise exception 'Pravic lastnika ni mogoče spremeniti.' using errcode = '42501';
    end if;
    -- Lastnih pravic ne spreminja nihče — razen lastnika.
    if NEW.id = auth.uid() and not app.je_lastnik() then
      raise exception 'Lastnih pravic ni mogoče spremeniti.' using errcode = '42501';
    end if;
    -- Tujim pravicam sme le aktiven super admin ali lastnik (po žetonu).
    select app.je_lastnik() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin
    ) into sme;
    if not sme then
      raise exception 'Za spreminjanje pravic nimate dovoljenja.' using errcode = '42501';
    end if;
  end if;

  return NEW;
end $$;

create or replace function app.profiles_zascita_vnos()
returns trigger language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;   -- service_role (Edge funkcije), SQL
  if TG_OP = 'DELETE' and lower(coalesce(OLD.email, '')) = 'filip@eflitte.si' and not app.je_lastnik() then
    raise exception 'Profila lastnika ni mogoče izbrisati.' using errcode = '42501';
  end if;
  if app.je_lastnik() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin) then
    return coalesce(NEW, OLD);
  end if;
  raise exception 'Uporabnike dodaja in briše le skrbnik.' using errcode = '42501';
end $$;

-- ── 5. slike profila ───────────────────────────────────────────────────
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'avatars';
alter table public.profiles drop constraint if exists profiles_avatar_lastna_mapa;
alter table public.profiles add constraint profiles_avatar_lastna_mapa check (
  avatar_url is null
  or avatar_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$')
);

-- ── 6. po novem geslu: odjava vseh sej ─────────────────────────────────
create or replace function public.reg_odjavi(p_user uuid)
returns void language sql security definer set search_path to 'public', 'auth' as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke all on function public.reg_odjavi(uuid) from public, anon, authenticated;
grant execute on function public.reg_odjavi(uuid) to service_role;
