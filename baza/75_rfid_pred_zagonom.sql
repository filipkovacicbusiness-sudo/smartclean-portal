-- ════════════════════════════════════════════════════════════════════════
--  75_rfid_pred_zagonom.sql — čipi pred prvo pravo uporabo (pregled 27. 10. 2026)
--
--  ODDAJA / PREVZEM (rfid_potrdi)
--  1. Že oddano (p_preveri): kosov, ki so bili v zadnjih 12 urah oddani na spremnem listu, ki ni
--     izbrisan (in od takrat ne prevzeti), funkcija ne odda znova — vrne, kaj je že oddano (stranka,
--     kosi, listi). Aplikacija vpraša: izloči ali vseeno ustvari. Ujame isti voziček dvakrat,
--     sosednji že oddani voziček in dve napravi hkrati (zaklep številk ju zvrsti, druga vidi prvo).
--  2. Ključ potrditve je vezan na vsebino (prstni odtis: vrsta + čipi): isti ključ z drugačno
--     vsebino → napaka »kljuc_porabljen« (prej je vrnil staro potrditev in nove čipe tiho izpustil).
--  3. Čip brez artikla (artikel izbrisan v ceniku) se ob potrditvi znova poveže z artiklom stranke
--     z istim imenom — sicer bi postavka na računu ostala brez cene.
--  4. Izbrisane in neaktivne stranke ne dobijo listov; »pri več strankah« se računa po zaklepu.
--  5. Številko je vmes zasedel list iz portala (vnos brez zaklepa) → naslednja prosta, brez napake.
--  6. Seja hrani prejšnje stanje kosov (pranja, kje) — za morebitno razveljavitev.
--
--  OZNAČI (rfid_oznaci)
--  7. Čip, označen pri DRUGI stranki, se preseli sem (isti kos: pranja in zgodovina ostanejo,
--     dogodek). Odjemalec ga pošlje le, ko oseba to izrecno izbere (»Preseli«).
--  8. Odpisan ali izgubljen kos z istim artiklom je znova aktiven (dogodek); varno ob ponovitvi
--     (dve napravi isti nov čip); brez spremembe se seja ne zapiše.
--
--  OSTALO
--  9. Živi tok: rfid_kosi iz objave (500 čipov = 500 sporočil vsem napravam); odjemalca poslušata
--     seje in dogodke (ena vrstica na stranko ob potrditvi).
-- 10. RLS: pravica se preveri enkrat na poizvedbo (select app.sme_rfid()).
-- 11. Profili: dodajanje in brisanje iz odjemalca le super admin ali lastnik (prej je osebje lahko
--     profil izbrisalo in ga vstavilo s pravicami). Edge »uporabniki« (service_role) ostane.
-- 12. stranka_kosi le za osebje in lastnika.
--
--  POZOR: 72 in 74 po tem NE poganjaj znova — vrnila bi staro obliko rfid_potrdi (4 parametri)
--  ob novi in vsaka potrditev bi bila dvoumna.
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

alter table public.rfid_seje add column if not exists prstni text;
alter table public.rfid_seje add column if not exists prej jsonb;

