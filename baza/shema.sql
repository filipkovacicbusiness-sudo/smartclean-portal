


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."art_teza_recompute"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if NEW.teza is distinct from OLD.teza then
    update public.delivery_notes dn
       set weight_kg = public.dn_weight(dn.id)
     where dn.id in (
       select i.note_id from public.delivery_note_items i
       join public.delivery_notes n on n.id = i.note_id
       where i.article_id = NEW.id
          or (i.article_id is null and n.org_id = NEW.org_id
              and lower(i.article_name) = lower(NEW.name))
     );
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."art_teza_recompute"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_card"("p_id" "text", "p_card" "text", "p_pin" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_ime text; v_clash text; begin
  if p_pin is distinct from 'SC-setup-2026' then
    return jsonb_build_object('ok', false, 'reason', 'pin');
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
end; $$;


ALTER FUNCTION "public"."assign_card"("p_id" "text", "p_card" "text", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dn_recompute_from_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_note uuid;
begin
  v_note := coalesce(NEW.note_id, OLD.note_id);
  update public.delivery_notes set weight_kg = public.dn_weight(v_note) where id = v_note;
  return null;
end $$;


ALTER FUNCTION "public"."dn_recompute_from_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dn_weight"("p_note" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(
    i.pieces * (
      select a.teza from public.articles a
      where a.teza is not null
        and ( a.id = i.article_id
           or (i.article_id is null and a.org_id = n.org_id
               and lower(a.name) = lower(i.article_name)) )
      order by (a.id = i.article_id) desc nulls last
      limit 1
    )
  ), 0)
  from public.delivery_note_items i
  join public.delivery_notes n on n.id = i.note_id
  where i.note_id = p_note;
$$;


ALTER FUNCTION "public"."dn_weight"("p_note" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_employees"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'ime', ime, 'aktiven', coalesce(active,true),
           'ima_karto', (card_token is not null and length(btrim(card_token))>0)
         ) order by ime), '[]'::jsonb)
  from public.employees;
$$;


ALTER FUNCTION "public"."list_employees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."odprte_izmene"() RETURNS TABLE("ime" "text", "prihod" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select e.ime, le.ts as prihod
  from public.employees e
  join lateral (
    select ev.type, ev.ts
    from public.att_events ev
    where ev.employee_id = e.id
    order by ev.ts desc
    limit 1
  ) le on true
  where e.active and le.type = 'in'
  order by le.ts;
$$;


