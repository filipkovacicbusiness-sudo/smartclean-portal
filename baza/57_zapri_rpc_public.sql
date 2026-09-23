-- ════════════════════════════════════════════════════════════════════════
--  57_zapri_rpc_public.sql — dokonča, česar 52 ni
--
--  Migracija 52 je štirim funkcijam odvzela pravico z
--      revoke all on function … from anon;
--  To NI zadostovalo. Postgres vsaki novi funkciji podeli EXECUTE vlogi
--  PUBLIC (vse vloge), in anon jo od tam podeduje. Preverjeno 23. 9. 2026
--  z neprijavljenim klicem prek REST: vse štiri so se izvedle.
--
--  Trem to ni škodilo, ker jih varuje notranje preverjanje app.is_staff().
--  terminal_stamp pa ga NIMA: kdorkoli z javnim ključem je lahko
--    - za znan žeton kartice zabeležil prihod/odhod s poljubnim časom (p_ts),
--    - za neznan niz neomejeno pisal v card_scans.
--
--  Pravilo za prihodnje migracije: funkcijo zapri z  … from public, anon;
--  in prijavljenim, ki jo potrebujejo, pravico podeli IZRECNO.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- terminal_stamp: nadomestila jo je Edge funkcija punch (HMAC + nonce +
-- strežniški čas). Ne kliče je nič več — zapri za vse razen service_role.
revoke execute on function public.terminal_stamp(text, text, timestamp with time zone)
  from public, anon, authenticated;

-- Ostale tri: brez prijave nič, prijavljenim ostane (vsaka ima še notranje
-- preverjanje app.is_staff()). list_employees kliče terminal/vpisi_vec.py.
revoke execute on function public.list_employees()                  from public, anon;
revoke execute on function public.recent_scans(integer)             from public, anon;
revoke execute on function public.assign_card(text, text, text)     from public, anon;

grant execute on function public.list_employees()                   to authenticated;
grant execute on function public.recent_scans(integer)              to authenticated;
grant execute on function public.assign_card(text, text, text)      to authenticated;
