-- ════════════════════════════════════════════════════════════════════════
--  77_rfid_popravki.sql — pregled 76 (28. 10. 2026)
--
--  1. rfid_oznaci: p_preseli privzeto NULL. Odjemalec pred 4.79 ga ne pošlje in »drugje« ne pozna —
--     namesto tihega izpusta (in lažnega »Označeno«) dobi napako »Stran je zastarela«.
--  2. rfid_oznaci: pri preselitvi se vzame vrstica pri živi stranki (prej morda pri izbrisani).
--  3. rfid_potrdi, že oddano: odloča zadnja veljavna seja kosa v 12 urah (prevzem ali oddaja z
--     neizbrisanim listom). Prej: če je bil zadnji list izbrisan, prejšnji veljavni list ni bil opozorjen.
--  4. rfid_stanje: blokira le oživitev ODPISANEGA kosa, ki je živ pri drugi stranki (prej tudi
--     aktiven ↔ izgubljen); napaka P0001, da odjemalec pokaže slovensko sporočilo.
--
--  POZOR: 72, 74, 75 in 76 po tem NE poganjaj znova.  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

drop function if exists public.rfid_oznaci(uuid, uuid, text[], boolean);
create or replace function public.rfid_oznaci(p_org uuid, p_article uuid, p_epcs text[], p_preseli boolean default null)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  a public.articles; s uuid; e text; k public.rfid_kosi; d public.rfid_kosi; ids uuid[] := '{}'; drugje text[] := '{}';
  novih int := 0; prestavljenih int := 0; enakih int := 0; preseljenih int := 0; odpisanih int := 0;
  v_stranka text; v_od text; v_pranj int;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  select * into a from public.articles where id = p_article and org_id = p_org;
  if not found then raise exception 'Artikel ni artikel te stranke.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('sc_rfid'));
  select name into v_stranka from public.orgs where id = p_org;
  insert into public.rfid_seje (org_id, tip) values (p_org, 'oznacevanje') returning id into s;
  foreach e in array app.rfid_epci(p_epcs) loop
    -- živ pri drugi (živi) stranki: brez izrecnega »Preseli« ostane, kjer je
    if not coalesce(p_preseli, false) and exists (
        select 1 from public.rfid_kosi x join public.orgs o on o.id = x.org_id and o.deleted_at is null and coalesce(o.active, true)
        where x.epc = e and x.org_id <> p_org and x.stanje <> 'odpisan') then
      -- odjemalec pred 4.79 parametra ne pošlje in »drugje« ne pozna: raje napaka kot tiho »Označeno«
      if p_preseli is null then raise exception 'Stran je zastarela. Osvežite jo in poskusite znova.' using errcode = 'P0001'; end if;
      drugje := drugje || e;
      continue;
    end if;
    select max(pranj) into v_pranj from public.rfid_kosi where epc = e and org_id <> p_org and stanje <> 'odpisan';
    select * into k from public.rfid_kosi where org_id = p_org and epc = e for update;
    if not found then
      -- aktiven pri drugi stranki → isti kos se preseli sem (pranja in zgodovina ostanejo)
      select x.* into d from public.rfid_kosi x left join public.orgs o on o.id = x.org_id
        where x.epc = e and x.org_id <> p_org and x.stanje <> 'odpisan'
        order by (o.id is not null and o.deleted_at is null and coalesce(o.active, true)) desc, x.zadnjic desc nulls last limit 1 for update of x;   -- najprej živa stranka
      if found then
        select name into v_od from public.orgs where id = d.org_id;
        update public.rfid_kosi set org_id = p_org, article_id = a.id, naziv = coalesce(a.name, ''), stanje = 'aktiven',
          pranj = greatest(pranj, coalesce(v_pranj, 0)), zadnji_tip = 'oznacen', zadnjic = now() where id = d.id;
        insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) values (d.id, s, 'oznacen',
          coalesce(v_od, 'druga stranka') || ' → ' || coalesce(v_stranka, 'stranka')
          || case when d.article_id is distinct from a.id then ' · ' || d.naziv || ' → ' || a.name else '' end
          || case when d.stanje <> 'aktiven' then ' (' || d.stanje || ' → aktiven)' else '' end);
        ids := ids || d.id; preseljenih := preseljenih + 1;
      else
        insert into public.rfid_kosi (org_id, epc, article_id, naziv, zadnji_tip, zadnjic)
          values (p_org, e, a.id, coalesce(a.name, ''), 'oznacen', now())
          on conflict (org_id, epc) do nothing returning * into k;   -- druga naprava ga je ravno označila
        if k.id is not null then ids := ids || k.id; novih := novih + 1; else enakih := enakih + 1; end if;
      end if;
    else
      if k.article_id is distinct from a.id then
        update public.rfid_kosi set article_id = a.id, naziv = coalesce(a.name, ''), stanje = 'aktiven',
          pranj = greatest(pranj, coalesce(v_pranj, 0)) where id = k.id;
        insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) values (k.id, s, 'oznacen',
          k.naziv || ' → ' || a.name || case when k.stanje <> 'aktiven' then ' (' || k.stanje || ' → aktiven)' else '' end);
        ids := ids || k.id; prestavljenih := prestavljenih + 1;
      elsif k.stanje <> 'aktiven' then
        update public.rfid_kosi set stanje = 'aktiven', pranj = greatest(pranj, coalesce(v_pranj, 0)) where id = k.id;
        insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) values (k.id, s, 'stanje', k.stanje || ' → aktiven (znova označen)');
        ids := ids || k.id; prestavljenih := prestavljenih + 1;
      else
        enakih := enakih + 1;
      end if;
    end if;
    -- isti čip še pri kateri drugi stranki (»pri več strankah«): tam odpisan
    for d in select * from public.rfid_kosi where epc = e and org_id <> p_org and stanje <> 'odpisan' for update loop
      update public.rfid_kosi set stanje = 'odpisan' where id = d.id;
      insert into public.rfid_dogodki (kos_id, seja_id, tip, opis)
        values (d.id, s, 'stanje', d.stanje || ' → odpisan (označen pri ' || coalesce(v_stranka, 'drugi stranki') || ')');
      odpisanih := odpisanih + 1;
    end loop;
  end loop;
  if cardinality(ids) = 0 and odpisanih = 0 then
    delete from public.rfid_seje where id = s; s := null;   -- nič se ni spremenilo
  else
    update public.rfid_seje set kosi = ids where id = s;
  end if;
  return json_build_object('seja', s, 'novih', novih, 'prestavljenih', prestavljenih, 'enakih', enakih,
    'preseljenih', preseljenih, 'odpisanih', odpisanih, 'drugje', drugje);
