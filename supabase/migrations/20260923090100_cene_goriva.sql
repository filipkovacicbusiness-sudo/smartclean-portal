-- Ustvarjeno iz baza/56_cene_goriva.sql (brez kontrolnih poizvedb na koncu).
-- Razlaga in kontrole so v izvirniku; tu je samo to, kar se izvede.

-- ════════════════════════════════════════════════════════════════════════
--  56_cene_goriva.sql — uradne cene goriva + DDV pri tankanjih
--
--  Vlada objavlja NAJVIŠJO DOVOLJENO MALOPRODAJNO ceno NMB-95 in dizla za
--  bencinske servise zunaj avtocest, po tednih:
--    https://www.gov.si/teme/cene-naftnih-derivatov/
--  Objavljena cena je Z DDV. Neto je izpeljan, ne vpisan.
--
--  Edge funkcija »cene-goriva« stran prebere in tabelo dopolni. Portal jo
--  pokliče, ko odpreš Gorivo in je najnovejša cena starejša od dveh dni —
--  zato ni treba nastavljati urnika.
--
--  POZOR: to je NAJVIŠJA DOVOLJENA cena, ne cena, ki si jo dejansko plačal.
--  Servis sme prodajati ceneje in avtocestni dražje. Zato je v obrazcu samo
--  predlog; obvelja znesek z računa.
--
--  Zaženi po 55_gorivo.sql. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. DDV pri tankanju ─────────────────────────────────────────────────
-- »znesek« je in ostaja znesek Z DDV — tak je na računu. Neto izpeljemo.
-- Stopnjo hranimo pri zapisu, da pretekla tankanja ob spremembi DDV ne
-- spremenijo vrednosti za nazaj.
alter table public.fuel_logs
  add column if not exists ddv numeric(5,2) not null default 22.00;

comment on column public.fuel_logs.znesek is 'Znesek Z DDV, kot je na računu.';
comment on column public.fuel_logs.ddv    is 'Stopnja DDV v odstotkih, veljavna ob tankanju.';


-- ── 2. Uradne cene ──────────────────────────────────────────────────────
create table if not exists public.fuel_prices (
  velja_od    date primary key,
  velja_do    date not null,
  dizel       numeric(6,3) not null check (dizel > 0),   -- €/l Z DDV
  nmb95       numeric(6,3) check (nmb95 > 0),            -- €/l Z DDV
  ddv         numeric(5,2) not null default 22.00,
  vir         text not null default 'gov.si',
  osvezeno_at timestamptz not null default now(),
  check (velja_do >= velja_od)
);

create index if not exists fuel_prices_obdobje_idx on public.fuel_prices (velja_od, velja_do);

alter table public.fuel_prices enable row level security;

-- Bere, kdor sme v Gorivo. Piše samo Edge funkcija s service_role, ki RLS
-- obide — zato pravila za pisanje namenoma ni.
drop policy if exists fuel_prices_bere on public.fuel_prices;
create policy fuel_prices_bere on public.fuel_prices
  for select to authenticated
  using (app.sme_gorivo());

revoke all on table public.fuel_prices from anon;
grant select on table public.fuel_prices to authenticated;
