begin;
alter table public.profiles add column account_kind text not null default 'CUSTOMER' check(account_kind in('CUSTOMER','STAFF'));
update public.profiles p set account_kind='STAFF' where exists(select 1 from public.staff_assignments s where s.user_id=p.id);
create index profiles_kind_cursor_idx on public.profiles(account_kind,id);
create function private.classify_staff() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.profiles set account_kind='STAFF' where id=new.user_id; return new;end;
$$;
revoke all on function private.classify_staff() from public,anon,authenticated,service_role;
create trigger classify_staff after insert or update on public.staff_assignments for each row execute function private.classify_staff();
create function private.is_active_account() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
 where p.id=auth.uid() and p.active and s.id=nullif(current_setting('request.jwt.claims',true)::jsonb->>'session_id','')::uuid
 and (p.account_kind='CUSTOMER' or exists(select 1 from public.staff_assignments a where a.user_id=p.id and a.active)));
$$;
revoke all on function private.is_active_account() from public,anon,authenticated,service_role;
grant execute on function private.is_active_account() to authenticated;
create or replace function private.is_active_customer() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_account() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_kind='CUSTOMER');
$$;
create or replace function private.has_permission(required_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_account() and exists(select 1 from public.staff_assignments s where s.user_id=auth.uid() and s.active and
 (s.role='OWNER' or exists(select 1 from public.role_permissions rp where rp.role=s.role and rp.permission=required_permission)));
$$;
drop policy profiles_read on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using((id=auth.uid() and private.is_active_account()) or private.has_permission('staff.manage') or(account_kind='CUSTOMER' and private.has_permission('customers.read')));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid() and account_kind='CUSTOMER' and private.is_active_customer()) with check(id=auth.uid() and account_kind='CUSTOMER' and active and private.is_active_customer());
create or replace function public.manage_staff(p_target uuid,p_role public.staff_role,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(43662001);
 if p_target=auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
 if p_role is null or p_active is null then raise exception 'INVALID_STAFF';end if;
 if not exists(select 1 from public.profiles where id=p_target and account_kind='STAFF') then raise exception 'STAFF_ONLY';end if;
 if not exists(select 1 from public.staff_assignments where user_id=p_target) then raise exception 'STAFF_UNAVAILABLE';end if;
 if exists(select 1 from public.staff_assignments where user_id=p_target and role='OWNER' and active) and
 (p_role<>'OWNER' or not p_active) and (select count(*) from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.role='OWNER' and s.active)<=1 then raise exception 'LAST_OWNER';end if;
 update public.staff_assignments set role=p_role,active=p_active where user_id=p_target;
 delete from auth.sessions where user_id=p_target;
end;
$$;
create or replace function public.manage_customer(p_target uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_active is null or p_target=auth.uid() then raise exception 'OWNER_PROTECTED';end if;
 update public.profiles set active=p_active where id=p_target and account_kind='CUSTOMER';
 if not found then raise exception 'CUSTOMER_UNAVAILABLE';end if;
 if not p_active then delete from auth.sessions where user_id=p_target;end if;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'customer_access','UPDATE',jsonb_build_object('id',p_target,'active',p_active));
end;
$$;
create function public.provision_staff(p_actor uuid,p_target uuid,p_name text,p_role public.staff_role) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(43662001);
 if not exists(select 1 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=p_actor and s.role='OWNER' and s.active) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 3 and 160 or p_role is null then raise exception 'INVALID_STAFF';end if;
 perform 1 from public.profiles where id=p_target and account_kind='CUSTOMER' and shop_name='' and delivery_address='' and area='' for update;
 if not found or exists(select 1 from public.orders where customer_id=p_target) or exists(select 1 from public.staff_assignments where user_id=p_target) then raise exception 'NOT_NEW_STAFF_ACCOUNT';end if;
 update public.profiles set full_name=trim(p_name),account_kind='STAFF' where id=p_target;
 insert into public.staff_assignments(user_id,role,active) values(p_target,p_role,true);
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'staff_provisioning','INSERT',jsonb_build_object('user_id',p_target,'role',p_role,'name',trim(p_name)));
end;
$$;
revoke all on function public.provision_staff(uuid,uuid,text,public.staff_role) from public,anon,authenticated,service_role;
grant execute on function public.provision_staff(uuid,uuid,text,public.staff_role) to service_role;
create or replace function public.complete_account_recovery(p_actor uuid,p_target uuid,p_reason text,p_new_phone text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=p_actor and s.role='OWNER' and s.active) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_target=p_actor or p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'OWNER_PROTECTED';end if;
 perform 1 from public.profiles where id=p_target for update;if not found then raise exception 'ACCOUNT_UNAVAILABLE';end if;
 if p_new_phone is not null then update public.profiles set phone=p_new_phone where id=p_target;end if;
 delete from auth.sessions where user_id=p_target;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'account_recovery','UPDATE',jsonb_build_object('user_id',p_target,'reason',trim(p_reason),'phone_changed',p_new_phone is not null));