end $$;

-- ── prevzem / oddaja ────────────────────────────────────────────────────
create or replace function public.rfid_potrdi(p_tip text, p_epcs text[], p_kljuc uuid, p_izdal text default null, p_preveri boolean default false)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  vsi text[]; dvoumni text[]; g record; s uuid; v_note uuid; v_seq int; v_leto int; v_danes date; i int;
  listi jsonb := '[]'; znanih int := 0; v_izdal text; v_ze jsonb; v_prstni text;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  if p_tip not in ('prevzem', 'oddaja') then raise exception 'Neveljavna vrsta skeniranja.' using errcode = '22023'; end if;
  if p_kljuc is null then raise exception 'Manjka ključ potrditve.' using errcode = '22023'; end if;
  vsi := app.rfid_epci(p_epcs);
  v_prstni := md5(p_tip || ':' || array_to_string(array(select x from unnest(vsi) x order by x), ','));
  -- ponovljena potrditev (dvojni klik, ponovitev po izpadu omrežja): vrni že narejeno, nič dvakrat
  perform pg_advisory_xact_lock(hashtext('sc_rfid_potrdi'), hashtext(p_kljuc::text));
  if exists (select 1 from public.rfid_seje where kljuc = p_kljuc) then
    if exists (select 1 from public.rfid_seje where kljuc = p_kljuc and prstni is not null and prstni <> v_prstni) then
      raise exception 'kljuc_porabljen' using errcode = 'P0001', hint = 'Ključ potrditve je že porabljen za drugo skeniranje.';
    end if;
    return (select json_build_object('ponovljeno', true, 'kosov', coalesce(sum(cardinality(x.kosi)), 0), 'neznanih', 0, 'dvoumni', '{}'::text[],
      'listi', coalesce(jsonb_agg(jsonb_build_object('org', x.org_id, 'note', x.note_id, 'stevilka', d.number, 'kosov', cardinality(x.kosi)) order by o.name), '[]'))
      from public.rfid_seje x join public.orgs o on o.id = x.org_id left join public.delivery_notes d on d.id = x.note_id where x.kljuc = p_kljuc);
  end if;
  perform pg_advisory_xact_lock(hashtext('sc_rfid'));   -- skupaj z označevanjem in stanjem (vrstni red: ključ → sc_rfid → leto)
  -- izdal: ime prijavljenega iz profila (odjemalec ga ne more podtakniti), sicer poslano ime
  select nullif(btrim(coalesce(full_name, '')), '') into v_izdal from public.profiles where id = auth.uid();
  v_izdal := coalesce(v_izdal, nullif(btrim(coalesce(p_izdal, '')), ''));
  v_danes := (now() at time zone 'Europe/Ljubljana')::date;
  v_leto := extract(year from v_danes)::int;
  if p_tip = 'oddaja' then perform pg_advisory_xact_lock(hashtext('sc_stevilke_listov'), v_leto); end if;   -- isto zaklepanje kot rezervacija številk (70)

  -- pri več (živih) strankah: šele po zaklepu, da vmesno označevanje ne pobegne
  select coalesce(array_agg(epc), '{}') into dvoumni from (
    select k.epc from public.rfid_kosi k join public.orgs o on o.id = k.org_id and o.deleted_at is null and coalesce(o.active, true)
    where k.epc = any (vsi) and k.stanje <> 'odpisan' group by k.epc having count(distinct k.org_id) > 1) x;

  -- že oddano (po zaklepu: druga naprava, ki je potrdila prej, je že vidna)
  if p_tip = 'oddaja' and coalesce(p_preveri, false) then
    with kandidati as (
      select k.id, k.org_id, k.epc from public.rfid_kosi k
      where k.epc = any (vsi) and not (k.epc = any (dvoumni)) and k.stanje <> 'odpisan'),
    zadnja as (   -- zadnja veljavna seja kosa v 12 urah: prevzem ali oddaja z neizbrisanim listom
      select distinct on (c.id) c.id kos_id, c.org_id, c.epc, s2.tip, s2.note_id, d.number, s2.created_at
      from kandidati c
      join public.rfid_seje s2 on s2.kosi @> array[c.id] and s2.org_id = c.org_id and s2.tip in ('prevzem', 'oddaja')
        and s2.created_at > now() - interval '12 hours'
      left join public.delivery_notes d on d.id = s2.note_id
      where s2.tip = 'prevzem' or (d.id is not null and d.deleted_at is null)
      order by c.id, s2.created_at desc),
    ze as (
      select z.org_id, array_agg(distinct z.epc) epcs, count(*)::int n, max(z.created_at) cas,
        jsonb_agg(distinct jsonb_build_object('note', z.note_id, 'stevilka', z.number)) ze_listi
      from zadnja z where z.tip = 'oddaja'
      group by z.org_id)
    select coalesce(jsonb_agg(jsonb_build_object('org', z.org_id, 'ime', o.name, 'kosov', z.n, 'epc', to_jsonb(z.epcs), 'cas', z.cas, 'listi', z.ze_listi) order by o.name), '[]')
      into v_ze from ze z join public.orgs o on o.id = z.org_id and o.deleted_at is null and coalesce(o.active, true);
    if jsonb_array_length(v_ze) > 0 then
      return json_build_object('ze_oddano', v_ze, 'listi', '[]'::jsonb, 'kosov', 0, 'dvoumni', dvoumni, 'neznanih', 0);
    end if;
  end if;

  -- čip brez artikla (artikel izbrisan, npr. ob menjavi cenika): artikel stranke z istim imenom, a le, če je tak en sam
  with kandidati as (
    select k.id kos, (array_agg(a.id))[1] art, (array_agg(a.name))[1] ime
    from public.rfid_kosi k join public.articles a on a.org_id = k.org_id and coalesce(a.aktiven, true) and lower(btrim(a.name)) = lower(btrim(k.naziv))
    where k.epc = any (vsi) and k.article_id is null and k.stanje <> 'odpisan'
    group by k.id having count(*) = 1),
  pov as (update public.rfid_kosi k set article_id = c.art, naziv = c.ime from kandidati c where k.id = c.kos returning k.id, c.ime)
  insert into public.rfid_dogodki (kos_id, tip, opis) select id, 'oznacen', 'artikel znova povezan: ' || ime from pov;

  for g in
    select k.org_id, array_agg(k.id) ids, array_agg(k.id) filter (where k.stanje = 'izgubljen') najdeni
    from public.rfid_kosi k join public.orgs o on o.id = k.org_id and o.deleted_at is null and coalesce(o.active, true)
    where k.epc = any (vsi) and not (k.epc = any (dvoumni)) and k.stanje <> 'odpisan'
    group by k.org_id, o.name order by o.name
  loop
    v_note := null; v_seq := null;
    if p_tip = 'oddaja' then
      v_seq := greatest(
        coalesce((select max(doc_seq) from public.delivery_notes where doc_year = v_leto and deleted_at is null), 0),
        coalesce((select max(doc_seq) from public.stevilke_rezervacije where doc_year = v_leto and potece >= now()), 0)) + 1;
      <<stevilka>>
      for i in 1..20 loop
        while exists (select 1 from public.delivery_notes where doc_year = v_leto and doc_seq = v_seq and deleted_at is null)
           or exists (select 1 from public.stevilke_rezervacije where doc_year = v_leto and doc_seq = v_seq and potece >= now()) loop
          v_seq := v_seq + 1;
        end loop;
        begin
          insert into public.delivery_notes (org_id, doc_year, doc_seq, doc_date, issued_by, issued_name, transport, source, legacy_id)
            values (g.org_id, v_leto, v_seq, v_danes, auth.uid(), v_izdal, 'redni', 'rfid', 'rfid-' || p_kljuc || '-' || g.org_id)
            returning id into v_note;
          exit stevilka;
        exception when unique_violation then
          if i = 20 then raise; end if;
          v_seq := v_seq + 1;   -- številko je vmes zasedel list iz portala (vnos brez zaklepa številk)
        end;
      end loop;
      insert into public.delivery_note_items (note_id, article_id, article_name, pieces, sort_order)
        select v_note, x.article_id, x.ime, x.n, (row_number() over (order by x.red, x.ime) - 1)::int
        from (select k.article_id, coalesce(a.name, k.naziv) ime, count(*)::int n, min(coalesce(a.sort_order, 2147483647)) red
              from public.rfid_kosi k left join public.articles a on a.id = k.article_id
              where k.id = any (g.ids) group by k.article_id, coalesce(a.name, k.naziv)) x;
    end if;
    insert into public.rfid_seje (org_id, tip, note_id, kosi, kljuc, prstni, prej)
      values (g.org_id, p_tip, v_note, g.ids, p_kljuc, v_prstni,
        (select jsonb_agg(jsonb_build_object('id', id, 'pranj', pranj, 'tip', zadnji_tip, 'cas', zadnjic, 'stanje', stanje)) from public.rfid_kosi where id = any (g.ids)))
      returning id into s;
    update public.rfid_kosi set
      pranj = pranj + case when p_tip = 'oddaja' and (zadnji_tip is distinct from 'oddaja' or zadnjic < now() - interval '12 hours') then 1 else 0 end,
      zadnji_tip = p_tip, zadnjic = now(),
      stanje = case when stanje = 'izgubljen' then 'aktiven' else stanje end   -- izgubljen kos se je našel
    where id = any (g.ids);
    if g.najdeni is not null then
      insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) select x, s, 'stanje', 'izgubljen → aktiven (najden)' from unnest(g.najdeni) x;
    end if;
    znanih := znanih + cardinality(g.ids);
    listi := listi || jsonb_build_object('org', g.org_id, 'note', v_note, 'stevilka', case when v_seq is not null then v_seq || '/' || v_leto end, 'kosov', cardinality(g.ids));
  end loop;
  return json_build_object('listi', listi, 'kosov', znanih, 'dvoumni', dvoumni,
    'neznanih', cardinality(vsi) - znanih - cardinality(dvoumni));
