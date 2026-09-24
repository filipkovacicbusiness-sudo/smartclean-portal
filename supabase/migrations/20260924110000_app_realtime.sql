-- ════════════════════════════════════════════════════════════════════════
--  60_app_realtime.sql — živa sinhronizacija aplikacije (tablica, mobile)
--
--  Aplikacija posluša spremembe na orgs, articles, delivery_notes in
--  delivery_note_items (kanal »pralnica-sync«). Supabase pošilja dogodke le
--  za tabele v publikaciji supabase_realtime, te pa v repozitoriju ni bilo
--  nikjer zapisano, katere so. Brez njih je aplikacija nove liste videla šele
--  ob naslednjem polnem prenosu.
--
--  Aplikacija 9.0 zato prenese cel arhiv redkeje (vsakih 5 min, ko živa
--  povezava deluje; prej vsakih 20 s ne glede na vse) — ta migracija
--  poskrbi, da živa povezava res prinaša spremembe.
--
--  RLS velja tudi za dogodke: vsak prejme samo vrstice, ki jih sme brati.
--  Samo doda manjkajoče tabele; ničesar ne odstrani. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- publikacija »for all tables« že vsebuje vse
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    return;
  end if;
  foreach t in array array['orgs', 'articles', 'delivery_notes', 'delivery_note_items'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
