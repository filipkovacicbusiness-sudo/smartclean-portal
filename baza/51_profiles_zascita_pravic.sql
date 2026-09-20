-- ════════════════════════════════════════════════════════════════════════
--  51_profiles_zascita_pravic.sql
--
--  NUJNO. Odpravlja povišanje lastnih pravic.
--
--  Kaj je narobe zdaj:
--    · pravilo "profiles_self_update" dovoli vsakemu prijavljenemu
--      uporabniku UPDATE lastne vrstice v profiles,
--    · "GRANT ALL ON TABLE profiles TO authenticated" ne omejuje stolpcev,
--    · na profiles ni nobenega sprožilca.
--
--  Posledica: kdorkoli s prijavo — tudi navadna stranka — se z enim samim
--  klicem povzpne v osebje oziroma super admina:
--
--      update profiles set is_staff = true, super_admin = true
--       where id = auth.uid();
--
--  Ker app.is_staff() bere prav ta stolpec, se za tem odprejo vsa pravila,
--  vezana na osebje: vseh 51 strank, spremni listi, fakture, dokumenti in
--  upravljanje uporabnikov.
--
--  Popravek: sprožilec BEFORE UPDATE, ki dovoli spremembo privilegiranih
--  stolpcev samo super adminu ali lastniku, in NIKOMUR nad samim sabo.
--
--  Zaženi v Supabase → SQL Editor. Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

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
  -- Teh poti ne oviramo, sicer si zapremo tudi ročni poseg.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Zanima nas samo sprememba privilegiranih stolpcev.
  if (NEW.is_staff    is distinct from OLD.is_staff)
  or (NEW.super_admin is distinct from OLD.super_admin)
  or (NEW.zaposleni   is distinct from OLD.zaposleni)
  or (NEW.active      is distinct from OLD.active)
  or (NEW.web_dostop  is distinct from OLD.web_dostop)
  then
    -- 1) Nihče ne sme spreminjati LASTNIH pravic. To je jedro popravka.
    if NEW.id = auth.uid() then
      raise exception 'Lastnih pravic ni mogoče spreminjati.'
        using errcode = '42501';
    end if;

    -- 2) Tujim pravicam sme le super admin ali lastnik — enako kot
    --    vmesnik (ADMIN_PRIVZ: osebje → uporabniki r=0) in kot Edge
    --    funkcija »uporabniki« po popravku. Zgolj is_staff NI dovolj:
    --    sicer bi se dva člana osebja lahko povišala vzajemno.
    select exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active
        and ( p.super_admin
           or lower(coalesce(p.email, '')) = 'filip@eflitte.si' )
    ) into sme;

    if not sme then
      raise exception 'Za spreminjanje pravic nimate dovoljenja.'
        using errcode = '42501';
    end if;
  end if;

  return NEW;
end $$;

alter function app.profiles_zascita_pravic() owner to postgres;

drop trigger if exists trg_profiles_zascita on public.profiles;
create trigger trg_profiles_zascita
  before update on public.profiles
  for each row execute function app.profiles_zascita_pravic();


-- ── PREVERJANJE ─────────────────────────────────────────────────────────
-- 1) Sprožilec je nameščen:
--      select tgname, tgenabled from pg_trigger
--       where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- 2) Poskus povišanja samega sebe mora ODPOVEDATI. V portalu (prijavljen
--    kot NAVADEN uporabnik, ne lastnik) odpri konzolo brskalnika:
--
--      const { data:{ user } } = await sb.auth.getUser();
--      await sb.from('profiles').update({ super_admin: true }).eq('id', user.id);
--
--    Pričakovano: napaka 42501 »Lastnih pravic ni mogoče spreminjati.«
--    Pred popravkom je tak klic uspel.
--
-- 3) Uporabniki (kot lastnik) morajo delovati naprej: vklop/izklop
--    »Super admin«, »Spletni dostop« in »Osebje« pri DRUGIH računih.
