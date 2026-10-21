-- ════════════════════════════════════════════════════════════════════════
--  63_terminal_skrivnost.sql — skrivnost terminala ni več berljiva iz portala
--
--  Varnostni pregled 21. 10. 2026 (M1): pravilo staff_all_att_terminals je
--  vsakemu članu osebja dovolilo branje att_terminals.secret — ključa HMAC,
--  s katerim terminal za kartice podpisuje prihode in odhode. Z njim bi se
--  dalo ponarediti žig za kogarkoli.
--
--  Portal te tabele ne uporablja; terminal (Edge funkcija »punch«) in
--  »odprte-izmene« jo bereta s service_role, ki RLS obide. Zato odjemalcem
--  (anon, authenticated) odvzamemo vsak dostop.
--
--  Podatki se ne spremenijo. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists "staff_all_att_terminals" on public.att_terminals;
revoke all on table public.att_terminals from anon, authenticated;
