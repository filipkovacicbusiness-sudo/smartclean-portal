-- SmartClean — ID (koda) kot pravi ključ artikla
-- Zaženi v Supabase → SQL Editor. Namenoma v DVEH korakih:
--   1) NAJPREJ preveri podatke (spodnji SELECT-i). Popravi morebitne prazne/podvojene ID-je.
--   2) Šele KO so ID-ji urejeni, poženi UKAZE ZA UVELJAVITEV.
--
-- OPOMBA: To NE spreminja obstoječega primarnega ključa (pricelist.sifra) in
-- NE ruši povezav (articles.cena_sifra -> pricelist.sifra). Doda pa TRDNO
-- pravilo, da je koda (ID) obvezna in enolična — kar je bistvo »ID = ključ«.
-- S tem se v bazi ne morejo pojaviti prazni ali podvojeni ID-ji.

-- ─────────────────────────────────────────────────────────────
-- KORAK 1 — PREVERJANJE (samo branje, nič ne spremeni)
-- ─────────────────────────────────────────────────────────────

-- 1a) Artikli BREZ ID-ja (prazna ali NULL koda) — te je treba dopolniti:
select sifra, naziv, koda
from public.pricelist
where deleted_at is null
  and (koda is null or btrim(koda) = '')
order by naziv;

-- 1b) PODVOJENI ID-ji (ista koda pri več aktivnih artiklih) — te je treba poenotiti:
select upper(btrim(koda)) as id, count(*) as kolikokrat,
       array_agg(sifra order by sifra) as sifre,
       array_agg(naziv order by sifra) as nazivi
from public.pricelist
where deleted_at is null
  and koda is not null and btrim(koda) <> ''
group by upper(btrim(koda))
having count(*) > 1
order by kolikokrat desc;

-- ─────────────────────────────────────────────────────────────
-- KORAK 2 — UVELJAVITEV (poženi ŠELE, ko sta 1a in 1b PRAZNA)
-- ─────────────────────────────────────────────────────────────

-- 2a) Normaliziraj obliko ID-ja (brez presledkov, velike črke) na aktivnih artiklih:
update public.pricelist
set koda = upper(btrim(koda))
where deleted_at is null
  and koda is not null
  and koda <> upper(btrim(koda));

-- 2b) Enoličnost ID-ja med AKTIVNIMI artikli (izbrisani so izvzeti):
create unique index if not exists pricelist_koda_unikat
  on public.pricelist (upper(btrim(koda)))
  where deleted_at is null;

-- 2c) (neobvezno) ID naj bo OBVEZEN za nove aktivne artikle.
--     Vklopi šele, ko si prepričan, da imajo VSI aktivni artikli ID.
--     Odkomentiraj in poženi:
-- alter table public.pricelist
--   add constraint pricelist_koda_obvezna
--   check (deleted_at is not null or (koda is not null and btrim(koda) <> ''))
--   not valid;
-- alter table public.pricelist validate constraint pricelist_koda_obvezna;
