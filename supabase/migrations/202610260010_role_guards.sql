begin;
create or replace function public.save_role_permissions(p_role public.staff_role,p_permissions text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_role='OWNER' or p_role is null or p_permissions is null or cardinality(p_permissions)>10 or not p_permissions<@array['catalog.read','catalog.write','inventory.read','inventory.write','customers.read','reports.read','orders.read','orders.write','settings.write','audit.read']::text[] then raise exception 'INVALID_PERMISSIONS'; end if;
 if ('catalog.write'=any(p_permissions) and not 'catalog.read'=any(p_permissions)) or ('orders.write'=any(p_permissions) and not 'orders.read'=any(p_permissions)) or ('inventory.write'=any(p_permissions) and not 'inventory.read'=any(p_permissions)) then raise exception 'INVALID_PERMISSIONS'; end if;
 if p_role='VIEWER' and exists(select 1 from unnest(p_permissions) p where p like '%.write') then raise exception 'INVALID_PERMISSIONS'; end if;
 if p_role='ORDER_STAFF' and p_permissions && array['catalog.write','inventory.write','settings.write']::text[] then raise exception 'INVALID_PERMISSIONS'; end if;
 delete from public.role_permissions where role=p_role;
 insert into public.role_permissions(role,permission) select p_role,unnest(p_permissions) on conflict do nothing;
end;
$$;

commit;