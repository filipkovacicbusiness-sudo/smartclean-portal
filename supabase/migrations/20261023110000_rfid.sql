-- ════════════════════════════════════════════════════════════════════════
--  72_rfid.sql — perilo s čipi (UHF RFID)
--
--  Vsaka stranka ima svoje perilo: kos = čip (EPC) pri stranki + njen artikel.
--  EPC je enoličen le znotraj stranke (dve stranki imata lahko čip z isto
--  številko) — skeniranje zato vedno teče v okviru ene stranke.
--
--  rfid_kosi     kos perila: epc, stranka, artikel, stanje, število pranj, kje je bil nazadnje
--  rfid_seje     eno skeniranje (označevanje, prevzem, oddaja) s SEZNAMOM kosov (kosi uuid[]).
--                Zgodovina kosa = seje, ki ga vsebujejo (GIN indeks). Ena vrstica na skeniranje
--                namesto ena na kos: pri ~10.000 kosih in dveh skeniranjih na teden ~4–5× manj prostora.
--  rfid_dogodki  le redki dogodki kosa: prestavljen na drug artikel, sprememba stanja, najden
--
--  Prevzem in oddaja: skeniraš vse naenkrat (lahko več strank), rfid_potrdi kose razvrsti po strankah
--  in v ENI transakciji pri oddaji vsaki stranki ustvari spremni list (naslednja prosta številka,
--  današnji datum, vir »rfid«, postavke po artiklih; težo in skupno število preračuna baza sama).
--  Ključ potrditve (p_kljuc) prepreči dvojne liste ob dvojnem kliku ali ponovitvi po izpadu omrežja.
--  Čip, ki je pri več strankah, se ne šteje (»pri več strankah«) — označi se znova pri pravi stranki.
--
--  Pranje se šteje ob ODDAJI (čisto perilo gre k stranki). Dvojno skeniranje iste oddaje ne
--  šteje dvakrat: pranje +1 le, če kos od zadnje oddaje vmes ni bil oddan (prevzem) ali je od
--  zadnje oddaje minilo vsaj 12 ur.
--
--  Varnost: tabele bere le aktivno osebje in lastnik (RLS). Pisanje SAMO prek funkcij
--  (security definer, preverijo osebje) — števila pranj, stanj in zgodovine ni mogoče
--  spreminjati mimo skeniranja.
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.rfid_kosi (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  epc text not null,
  article_id uuid references public.articles(id) on delete set null,
  naziv text not null,                          -- ime artikla ob označitvi (ostane, če se artikel izbriše)
  stanje text not null default 'aktiven',
  pranj integer not null default 0,
  zadnji_tip text,                              -- oznacen | prevzem | oddaja
  zadnjic timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint rfid_kosi_epc_oblika check (epc ~ '^[0-9A-F]{8,64}$'),
  constraint rfid_kosi_stanje check (stanje in ('aktiven', 'izgubljen', 'odpisan')),
  constraint rfid_kosi_zadnji check (zadnji_tip is null or zadnji_tip in ('oznacen', 'prevzem', 'oddaja'))
);
create unique index if not exists rfid_kosi_org_epc on public.rfid_kosi (org_id, epc);
create index if not exists rfid_kosi_epc on public.rfid_kosi (epc);

create table if not exists public.rfid_seje (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  tip text not null,
  note_id uuid references public.delivery_notes(id) on delete set null,
  kosi uuid[] not null default '{}',
  neznanih integer not null default 0,
  kljuc uuid,                                   -- ključ potrditve (ista potrditev se ne izvede dvakrat)
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint rfid_seje_tip check (tip in ('oznacevanje', 'prevzem', 'oddaja'))
);
create index if not exists rfid_seje_org on public.rfid_seje (org_id, created_at desc);
create index if not exists rfid_seje_kosi on public.rfid_seje using gin (kosi);
create unique index if not exists rfid_seje_kljuc on public.rfid_seje (kljuc, org_id) where kljuc is not null;

create table if not exists public.rfid_dogodki (
  id bigint generated always as identity primary key,
  kos_id uuid not null references public.rfid_kosi(id) on delete cascade,
  seja_id uuid references public.rfid_seje(id) on delete set null,
  tip text not null,
  opis text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint rfid_dogodki_tip check (tip in ('oznacen', 'stanje'))
);
create index if not exists rfid_dogodki_kos on public.rfid_dogodki (kos_id, created_at desc);

alter table public.rfid_kosi enable row level security;
alter table public.rfid_seje enable row level security;
alter table public.rfid_dogodki enable row level security;
drop policy if exists rfid_kosi_osebje on public.rfid_kosi;
drop policy if exists rfid_seje_osebje on public.rfid_seje;
drop policy if exists rfid_dogodki_osebje on public.rfid_dogodki;
create policy rfid_kosi_osebje on public.rfid_kosi for select to authenticated using (app.is_staff() or app.je_lastnik());
create policy rfid_seje_osebje on public.rfid_seje for select to authenticated using (app.is_staff() or app.je_lastnik());
create policy rfid_dogodki_osebje on public.rfid_dogodki for select to authenticated using (app.is_staff() or app.je_lastnik());
revoke all on public.rfid_kosi, public.rfid_seje, public.rfid_dogodki from anon, authenticated;
grant select on public.rfid_kosi, public.rfid_seje, public.rfid_dogodki to authenticated;

