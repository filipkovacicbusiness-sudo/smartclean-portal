-- ════════════════════════════════════════════════════════════════════════
--  73_zivo_cipi.sql — čipi v živem toku (realtime)
--
--  Portal (in aplikacija SmartClean RFID, ki portal odpre) dobi spremembe čipov
--  takoj: druga naprava označi kos ali potrdi oddajo → Kosi in skeniranje se
--  osvežijo sami. Realtime upošteva RLS (bere le aktivno osebje, 72_rfid.sql).
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rfid_kosi') then
    alter publication supabase_realtime add table public.rfid_kosi;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rfid_seje') then
    alter publication supabase_realtime add table public.rfid_seje;
  end if;
end $$;