ALTER FUNCTION "public"."odprte_izmene"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."posodobi_ime_artikla"("p_sifra" bigint, "p_ime" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not app.is_staff() then
    raise exception 'Ni dovoljeno (samo osebje).';
  end if;

  -- ime na članstvih strank
  update public.articles
    set name = p_ime
    where cena_sifra = p_sifra;

  -- ime v arhivskih postavkah, a le za liste iz zadnjih 3 mesecev
  update public.delivery_note_items di
    set article_name = p_ime
    from public.articles a, public.delivery_notes dn
    where di.article_id = a.id
      and a.cena_sifra = p_sifra
      and dn.id = di.note_id
      and dn.doc_date >= (current_date - interval '3 months');
end;
$$;


ALTER FUNCTION "public"."posodobi_ime_artikla"("p_sifra" bigint, "p_ime" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."razkrij_artikel_ob_uporabi"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_org uuid;
begin
  select org_id into v_org from public.delivery_notes where id = NEW.note_id;
  if NEW.article_id is not null then
    update public.articles set viden_app = true
    where id = NEW.article_id and viden_app = false;
  elsif NEW.article_name is not null then
    update public.articles set viden_app = true
    where org_id = v_org and viden_app = false
      and lower(btrim(name)) = lower(btrim(NEW.article_name));
  end if;
  return NEW;
end $$;


ALTER FUNCTION "public"."razkrij_artikel_ob_uporabi"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recent_scans"("p_limit" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(jsonb_agg(x order by x.ts desc), '[]'::jsonb)
  from (select uid, terminal, ts from public.card_scans
        order by ts desc limit greatest(1, coalesce(p_limit,10))) x;
$$;


ALTER FUNCTION "public"."recent_scans"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shrani_nastavitve"("n" "jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set nastavitve = n where id = auth.uid();
$$;


ALTER FUNCTION "public"."shrani_nastavitve"("n" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sme_app"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.web_dostop, true) = true
      and ( coalesce(p.is_staff,false)
         or coalesce(p.super_admin,false)
         or coalesce(p.zaposleni,false)
         or lower(coalesce(p.email,'')) = 'filip@eflitte.si' )
  );
$$;


ALTER FUNCTION "public"."sme_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stranka_kosi"("p_org" "uuid") RETURNS TABLE("article_id" "uuid", "kosov" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  where a.org_id = p_org;
$$;


ALTER FUNCTION "public"."stranka_kosi"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."terminal_stamp"("p_card" "text", "p_terminal" "text" DEFAULT 'terminal'::"text", "p_ts" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_emp   public.employees%rowtype;
  v_last  public.att_events%rowtype;
  v_type  text;
  v_now   timestamptz := coalesce(p_ts, now());
  v_dupct integer;
  v_found boolean;
begin
  if p_card is null or length(btrim(p_card)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select * into v_emp from public.employees where card_token = btrim(p_card) limit 1;

  if not found then
    insert into public.card_scans(uid, terminal) values (btrim(p_card), p_terminal);
    return jsonb_build_object('ok', false, 'reason', 'unknown', 'card', btrim(p_card));
  end if;

  if coalesce(v_emp.active, true) = false then
    return jsonb_build_object('ok', false, 'reason', 'inactive', 'ime', v_emp.ime);
  end if;

  select count(*) into v_dupct from public.att_events
    where employee_id = v_emp.id
      and ts >  v_now - interval '8 seconds'
      and ts <  v_now + interval '8 seconds';
  if v_dupct > 0 then
    select * into v_last from public.att_events
      where employee_id = v_emp.id
        and ts >  v_now - interval '8 seconds'
        and ts <  v_now + interval '8 seconds'
      order by ts desc limit 1;
    return jsonb_build_object('ok', true, 'dup', true, 'ime', v_emp.ime,
      'type', v_last.type, 'ts', v_last.ts);
  end if;

  select * into v_last from public.att_events
    where employee_id = v_emp.id and ts <= v_now
    order by ts desc limit 1;
  v_found := found;

  if v_found and v_last.type = 'in' then v_type := 'out'; else v_type := 'in'; end if;

  insert into public.att_events (org_id, employee_id, type, source, ts)
    values (v_emp.org_id, v_emp.id, v_type, 'terminal', v_now);

  return jsonb_build_object('ok', true, 'ime', v_emp.ime, 'type', v_type, 'ts', v_now);
end; $$;


ALTER FUNCTION "public"."terminal_stamp"("p_card" "text", "p_terminal" "text", "p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_last_login"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set last_login = now() where id = auth.uid();
$$;


ALTER FUNCTION "public"."touch_last_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_seen"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;


ALTER FUNCTION "public"."touch_seen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."webauthn_pocisti_izzive"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.webauthn_challenges where expires_at < now();
$$;


ALTER FUNCTION "public"."webauthn_pocisti_izzive"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "kljuc" "text" NOT NULL,
    "vrednost" "text"
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."article_groups" (
    "prefix" "text" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."article_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "legacy_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cena_sifra" integer,
    "aktiven" boolean DEFAULT true NOT NULL,
    "teza" numeric,
    "viden_app" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."att_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "terminal_id" "uuid",
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" NOT NULL,
    "source" "text" DEFAULT 'terminal'::"text" NOT NULL,
    "nonce" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "potrjeno" boolean DEFAULT false NOT NULL,
    CONSTRAINT "att_events_source_check" CHECK (("source" = ANY (ARRAY['terminal'::"text", 'manual'::"text"]))),
    CONSTRAINT "att_events_type_check" CHECK (("type" = ANY (ARRAY['in'::"text", 'out'::"text", 'break_start'::"text", 'break_end'::"text"])))
);


ALTER TABLE "public"."att_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."att_terminals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "location" "text",
    "secret" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text"
);


ALTER TABLE "public"."att_terminals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "uuid",
    "org_id" "uuid",
    "meta" "jsonb",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kdo" "uuid" DEFAULT "auth"."uid"(),
    "kdo_ime" "text",
    "razdelek" "text",
    "akcija" "text",
    "opis" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."card_scans" (
    "id" bigint NOT NULL,
    "uid" "text" NOT NULL,
    "terminal" "text",
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."card_scans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."card_scans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."card_scans_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."card_scans_id_seq" OWNED BY "public"."card_scans"."id";



CREATE TABLE IF NOT EXISTS "public"."delivery_note_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid",
    "legacy_id" "text",
    "org_id" "uuid",
    "org_name" "text",
    "doc_year" integer,
    "doc_seq" integer,
    "doc_date" "date",
    "number" "text",
    "weight_kg" numeric,
    "transport" "text",
    "issued_name" "text",
    "popravil" "text",
    "popravki" "text",
    "postavke" "jsonb",
    "base_popravljeno_at" timestamp with time zone,
    "portal_popravljeno_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_note_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_note_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "note_id" "uuid" NOT NULL,
    "article_id" "uuid",
    "article_name" "text" NOT NULL,
    "pieces" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "delivery_note_items_pieces_check" CHECK (("pieces" >= 0))
);


ALTER TABLE "public"."delivery_note_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "doc_year" integer NOT NULL,
    "doc_seq" integer NOT NULL,
    "number" "text" GENERATED ALWAYS AS (((("doc_seq")::"text" || '/'::"text") || ("doc_year")::"text")) STORED,
    "doc_date" "date" NOT NULL,
    "issued_by" "uuid",
    "issued_name" "text",
    "total_pieces" integer DEFAULT 0 NOT NULL,
    "weight_kg" numeric(10,2),
    "source" "app"."note_source" DEFAULT 'portal'::"app"."note_source" NOT NULL,
    "legacy_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "popravil" "text",
    "popravljeno_at" timestamp with time zone,
    "transport" "text" DEFAULT 'redni'::"text" NOT NULL,
    "potrjeno" boolean DEFAULT false NOT NULL,
    "opomba" "text",
    "opomba_avtor" "text",
    "opomba_at" timestamp with time zone,
    "popravki" "text",
    "opomba_stranka" "text",
    "opomba_evidenca" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."delivery_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_logins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_name" "text",
    "login_at" timestamp with time zone,
    "logout_at" timestamp with time zone,
    "duration_sec" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_logins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doc_counters" (
    "doc_year" integer NOT NULL,
    "zadnja" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."doc_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "opomba" "text",
    "datum" "date" DEFAULT CURRENT_DATE NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime" "text",
    "velikost" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mapa" "text" DEFAULT ''::"text" NOT NULL,
    "ime" "text",
    "je_mapa" boolean DEFAULT false NOT NULL,
    "zaklenjeno" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "ime" "text" NOT NULL,
    "profile_id" "uuid",
    "card_token" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "app"."member_role" DEFAULT 'member'::"app"."member_role" NOT NULL,
    "location_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."obvestila" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "naslov" "text",
    "sporocilo" "text" NOT NULL,
    "aktivno" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "prejemnik" "uuid",
    "tip" "text" DEFAULT 'toast'::"text" NOT NULL
);


ALTER TABLE "public"."obvestila" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "legal_name" "text",
    "address" "text",
    "vat_id" "text",
    "active" boolean DEFAULT true NOT NULL,
    "legacy_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "sort_order" integer
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickup_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "requested_by" "uuid",
    "requested_for" "date" NOT NULL,
    "note" "text",
    "status" "app"."pickup_status" DEFAULT 'nova'::"app"."pickup_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pickup_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricelist" (
    "sifra" integer NOT NULL,
    "koda" "text",
    "naziv" "text" NOT NULL,
    "em" "text" DEFAULT 'kos'::"text",
    "cena1" numeric(10,2) DEFAULT 0,
    "cena2" numeric(10,2) DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid",
    "sort_order" integer,
    "deleted_at" timestamp with time zone,
    "teza" numeric,
    "cena_potrjena" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pricelist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "is_staff" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "is_device" boolean DEFAULT false NOT NULL,
    "last_login" timestamp with time zone,
    "last_seen" timestamp with time zone,
    "nastavitve" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_tablet" boolean DEFAULT false NOT NULL,
    "avatar_url" "text",
    "contact_email" "text",
    "super_admin" boolean DEFAULT false NOT NULL,
    "zaposleni" boolean DEFAULT false NOT NULL,
    "web_dostop" boolean DEFAULT true NOT NULL,
    "app_pin" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webauthn_challenges" (
    "handle" "text" NOT NULL,
    "user_id" "uuid",
    "challenge" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:05:00'::interval) NOT NULL
);


ALTER TABLE "public"."webauthn_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webauthn_credentials" (
    "credential_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "public_key" "text" NOT NULL,
    "counter" bigint DEFAULT 0 NOT NULL,
    "transports" "text"[],
    "device_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."webauthn_credentials" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."card_scans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."card_scans_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("kljuc");



ALTER TABLE ONLY "public"."article_groups"
    ADD CONSTRAINT "article_groups_pkey" PRIMARY KEY ("prefix");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_org_id_legacy_id_key" UNIQUE ("org_id", "legacy_id");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."att_events"
    ADD CONSTRAINT "att_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."att_terminals"
    ADD CONSTRAINT "att_terminals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_scans"
    ADD CONSTRAINT "card_scans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_note_conflicts"
    ADD CONSTRAINT "delivery_note_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_doc_year_doc_seq_key" UNIQUE ("doc_year", "doc_seq");



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_logins"
    ADD CONSTRAINT "device_logins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doc_counters"
    ADD CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("doc_year");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_card_token_key" UNIQUE ("card_token");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."obvestila"
    ADD CONSTRAINT "obvestila_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_legacy_id_key" UNIQUE ("legacy_id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricelist"
    ADD CONSTRAINT "pricelist_pkey" PRIMARY KEY ("sifra");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webauthn_challenges"
    ADD CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("handle");



ALTER TABLE ONLY "public"."webauthn_credentials"
    ADD CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("credential_id");



CREATE INDEX "articles_cena_sifra_idx" ON "public"."articles" USING "btree" ("cena_sifra");



CREATE UNIQUE INDEX "articles_org_cena_unikat" ON "public"."articles" USING "btree" ("org_id", "cena_sifra") WHERE ("cena_sifra" IS NOT NULL);



CREATE INDEX "att_events_emp_ts_idx" ON "public"."att_events" USING "btree" ("employee_id", "ts" DESC);



CREATE INDEX "att_events_org_ts_idx" ON "public"."att_events" USING "btree" ("org_id", "ts" DESC);



CREATE UNIQUE INDEX "att_events_terminal_nonce_unikat" ON "public"."att_events" USING "btree" ("terminal_id", "nonce") WHERE ("nonce" IS NOT NULL);



CREATE UNIQUE INDEX "att_terminals_slug_unikat" ON "public"."att_terminals" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "audit_log_created_idx" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "delivery_notes_deleted_idx" ON "public"."delivery_notes" USING "btree" ("deleted_at");



CREATE INDEX "device_logins_login_at_idx" ON "public"."device_logins" USING "btree" ("login_at" DESC);



CREATE INDEX "dnc_created_idx" ON "public"."delivery_note_conflicts" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "dni_note_article_unikat" ON "public"."delivery_note_items" USING "btree" ("note_id", "article_id") WHERE ("article_id" IS NOT NULL);



CREATE INDEX "documents_created_at_idx" ON "public"."documents" USING "btree" ("created_at" DESC);



CREATE INDEX "documents_deleted_idx" ON "public"."documents" USING "btree" ("deleted_at");



CREATE INDEX "documents_mapa_idx" ON "public"."documents" USING "btree" ("mapa");



CREATE INDEX "employees_profile_idx" ON "public"."employees" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "employees_profile_uidx" ON "public"."employees" USING "btree" ("profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE INDEX "idx_articles_1" ON "public"."articles" USING "btree" ("org_id") WHERE "active";



CREATE INDEX "idx_audit_log_1" ON "public"."audit_log" USING "btree" ("org_id", "at" DESC);



CREATE INDEX "idx_audit_log_2" ON "public"."audit_log" USING "btree" ("actor_id", "at" DESC);



CREATE INDEX "idx_delivery_note_items_1" ON "public"."delivery_note_items" USING "btree" ("note_id");



CREATE INDEX "idx_delivery_note_items_2" ON "public"."delivery_note_items" USING "btree" ("article_id");



CREATE INDEX "idx_delivery_notes_1" ON "public"."delivery_notes" USING "btree" ("org_id", "doc_date" DESC);



CREATE INDEX "idx_delivery_notes_2" ON "public"."delivery_notes" USING "btree" ("doc_date" DESC);



CREATE INDEX "idx_locations_1" ON "public"."locations" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_1" ON "public"."memberships" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_2" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "idx_orgs_1" ON "public"."orgs" USING "btree" ("active");



CREATE INDEX "idx_pickup_requests_1" ON "public"."pickup_requests" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_pickup_requests_2" ON "public"."pickup_requests" USING "btree" ("status") WHERE ("status" = 'nova'::"app"."pickup_status");



CREATE INDEX "idx_profiles_1" ON "public"."profiles" USING "btree" ("is_staff") WHERE "is_staff";



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("lower"("email"));



CREATE INDEX "orgs_deleted_idx" ON "public"."orgs" USING "btree" ("deleted_at");



CREATE INDEX "pricelist_deleted_idx" ON "public"."pricelist" USING "btree" ("deleted_at");



CREATE INDEX "pricelist_org_idx" ON "public"."pricelist" USING "btree" ("org_id");



CREATE INDEX "webauthn_cred_user_idx" ON "public"."webauthn_credentials" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_art_teza_weight" AFTER UPDATE OF "teza" ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."art_teza_recompute"();



CREATE OR REPLACE TRIGGER "trg_dn_items_weight" AFTER INSERT OR DELETE OR UPDATE ON "public"."delivery_note_items" FOR EACH ROW EXECUTE FUNCTION "public"."dn_recompute_from_items"();



CREATE OR REPLACE TRIGGER "trg_profiles_zascita" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "app"."profiles_zascita_pravic"();



CREATE OR REPLACE TRIGGER "trg_razkrij_artikel" AFTER INSERT ON "public"."delivery_note_items" FOR EACH ROW EXECUTE FUNCTION "public"."razkrij_artikel_ob_uporabi"();



CREATE OR REPLACE TRIGGER "trg_recount" AFTER INSERT OR DELETE OR UPDATE ON "public"."delivery_note_items" FOR EACH ROW EXECUTE FUNCTION "app"."recount_note"();



CREATE OR REPLACE TRIGGER "trg_touch_pickup" BEFORE UPDATE ON "public"."pickup_requests" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."att_events"
    ADD CONSTRAINT "att_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."att_events"
    ADD CONSTRAINT "att_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."att_events"
    ADD CONSTRAINT "att_events_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "public"."att_terminals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."att_terminals"
    ADD CONSTRAINT "att_terminals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_note_items"
    ADD CONSTRAINT "delivery_note_items_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_notes"
    ADD CONSTRAINT "delivery_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricelist"
    ADD CONSTRAINT "pricelist_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webauthn_credentials"
    ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_config_read" ON "public"."app_config" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_config_write" ON "public"."app_config" TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text"));



CREATE POLICY "app_del" ON "public"."delivery_note_items" FOR DELETE TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_ins" ON "public"."delivery_note_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."sme_app"());



CREATE POLICY "app_ins" ON "public"."delivery_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."sme_app"());



CREATE POLICY "app_sel" ON "public"."articles" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_sel" ON "public"."delivery_note_items" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_sel" ON "public"."delivery_notes" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_sel" ON "public"."orgs" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_sel" ON "public"."pricelist" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "app_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "app_upd" ON "public"."delivery_note_items" FOR UPDATE TO "authenticated" USING ("public"."sme_app"()) WITH CHECK ("public"."sme_app"());



CREATE POLICY "app_upd" ON "public"."delivery_notes" FOR UPDATE TO "authenticated" USING ("public"."sme_app"()) WITH CHECK ("public"."sme_app"());



ALTER TABLE "public"."article_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."att_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."att_terminals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_ins" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."sme_app"());



CREATE POLICY "audit_insert" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("kdo" = "auth"."uid"()) OR ("kdo" IS NULL)));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text"));



CREATE POLICY "audit_sel" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (COALESCE("p"."is_staff", false) OR COALESCE("p"."super_admin", false) OR ("lower"(COALESCE("p"."email", ''::"text")) = 'filip@eflitte.si'::"text"))))));



