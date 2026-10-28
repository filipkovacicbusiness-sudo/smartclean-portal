-- ════════════════════════════════════════════════════════════════════════
--  79: POVABILA Z AKTIVACIJSKO KODO, KODE PO E-POŠTI, OMEJITEV POSKUSOV
--
--  Registracija brez gesla od skrbnika: skrbnik ustvari povabilo (vloga,
--  stranka, aplikacija RFID) → koda (povezava in QR) → oseba sama vpiše
--  ime, e-naslov in geslo, e-naslov potrdi s 6-mestno kodo, doda
--  fotografijo. Koda velja 7 dni in samo enkrat; ni vezana na e-naslov.
--  Pozabljeno geslo: 6-mestna koda po e-pošti, oseba sama nastavi novo.
--
--  E-pošto, kode in ustvarjanje računov opravlja strežniška funkcija
--  »registracija« (service_role); tabele eposta_kode in omejitve so brez
--  pravil (iz brskalnika niso dostopne).
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.povabila (
  id uuid primary key default gen_random_uuid(),
  koda text not null unique,                       -- 10 znakov (A–Z brez I in O, 2–9); prikaz XXXXX-XXXXX
  vloga text not null check (vloga in ('admin', 'osebje', 'zaposleni', 'stranka')),
  org_id uuid references public.orgs(id) on delete cascade,
  rfid_dostop boolean not null default false,
  opomba text,                                     -- za koga (le prikaz v seznamu)
  ustvaril uuid references public.profiles(id) on delete set null,
  ustvarjeno timestamptz not null default now(),
  velja_do timestamptz not null default now() + interval '7 days',
  porabljeno timestamptz,
  porabil uuid references public.profiles(id) on delete set null,
  preklicano timestamptz,
  constraint povabila_stranka check (vloga <> 'stranka' or org_id is not null)
);
create index if not exists povabila_ustvarjeno on public.povabila (ustvarjeno desc);
alter table public.povabila enable row level security;

-- vabi lahko, kdor sme ustvarjati račune: lastnik ali admin (aktiven)
create or replace function app.sme_vabiti()
returns boolean language sql stable security definer set search_path to 'public', 'app' as $$
  select app.je_lastnik() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin)
$$;
revoke all on function app.sme_vabiti() from public;
grant execute on function app.sme_vabiti() to authenticated, service_role;

drop policy if exists povabila_branje on public.povabila;
create policy povabila_branje on public.povabila for select to authenticated using (app.sme_vabiti());

-- koda: 10 znakov iz 32 = 50 bitov naključja (ugibanje je ob omejitvi poskusov nemogoče)
create or replace function app.povabilo_koda()
returns text language plpgsql volatile set search_path to 'public', 'app', 'extensions' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(10);
  k text := '';
begin
  for i in 0..9 loop k := k || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
  return k;
end $$;
revoke all on function app.povabilo_koda() from public;

create or replace function public.povabilo_ustvari(p_vloga text, p_org uuid default null, p_rfid boolean default false, p_opomba text default null)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare v public.povabila; poskus int := 0;
begin
  if not app.sme_vabiti() then raise exception 'Za povabila nimate pravic.' using errcode = '42501'; end if;
  if p_vloga is null or p_vloga not in ('admin', 'osebje', 'zaposleni', 'stranka') then raise exception 'Neznana vloga.' using errcode = 'P0001'; end if;
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
revoke all on function public.povabilo_ustvari(text, uuid, boolean, text) from public, anon;
grant execute on function public.povabilo_ustvari(text, uuid, boolean, text) to authenticated;

create or replace function public.povabilo_preklici(p_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_vabiti() then raise exception 'Za povabila nimate pravic.' using errcode = '42501'; end if;
  update public.povabila set preklicano = now() where id = p_id and porabljeno is null and preklicano is null;
end $$;
revoke all on function public.povabilo_preklici(uuid) from public, anon;
grant execute on function public.povabilo_preklici(uuid) to authenticated;

-- ── kode po e-pošti (potrditev registracije, pozabljeno geslo) in omejitev poskusov ──
create table if not exists public.eposta_kode (
  id uuid primary key default gen_random_uuid(),
  namen text not null check (namen in ('registracija', 'geslo')),
  email text not null,
  ime text,                                        -- registracija: ime in priimek (geslo se ne shrani)
  povabilo_id uuid references public.povabila(id) on delete cascade,
  koda_hash text not null,
  poskusi int not null default 0,
  velja_do timestamptz not null,
  ustvarjeno timestamptz not null default now()
);
create index if not exists eposta_kode_email on public.eposta_kode (lower(email), namen, ustvarjeno desc);
alter table public.eposta_kode enable row level security;   -- brez pravil: samo service_role

create table if not exists public.omejitve (
  kljuc text not null,
  cas timestamptz not null default now()
);
create index if not exists omejitve_kljuc on public.omejitve (kljuc, cas desc);
create index if not exists omejitve_cas on public.omejitve (cas);
alter table public.omejitve enable row level security;      -- brez pravil: samo service_role

-- poraba povabila: atomarno (dve hkratni potrditvi z isto kodo — uspe le ena)
create or replace function public.reg_porabi(p_povabilo uuid, p_user uuid)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare v public.povabila;
begin
  update public.povabila set porabljeno = now(), porabil = p_user
   where id = p_povabilo and porabljeno is null and preklicano is null and velja_do > now()
   returning * into v;
  if v.id is null then return null; end if;
  return json_build_object('vloga', v.vloga, 'org', v.org_id, 'rfid', v.rfid_dostop, 'ustvaril', v.ustvaril);
end $$;
revoke all on function public.reg_porabi(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reg_porabi(uuid, uuid) to service_role;

-- uporabnik po e-naslovu (auth.users prek API ni dostopen): registracija in pozabljeno geslo
create or replace function public.reg_uporabnik(p_email text)
returns json language sql stable security definer set search_path to 'public', 'auth' as $$
  select json_build_object('id', u.id, 'potrjen', u.email_confirmed_at is not null, 'aktiven', coalesce(p.active, false), 'ime', p.full_name)
  from auth.users u left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(p_email))
  limit 1
$$;
revoke all on function public.reg_uporabnik(text) from public, anon, authenticated;
grant execute on function public.reg_uporabnik(text) to service_role;
