-- ════════════════════════════════════════════════════════════════════════
--  74_rfid_aplikacija.sql — ločena aplikacija SmartClean RFID (C72) za zaposlene
--
--  Aplikacija na C72 je edino, kar je na napravi; uporabljajo jo zaposleni, ki do
--  portala nimajo dostopa. Dostop je pravica uporabnika (profiles.rfid_dostop, v
--  portalu Uporabniki → Aplikacija RFID), ki jo spreminja le super admin ali lastnik.
--  Osebje in super admin imata čipe že po vlogi (portal, razdelek Čipi).
--
--  Zaposleni z dostopom: berejo čipe (rfid_*), označujejo in potrjujejo prevzem/oddajo.
--  Do strank, artiklov in spremnih listov NE dobijo neposrednega branja — aplikacija dobi
--  le, kar potrebuje: imena strank in artiklov (rfid_podatki) ter za tisk spremne liste,
--  ki jih je pravkar ustvarila aplikacija (rfid_tisk: vir 'rfid', zadnji 3 dnevi).
--  Spreminjanje stanja kosa (izgubljen, odpisan) ostane osebju v portalu.
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists rfid_dostop boolean not null default false;

-- ── pravico spreminja le super admin ali lastnik (kot druge pravice) ────
create or replace function app.profiles_zascita_pravic()
returns trigger
language plpgsql
set search_path to 'public', 'app'
as $$
declare
  sme boolean;
begin
  -- Brez prijavljenega uporabnika gre za service_role (Edge funkcija
  -- »uporabniki«, ki pravice preverja sama), SQL Editor ali psql.
  if auth.uid() is null then
    return NEW;
  end if;

  -- E-pošta je identiteta (po njej jo prepoznajo pravila in Edge funkcije):
  -- iz odjemalca je ne spreminja nihče, tudi ne lastnik. Spremembe gredo
  -- prek Edge funkcije »uporabniki« (Supabase Auth + profil hkrati).
  if NEW.email is distinct from OLD.email then
    raise exception 'E-pošte ni mogoče spremeniti tukaj.'
      using errcode = '42501';
  end if;

  if (NEW.is_staff    is distinct from OLD.is_staff)
  or (NEW.super_admin is distinct from OLD.super_admin)
  or (NEW.zaposleni   is distinct from OLD.zaposleni)
  or (NEW.active      is distinct from OLD.active)
  or (NEW.web_dostop  is distinct from OLD.web_dostop)
  or (NEW.rfid_dostop is distinct from OLD.rfid_dostop)
  or (NEW.is_device   is distinct from OLD.is_device)
  or (NEW.is_tablet   is distinct from OLD.is_tablet)
  then
    -- Nihče ne sme spreminjati LASTNIH pravic.
    if NEW.id = auth.uid() then
      raise exception 'Lastnih pravic ni mogoče spremeniti.'
        using errcode = '42501';
    end if;

    -- Tujim pravicam sme le aktiven super admin ali lastnik (po žetonu).
    select app.je_lastnik() or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active and p.super_admin
    ) into sme;

    if not sme then
      raise exception 'Za spreminjanje pravic nimate dovoljenja.'
        using errcode = '42501';
    end if;
  end if;

  return NEW;
end $$;

alter function app.profiles_zascita_pravic() owner to postgres;

-- ── kdo sme do čipov: lastnik, aktivno osebje / super admin, aktiven račun s pravico ──
create or replace function app.sme_rfid()
returns boolean language sql stable security definer set search_path to 'public', 'app' as $$
  select app.je_lastnik() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false) or coalesce(p.rfid_dostop, false)));
$$;
revoke all on function app.sme_rfid() from public, anon;
grant execute on function app.sme_rfid() to authenticated;

drop policy if exists rfid_kosi_osebje on public.rfid_kosi;
drop policy if exists rfid_seje_osebje on public.rfid_seje;
drop policy if exists rfid_dogodki_osebje on public.rfid_dogodki;
create policy rfid_kosi_osebje on public.rfid_kosi for select to authenticated using (app.sme_rfid());
create policy rfid_seje_osebje on public.rfid_seje for select to authenticated using (app.sme_rfid());
create policy rfid_dogodki_osebje on public.rfid_dogodki for select to authenticated using (app.sme_rfid());

