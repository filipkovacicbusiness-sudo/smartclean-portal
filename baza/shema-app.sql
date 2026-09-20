


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "app";


ALTER SCHEMA "app" OWNER TO "postgres";


CREATE TYPE "app"."member_role" AS ENUM (
    'owner',
    'member'
);


ALTER TYPE "app"."member_role" OWNER TO "postgres";


CREATE TYPE "app"."note_source" AS ENUM (
    'tablet',
    'portal',
    'rfid',
    'import'
);


ALTER TYPE "app"."note_source" OWNER TO "postgres";


CREATE TYPE "app"."pickup_status" AS ENUM (
    'nova',
    'potrjena',
    'opravljena',
    'preklicana'
);


ALTER TYPE "app"."pickup_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."can_see"("p_org" "uuid", "p_loc" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
  select exists (
    select 1
      from memberships m
      join profiles p on p.id = m.user_id and p.active
     where m.user_id = auth.uid()
       and m.org_id  = p_org
       and (m.location_id is null or m.location_id is not distinct from p_loc)
  )
$$;


ALTER FUNCTION "app"."can_see"("p_org" "uuid", "p_loc" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;


ALTER FUNCTION "app"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_device"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
  select coalesce(
    (select p.is_device and p.active and not p.is_staff
       from profiles p where p.id = auth.uid()),
    false)
$$;


ALTER FUNCTION "app"."is_device"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
  select coalesce(
    (select p.is_staff and p.active from profiles p where p.id = auth.uid()),
    false)
$$;


ALTER FUNCTION "app"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."my_org_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
  select m.org_id
    from memberships m
    join profiles p on p.id = m.user_id and p.active
   where m.user_id = auth.uid()
$$;


ALTER FUNCTION "app"."my_org_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."profiles_zascita_pravic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'app'
    AS $$
declare
  sme boolean;
begin
  -- Brez prijavljenega uporabnika gre za service_role (Edge funkcija
  -- ¬ªuporabniki¬´, ki pravice preverja sama), SQL Editor ali psql.
  -- Teh poti ne oviramo, sicer si zapremo tudi roƒçni poseg.
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
    -- 1) Nihƒçe ne sme spreminjati LASTNIH pravic. To je jedro popravka.
    if NEW.id = auth.uid() then
      raise exception 'Lastnih pravic ni mogoƒçe spreminjati.'
        using errcode = '42501';
    end if;

    -- 2) Tujim pravicam sme le super admin ali lastnik ‚Äî enako kot
    --    vmesnik (ADMIN_PRIVZ: osebje ‚Üí uporabniki r=0) in kot Edge
    --    funkcija ¬ªuporabniki¬´ po popravku. Zgolj is_staff NI dovolj:
    --    sicer bi se dva ƒçlana osebja lahko povi≈°ala vzajemno.
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


ALTER FUNCTION "app"."profiles_zascita_pravic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."recount_note"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
declare n uuid;
begin
  n := coalesce(new.note_id, old.note_id);
  update delivery_notes d
     set total_pieces = coalesce((select sum(i.pieces)
                                    from delivery_note_items i
                                   where i.note_id = n), 0)
   where d.id = n;
  return null;
end $$;


ALTER FUNCTION "app"."recount_note"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."rezerviraj_stevilko"("p_leto" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
declare n int;
begin
  if not (app.is_device() or app.is_staff()) then
    raise exception 'Za to nimate pravic.';
  end if;
  insert into doc_counters (doc_year, zadnja) values (p_leto, 0)
    on conflict (doc_year) do nothing;
  update doc_counters set zadnja = zadnja + 1
   where doc_year = p_leto returning zadnja into n;
  return n;
end $$;


ALTER FUNCTION "app"."rezerviraj_stevilko"("p_leto" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."sync_user_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;


ALTER FUNCTION "app"."sync_user_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at := now(); return new; end $$;


ALTER FUNCTION "app"."touch_updated_at"() OWNER TO "postgres";


GRANT USAGE ON SCHEMA "app" TO "authenticated";



REVOKE ALL ON FUNCTION "app"."can_see"("p_org" "uuid", "p_loc" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."can_see"("p_org" "uuid", "p_loc" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "app"."is_device"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_device"() TO "authenticated";



REVOKE ALL ON FUNCTION "app"."is_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_staff"() TO "authenticated";



REVOKE ALL ON FUNCTION "app"."my_org_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."my_org_ids"() TO "authenticated";



REVOKE ALL ON FUNCTION "app"."rezerviraj_stevilko"("p_leto" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."rezerviraj_stevilko"("p_leto" integer) TO "authenticated";




