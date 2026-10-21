-- ════════════════════════════════════════════════════════════════════════
--  62_varnost_profili.sql — zapre povišanje pravic prek profila
--
--  Varnostni pregled 21. 10. 2026 je odkril (in lokalna kopija sheme v PGlite
--  potrdila) tri poti do tujih podatkov:
--
--  C1  Vsak prijavljen uporabnik — tudi stranka — si je lahko v svojem profilu
--      spremenil e-pošto v lastnikovo. sme_app(), audit_sel in dnc_staff_all
--      lastnika prepoznajo po profiles.email, zato je stranka nato videla in
--      urejala spremne liste VSEH strank. Osebje je enako lahko spremenilo
--      e-pošto drugemu računu (pravilo staff_all_profiles).
--  C2  Vsak si je lahko vklopil profiles.is_device in dobil pravice tablice
--      (branje vseh strank, artiklov in listov s tablice, urejanje listov).
--  H2  Izklopljen račun (active = false) je prek sme_app() še imel dostop.
--
--  Popravek:
--  1) Zaščita profila varuje tudi email, is_device in is_tablet. E-pošto
--     spreminja le Edge funkcija »uporabniki« (service_role) — portal je
--     neposredno ne spreminja nikjer. is_device/is_tablet kot ostale pravice:
--     ne lastnih, tujih le super admin ali lastnik.
--  2) Lastnik se prepozna po e-pošti iz prijavnega žetona (auth.jwt()), ki
--     je ni mogoče spremeniti iz odjemalca — ne več po profiles.email.
--  3) sme_app(), audit_sel in dnc_staff_all zahtevajo aktiven račun.
--  4) TRUNCATE ni dovoljen nikomur od odjemalcev (RLS ga ne ovira).
--  5) Stranka ne vidi spremnih listov v košu (deleted_at).
--
--  Podatki se ne spremenijo. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. lastnik po prijavnem žetonu ─────────────────────────────────────
create or replace function app.je_lastnik()
returns boolean
language sql
stable
set search_path to 'public', 'app'
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'filip@eflitte.si'
$$;
revoke all on function app.je_lastnik() from public;
grant execute on function app.je_lastnik() to authenticated, service_role;

-- ── 1. zaščita profila ─────────────────────────────────────────────────
create or replace function app.profiles_zascita_pravic()
returns trigger
language plpgsql
set search_path to 'public', 'app'
as $$
declare
  sme boolean;
begin
  -- Brez prijavljenega uporabnika gre za service_role (Edge funkcija
  -- »uporabniki«, ki pravice preverja sama), SQL Editor ali psql.
  if auth.uid() is null then
    return NEW;
  end if;

  -- E-pošta je identiteta (po njej jo prepoznajo pravila in Edge funkcije):
  -- iz odjemalca je ne spreminja nihče, tudi ne lastnik. Spremembe gredo
  -- prek Edge funkcije »uporabniki« (Supabase Auth + profil hkrati).
  if NEW.email is distinct from OLD.email then
    raise exception 'E-pošte ni mogoče spremeniti tukaj.'
      using errcode = '42501';
  end if;

  if (NEW.is_staff    is distinct from OLD.is_staff)
  or (NEW.super_admin is distinct from OLD.super_admin)
  or (NEW.zaposleni   is distinct from OLD.zaposleni)
  or (NEW.active      is distinct from OLD.active)
  or (NEW.web_dostop  is distinct from OLD.web_dostop)
  or (NEW.is_device   is distinct from OLD.is_device)
  or (NEW.is_tablet   is distinct from OLD.is_tablet)
  then
    -- Nihče ne sme spreminjati LASTNIH pravic.
    if NEW.id = auth.uid() then
      raise exception 'Lastnih pravic ni mogoče spremeniti.'
        using errcode = '42501';
    end if;

    -- Tujim pravicam sme le aktiven super admin ali lastnik (po žetonu).
    select app.je_lastnik() or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active and p.super_admin
    ) into sme;

    if not sme then
      raise exception 'Za spreminjanje pravic nimate dovoljenja.'
        using errcode = '42501';
    end if;
  end if;

  return NEW;
end $$;

alter function app.profiles_zascita_pravic() owner to postgres;

drop trigger if exists trg_profiles_zascita on public.profiles;
create trigger trg_profiles_zascita
  before update on public.profiles
  for each row execute function app.profiles_zascita_pravic();

-- ── 2. dostop aplikacije: aktiven račun, lastnik po žetonu ─────────────
create or replace function public.sme_app()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active
      and coalesce(p.web_dostop, true) = true
      and ( coalesce(p.is_staff, false)
         or coalesce(p.super_admin, false)
         or app.je_lastnik() )
  );
$$;

-- ── 3. dnevnik in prekrivanja: aktiven račun, lastnik po žetonu ────────
drop policy if exists "audit_sel" on public.audit_log;
create policy "audit_sel" on public.audit_log for select to authenticated using (
  app.je_lastnik() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false))
  )
);

drop policy if exists "dnc_staff_all" on public.delivery_note_conflicts;
create policy "dnc_staff_all" on public.delivery_note_conflicts to authenticated
  using (
    app.je_lastnik() or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active
        and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false))
    )
  )
  with check (
    app.je_lastnik() or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active
        and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false))
    )
  );

-- ── 4. TRUNCATE ni za odjemalce ────────────────────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- ── 5. stranka ne vidi listov v košu ───────────────────────────────────
drop policy if exists "member_read_own_notes" on public.delivery_notes;
create policy "member_read_own_notes" on public.delivery_notes for select to authenticated
  using (app.can_see(org_id, location_id) and deleted_at is null);