-- ── označevanje in potrditev: vsi z dostopom do čipov ───────────────────
create or replace function public.rfid_oznaci(p_org uuid, p_article uuid, p_epcs text[])
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  a public.articles; s uuid; e text; k public.rfid_kosi; ids uuid[] := '{}';
  novih int := 0; prestavljenih int := 0; enakih int := 0;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  select * into a from public.articles where id = p_article and org_id = p_org;
  if not found then raise exception 'Artikel ni artikel te stranke.' using errcode = '22023'; end if;
  insert into public.rfid_seje (org_id, tip) values (p_org, 'oznacevanje') returning id into s;
  foreach e in array app.rfid_epci(p_epcs) loop
    select * into k from public.rfid_kosi where org_id = p_org and epc = e for update;
    if not found then
      insert into public.rfid_kosi (org_id, epc, article_id, naziv, zadnji_tip, zadnjic)
        values (p_org, e, a.id, coalesce(a.name, ''), 'oznacen', now()) returning * into k;
      ids := ids || k.id; novih := novih + 1;
    elsif k.article_id is distinct from a.id then
      update public.rfid_kosi set article_id = a.id, naziv = coalesce(a.name, ''), stanje = 'aktiven' where id = k.id;
      insert into public.rfid_dogodki (kos_id, seja_id, tip, opis) values (k.id, s, 'oznacen', k.naziv || ' → ' || a.name);
      ids := ids || k.id; prestavljenih := prestavljenih + 1;
    else
      enakih := enakih + 1;
    end if;
  end loop;
  update public.rfid_seje set kosi = ids where id = s;
  return json_build_object('seja', s, 'novih', novih, 'prestavljenih', prestavljenih, 'enakih', enakih);
end $$;

create or replace function public.rfid_potrdi(p_tip text, p_epcs text[], p_kljuc uuid, p_izdal text default null)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  vsi text[]; dvoumni text[]; g record; s uuid; v_note uuid; v_seq int; v_leto int; v_danes date;
  listi jsonb := '[]'; znanih int := 0; v_izdal text;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  if p_tip not in ('prevzem', 'oddaja') then raise exception 'Neveljavna vrsta skeniranja.' using errcode = '22023'; end if;
  if p_kljuc is null then raise exception 'Manjka ključ potrditve.' using errcode = '22023'; end if;
  -- ponovljena potrditev (dvojni klik, ponovitev po izpadu omrežja): vrni že narejeno, nič dvakrat
  perform pg_advisory_xact_lock(hashtext('sc_rfid_potrdi'), hashtext(p_kljuc::text));
  if exists (select 1 from public.rfid_seje where kljuc = p_kljuc) then
    return (select json_build_object('ponovljeno', true, 'kosov', coalesce(sum(cardinality(x.kosi)), 0), 'neznanih', 0, 'dvoumni', '{}'::text[],
      'listi', coalesce(jsonb_agg(jsonb_build_object('org', x.org_id, 'note', x.note_id, 'stevilka', d.number, 'kosov', cardinality(x.kosi)) order by o.name), '[]'))
      from public.rfid_seje x join public.orgs o on o.id = x.org_id left join public.delivery_notes d on d.id = x.note_id where x.kljuc = p_kljuc);
  end if;
  -- izdal: ime prijavljenega iz profila (odjemalec ga ne more podtakniti), sicer poslano ime
  select nullif(btrim(coalesce(full_name, '')), '') into v_izdal from public.profiles where id = auth.uid();
  v_izdal := coalesce(v_izdal, nullif(btrim(coalesce(p_izdal, '')), ''));
  v_danes := (now() at time zone 'Europe/Ljubljana')::date;
  v_leto := extract(year from v_danes)::int;
  vsi := app.rfid_epci(p_epcs);
  select coalesce(array_agg(epc), '{}') into dvoumni from (
    select epc from public.rfid_kosi where epc = any (vsi) and stanje <> 'odpisan' group by epc having count(distinct org_id) > 1) x;
  if p_tip = 'oddaja' then perform pg_advisory_xact_lock(hashtext('sc_stevilke_listov'), v_leto); end if;   -- isto zaklepanje kot rezervacija številk (70)
  for g in
    select k.org_id, array_agg(k.id) ids, array_agg(k.id) filter (where k.stanje = 'izgubljen') najdeni
    from public.rfid_kosi k join public.orgs o on o.id = k.org_id
    where k.epc = any (vsi) and not (k.epc = any (dvoumni)) and k.stanje <> 'odpisan'
    group by k.org_id, o.name order by o.name
  loop
    v_note := null; v_seq := null;
    if p_tip = 'oddaja' then
      v_seq := greatest(
        coalesce((select max(doc_seq) from public.delivery_notes where doc_year = v_leto and deleted_at is null), 0),
        coalesce((select max(doc_seq) from public.stevilke_rezervacije where doc_year = v_leto and potece >= now()), 0)) + 1;
      while exists (select 1 from public.delivery_notes where doc_year = v_leto and doc_seq = v_seq and deleted_at is null)
         or exists (select 1 from public.stevilke_rezervacije where doc_year = v_leto and doc_seq = v_seq and potece >= now()) loop
        v_seq := v_seq + 1;
      end loop;
      insert into public.delivery_notes (org_id, doc_year, doc_seq, doc_date, issued_by, issued_name, transport, source, legacy_id)
        values (g.org_id, v_leto, v_seq, v_danes, auth.uid(), v_izdal, 'redni', 'rfid', 'rfid-' || p_kljuc || '-' || g.org_id)
        returning id into v_note;
      insert into public.delivery_note_items (note_id, article_id, article_name, pieces, sort_order)
        select v_note, x.article_id, x.ime, x.n, (row_number() over (order by x.red, x.ime) - 1)::int
        from (select k.article_id, coalesce(a.name, k.naziv) ime, count(*)::int n, min(coalesce(a.sort_order, 2147483647)) red
              from public.rfid_kosi k left join public.articles a on a.id = k.article_id
              where k.id = any (g.ids) group by k.article_id, coalesce(a.name, k.naziv)) x;
    end if;
    insert into public.rfid_seje (org_id, tip, note_id, kosi, kljuc) values (g.org_id, p_tip, v_note, g.ids, p_kljuc) returning id into s;
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