-- ── označevanje ─────────────────────────────────────────────────────────
create or replace function public.rfid_oznaci(p_org uuid, p_article uuid, p_epcs text[])
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  a public.articles; s uuid; e text; k public.rfid_kosi; d public.rfid_kosi; ids uuid[] := '{}';
  novih int := 0; prestavljenih int := 0; enakih int := 0; preseljenih int := 0; v_stranka text; v_od text;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  select * into a from public.articles where id = p_article and org_id = p_org;
  if not found then raise exception 'Artikel ni artikel te stranke.' using errcode = '22023'; end if;
  select name into v_stranka from public.orgs where id = p_org;
  insert into public.rfid_seje (org_id, tip) values (p_org, 'oznacevanje') returning id into s;
  foreach e in array app.rfid_epci(p_epcs) loop
    select * into k from public.rfid_kosi where org_id = p_org and epc = e for update;
    if not found then
      -- aktiven pri drugi stranki → isti kos se preseli sem (pranja in zgodovina ostanejo)
      select * into d from public.rfid_kosi where epc = e and org_id <> p_org and stanje <> 'odpisan'
        order by zadnjic desc nulls last limit 1 for update;
      if found then
        select name into v_od from public.orgs where id = d.org_id;
        update public.rfid_kosi set org_id = p_org, article_id = a.id, naziv = coalesce(a.name, ''), stanje = 'aktiven' where id = d.id;
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
        update public.rfid_kosi set article_id = a.id, naziv = coalesce(a.name, ''), stanje = 'aktiven' where id = k.id;
        insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) values (k.id, s, 'oznacen',
          k.naziv || ' → ' || a.name || case when k.stanje <> 'aktiven' then ' (' || k.stanje || ' → aktiven)' else '' end);
        ids := ids || k.id; prestavljenih := prestavljenih + 1;
      elsif k.stanje <> 'aktiven' then
        update public.rfid_kosi set stanje = 'aktiven' where id = k.id;
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
      preseljenih := preseljenih + 1;
    end loop;
  end loop;
  if cardinality(ids) = 0 and preseljenih = 0 then
    delete from public.rfid_seje where id = s; s := null;   -- nič se ni spremenilo
  else
    update public.rfid_seje set kosi = ids where id = s;
  end if;
  return json_build_object('seja', s, 'novih', novih, 'prestavljenih', prestavljenih, 'enakih', enakih, 'preseljenih', preseljenih);
end $$;

-- ── prevzem / oddaja ────────────────────────────────────────────────────
-- nov parameter p_preveri: stara oblika (4 parametri) se odstrani, da PostgREST ne izbira med dvema
drop function if exists public.rfid_potrdi(text, text[], uuid, text);
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
  -- izdal: ime prijavljenega iz profila (odjemalec ga ne more podtakniti), sicer poslano ime
  select nullif(btrim(coalesce(full_name, '')), '') into v_izdal from public.profiles where id = auth.uid();
  v_izdal := coalesce(v_izdal, nullif(btrim(coalesce(p_izdal, '')), ''));
  v_danes := (now() at time zone 'Europe/Ljubljana')::date;
  v_leto := extract(year from v_danes)::int;
  if p_tip = 'oddaja' then perform pg_advisory_xact_lock(hashtext('sc_stevilke_listov'), v_leto); end if;   -- isto zaklepanje kot rezervacija številk (70)

  -- čip brez artikla (artikel izbrisan, npr. ob menjavi cenika): artikel stranke z istim imenom
  update public.rfid_kosi k set article_id = a.id, naziv = a.name
  from public.articles a
  where k.epc = any (vsi) and k.article_id is null and k.stanje <> 'odpisan'
    and a.org_id = k.org_id and coalesce(a.aktiven, true) and lower(btrim(a.name)) = lower(btrim(k.naziv));

  -- pri več (živih) strankah: šele po zaklepu, da vmesno označevanje ne pobegne
  select coalesce(array_agg(epc), '{}') into dvoumni from (
    select k.epc from public.rfid_kosi k join public.orgs o on o.id = k.org_id and o.deleted_at is null and coalesce(o.active, true)
    where k.epc = any (vsi) and k.stanje <> 'odpisan' group by k.epc having count(distinct k.org_id) > 1) x;

  -- že oddano (po zaklepu: druga naprava, ki je potrdila prej, je že vidna)
  if p_tip = 'oddaja' and coalesce(p_preveri, false) then
    with nedavno as (
      select s2.org_id, s2.note_id, d.number, s2.created_at, unnest(s2.kosi) kos_id
      from public.rfid_seje s2 join public.delivery_notes d on d.id = s2.note_id and d.deleted_at is null
      where s2.tip = 'oddaja' and s2.created_at > now() - interval '12 hours'),
    ze as (
      select k.org_id, array_agg(distinct k.epc) epcs, count(distinct k.id)::int n, max(n2.created_at) cas,
        jsonb_agg(distinct jsonb_build_object('note', n2.note_id, 'stevilka', n2.number)) ze_listi
      from public.rfid_kosi k join nedavno n2 on n2.kos_id = k.id and n2.org_id = k.org_id
      where k.epc = any (vsi) and not (k.epc = any (dvoumni)) and k.stanje <> 'odpisan' and k.zadnji_tip = 'oddaja'
      group by k.org_id)
    select coalesce(jsonb_agg(jsonb_build_object('org', z.org_id, 'ime', o.name, 'kosov', z.n, 'epc', to_jsonb(z.epcs), 'cas', z.cas, 'listi', z.ze_listi) order by o.name), '[]')
      into v_ze from ze z join public.orgs o on o.id = z.org_id and o.deleted_at is null and coalesce(o.active, true);
    if jsonb_array_length(v_ze) > 0 then
      return json_build_object('ze_oddano', v_ze, 'listi', '[]'::jsonb, 'kosov', 0, 'dvoumni', dvoumni, 'neznanih', 0);
    end if;
  end if;

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