end;
$$;
create function public.finish_own_credentials(p_actor uuid,p_phone text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.active) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_phone is not null then update public.profiles set phone=p_phone where id=p_actor;end if;
 delete from auth.sessions where user_id=p_actor;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'own_credentials','UPDATE',jsonb_build_object('phone_changed',p_phone is not null));
end;
$$;
revoke all on function public.finish_own_credentials(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_own_credentials(uuid,text) to service_role;

create or replace function public.search_suggestions(p_scope text,p_query text,p_category uuid default null,
 p_state text default 'all',p_available boolean default false,p_status text default '',p_from date default null,p_to date default null)
returns table(id uuid,label text,detail text,value text)
language plpgsql stable security definer set search_path='' as $$
declare needle tsquery; digits text;
begin
 if p_query is null or length(p_query)>160 or p_scope is null or p_scope not in('catalog','products','pricing','customers','orders')
 or p_state is null or p_state not in('all','active','inactive','archived') or p_available is null or p_status is null
 then raise exception 'INVALID_SEARCH'; end if;
 if p_scope in('products','pricing') and not private.has_permission(case when p_scope='pricing' then 'catalog.write' else 'catalog.read' end) then raise exception 'FORBIDDEN'; end if;
 if p_scope='customers' and not private.has_permission('customers.read') then raise exception 'FORBIDDEN'; end if;
 if p_scope='orders' and not private.has_permission('orders.read') then raise exception 'FORBIDDEN'; end if;
 if trim(p_query)='' then return; end if;
 needle:=private.search_prefix(p_query);
 digits:=regexp_replace(translate(p_query,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');
 if left(digits,1)='0' then digits:='2'||digits; end if;
 if p_scope in('catalog','products','pricing') then
  return query select p.id,p.name,p.sku,p.sku from public.products p
  join public.categories c on c.id=p.category_id
  where p.search_document @@ needle and (p_category is null or p.category_id=p_category)
  and (p_scope<>'catalog' or (p.active and p.archived_at is null and c.active and exists(
    select 1 from public.product_units u join public.inventory i on i.product_id=u.product_id cross join public.store_settings s
    where u.product_id=p.id and u.active and (not p_available or
     (i.quantity_pieces-i.reserved_pieces>=u.minimum_quantity::bigint*u.pieces_per_unit and
      (s.stale_stock_policy='warn' or coalesce(i.stock_updated_at>=now()-make_interval(hours=>s.stock_stale_hours),false)))))))
  and (p_scope='catalog' or p_state='all' or (p_state='archived' and p.archived_at is not null)
   or (p_state='active' and p.active and p.archived_at is null) or (p_state='inactive' and not p.active and p.archived_at is null))
  order by p.name,p.id limit 8;
 elsif p_scope='customers' then
  return query select p.id,p.full_name,p.shop_name||' — '||p.phone,p.phone from public.profiles p
  where p.account_kind='CUSTOMER' and (to_tsvector('simple'::regconfig,private.normalize_search(p.full_name||' '||p.shop_name)) @@ needle
   or (digits<>'' and strpos(replace(p.phone,'+',''),digits)>0))
  order by p.full_name,p.id limit 8;
 else
  return query select o.id,'طلب '||o.number::text,coalesce(o.customer_snapshot->>'name','')||' — '||coalesce(o.customer_snapshot->>'phone',''),o.number::text
  from public.orders o where (p_status='' or o.status::text=p_status)
  and (p_from is null or o.created_at>=p_from::timestamp at time zone 'Africa/Cairo')
  and (p_to is null or o.created_at<(p_to+1)::timestamp at time zone 'Africa/Cairo')
  and (starts_with(o.number::text,translate(trim(p_query),'٠١٢٣٤٥٦٧٨٩','0123456789'))
   or to_tsvector('simple'::regconfig,private.normalize_search(coalesce(o.customer_snapshot->>'name',''))) @@ needle
   or (digits<>'' and strpos(replace(coalesce(o.customer_snapshot->>'phone',''),'+',''),digits)>0))
  order by o.number desc limit 8;
 end if;
end;
$$;

create function public.save_managed_profile(p_target uuid,p_fields jsonb) returns void language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if jsonb_typeof(p_fields) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_fields) k where k not in('full_name','shop_name','delivery_address','area','delivery_notes')) or length(trim(coalesce(p_fields->>'full_name',''))) not between 3 and 160 then raise exception 'INVALID_PROFILE';end if;
 select account_kind into kind from public.profiles where id=p_target for update;if not found then raise exception 'ACCOUNT_UNAVAILABLE';end if;
 if kind='STAFF' then
  if p_fields-'full_name'<>'{}'::jsonb then raise exception 'STAFF_PROFILE_ONLY';end if;
  update public.profiles set full_name=trim(p_fields->>'full_name') where id=p_target;
 else
  if length(trim(coalesce(p_fields->>'shop_name',''))) not between 2 and 160 or length(trim(coalesce(p_fields->>'delivery_address',''))) not between 10 and 1000 or length(trim(coalesce(p_fields->>'area',''))) not between 2 and 100 or length(coalesce(p_fields->>'delivery_notes',''))>1000 then raise exception 'INVALID_PROFILE';end if;
  update public.profiles set full_name=trim(p_fields->>'full_name'),shop_name=trim(p_fields->>'shop_name'),delivery_address=trim(p_fields->>'delivery_address'),area=trim(p_fields->>'area'),delivery_notes=coalesce(p_fields->>'delivery_notes','') where id=p_target;
 end if;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'managed_profile','UPDATE',jsonb_build_object('user_id',p_target,'fields',p_fields));