-- ── podatki za aplikacijo: kdo sem in stranke (le imena); artikli po stranki, ko so potrebni ──
create or replace function public.rfid_podatki()
returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  return json_build_object(
    'ime', (select coalesce(nullif(btrim(full_name), ''), email) from public.profiles where id = auth.uid()),
    'skrbnik', app.je_lastnik() or exists (select 1 from public.profiles where id = auth.uid() and active and super_admin),
    'stranke', coalesce((select json_agg(json_build_object('id', o.id, 'ime', o.name) order by o.sort_order nulls last, o.name)
      from public.orgs o where o.deleted_at is null and coalesce(o.active, true)), '[]'::json));
end $$;

create or replace function public.rfid_artikli(p_org uuid)
returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  return coalesce((select json_agg(json_build_object('id', a.id, 'ime', a.name) order by a.sort_order nulls last, a.name)
    from public.articles a where a.org_id = p_org and coalesce(a.aktiven, true) and nullif(btrim(coalesce(a.name, '')), '') is not null), '[]'::json);
end $$;

-- ── tisk: le spremni listi, ki jih je ustvarila aplikacija (vir 'rfid', zadnji 3 dnevi) ──
create or replace function public.rfid_tisk(p_notes uuid[])
returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  return coalesce((select json_agg(x order by x.doc_year, x.doc_seq) from (
    select n.id, n.number, n.doc_year, n.doc_seq, n.doc_date, n.issued_name, n.transport, n.weight_kg, n.opomba_stranka,
      o.name as stranka, o.legal_name as podjetje,
      coalesce((select json_agg(json_build_object('naziv', i.article_name, 'kosov', i.pieces) order by i.sort_order, i.article_name)
        from public.delivery_note_items i where i.note_id = n.id), '[]'::json) as postavke
    from public.delivery_notes n join public.orgs o on o.id = n.org_id
    where n.id = any (coalesce(p_notes, '{}')) and n.source = 'rfid' and n.deleted_at is null
      and n.created_at > now() - interval '3 days'
  ) x), '[]'::json);
end $$;

revoke all on function public.rfid_oznaci(uuid, uuid, text[]) from public, anon;
revoke all on function public.rfid_potrdi(text, text[], uuid, text) from public, anon;
revoke all on function public.rfid_podatki() from public, anon;
revoke all on function public.rfid_artikli(uuid) from public, anon;
revoke all on function public.rfid_tisk(uuid[]) from public, anon;
grant execute on function public.rfid_oznaci(uuid, uuid, text[]) to authenticated;
grant execute on function public.rfid_potrdi(text, text[], uuid, text) to authenticated;
grant execute on function public.rfid_podatki() to authenticated;
grant execute on function public.rfid_artikli(uuid) to authenticated;
grant execute on function public.rfid_tisk(uuid[]) to authenticated;