ALTER TABLE "public"."card_scans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_note_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_note_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_delete_items" ON "public"."delivery_note_items" FOR DELETE TO "authenticated" USING (("app"."is_device"() AND (EXISTS ( SELECT 1
   FROM "public"."delivery_notes" "d"
  WHERE (("d"."id" = "delivery_note_items"."note_id") AND ("d"."source" = 'tablet'::"app"."note_source"))))));



CREATE POLICY "device_insert_items" ON "public"."delivery_note_items" FOR INSERT TO "authenticated" WITH CHECK (("app"."is_device"() AND (EXISTS ( SELECT 1
   FROM "public"."delivery_notes" "d"
  WHERE (("d"."id" = "delivery_note_items"."note_id") AND ("d"."source" = 'tablet'::"app"."note_source"))))));



CREATE POLICY "device_insert_notes" ON "public"."delivery_notes" FOR INSERT TO "authenticated" WITH CHECK (("app"."is_device"() AND ("source" = 'tablet'::"app"."note_source")));



ALTER TABLE "public"."device_logins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_read_articles" ON "public"."articles" FOR SELECT TO "authenticated" USING ("app"."is_device"());



CREATE POLICY "device_read_items" ON "public"."delivery_note_items" FOR SELECT TO "authenticated" USING (("app"."is_device"() AND (EXISTS ( SELECT 1
   FROM "public"."delivery_notes" "d"
  WHERE (("d"."id" = "delivery_note_items"."note_id") AND ("d"."source" = 'tablet'::"app"."note_source"))))));