end $$;

-- ── ročna sprememba stanja ───────────────────────────────────────────────
create or replace function public.rfid_stanje(p_kos uuid, p_stanje text)
returns void language plpgsql security definer set search_path to 'public', 'app' as $$
declare k public.rfid_kosi;
begin
  if not (app.is_staff() or app.je_lastnik()) then raise exception 'Za to nimate dovoljenja.' using errcode = '42501'; end if;
  if p_stanje not in ('aktiven', 'izgubljen', 'odpisan') then raise exception 'Neveljavno stanje.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('sc_rfid'));
  select * into k from public.rfid_kosi where id = p_kos for update;
  if not found then raise exception 'Kosa ni.' using errcode = 'P0002'; end if;
  if k.stanje = p_stanje then return; end if;
  if k.stanje = 'odpisan' and p_stanje <> 'odpisan' and exists (
      select 1 from public.rfid_kosi x join public.orgs o on o.id = x.org_id and o.deleted_at is null and coalesce(o.active, true)
      where x.epc = k.epc and x.id <> k.id and x.stanje <> 'odpisan') then
    raise exception 'Ta čip je živ pri drugi stranki.' using errcode = 'P0001';
  end if;
  update public.rfid_kosi set stanje = p_stanje where id = p_kos;
  insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'stanje', k.stanje || ' → ' || p_stanje);
end $$;

revoke all on function public.rfid_oznaci(uuid, uuid, text[], boolean) from public, anon;
grant execute on function public.rfid_oznaci(uuid, uuid, text[], boolean) to authenticated;
revoke all on function public.rfid_potrdi(text, text[], uuid, text, boolean) from public, anon;
grant execute on function public.rfid_potrdi(text, text[], uuid, text, boolean) to authenticated;
revoke all on function public.rfid_stanje(uuid, text) from public, anon;
grant execute on function public.rfid_stanje(uuid, text) to authenticated;
