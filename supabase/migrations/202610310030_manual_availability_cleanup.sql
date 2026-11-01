begin;
-- Retire permissions and dead imports, preserving historical and financial data.
delete from public.role_permissions where permission in('inventory.read','inventory.write');
create or replace function private.has_permission(required_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select required_permission not in('inventory.read','inventory.write') and private.is_active_account() and private.admin_mfa_satisfied() and
 (private.staff_email_ready(auth.uid()) or(not(select staff_email_login_required from private.deployment_security where id) and exists(select 1 from public.profiles p where p.id=auth.uid() and p.legacy_staff_login))) and
 exists(select 1 from public.staff_assignments s where s.user_id=auth.uid() and s.active and(s.role='OWNER' or exists(select 1 from public.role_permissions rp where rp.role=s.role and rp.permission=required_permission)));
$$;
create or replace function public.save_role_permissions(p_role public.staff_role,p_permissions text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_role='OWNER' or p_role is null or p_permissions is null or cardinality(p_permissions)>8 or not p_permissions<@array['catalog.read','catalog.write','customers.read','reports.read','orders.read','orders.write','settings.write','audit.read']::text[] then raise exception 'INVALID_PERMISSIONS'; end if;
 if ('catalog.write'=any(p_permissions) and not 'catalog.read'=any(p_permissions)) or ('orders.write'=any(p_permissions) and not 'orders.read'=any(p_permissions)) then raise exception 'INVALID_PERMISSIONS'; end if;
 if p_role='VIEWER' and exists(select 1 from unnest(p_permissions) p where p like '%.write') then raise exception 'INVALID_PERMISSIONS'; end if;
 if p_role='ORDER_STAFF' and p_permissions && array['catalog.write','settings.write']::text[] then raise exception 'INVALID_PERMISSIONS'; end if;
 delete from public.role_permissions where role=p_role;
 insert into public.role_permissions(role,permission) select p_role,unnest(p_permissions) on conflict do nothing;
end;
$$;
create or replace function public.get_staff_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',s.role,'permissions',case when s.role='OWNER' then
 (select jsonb_agg(permission order by permission) from(select permission from public.role_permissions where permission not in('inventory.read','inventory.write') union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write'])) a)
 else(select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) from public.role_permissions where role=s.role and permission not in('inventory.read','inventory.write'))end,
 'email_required',(select staff_email_login_required from private.deployment_security where id) or not p.legacy_staff_login,'email_ready',private.staff_email_ready(p.id),
 'mfa_required',private.admin_mfa_required(),'mfa_verified',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2')
 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=auth.uid() and s.active and private.is_active_account();
$$;
alter policy imports_read on public.import_batches using(actor_id=auth.uid() and private.has_permission('catalog.write'));
create or replace function public.preview_import(p_kind text,p_rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if p_kind is distinct from 'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 or pg_column_size(p_rows)>2000000 then raise exception 'INVALID_IMPORT'; end if;
 insert into public.import_batches(actor_id,kind,rows) values(auth.uid(),p_kind,p_rows) returning id into target;return target;
end;
$$;
create or replace function public.import_context(p_kind text,p_skus text[],p_categories text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_kind is distinct from 'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_skus is null or cardinality(p_skus)>500 or cardinality(p_categories)>500 then raise exception 'INVALID_IMPORT'; end if;
 return jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'revision',p.revision,'archived_at',p.archived_at,
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'pieces_per_unit',u.pieces_per_unit,'revision',u.revision)),'[]') from public.product_units u where u.product_id=p.id))),'[]') from public.products p where p.sku=any(p_skus)),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)),'[]') from public.categories c where c.name=any(p_categories)));
end;
$$;
create or replace function public.apply_import(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.import_batches%rowtype;r jsonb;target uuid;begin
 select * into b from public.import_batches where id=p_batch and actor_id=auth.uid() for update;
 if not found then raise exception 'IMPORT_UNAVAILABLE'; end if;
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if b.kind<>'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if b.status='APPLIED' then return; end if;
 -- Lock every referenced product in one order before any row mutation.
 perform 1 from public.products p where p.sku in(select value->>'sku' from jsonb_array_elements(b.rows)) order by p.id for update;
 for r in select value from jsonb_array_elements(b.rows) order by value->>'sku' loop
 target:=public.save_admin_product(nullif(r->>'id','')::uuid,(r->>'revision')::bigint,r->>'sku',r->>'name',(r->>'category_id')::uuid,coalesce(r->>'description',''),(r->>'active')::boolean);
 if r->>'unit_name' is not null then perform public.save_admin_unit(nullif(r->>'unit_id','')::uuid,target,coalesce((r->>'unit_revision')::bigint,0),r->>'unit_name',(r->>'pieces')::integer,(r->>'price')::bigint,(r->>'minimum')::integer,true); end if;
 end loop;
 update public.import_batches set status='APPLIED',applied_at=now() where id=p_batch;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'import_batches','UPDATE',jsonb_build_object('id',p_batch,'kind',b.kind,'row_count',jsonb_array_length(b.rows)));
end;
$$;
create function public.admin_products_with_availability(p_query text default '',p_category uuid default null,p_state text default 'all',p_sort text default 'sku',p_after uuid default null,p_limit integer default 25)
returns table(id uuid,sku text,name text,category_name text,active boolean,archived_at timestamptz,unit_count bigint,available boolean)
language sql stable security definer set search_path='' as $$
 select r.*,p.available from public.admin_products(p_query,p_category,p_state,p_sort,p_after,p_limit) r join public.products p on p.id=r.id;
$$;
revoke all on function public.admin_products_with_availability(text,uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_products_with_availability(text,uuid,text,text,uuid,integer) to authenticated;
commit;