CREATE POLICY "device_read_locations" ON "public"."locations" FOR SELECT TO "authenticated" USING ("app"."is_device"());



CREATE POLICY "device_read_notes" ON "public"."delivery_notes" FOR SELECT TO "authenticated" USING (("app"."is_device"() AND ("source" = 'tablet'::"app"."note_source")));



CREATE POLICY "device_read_orgs" ON "public"."orgs" FOR SELECT TO "authenticated" USING ("app"."is_device"());



CREATE POLICY "device_update_notes" ON "public"."delivery_notes" FOR UPDATE TO "authenticated" USING (("app"."is_device"() AND ("source" = 'tablet'::"app"."note_source"))) WITH CHECK (("app"."is_device"() AND ("source" = 'tablet'::"app"."note_source")));



CREATE POLICY "dl_staff_insert" ON "public"."device_logins" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_staff"))));



CREATE POLICY "dl_staff_select" ON "public"."device_logins" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_staff"))));



CREATE POLICY "dnc_app_ins" ON "public"."delivery_note_conflicts" FOR INSERT TO "authenticated" WITH CHECK ("public"."sme_app"());



CREATE POLICY "dnc_app_sel" ON "public"."delivery_note_conflicts" FOR SELECT TO "authenticated" USING ("public"."sme_app"());