revoke all on function public.rfid_oznaci(uuid, uuid, text[]) from public, anon;
revoke all on function public.rfid_potrdi(text, text[], uuid, text, boolean) from public, anon;
grant execute on function public.rfid_oznaci(uuid, uuid, text[]) to authenticated;
grant execute on function public.rfid_potrdi(text, text[], uuid, text, boolean) to authenticated;

-- ── živi tok: seje in dogodki namesto vsakega kosa ──────────────────────
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rfid_kosi') then
    alter publication supabase_realtime drop table public.rfid_kosi;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rfid_dogodki') then
    alter publication supabase_realtime add table public.rfid_dogodki;
  end if;
end $$;

-- ── RLS: pravica enkrat na poizvedbo ────────────────────────────────────
drop policy if exists rfid_kosi_osebje on public.rfid_kosi;
drop policy if exists rfid_seje_osebje on public.rfid_seje;
drop policy if exists rfid_dogodki_osebje on public.rfid_dogodki;
create policy rfid_kosi_osebje on public.rfid_kosi for select to authenticated using ((select app.sme_rfid()));
create policy rfid_seje_osebje on public.rfid_seje for select to authenticated using ((select app.sme_rfid()));
create policy rfid_dogodki_osebje on public.rfid_dogodki for select to authenticated using ((select app.sme_rfid()));

-- ── profili: dodajanje in brisanje iz odjemalca le super admin ali lastnik ──
create or replace function app.profiles_zascita_vnos()
returns trigger language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;   -- service_role (Edge »uporabniki«), SQL
  if app.je_lastnik() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin) then
    return coalesce(NEW, OLD);
  end if;
  raise exception 'Uporabnike dodaja in briše le skrbnik.' using errcode = '42501';
end $$;
alter function app.profiles_zascita_vnos() owner to postgres;
revoke all on function app.profiles_zascita_vnos() from public, anon;
drop trigger if exists trg_profiles_zascita_vnos on public.profiles;
create trigger trg_profiles_zascita_vnos before insert or delete on public.profiles
  for each row execute function app.profiles_zascita_vnos();

-- ── stranka_kosi: le osebje in lastnik ──────────────────────────────────
create or replace function public.stranka_kosi(p_org uuid)
returns table(article_id uuid, kosov bigint) language sql stable security definer set search_path to 'public' as $$
  select a.id as article_id,
    coalesce((
      select sum(i.pieces)::bigint
      from public.delivery_note_items i
      join public.delivery_notes n on n.id = i.note_id
      where n.org_id = p_org
        and ( i.article_id = a.id
           or (i.article_id is null
               and lower(btrim(i.article_name)) = lower(btrim(a.name))) )
    ), 0) as kosov
  from public.articles a
  where a.org_id = p_org and (app.is_staff() or app.je_lastnik());
$$;
