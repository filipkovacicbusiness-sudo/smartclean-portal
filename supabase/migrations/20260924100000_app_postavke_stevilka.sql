-- ════════════════════════════════════════════════════════════════════════
--  59_app_postavke_stevilka.sql — aplikacija (tablica, mobile): varna
--  zamenjava postavk in prosta številka lista
--
--  1. app_zamenjaj_postavke(p_note, p_postavke)
--     Aplikacija je postavke urejenega lista zamenjala v DVEH klicih
--     (DELETE, nato POST). Če je drugi klic padel (omrežje, seja), je list
--     v portalu ostal brez postavk, dokler ga naprava ni poslala znova.
--     Zdaj oboje v eni transakciji. SECURITY INVOKER: veljajo ista RLS
--     pravila kot pri neposrednih klicih (osebje, sme_app, naprava). Če
--     izbris ni dovoljen, se vse razveljavi — postavke se ne podvojijo.
--
--  2. app_prosta_stevilka(p_leto)
--     Naslednja prosta zaporedna številka v letu (največja + 1, tudi
--     izbrisani listi v košu številko še zasedajo). Aplikacija jo ponudi,
--     ko je številka s tablice v portalu že zasedena z drugim listom.
--     SECURITY DEFINER, ker naprava ne vidi nujno vseh listov; vrne le
--     številko in samo osebju / aplikaciji / napravi.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.app_zamenjaj_postavke(p_note uuid, p_postavke jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from public.delivery_note_items where note_id = p_note;
  if exists (select 1 from public.delivery_note_items where note_id = p_note) then
    raise exception 'ni pravic za zamenjavo postavk lista %', p_note using errcode = '42501';
  end if;
  insert into public.delivery_note_items (note_id, article_id, article_name, pieces, sort_order)
  select p_note,
         nullif(x->>'article_id', '')::uuid,
         btrim(x->>'article_name'),
         greatest(coalesce((x->>'pieces')::integer, 0), 0),
         (t.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_postavke, '[]'::jsonb)) with ordinality as t(x, ord)
  where coalesce(btrim(x->>'article_name'), '') <> '';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.app_zamenjaj_postavke(uuid, jsonb) from public, anon;
grant execute on function public.app_zamenjaj_postavke(uuid, jsonb) to authenticated;

create or replace function public.app_prosta_stevilka(p_leto integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when (app.is_staff() or public.sme_app() or app.is_device())
    then coalesce((select max(doc_seq) from public.delivery_notes where doc_year = p_leto), 0) + 1
    else null end;
$$;

revoke all on function public.app_prosta_stevilka(integer) from public, anon;
grant execute on function public.app_prosta_stevilka(integer) to authenticated;
