-- ════════════════════════════════════════════════════════════════════════
--  21_cena_potrjena.sql — potrditev cene pri artiklih
--  Kljukica »cena potrjena«. Barvna stanja v Artiklih:
--    rdeča  = cena 0,00 €
--    oranžna = cena vpisana, a še ni potrjena (kljukica ni obkljukana)
--    zelena = cena potrjena
--  Zaženi enkrat v Supabase SQL editorju.
-- ════════════════════════════════════════════════════════════════════════
alter table public.pricelist
  add column if not exists cena_potrjena boolean not null default false;
