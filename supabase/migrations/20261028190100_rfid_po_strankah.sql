-- 78: Čipi — število kosov s čipi po strankah (izbira stranke v portalu: mreža strank s številom kosov).
-- Samo branje; kdo sme, enako kot pri ostalih klicih RFID (app.sme_rfid).
create or replace function public.rfid_po_strankah()
returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  return coalesce((
    select json_agg(json_build_object('org', x.org_id, 'aktivnih', x.aktivnih, 'vseh', x.vseh))
    from (select k.org_id, count(*) filter (where k.stanje = 'aktiven') as aktivnih, count(*) as vseh
          from public.rfid_kosi k group by k.org_id) x
  ), '[]'::json);
end $$;
revoke all on function public.rfid_po_strankah() from public, anon;
grant execute on function public.rfid_po_strankah() to authenticated;
