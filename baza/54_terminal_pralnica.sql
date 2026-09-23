-- ════════════════════════════════════════════════════════════════════════
--  54_terminal_pralnica.sql
--  Vpiše terminal za štemplanje in izpiše skrivnost zanj.
--
--  Terminal se funkciji »punch« predstavi s slugom, vsako zahtevo pa podpiše
--  s to skrivnostjo (HMAC-SHA256). Skrivnost je edino, kar loči naš terminal
--  od kogarkoli drugega — zato je NE daj nikamor razen v terminal.json na
--  Raspberry Pi (chmod 600).
--
--  Slug je 'pralnica-vhod' in se mora ujemati s TERMINAL_SLUG v stemplj.py.
--  Če ju spremeniš, spremeni OBA — sicer punch terminala ne najde.
--
--  Zaženi po korakih in preberi izpise. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Kateri organizaciji pripadajo zaposleni? ─────────────────────────
-- Funkcija punch zahteva, da sta terminal in zaposleni v ISTI organizaciji.
select o.id as org_id, o.name, count(e.id) as zaposlenih
from public.orgs o
join public.employees e on e.org_id = o.id
group by o.id, o.name
order by zaposlenih desc;


-- ── 2. Vpiši terminal (org_id vzame iz zaposlenih) ──────────────────────
-- pgcrypto je na Supabase že nameščen; gen_random_bytes da 32 naključnih bajtov.
insert into public.att_terminals (org_id, slug, location, secret, active)
select
  (select org_id from public.employees group by org_id order by count(*) desc limit 1),
  'pralnica-vhod',
  'Pralnica — vhod',
  encode(gen_random_bytes(32), 'hex'),
  true
where not exists (select 1 from public.att_terminals where slug = 'pralnica-vhod');


-- ── 3. Preberi skrivnost in jo prenesi na Raspberry Pi ──────────────────
-- Ustvari na Pi-ju  terminal/terminal.json :
--     { "secret": "<spodnja vrednost>" }
-- in nato:  chmod 600 terminal/terminal.json
select slug, location, active, secret
from public.att_terminals
where slug = 'pralnica-vhod';


-- ── 4. Po vpisu kartice poveži žeton z zaposlenim ───────────────────────
-- Žeton izpiše  python3 vpisi_karto.py  na tvojem računalniku.
--
--   update public.employees
--      set card_token = '<ŽETON S KARTICE>'
--    where ime = 'Brigita Kaker';
--
-- Pregled, kdo ima kartico:
--   select ime, active, (card_token is not null) as ima_karto from public.employees order by ime;


-- ── OPOMBA: skrivnost se da zamenjati kadarkoli ─────────────────────────
-- Če bi Pi kdaj odtujili, zamenjaj skrivnost in popravi terminal.json —
-- stare kartice ostanejo veljavne, ponarejene zahteve pa takoj odpovejo:
--   update public.att_terminals
--      set secret = encode(gen_random_bytes(32), 'hex')
--    where slug = 'pralnica-vhod';