CREATE POLICY "dnc_staff_all" ON "public"."delivery_note_conflicts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (COALESCE("p"."is_staff", false) OR COALESCE("p"."super_admin", false) OR ("lower"(COALESCE("p"."email", ''::"text")) = 'filip@eflitte.si'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (COALESCE("p"."is_staff", false) OR COALESCE("p"."super_admin", false) OR ("lower"(COALESCE("p"."email", ''::"text")) = 'filip@eflitte.si'::"text"))))));



ALTER TABLE "public"."doc_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_osebje" ON "public"."documents" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "documents_staff" ON "public"."documents" TO "authenticated" USING (((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_staff" = true)))))) WITH CHECK (((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_staff" = true))))));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_create_pickup" ON "public"."pickup_requests" FOR INSERT TO "authenticated" WITH CHECK (("app"."can_see"("org_id", "location_id") AND ("requested_by" = "auth"."uid"()) AND ("status" = 'nova'::"app"."pickup_status")));



CREATE POLICY "member_read_own_articles" ON "public"."articles" FOR SELECT TO "authenticated" USING (("org_id" IN ( SELECT "app"."my_org_ids"() AS "my_org_ids")));



CREATE POLICY "member_read_own_items" ON "public"."delivery_note_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."delivery_notes" "d"
  WHERE (("d"."id" = "delivery_note_items"."note_id") AND "app"."can_see"("d"."org_id", "d"."location_id")))));



