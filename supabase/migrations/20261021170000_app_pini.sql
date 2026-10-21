-- ════════════════════════════════════════════════════════════════════════
--  67_app_pini.sql — koda (PIN) za aplikacijo: zgoščena, ločeno, berljiva le lastniku
--
--  Prej je bila koda v profiles.app_pin kot navadno besedilo. Vsak član osebja
--  jo je lahko prebral (pravilo staff_all_profiles) in na tablici vstopil kot
--  drug uporabnik.
--
--  Zdaj:
--  1) public.app_pini (user_id, hash): PBKDF2-HMAC-SHA256, 100.000 ponovitev,
--     16 B naključne soli. Zapis: pbkdf2$sha256$<ponovitve>$<sol b64>$<hash b64>
--     — enak, kot ga izračuna WebCrypto v portalu (nastavitev) in na tablici
--     (preverjanje brez povezave).
--  2) Vrstico bere SAMO njen lastnik (tablica jo prenese ob prijavi tega
--     uporabnika). Pisanje le prek nastavi_app_pin() (osebje, super admin,
--     lastnik ali uporabnik sam).
--  3) app_pini_nastavljeni(): komu je koda nastavljena (za portal, brez hashev).
--  4) Obstoječe kode se pretvorijo; profiles.app_pin se izprazni in je odslej
--     zaklenjen (stare različice aplikacije zato kode ne zahtevajo več, dokler
--     tablica ne dobi nove različice).
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── PBKDF2-HMAC-SHA256, en blok (32 B) ─────────────────────────────────
create or replace function app.pbkdf2_sha256(p_geslo text, p_sol bytea, p_iter integer)
returns bytea
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  k bytea := convert_to(p_geslo, 'UTF8');
  u bytea; h text;
  a1 bigint := 0; a2 bigint := 0; a3 bigint := 0; a4 bigint := 0;
  i integer;
begin
  u := extensions.hmac(p_sol || '\x00000001'::bytea, k, 'sha256');
  for i in 1..p_iter loop
    if i > 1 then u := extensions.hmac(u, k, 'sha256'); end if;
    h := encode(u, 'hex');
    a1 := a1 # ('x' || substr(h, 1, 16))::bit(64)::bigint;
    a2 := a2 # ('x' || substr(h, 17, 16))::bit(64)::bigint;
    a3 := a3 # ('x' || substr(h, 33, 16))::bit(64)::bigint;
    a4 := a4 # ('x' || substr(h, 49, 16))::bit(64)::bigint;
  end loop;
  return decode(lpad(to_hex(a1), 16, '0') || lpad(to_hex(a2), 16, '0') || lpad(to_hex(a3), 16, '0') || lpad(to_hex(a4), 16, '0'), 'hex');
end $$;
revoke all on function app.pbkdf2_sha256(text, bytea, integer) from public;

-- Samopreverjanje (znani vektorji PBKDF2-HMAC-SHA256): ob napačnem izračunu se
-- migracija ustavi, preden se katera koda pretvori.
do $$
begin
  if encode(app.pbkdf2_sha256('password', convert_to('salt', 'UTF8'), 1), 'hex') <> '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
  or encode(app.pbkdf2_sha256('password', convert_to('salt', 'UTF8'), 4096), 'hex') <> 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a' then
    raise exception 'pbkdf2_sha256: napačen izračun';
  end if;
end $$;

-- ── tabela kod ─────────────────────────────────────────────────────────
create table if not exists public.app_pini (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hash text not null check (hash ~ '^pbkdf2\$sha256\$[0-9]{4,7}\$[A-Za-z0-9+/=]{16,64}\$[A-Za-z0-9+/=]{40,64}$'),
  nastavljen_at timestamptz not null default now(),
  nastavil uuid
);
alter table public.app_pini enable row level security;
revoke all on public.app_pini from public, anon, authenticated;
grant select on public.app_pini to authenticated;
drop policy if exists "app_pini_svoj" on public.app_pini;
create policy "app_pini_svoj" on public.app_pini for select to authenticated
  using (user_id = auth.uid());

-- ── kdo sme nastavljati kode ───────────────────────────────────────────
create or replace function app.sme_kode(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select auth.uid() is not null and (
    p_user = auth.uid()
    or app.je_lastnik()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.active
                 and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false)))
  )
$$;
revoke all on function app.sme_kode(uuid) from public;

create or replace function public.nastavi_app_pin(p_user uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  if not app.sme_kode(p_user) then
    raise exception 'Za nastavitev kode nimate dovoljenja.' using errcode = '42501';
  end if;
  if p_hash is null or p_hash = '' then
    delete from public.app_pini where user_id = p_user;
    return;
  end if;
  if p_hash !~ '^pbkdf2\$sha256\$[0-9]{4,7}\$[A-Za-z0-9+/=]{16,64}\$[A-Za-z0-9+/=]{40,64}$' then
    raise exception 'Neveljaven zapis kode.' using errcode = '22023';
  end if;
  insert into public.app_pini (user_id, hash, nastavljen_at, nastavil)
  values (p_user, p_hash, now(), auth.uid())
  on conflict (user_id) do update
    set hash = excluded.hash, nastavljen_at = now(), nastavil = auth.uid();
end $$;
revoke all on function public.nastavi_app_pin(uuid, text) from public, anon;
grant execute on function public.nastavi_app_pin(uuid, text) to authenticated;

create or replace function public.app_pini_nastavljeni()
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select k.user_id from public.app_pini k
  where app.je_lastnik() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false)))
$$;
revoke all on function public.app_pini_nastavljeni() from public, anon;
grant execute on function public.app_pini_nastavljeni() to authenticated;

-- ── pretvorba obstoječih kod ───────────────────────────────────────────
insert into public.app_pini (user_id, hash, nastavljen_at)
select p.id,
       'pbkdf2$sha256$100000$' || encode(s.sol, 'base64') || '$' ||
       encode(app.pbkdf2_sha256(btrim(p.app_pin), s.sol, 100000), 'base64'),
       now()
from public.profiles p
cross join lateral (select extensions.gen_random_bytes(16) as sol where p.id is not null) s
where btrim(coalesce(p.app_pin, '')) ~ '^[0-9]{4,8}$'
on conflict (user_id) do nothing;

update public.profiles set app_pin = null where app_pin is not null;

-- ── profiles.app_pin je odslej zaklenjen (stari odjemalci ga ne morejo znova napolniti) ──
create or replace function app.app_pin_zaklenjen()
returns trigger
language plpgsql
set search_path to 'public', 'app'
as $$
begin
  if NEW.app_pin is not null then
    raise exception 'Kodo za aplikacijo nastavi nova različica portala.' using errcode = '42501';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_app_pin_zaklenjen on public.profiles;
create trigger trg_app_pin_zaklenjen
  before insert or update of app_pin on public.profiles
  for each row execute function app.app_pin_zaklenjen();
