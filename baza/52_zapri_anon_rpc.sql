-- ════════════════════════════════════════════════════════════════════════
--  52_zapri_anon_rpc.sql
--
--  NUJNO. Štiri funkcije so dosegljive VSAKOMUR na internetu.
--
--  Vse štiri so podeljene vlogi `anon`, torej za klic ni potrebna prijava —
--  dovolj je objavljeni ključ `sb_publishable_…` iz config.js. Vse so
--  SECURITY DEFINER, torej obidejo RLS:
--
--    list_employees()   → vrne VSE zaposlene (id, ime, ali imajo kartico)
--    recent_scans(n)    → vrne zadnje prislone kartic, vključno s ŠTEVILKO
--                         kartice; n je brez zgornje meje (greatest(1,n)),
--                         torej recent_scans(999999) izpiše vse doslej
--    assign_card(...)   → poveže kartico z zaposlenim; edina zaščita je
--                         PIN, TRDO ZAPISAN v telesu funkcije
--    terminal_stamp(...)→ zapiše prihod/odhod; parameter p_ts določi ČAS,
--                         torej se ure lahko ponaredijo za nazaj
--
--  Veriga: list_employees → recent_scans (poberi številke kartic) →
--  terminal_stamp (štempljaj v imenu kogarkoli, ob poljubni uri).
--
--  PIN v assign_card je bil od objave sheme viden v javnem repozitoriju.
--  Zamenjamo ga s preverjanjem osebja — PIN-a v kodi ne sme biti.
--
--  Nič v portalu, na tablici ali v mobilni aplikaciji teh funkcij ne kliče
--  (preverjeno z iskanjem po celotnem repozitoriju). Kliče jih le stara
--  terminal/stemplj.py, ki je tako ali tako ne bomo uporabili — nova pot je
--  Edge funkcija `punch` s HMAC podpisom. Zato tu nič ne odpade.
--
--  Zaženi v Supabase → SQL Editor. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Popolnoma zapri za neprijavljene ─────────────────────────────────
revoke all on function public.terminal_stamp(text, text, timestamp with time zone) from anon;
revoke all on function public.list_employees()                                     from anon;
revoke all on function public.recent_scans(integer)                                from anon;
revoke all on function public.assign_card(text, text, text)                        from anon;

-- ── 2. terminal_stamp ni več v uporabi: zapri tudi za prijavljene ───────
-- Nadomešča ga Edge funkcija `punch` (HMAC + nonce + strežniški čas).
-- Če bi jo kdaj spet potreboval, vrni pravico z GRANT … TO authenticated.
revoke all on function public.terminal_stamp(text, text, timestamp with time zone) from authenticated;

-- ── 3. assign_card: namesto PIN-a v kodi zahtevaj osebje ────────────────
-- Podpis pustimo nespremenjen (p_pin se ignorira), da se ne podre noben klic.
create or replace function public.assign_card(p_id text, p_card text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'app' as $$
declare v_ime text; v_clash text;
begin
  if not app.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'ni_pravic');
  end if;
  if p_card is null or length(btrim(p_card)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_card');
  end if;
  select ime into v_clash from public.employees
    where card_token = btrim(p_card) and id::text <> p_id limit 1;
  if v_clash is not null then
    return jsonb_build_object('ok', false, 'reason', 'card_taken', 'ime', v_clash);
  end if;
  update public.employees set card_token = btrim(p_card)
    where id::text = p_id returning ime into v_ime;
  if v_ime is null then return jsonb_build_object('ok', false, 'reason', 'no_emp'); end if;
  return jsonb_build_object('ok', true, 'ime', v_ime, 'card', btrim(p_card));
end $$;

-- ── 4. list_employees in recent_scans: samo osebje ──────────────────────
create or replace function public.list_employees()
returns jsonb language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if not app.is_staff() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'ime', ime, 'aktiven', coalesce(active,true),
           'ima_karto', (card_token is not null and length(btrim(card_token))>0)
         ) order by ime), '[]'::jsonb) from public.employees);
end $$;

-- recent_scans dodatno omeji število vrstic (prej brez zgornje meje).
create or replace function public.recent_scans(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public', 'app' as $$
begin
  if not app.is_staff() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(x order by x.ts desc), '[]'::jsonb)
          from (select uid, terminal, ts from public.card_scans
                order by ts desc
                limit least(200, greatest(1, coalesce(p_limit,10)))) x);
end $$;


-- ── PREVERJANJE ─────────────────────────────────────────────────────────
-- Nobena od štirih ne sme biti več dostopna vlogi anon:
--   select p.proname, r.rolname
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
--     cross join lateral aclexplode(p.proacl) a
--     join pg_roles r on r.oid = a.grantee
--    where p.proname in ('terminal_stamp','list_employees','recent_scans','assign_card')
--      and r.rolname = 'anon';
--   -- pričakovano: 0 vrstic
--
-- Kontrolni klic brez prijave (mora vrniti 401/permission denied):
--   curl -s -X POST "https://anrhtgbckxrccnafcmsz.supabase.co/rest/v1/rpc/list_employees" \
--     -H "apikey: <sb_publishable_…>" -H "Content-Type: application/json" -d '{}'
