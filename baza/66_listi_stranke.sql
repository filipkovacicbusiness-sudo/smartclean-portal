-- ════════════════════════════════════════════════════════════════════════
--  66_listi_stranke.sql — stranka ne vidi več internih podatkov spremnih listov
--
--  Pravilo member_read_own_notes je stranki dovolilo branje CELE vrstice
--  delivery_notes. Portal je zato v njen brskalnik prenesel tudi interno
--  opombo (opomba_evidenca), pisno opombo osebja (opomba, opomba_avtor,
--  opomba_at) in dnevnik popravkov (popravki). Zaslon jih ni kazal, a so
--  bili berljivi v orodjih brskalnika.
--
--  Popravek:
--  1) Pogled public.listi_stranke: samo stolpci, ki jih stranka sme videti
--     (vse, kar je natisnjeno na spremnem listu), le njeni listi, brez koša.
--     Pogled teče s pravicami lastnika, zato sam filtrira z app.can_see().
--  2) Neposredno branje tabele delivery_notes za stranke ukinjeno.
--  3) Postavke: pravilo za stranke prek app.stranka_vidi_list() (SECURITY
--     DEFINER), ker podpoizvedba v pravilu ne vidi več tabele listov.
--
--  Osebje, tablica in aplikacija se ne spremenijo (svoja pravila).
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create or replace view public.listi_stranke
with (security_barrier = true)
as
select d.id, d.org_id, d.location_id, d.number, d.doc_year, d.doc_seq, d.doc_date,
       d.total_pieces, d.weight_kg, d.issued_name, d.transport, d.potrjeno,
       d.opomba_stranka, d.popravil, d.popravljeno_at, d.source, d.legacy_id, d.created_at
from public.delivery_notes d
where d.deleted_at is null
  and app.can_see(d.org_id, d.location_id);

revoke all on public.listi_stranke from public, anon;
grant select on public.listi_stranke to authenticated;

create or replace function app.stranka_vidi_list(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from public.delivery_notes d
    where d.id = p_note and d.deleted_at is null
      and app.can_see(d.org_id, d.location_id)
  )
$$;
revoke all on function app.stranka_vidi_list(uuid) from public;
grant execute on function app.stranka_vidi_list(uuid) to authenticated;

drop policy if exists "member_read_own_items" on public.delivery_note_items;
create policy "member_read_own_items" on public.delivery_note_items for select to authenticated
  using (app.stranka_vidi_list(note_id));

drop policy if exists "member_read_own_notes" on public.delivery_notes;
