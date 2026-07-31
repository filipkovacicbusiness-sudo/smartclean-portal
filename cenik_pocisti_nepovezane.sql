-- SmartClean — počisti cenik: mehko izbriši uvožene artikle, ki NISO povezani s stranko
-- Po tem je Cenik 1:1 s Strankami. Zaženi v Supabase → SQL Editor (enkrat).
-- Mehko brisanje = obnovljivo 30 dni v portalu (Ceniki → »Nedavno brisani«).

update public.pricelist
set deleted_at = now()
where deleted_at is null
  and (
    org_id is null
    or org_id not in (select id from public.orgs where deleted_at is null)
  );

-- (neobvezno) preveri, koliko jih je ostalo povezanih:
--   select count(*) from public.pricelist where deleted_at is null;
