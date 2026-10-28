-- ════════════════════════════════════════════════════════════════════════
--  81: DRUGI KROG PREGLEDA (4.85)
--
--  1) Admina postavi ali odstavi le lastnik (tudi z neposrednim klicem
--     mimo portala); lastnikovega profila ne spreminja nihče drug.
--  2) Kode povabil za admina vidi le lastnik.
--  3) Registracija: reg_dokoncaj je idempotenten (ponovitev istega računa
--     ne pade in ne izbriše že dokončanega računa).
--  4) Koda iz e-pošte: napake ločeno za registracijo in geslo; napačna
--     koda za neobstoječ naslov se šteje enako kot za obstoječega (brez
--     razkrivanja računov); deseta napaka pove, da je zaklenjeno.
--  5) Pošiljanje kod: omejitev na naslov atomarno (vzporedni klici je ne
--     obidejo): največ 1 na minuto in 5 na uro.
--  6) Novo geslo: odjava vseh sej in odstranitev ključev za prijavo z
--     obrazom/prstnim odtisom (napadalec bi ga sicer obdržal).
--  7) Slika profila le iz shrambe tega projekta.
--  8) Odjemalci nimajo pravic REFERENCES/TRIGGER/MAINTAIN na tabelah.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. lastnik in admini ───────────────────────────────────────────────
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

  -- Lastnikov profil spreminja le lastnik (ime, slika, nastavitve, pravice).
  if lower(coalesce(OLD.email, '')) = 'filip@eflitte.si' and not app.je_lastnik() then
    raise exception 'Profila lastnika ni mogoče spremeniti.' using errcode = '42501';
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
    -- Lastnih pravic ne spreminja nihče — razen lastnika.
    if NEW.id = auth.uid() and not app.je_lastnik() then
      raise exception 'Lastnih pravic ni mogoče spremeniti.' using errcode = '42501';
    end if;
    -- Admina postavi, odstavi ali mu spremeni pravice le lastnik (kot v portalu: admin ureja le nižje vloge).
    if ((NEW.super_admin is distinct from OLD.super_admin) or coalesce(OLD.super_admin, false)) and not app.je_lastnik() then
      raise exception 'Pravice admina spreminja le lastnik.' using errcode = '42501';
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

-- ── 2. kode povabil za admina le lastniku ──────────────────────────────
drop policy if exists povabila_branje on public.povabila;
create policy povabila_branje on public.povabila for select to authenticated
  using (app.je_lastnik() or (app.sme_vabiti() and vloga <> 'admin'));

-- ── 3. registracija: idempotentno ──────────────────────────────────────
create or replace function public.reg_dokoncaj(p_povabilo uuid, p_user uuid, p_ime text)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare v public.povabila; c public.profiles; lastnik boolean;
begin
  select * into v from public.povabila where id = p_povabilo for update;
  if v.id is not null and v.porabil = p_user then   -- isti račun že dokončan (ponovitev, dvojni klik)
    return json_build_object('ok', true, 'vloga', v.vloga, 'org', v.org_id, 'ustvaril', v.ustvaril, 'ze', true);
  end if;
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

-- ── 4. poskus kode: ločeno po namenu, enako za neobstoječe naslove ─────
create or replace function public.reg_poskus(p_email text, p_namen text, p_hash text)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  k text := 'otp-napaka:' || coalesce(p_namen, '') || ':' || lower(btrim(coalesce(p_email, '')));
  z public.eposta_kode;
  napak int;
begin
  perform pg_advisory_xact_lock(hashtext(k));   -- vzporedni poskusi za isti naslov si sledijo
  select count(*) into napak from public.omejitve where kljuc = k and cas > now() - interval '24 hours';
  if napak >= 10 then return json_build_object('napaka', 'zaklenjeno'); end if;
  select * into z from public.eposta_kode where email = e and namen = p_namen order by ustvarjeno desc limit 1 for update;
  if z.id is null or z.velja_do < now() or z.poskusi >= 5 or z.koda_hash is distinct from p_hash then
    if z.id is not null and z.velja_do >= now() and z.poskusi < 5 then update public.eposta_kode set poskusi = poskusi + 1 where id = z.id; end if;
    insert into public.omejitve (kljuc) values (k);
    if napak + 1 >= 10 then return json_build_object('napaka', 'zaklenjeno'); end if;
    if z.id is null then return json_build_object('napaka', 'ni'); end if;
    if z.velja_do < now() then return json_build_object('napaka', 'poteklo'); end if;
    if z.poskusi + 1 >= 5 then return json_build_object('napaka', 'poskusi'); end if;
    return json_build_object('napaka', 'koda');
  end if;
  return json_build_object('ok', true, 'id', z.id, 'ime', z.ime, 'povabilo_id', z.povabilo_id);
end $$;
revoke all on function public.reg_poskus(text, text, text) from public, anon, authenticated;
grant execute on function public.reg_poskus(text, text, text) to service_role;

-- ── 5. pošiljanje kod: atomarna omejitev na naslov ─────────────────────
create or replace function public.reg_dovoli_kodo(p_email text)
returns text language plpgsql security definer set search_path to 'public', 'app' as $$
declare k text := 'koda:' || lower(btrim(coalesce(p_email, '')));
begin
  perform pg_advisory_xact_lock(hashtext(k));
  if exists (select 1 from public.omejitve where kljuc = k and cas > now() - interval '1 minute') then return 'minuta'; end if;
  if (select count(*) from public.omejitve where kljuc = k and cas > now() - interval '1 hour') >= 5 then return 'ura'; end if;
  insert into public.omejitve (kljuc) values (k);
  return 'ok';
end $$;
revoke all on function public.reg_dovoli_kodo(text) from public, anon, authenticated;
grant execute on function public.reg_dovoli_kodo(text) to service_role;

-- ── 6. novo geslo: odjava vseh sej in ključev za prijavo z obrazom ─────
create or replace function public.reg_odjavi(p_user uuid)
returns void language plpgsql security definer set search_path to 'public', 'auth' as $$
begin
  delete from auth.sessions where user_id = p_user;
  delete from public.webauthn_credentials where user_id = p_user;
  delete from public.webauthn_challenges where user_id = p_user;
end $$;
revoke all on function public.reg_odjavi(uuid) from public, anon, authenticated;
grant execute on function public.reg_odjavi(uuid) to service_role;

-- ── 7. slika profila le iz shrambe tega projekta ───────────────────────
alter table public.profiles drop constraint if exists profiles_avatar_lastna_mapa;
alter table public.profiles add constraint profiles_avatar_lastna_mapa check (
  avatar_url is null
  or avatar_url ~ ('^https://anrhtgbckxrccnafcmsz\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$')
);

-- ── 8. odjemalci brez REFERENCES/TRIGGER/MAINTAIN ──────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke references, trigger, maintain on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
