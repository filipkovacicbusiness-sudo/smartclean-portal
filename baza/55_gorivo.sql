-- ════════════════════════════════════════════════════════════════════════
--  55_gorivo.sql — evidenca tankanj z računi
--
--  Eno vozilo. Pri vsakem tankanju: datum, litri, znesek, stanje števca in
--  kdo je tankal. Račun (PDF ali slika) gre v SVOJ bucket »gorivo«.
--
--  Kdo: LASTNIK in ADMIN (profiles.super_admin) — enako kot Fakture. Osebje
--  in zaposleni razdelka ne vidijo. Prav zato računi NE gredo v bucket
--  »dokumenti«: tam ima pravila app.is_staff(), torej vse osebje, in kdor bi
--  poznal pot do datoteke, bi si lahko izdelal podpisan URL.
--
--  Poraba se računa iz razlike med zaporednima stanjema števca in litrov
--  poznejšega tankanja. To drži ob polnem rezervoarju; ob delnem tankanju je
--  posamezen odsek previsok ali prenizek, povprečje čez več tankanj pa se
--  izravna.
--
--  Zaženi v Supabase → SQL Editor. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Kdo sme ──────────────────────────────────────────────────────────
create or replace function app.sme_gorivo() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'filip@eflitte.si'
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and coalesce(p.super_admin, false));
$$;

revoke all on function app.sme_gorivo() from public;
revoke all on function app.sme_gorivo() from anon;
grant execute on function app.sme_gorivo() to authenticated;


-- ── 2. Tabela ───────────────────────────────────────────────────────────
create table if not exists public.fuel_logs (
  id              uuid primary key default gen_random_uuid(),
  datum           date not null default current_date,
  litri           numeric(8,2)  not null check (litri > 0),
  znesek          numeric(10,2) not null check (znesek >= 0),
  km              integer check (km >= 0),      -- stanje števca ob tankanju
  tankal          text,
  opomba          text,
  storage_path    text,                          -- račun v bucketu »gorivo«
  mime            text,
  velikost        bigint,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  popravil        text,
  popravljeno_at  timestamptz,
  deleted_at      timestamptz                    -- mehak bris, kot spremni listi
);

create index if not exists fuel_logs_datum_idx   on public.fuel_logs (datum desc);
create index if not exists fuel_logs_deleted_idx on public.fuel_logs (deleted_at);
create index if not exists fuel_logs_km_idx      on public.fuel_logs (km) where km is not null;

alter table public.fuel_logs enable row level security;

drop policy if exists fuel_logs_vodstvo on public.fuel_logs;
create policy fuel_logs_vodstvo on public.fuel_logs
  to authenticated
  using (app.sme_gorivo())
  with check (app.sme_gorivo());

revoke all on table public.fuel_logs from anon;
grant select, insert, update, delete on table public.fuel_logs to authenticated;


-- ── 3. Bucket za račune ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
select 'gorivo', 'gorivo', false
where not exists (select 1 from storage.buckets where id = 'gorivo');

drop policy if exists gorivo_sel on storage.objects;
drop policy if exists gorivo_ins on storage.objects;
drop policy if exists gorivo_upd on storage.objects;
drop policy if exists gorivo_del on storage.objects;

create policy gorivo_sel on storage.objects for select to authenticated
  using (bucket_id = 'gorivo' and app.sme_gorivo());
create policy gorivo_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'gorivo' and app.sme_gorivo());
create policy gorivo_upd on storage.objects for update to authenticated
  using (bucket_id = 'gorivo' and app.sme_gorivo())
  with check (bucket_id = 'gorivo' and app.sme_gorivo());
create policy gorivo_del on storage.objects for delete to authenticated
  using (bucket_id = 'gorivo' and app.sme_gorivo());


-- ── 4. Kontrola ─────────────────────────────────────────────────────────
-- Mora vrniti eno vrstico s tvojim e-naslovom in sme = true.
select (auth.jwt() ->> 'email') as prijavljen, app.sme_gorivo() as sme;

-- Pravila na tabeli in bucketu:
select policyname, cmd from pg_policies
 where (schemaname = 'public'  and tablename = 'fuel_logs')
    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'gorivo\_%')
 order by tablename, policyname;
