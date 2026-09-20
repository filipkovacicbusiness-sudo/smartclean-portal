-- ════════════════════════════════════════════════════════════════════════
--  53_sme_app_brez_zaposlenih.sql
--
--  Zapre dvoje, kar vmesnik prepoveduje, baza pa dovoli.
--
--  ── 1. sme_app() je prešrok ───────────────────────────────────────────
--  Funkcija vrne true tudi za profile z zaposleni = true. Nanjo so vezana
--  pravila na PETIH tabelah:
--
--    delivery_note_items  app_sel / app_ins / app_upd / app_del   ← tudi BRIS
--    articles             app_sel
--    pricelist            app_sel
--    audit_log            audit_ins
--    delivery_note_conflicts  dnc_app_sel / dnc_app_ins
--
--  V portalu ima vloga »zaposleni« dostop SAMO do Domov (branje) in
--  Prisotnosti (ADMIN_PRIVZ v portal.js). Arhiva ne vidi. Prek REST pa je
--  lahko brala cenik in artikle ter brisala postavke spremnih listov
--  katerekoli stranke.
--
--  Osebje tega ne izgubi: vzporedna pravila staff_all_items,
--  staff_all_articles, pricelist_staff_all in dnc_staff_all mu dajejo vse
--  že prek app.is_staff(). Po tej spremembi sme_app() pokriva natanko
--  osebje, super admina in lastnika — torej isto kot ta pravila.
--
--  Preverjeno pred pisanjem: vsi trije računi osebja so is_staff, edini
--  račun z zaposleni = true se ni nikoli prijavil (last_login IS NULL),
--  tablica pa se prijavlja z računom osebja. Zato tu ne odpade nič.
--
--  ── 2. audit_log je lahko pisal vsak prijavljen ───────────────────────
--  Pravilo audit_insert ima WITH CHECK (kdo = auth.uid() OR kdo IS NULL)
--  in nobene omejitve vloge. Portal stolpca »kdo« ne nastavlja, zato je
--  pogoj vedno izpolnjen — tudi za stranko. Dnevnik sprememb je torej
--  lahko ponaredil ali zalil kdorkoli s prijavo.
--  Ostane audit_ins (WITH CHECK sme_app()), kar je po točki 1 osebje.
--
--  Zaženi v Supabase → SQL Editor. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. sme_app() brez veje »zaposleni« ──────────────────────────────────
create or replace function public.sme_app()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.web_dostop, true) = true
      and ( coalesce(p.is_staff, false)
         or coalesce(p.super_admin, false)
         or lower(coalesce(p.email, '')) = 'filip@eflitte.si' )
  );
$$;

-- ── 2. Odstrani pravilo, ki je dovolilo pisanje dnevnika vsakomur ───────
drop policy if exists "audit_insert" on public.audit_log;


-- ── PREVERJANJE ─────────────────────────────────────────────────────────
-- 1) sme_app() ne sme več omenjati zaposlenih:
--      select pg_get_functiondef('public.sme_app()'::regprocedure) not like '%zaposleni%';
--      -- pričakovano: true
--
-- 2) audit_log ima le še eno pravilo za INSERT:
--      select policyname, cmd from pg_policies
--       where schemaname='public' and tablename='audit_log' and cmd='INSERT';
--      -- pričakovano: samo audit_ins
--
-- 3) Osebje mora delovati naprej. V portalu kot osebje odpri Arhiv, odpri
--    spremni list, uredi postavko in jo shrani; odpri Cenik & Artikli.
--    Na tablici ustvari testni spremni list in ga sinhroniziraj.
--
-- OPOMBA za naprej: če bo vloga »zaposleni« kdaj res uporabljala portal,
-- potrebuje SVOJA pravila (npr. branje lastnih att_events), ne širjenja
-- sme_app(). Trenutno att_events sploh nima pravila za zaposlene, zato
-- razdelek Prisotnost za to vlogo tako ali tako ne bi deloval.