CREATE POLICY "member_read_own_locations" ON "public"."locations" FOR SELECT TO "authenticated" USING ("app"."can_see"("org_id", "id"));



CREATE POLICY "member_read_own_notes" ON "public"."delivery_notes" FOR SELECT TO "authenticated" USING ("app"."can_see"("org_id", "location_id"));



CREATE POLICY "member_read_own_org" ON "public"."orgs" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "app"."my_org_ids"() AS "my_org_ids")));



CREATE POLICY "member_read_own_pickups" ON "public"."pickup_requests" FOR SELECT TO "authenticated" USING ("app"."can_see"("org_id", "location_id"));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obvestila" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "obvestila_owner" ON "public"."obvestila" TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text"));



CREATE POLICY "obvestila_read" ON "public"."obvestila" FOR SELECT TO "authenticated" USING (((("aktivno" = true) AND (("prejemnik" IS NULL) OR ("prejemnik" = "auth"."uid"()))) OR (("auth"."jwt"() ->> 'email'::"text") = 'filip@eflitte.si'::"text")));



ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickup_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricelist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricelist_staff_all" ON "public"."pricelist" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_staff")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_staff"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "read_own_memberships" ON "public"."memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "read_own_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "staff_all_article_groups" ON "public"."article_groups" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_articles" ON "public"."articles" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_att_events" ON "public"."att_events" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_att_terminals" ON "public"."att_terminals" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_employees" ON "public"."employees" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_items" ON "public"."delivery_note_items" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_locations" ON "public"."locations" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_memberships" ON "public"."memberships" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_notes" ON "public"."delivery_notes" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_orgs" ON "public"."orgs" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_pickups" ON "public"."pickup_requests" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_all_profiles" ON "public"."profiles" TO "authenticated" USING ("app"."is_staff"()) WITH CHECK ("app"."is_staff"());



