-- ════════════════════════════════════════════════════════════════════════
--  preveri_fakture.sql — kontrola pred izstavitvijo računov
--
--  Ni migracija: samo bere. Poženi za obdobje, ki ga boš fakturiral, in
--  preglej štiri kontrole. Vse morajo biti prazne ali z ničlami.
--
--  Zakaj: portal postavko brez cene šteje kot 0 in to omeni le v opombi.
--  Vsota je zato lahko prenizka, ne da bi kdo opazil. Te poizvedbe to
--  pokažejo, preden račun odide stranki.
--
--  SPREMENI DATUMA v prvi vrstici vsake kontrole.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  1) VSOTE PO STRANKAH — to mora ustrezati portalu
--     BREZ_CENE mora biti 0. Karkoli več pomeni prenizko vsoto.
-- ─────────────────────────────────────────────────────────────────────
with obdobje as (select '2026-09-01'::date as od, '2026-09-14'::date as do_),
vrstice as (
  select n.org_id, btrim(i.article_name) as artikel,
         sum(i.pieces) as kosov,
         min(i.article_id::text) filter (where i.article_id is not null) as aid
  from public.delivery_notes n
  join public.delivery_note_items i on i.note_id = n.id
  cross join obdobje o
  where n.deleted_at is null and n.doc_date between o.od and o.do_
  group by n.org_id, btrim(i.article_name)
),
scena as (
  select v.*, coalesce(
      (select p.cena1 from public.articles a
         join public.pricelist p on p.sifra = a.cena_sifra and p.deleted_at is null
        where a.id::text = v.aid),
      (select p.cena1 from public.articles a
         join public.pricelist p on p.sifra = a.cena_sifra and p.deleted_at is null
        where a.org_id = v.org_id and lower(btrim(a.name)) = lower(v.artikel) limit 1)
    ) as cena
  from vrstice v
)
select coalesce(o.name, '⚠ NEZNANA STRANKA')            as stranka,
       count(*)                                          as vrstic,
       count(*) filter (where s.cena is null)            as brez_cene,
       sum(s.kosov)                                      as kosov,
       round(sum(s.kosov * coalesce(s.cena,0))::numeric, 2)         as neto,
       round((sum(s.kosov * coalesce(s.cena,0)) * 1.22)::numeric,2) as bruto
from scena s left join public.orgs o on o.id = s.org_id
group by o.name order by brez_cene desc, o.name;


-- ─────────────────────────────────────────────────────────────────────
--  2) KATERE POSTAVKE NIMAJO CENE — te manjkajo v znesku
--     Najpogosteje: artikel je bil preimenovan (stare postavke nosijo
--     staro ime) ali pa je bil umaknjen iz cenika (pricelist.deleted_at).
-- ─────────────────────────────────────────────────────────────────────
with obdobje as (select '2026-09-01'::date as od, '2026-09-14'::date as do_)
select o.name as stranka, btrim(i.article_name) as artikel,
       sum(i.pieces) as kosov,
       count(*) filter (where i.article_id is null) as brez_povezave_na_artikel
from public.delivery_notes n
join public.delivery_note_items i on i.note_id = n.id
join public.orgs o on o.id = n.org_id
cross join obdobje ob
where n.deleted_at is null and n.doc_date between ob.od and ob.do_
  and not exists (
    select 1 from public.articles a
     join public.pricelist p on p.sifra = a.cena_sifra and p.deleted_at is null
    where a.id = i.article_id
       or (a.org_id = n.org_id and lower(btrim(a.name)) = lower(btrim(i.article_name)))
  )
group by o.name, btrim(i.article_name)
order by sum(i.pieces) desc;


-- ─────────────────────────────────────────────────────────────────────
--  3) NESKLADJE MED GLAVO IN POSTAVKAMI
--     Kartica pokaže total_pieces z glave, postavke pa so svoj seštevek.
--     Če se razideta, račun sam sebi nasprotuje.
-- ─────────────────────────────────────────────────────────────────────
with obdobje as (select '2026-09-01'::date as od, '2026-09-14'::date as do_)
select n.number, o.name as stranka, n.doc_date,
       n.total_pieces as v_glavi,
       coalesce(sum(i.pieces), 0) as v_postavkah,
       n.total_pieces - coalesce(sum(i.pieces), 0) as razlika
from public.delivery_notes n
left join public.delivery_note_items i on i.note_id = n.id
left join public.orgs o on o.id = n.org_id
cross join obdobje ob
where n.deleted_at is null and n.doc_date between ob.od and ob.do_
group by n.id, n.number, o.name, n.doc_date, n.total_pieces
having n.total_pieces <> coalesce(sum(i.pieces), 0)
order by abs(n.total_pieces - coalesce(sum(i.pieces), 0)) desc;


-- ─────────────────────────────────────────────────────────────────────
--  4) SPREMNI LISTI BREZ STRANKE ALI BREZ POSTAVK
--     Prvi se v portalu prikažejo pod »Brez stranke«, drugi tiho
--     prispevajo 0 in jih je lahko spregledati.
-- ─────────────────────────────────────────────────────────────────────
with obdobje as (select '2026-09-01'::date as od, '2026-09-14'::date as do_)
select n.number, n.doc_date, n.total_pieces,
       case when o.id is null then 'stranka ne obstaja ali je izbrisana' end as tezava_stranka,
       case when not exists (select 1 from public.delivery_note_items i where i.note_id = n.id)
            then 'ni postavk' end as tezava_postavke
from public.delivery_notes n
left join public.orgs o on o.id = n.org_id and o.deleted_at is null
cross join obdobje ob
where n.deleted_at is null and n.doc_date between ob.od and ob.do_
  and (o.id is null
       or not exists (select 1 from public.delivery_note_items i where i.note_id = n.id))
order by n.doc_date;
