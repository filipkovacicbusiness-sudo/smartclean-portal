-- ════════════════════════════════════════════════════════════════════════
--  58_zapri_rpc_public_2.sql — isti vzrok kot 57, druge funkcije
--
--  Preverjeno 23. 9. 2026 z neprijavljenim klicem prek REST:
--
--  odprte_izmene()  → vrnila ime in čas prihoda osebe, ki je ta hip v službi.
--    Edge funkcija odprte-izmene je zaščitena z x-report-secret, ta RPC pa je
--    bil klicljiv NEPOSREDNO in je varovalko obšel v celoti. Kliče ga samo
--    Edge funkcija z service_role → zapri za vse ostale.
--
--  stranka_kosi(uuid), dn_weight(uuid) → odprti; brez UUID-a nič ne vrneta,
--    UUID-a pa ni mogoče uganiti. Manjše tveganje, a anon nima kaj početi z
--    njima. stranka_kosi kliče portal kot prijavljen uporabnik.
--
--  webauthn_pocisti_izzive() → briše le potekle izzive; neškodljivo, a anon
--    nima kaj početi z njo.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

revoke execute on function public.odprte_izmene()            from public, anon, authenticated;
grant  execute on function public.odprte_izmene()            to service_role;

revoke execute on function public.stranka_kosi(uuid)         from public, anon;
grant  execute on function public.stranka_kosi(uuid)         to authenticated;

revoke execute on function public.dn_weight(uuid)            from public, anon;
grant  execute on function public.dn_weight(uuid)            to authenticated;

revoke execute on function public.webauthn_pocisti_izzive()  from public, anon;
grant  execute on function public.webauthn_pocisti_izzive()  to authenticated, service_role;