CREATE POLICY "staff_read_audit" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("app"."is_staff"());



CREATE POLICY "update_own_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("is_staff" = ( SELECT "p"."is_staff"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))));



ALTER TABLE "public"."webauthn_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webauthn_cred_del" ON "public"."webauthn_credentials" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "webauthn_cred_self" ON "public"."webauthn_credentials" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."webauthn_credentials" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_card"("p_id" "text", "p_card" "text", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_card"("p_id" "text", "p_card" "text", "p_pin" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."list_employees"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_employees"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."odprte_izmene"() TO "service_role";



GRANT ALL ON FUNCTION "public"."posodobi_ime_artikla"("p_sifra" bigint, "p_ime" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."recent_scans"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recent_scans"("p_limit" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shrani_nastavitve"("n" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."sme_app"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."stranka_kosi"("p_org" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."terminal_stamp"("p_card" "text", "p_terminal" "text", "p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."terminal_stamp"("p_card" "text", "p_terminal" "text", "p_ts" timestamp with time zone) TO "authenticated";



GRANT ALL ON FUNCTION "public"."touch_last_login"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."touch_seen"() TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."article_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."article_groups" TO "service_role";



GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";



GRANT ALL ON TABLE "public"."att_events" TO "authenticated";
GRANT ALL ON TABLE "public"."att_events" TO "service_role";



GRANT ALL ON TABLE "public"."att_terminals" TO "authenticated";
GRANT ALL ON TABLE "public"."att_terminals" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."card_scans" TO "authenticated";
GRANT ALL ON TABLE "public"."card_scans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."card_scans_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_note_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_note_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_note_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_notes" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."device_logins" TO "authenticated";
GRANT ALL ON TABLE "public"."device_logins" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."doc_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."doc_counters" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."obvestila" TO "authenticated";
GRANT ALL ON TABLE "public"."obvestila" TO "service_role";



GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";



GRANT ALL ON TABLE "public"."pickup_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pickup_requests" TO "service_role";



GRANT ALL ON TABLE "public"."pricelist" TO "authenticated";
GRANT ALL ON TABLE "public"."pricelist" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webauthn_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."webauthn_challenges" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webauthn_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."webauthn_credentials" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







