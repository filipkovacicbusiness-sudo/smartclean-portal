-- ════════════════════════════════════════════════════════════════════════
--  65_shrani_list.sql — spremni list in njegove postavke v ENI transakciji
--
--  Aplikacija je list shranila v več klicih: list (POST/PATCH), dnevnik,
--  opombi, nato postavke. Če je povezava padla vmes, je bil list v portalu
--  brez postavk. Če ga je osebje medtem potrdilo, ga aplikacija ni smela več
--  popraviti in je ostal prazen za vedno. Portal je pri urejanju postavke
--  brisal in vstavljal v dveh klicih (enaka nevarnost).
--
--  app_shrani_list(p_id, p_list, p_postavke, p_tudi_potrjen)
--  · p_id      uuid lista ali null (nov list).
--  · p_list    polja lista (jsonb); spremenijo se SAMO podani ključi:
--              org_id, doc_year, doc_seq, doc_date, issued_name, weight_kg,
--              transport, source (le pri novem), legacy_id, popravil,
--              popravljeno_at, popravki, opomba_stranka, opomba_evidenca.
--  · p_postavke [{article_id, article_name, pieces}] — zamenja vse postavke.
--  · Brez p_id in z obstoječim legacy_id (isti list iz dveh zavihkov ali po
--    izgubljenem odgovoru) posodobi tisti list, namesto da javi podvojitev.
--  · Potrjenega lista ne spremeni (napaka »potrjen«), razen s
--    p_tudi_potrjen = true (portal, osebje).
--  Vrne uuid lista.
--
--  SECURITY INVOKER: veljajo ista RLS pravila kot pri neposrednih klicih.
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.app_shrani_list(
  p_id uuid,
  p_list jsonb,
  p_postavke jsonb,
  p_tudi_potrjen boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_potrjeno boolean;
  r public.delivery_notes;
begin
  p_list := coalesce(p_list, '{}'::jsonb);
  r := jsonb_populate_record(null::public.delivery_notes, p_list);

  if v_id is null and coalesce(r.legacy_id, '') <> '' then
    select id into v_id from public.delivery_notes where legacy_id = r.legacy_id;
  end if;

  if v_id is null then
    insert into public.delivery_notes (
      org_id, doc_year, doc_seq, doc_date, issued_name, weight_kg, transport, source,
      legacy_id, popravil, popravljeno_at, popravki, opomba_stranka, opomba_evidenca)
    values (
      r.org_id, r.doc_year, r.doc_seq, r.doc_date, r.issued_name, r.weight_kg,
      coalesce(r.transport, 'redni'), coalesce(r.source, 'portal'),
      r.legacy_id, r.popravil, r.popravljeno_at, r.popravki, r.opomba_stranka, r.opomba_evidenca)
    returning id into v_id;
  else
    select potrjeno into v_potrjeno from public.delivery_notes where id = v_id for update;
    if not found then
      raise exception 'spremnega lista % ni', v_id using errcode = 'P0002';
    end if;
    if v_potrjeno and not coalesce(p_tudi_potrjen, false) then
      raise exception 'spremni list je potrjen' using errcode = 'P0001', hint = 'potrjen';
    end if;
    update public.delivery_notes d set
      org_id          = case when p_list ? 'org_id'          then r.org_id          else d.org_id end,
      doc_year        = case when p_list ? 'doc_year'        then r.doc_year        else d.doc_year end,
      doc_seq         = case when p_list ? 'doc_seq'         then r.doc_seq         else d.doc_seq end,
      doc_date        = case when p_list ? 'doc_date'        then r.doc_date        else d.doc_date end,
      issued_name     = case when p_list ? 'issued_name'     then r.issued_name     else d.issued_name end,
      weight_kg       = case when p_list ? 'weight_kg'       then r.weight_kg       else d.weight_kg end,
      transport       = case when p_list ? 'transport'       then coalesce(r.transport, 'redni') else d.transport end,
      legacy_id       = case when p_list ? 'legacy_id'       then r.legacy_id       else d.legacy_id end,
      popravil        = case when p_list ? 'popravil'        then r.popravil        else d.popravil end,
      popravljeno_at  = case when p_list ? 'popravljeno_at'  then r.popravljeno_at  else d.popravljeno_at end,
      popravki        = case when p_list ? 'popravki'        then r.popravki        else d.popravki end,
      opomba_stranka  = case when p_list ? 'opomba_stranka'  then r.opomba_stranka  else d.opomba_stranka end,
      opomba_evidenca = case when p_list ? 'opomba_evidenca' then r.opomba_evidenca else d.opomba_evidenca end
    where d.id = v_id;
  end if;

  perform public.app_zamenjaj_postavke(v_id, p_postavke);
  return v_id;
end;
$$;

revoke all on function public.app_shrani_list(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.app_shrani_list(uuid, jsonb, jsonb, boolean) to authenticated;
