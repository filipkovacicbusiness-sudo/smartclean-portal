-- ════════════════════════════════════════════════════════════════════════
--  61_stevilke_kos.sql — številka lista v košu ni več zasedena
--
--  Izbrisan spremni list gre v koš (deleted_at), vrstica pa ostane. Pravilo
--  UNIQUE (doc_year, doc_seq) je zato številko še vedno držalo: portal je
--  za nov list predlagal 1675 (liste v košu pri štetju izpusti), baza pa je
--  vrnila »duplicate key … delivery_notes_doc_year_doc_seq_key«.
--
--  1) Številka mora biti edinstvena samo med listi, ki NISO v košu.
--  2) app_prosta_stevilka: naslednja prosta številka šteje le liste zunaj koša.
--
--  Obnova lista iz koša, katerega številko je medtem dobil drug list, v
--  portalu ponudi novo številko (portal.js, spremniObnovi).
--  Nobeni podatki se ne spremenijo. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

alter table public.delivery_notes drop constraint if exists delivery_notes_doc_year_doc_seq_key;

create unique index if not exists delivery_notes_doc_year_doc_seq_aktivni
  on public.delivery_notes (doc_year, doc_seq)
  where deleted_at is null;

create or replace function public.app_prosta_stevilka(p_leto integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when (app.is_staff() or public.sme_app() or app.is_device())
    then coalesce((select max(doc_seq) from public.delivery_notes where doc_year = p_leto and deleted_at is null), 0) + 1
    else null end;
$$;

revoke all on function public.app_prosta_stevilka(integer) from public, anon;
grant execute on function public.app_prosta_stevilka(integer) to authenticated;
