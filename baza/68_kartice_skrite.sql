-- ════════════════════════════════════════════════════════════════════════
--  68_kartice_skrite.sql — žeton kartice ni več berljiv iz portala
--
--  employees.card_token je skrivnost, zapisana na kartici zaposlenega; z njo
--  terminal beleži prihod in odhod. Vsak član osebja jo je lahko prebral in
--  z njo naredil kopijo kartice (beleženje ur namesto drugega).
--
--  Zdaj:
--  1) employees.ima_kartico (izračunan stolpec) — portal vidi le, ali je
--     kartica dodeljena.
--  2) Stolpec card_token za odjemalce ni berljiv (pravice po stolpcih);
--     dodeliti oz. zamenjati kartico osebje še vedno sme (UPDATE).
--  3) kartica_lastnik(žeton): ime zaposlenega, ki že ima ta žeton (za jasno
--     sporočilo ob dodeljevanju) — ne razkrije nobenega žetona.
--  Terminal in skripte uporabljajo funkcije SECURITY DEFINER (nespremenjene).
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

alter table public.employees
  add column if not exists ima_kartico boolean
  generated always as (card_token is not null and length(btrim(card_token)) > 0) stored;

revoke select on public.employees from anon, authenticated;
grant select (id, org_id, ime, profile_id, active, created_at, ima_kartico) on public.employees to authenticated;

create or replace function public.kartica_lastnik(p_zeton text, p_razen uuid default null)
returns text
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select e.ime from public.employees e
  where app.is_staff()
    and e.card_token = upper(regexp_replace(coalesce(p_zeton, ''), '\s', '', 'g'))
    and (p_razen is null or e.id <> p_razen)
  limit 1
$$;
revoke all on function public.kartica_lastnik(text, uuid) from public, anon;
grant execute on function public.kartica_lastnik(text, uuid) to authenticated;