-- EPC iz čitalca: velike črke, brez presledkov in ločil; neveljavne izpusti
create or replace function app.rfid_epci(p_epcs text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct e), '{}')
  from (select upper(regexp_replace(x, '[^0-9A-Fa-f]', '', 'g')) e from unnest(coalesce(p_epcs, '{}')) x) t
  where e ~ '^[0-9A-F]{8,64}$'
$$;

-- ── označevanje: čipe dodeli stranki in artiklu ─────────────────────────
-- nov EPC → nov kos; že označen pri tej stranki z drugim artiklom → prestavljen (dogodek)
create or replace function public.rfid_oznaci(p_org uuid, p_article uuid, p_epcs text[])
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  a public.articles; s uuid; e text; k public.rfid_kosi; ids uuid[] := '{}';
  novih int := 0; prestavljenih int := 0; enakih int := 0;
begin
  if not (app.is_staff() or app.je_lastnik()) then raise exception 'Za to nimate dovoljenja.' using errcode = '42501'; end if;
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

-- ── prevzem / oddaja: potrdi skenirane kose (vse stranke naenkrat) ─────
create or replace function public.rfid_potrdi(p_tip text, p_epcs text[], p_kljuc uuid, p_izdal text default null)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare
  vsi text[]; dvoumni text[]; g record; s uuid; v_note uuid; v_seq int; v_leto int; v_danes date;
  listi jsonb := '[]'; znanih int := 0;
begin
  if not (app.is_staff() or app.je_lastnik()) then raise exception 'Za to nimate dovoljenja.' using errcode = '42501'; end if;
  if p_tip not in ('prevzem', 'oddaja') then raise exception 'Neveljavna vrsta skeniranja.' using errcode = '22023'; end if;
  if p_kljuc is null then raise exception 'Manjka ključ potrditve.' using errcode = '22023'; end if;
  -- ponovljena potrditev (dvojni klik, ponovitev po izpadu omrežja): vrni že narejeno, nič dvakrat
  perform pg_advisory_xact_lock(hashtext('sc_rfid_potrdi'), hashtext(p_kljuc::text));
  if exists (select 1 from public.rfid_seje where kljuc = p_kljuc) then
    return (select json_build_object('ponovljeno', true, 'kosov', coalesce(sum(cardinality(x.kosi)), 0), 'neznanih', 0, 'dvoumni', '{}'::text[],
      'listi', coalesce(jsonb_agg(jsonb_build_object('org', x.org_id, 'note', x.note_id, 'stevilka', d.number, 'kosov', cardinality(x.kosi)) order by o.name), '[]'))
      from public.rfid_seje x join public.orgs o on o.id = x.org_id left join public.delivery_notes d on d.id = x.note_id where x.kljuc = p_kljuc);
  end if;
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
      insert into public.delivery_notes (org_id, doc_year, doc_seq, doc_date, issued_name, transport, source, legacy_id)
        values (g.org_id, v_leto, v_seq, v_danes, nullif(btrim(coalesce(p_izdal, '')), ''), 'redni', 'rfid', 'rfid-' || p_kljuc || '-' || g.org_id)
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

-- ── ročna sprememba stanja (izgubljen, odpisan, spet aktiven) ───────────
create or replace function public.rfid_stanje(p_kos uuid, p_stanje text)
returns void language plpgsql security definer set search_path to 'public', 'app' as $$
declare k public.rfid_kosi;
begin
  if not (app.is_staff() or app.je_lastnik()) then raise exception 'Za to nimate dovoljenja.' using errcode = '42501'; end if;
  if p_stanje not in ('aktiven', 'izgubljen', 'odpisan') then raise exception 'Neveljavno stanje.' using errcode = '22023'; end if;
  select * into k from public.rfid_kosi where id = p_kos for update;
  if not found then raise exception 'Kosa ni.' using errcode = 'P0002'; end if;
  if k.stanje = p_stanje then return; end if;
  update public.rfid_kosi set stanje = p_stanje where id = p_kos;
  insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'stanje', k.stanje || ' → ' || p_stanje);
end $$;

revoke all on function public.rfid_oznaci(uuid, uuid, text[]) from public, anon;
revoke all on function public.rfid_potrdi(text, text[], uuid, text) from public, anon;
revoke all on function public.rfid_stanje(uuid, text) from public, anon;
grant execute on function public.rfid_oznaci(uuid, uuid, text[]) to authenticated;
grant execute on function public.rfid_potrdi(text, text[], uuid, text) to authenticated;
grant execute on function public.rfid_stanje(uuid, text) to authenticated;
grant execute on function app.rfid_epci(text[]) to authenticated;
