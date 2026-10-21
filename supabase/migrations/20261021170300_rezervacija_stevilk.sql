-- ════════════════════════════════════════════════════════════════════════
--  70_rezervacija_stevilk.sql — številka spremnega lista je ob shranjevanju na
--  tablici rezervirana
--
--  Tablica list shrani in natisne takoj, v portal pa ga pošlje nekaj trenutkov
--  pozneje. Če je v tem času nov list ustvaril še portal (ali druga naprava),
--  sta oba dobila isto številko in drugi je dobil napako »številka zasedena«
--  (na natisnjenem listu je bila že napačna številka).
--
--  Zdaj:
--  1) app_rezerviraj_stevilko(leto, najmanj): naslednja prosta številka, ki je
--     hkrati zapisana kot rezervirana (24 ur oz. dokler list s to številko ne
--     pride v portal). Hkratni klici dobijo različne številke (zaklep na leto).
--     »najmanj« = naslednja številka, ki jo pozna naprava (njeni še neposlani
--     listi), da rezervacija ne pade pod že izdano številko.
--  2) app_prosta_stevilka (portal, starejše različice aplikacije) upošteva tudi
--     rezervirane številke.
--  3) Ko list s številko nastane, se njena rezervacija izbriše.
--
--  Varno za ponoven zagon.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.stevilke_rezervacije (
  doc_year integer not null,
  doc_seq integer not null,
  user_id uuid,
  ustvarjeno timestamptz not null default now(),
  potece timestamptz not null default now() + interval '24 hours',
  primary key (doc_year, doc_seq)
);
alter table public.stevilke_rezervacije enable row level security;
revoke all on public.stevilke_rezervacije from public, anon, authenticated;

create or replace function public.app_rezerviraj_stevilko(p_leto integer, p_najmanj integer default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v integer;
begin
  if not (app.is_staff() or public.sme_app() or app.is_device()) then
    return null;
  end if;
  if p_leto is null or p_leto < 2000 or p_leto > 2100 then
    raise exception 'neveljavno leto' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('sc_stevilke_listov'), p_leto);
  delete from public.stevilke_rezervacije where potece < now();
  v := greatest(
         coalesce((select max(doc_seq) from public.delivery_notes where doc_year = p_leto and deleted_at is null), 0),
         coalesce((select max(doc_seq) from public.stevilke_rezervacije where doc_year = p_leto), 0)
       ) + 1;
  v := greatest(v, coalesce(p_najmanj, 0));
  -- »najmanj« lahko pade na tujo rezervacijo ali obstoječ list — nikoli je ne prevzamemo
  while exists (select 1 from public.stevilke_rezervacije where doc_year = p_leto and doc_seq = v)
     or exists (select 1 from public.delivery_notes where doc_year = p_leto and doc_seq = v and deleted_at is null) loop
    v := v + 1;
  end loop;
  insert into public.stevilke_rezervacije (doc_year, doc_seq, user_id) values (p_leto, v, auth.uid());
  return v;
end $$;
revoke all on function public.app_rezerviraj_stevilko(integer, integer) from public, anon;
grant execute on function public.app_rezerviraj_stevilko(integer, integer) to authenticated;

create or replace function public.app_prosta_stevilka(p_leto integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when (app.is_staff() or public.sme_app() or app.is_device())
    then greatest(
           coalesce((select max(doc_seq) from public.delivery_notes where doc_year = p_leto and deleted_at is null), 0),
           coalesce((select max(doc_seq) from public.stevilke_rezervacije where doc_year = p_leto and potece >= now()), 0)
         ) + 1
    else null end;
$$;
revoke all on function public.app_prosta_stevilka(integer) from public, anon;
grant execute on function public.app_prosta_stevilka(integer) to authenticated;

create or replace function app.porabi_rezervacijo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  delete from public.stevilke_rezervacije where doc_year = NEW.doc_year and doc_seq = NEW.doc_seq;
  return NEW;
end $$;
revoke all on function app.porabi_rezervacijo() from public;

drop trigger if exists trg_porabi_rezervacijo on public.delivery_notes;
create trigger trg_porabi_rezervacijo
  after insert or update of doc_year, doc_seq on public.delivery_notes
  for each row execute function app.porabi_rezervacijo();
