-- ════════════════════════════════════════════════════════════════════════
--  45_skrij_neuporabljene.sql
--  · ENKRATNO: skrij v aplikaciji vse artikle, ki jih posamezna stranka
--    doslej NI IMELA na nobenem spremnem listu (0 kosov »za vedno«).
--    Artikli, ki so bili že uporabljeni, ostanejo vidni.
--    Ročno obkljukani (viden_app=true) NISO spremenjeni — to je enkratno.
--  · SPROŽILEC: ko se artikel prvič doda na spremni list (v aplikaciji ali
--    portalu), postane odslej samodejno viden (viden_app=true).
--  Zaženi enkrat v Supabase SQL editorju. (Varno za ponoven zagon.)
-- ════════════════════════════════════════════════════════════════════════

-- 1) ENKRATNO: skrij artikle brez kakršnekoli zgodovine za to stranko
update public.articles a
set viden_app = false
where a.viden_app = true
  and not exists (
    select 1
    from public.delivery_note_items i
    join public.delivery_notes n on n.id = i.note_id
    where n.org_id = a.org_id
      and ( i.article_id = a.id
         or (i.article_id is null
             and lower(btrim(i.article_name)) = lower(btrim(a.name))) )
  );

-- 2) SPROŽILEC: razkrij artikel ob prvi uporabi (samo skrite → vidne)
create or replace function public.razkrij_artikel_ob_uporabi()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_razkrij_artikel on public.delivery_note_items;
create trigger trg_razkrij_artikel
after insert on public.delivery_note_items
for each row execute function public.razkrij_artikel_ob_uporabi();