end;
$$;
revoke all on function public.save_managed_profile(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_managed_profile(uuid,jsonb) to authenticated;

create or replace function public.get_staff_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', s.role, 'permissions',
    case when s.role = 'OWNER' then (
      select jsonb_agg(permission order by permission) from (
        select permission from public.role_permissions
        union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write','inventory.read','inventory.write'])
      ) all_permissions
    ) else (select coalesce(jsonb_agg(permission order by permission), '[]'::jsonb) from public.role_permissions where role = s.role) end)
  from public.staff_assignments s join public.profiles p on p.id = s.user_id and p.active
  where s.user_id = (select auth.uid()) and s.active and private.is_active_account();
$$;


create or replace function public.save_customer_address(p_id uuid, p_zone uuid, p_address text, p_notes text, p_default boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare customer uuid := auth.uid(); target uuid; make_default boolean;
begin
  if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform 1 from public.profiles where id = customer and active for update;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_address is null or length(trim(p_address)) not between 10 and 1000
    or p_notes is null or length(p_notes) > 1000 or p_default is null then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone and active) then
    raise exception 'ZONE_UNAVAILABLE' using errcode = '22023';
  end if;
  if p_id is not null and not exists (select 1 from public.customer_addresses where id = p_id and customer_id = customer) then
    raise exception 'ADDRESS_UNAVAILABLE' using errcode = '42501';
  end if;
  if p_id is null and (select count(*) from public.customer_addresses where customer_id = customer) >= 25 then
    raise exception 'ADDRESS_LIMIT' using errcode = '22023';
  end if;
  make_default := p_default or not exists (
    select 1 from public.customer_addresses where customer_id = customer and is_default and id is distinct from p_id
  );
  if make_default then
    update public.customer_addresses set is_default = false where customer_id = customer and is_default;
  end if;
  if p_id is null then
    insert into public.customer_addresses(customer_id, zone_id, address, notes, is_default)
    values (customer, p_zone, trim(p_address), trim(p_notes), make_default) returning id into target;
  else
    update public.customer_addresses set zone_id = p_zone, address = trim(p_address), notes = trim(p_notes), is_default = make_default
    where id = p_id and customer_id = customer returning id into target;
  end if;
  return target;
end;
$$;
create or replace function public.delete_customer_address(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare customer uuid := auth.uid(); next_default uuid;
begin
  if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501';end if;
  perform 1 from public.profiles where id = customer and active for update;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.customer_addresses where id = p_id and customer_id = customer;
  if not found then raise exception 'ADDRESS_UNAVAILABLE' using errcode = '42501'; end if;
  if not exists(select 1 from public.customer_addresses where customer_id = customer and is_default) then
    select id into next_default from public.customer_addresses where customer_id = customer order by created_at, id limit 1;
    update public.customer_addresses set is_default = true where id = next_default;
  end if;
end;
$$;
commit;
