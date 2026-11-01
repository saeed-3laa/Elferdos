begin;

alter table public.products add column revision bigint not null default 0;
alter table public.product_units add column revision bigint not null default 0;
alter table public.categories add column revision bigint not null default 0;
alter table public.delivery_zones add column revision bigint not null default 0;
alter table public.store_settings add column revision bigint not null default 0;
create index products_name_cursor_idx on public.products(name, id);
create policy categories_staff_read on public.categories for select to authenticated using (private.has_permission('catalog.read'));

create function private.bump_revision() returns trigger
language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end;
$$;
revoke all on function private.bump_revision() from public, anon, authenticated;
do $$ declare target text; begin
  foreach target in array array['products','product_units','categories','delivery_zones','store_settings'] loop
    execute format('create trigger bump_revision before update on public.%I for each row execute function private.bump_revision()', target);
    execute format('revoke insert, update, delete on public.%I from authenticated', target);
  end loop;
end $$;

create function public.get_staff_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', s.role, 'permissions',
    case when s.role = 'OWNER' then (
      select jsonb_agg(permission order by permission) from (
        select permission from public.role_permissions
        union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write','inventory.read','inventory.write'])
      ) all_permissions
    ) else (select coalesce(jsonb_agg(permission order by permission), '[]'::jsonb) from public.role_permissions where role = s.role) end)
  from public.staff_assignments s join public.profiles p on p.id = s.user_id and p.active
  where s.user_id = (select auth.uid()) and s.active;
$$;
revoke all on function public.get_staff_access() from public, anon, authenticated, service_role;
grant execute on function public.get_staff_access() to authenticated;

create function public.save_admin_reference(p_kind text, p_id uuid, p_expected_revision bigint, p_name text, p_active boolean, p_fee bigint default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; current_revision bigint;
begin
  if p_kind not in ('category','zone') or p_kind is null then raise exception 'INVALID_REFERENCE' using errcode = '22023'; end if;
  if not private.has_permission(case when p_kind = 'zone' then 'settings.write' else 'catalog.write' end) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 or p_active is null
    or p_fee is null or p_fee not between 0 and 100000000 then raise exception 'INVALID_REFERENCE' using errcode = '22023'; end if;
  if p_kind = 'category' then
    if p_id is null then
      insert into public.categories(name, active) values(trim(p_name),p_active) returning id into target;
    else
      select revision into current_revision from public.categories where id=p_id for update;
      if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
      if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
      update public.categories set name=trim(p_name),active=p_active where id=p_id returning id into target;
    end if;
  else
    if p_id is null then
      insert into public.delivery_zones(name, active, fee_piastres) values(trim(p_name),p_active,p_fee) returning id into target;
    else
      select revision into current_revision from public.delivery_zones where id=p_id for update;
      if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
      if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
      update public.delivery_zones set name=trim(p_name),active=p_active,fee_piastres=p_fee where id=p_id returning id into target;
    end if;
  end if;
  return target;
end;
$$;
revoke all on function public.save_admin_reference(text,uuid,bigint,text,boolean,bigint) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_reference(text,uuid,bigint,text,boolean,bigint) to authenticated;

create function public.save_admin_product(p_id uuid, p_expected_revision bigint, p_sku text, p_name text, p_category uuid, p_description text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; current_product public.products%rowtype;
begin
  if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_sku is null or upper(trim(p_sku)) !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'
    or p_name is null or length(trim(p_name)) not between 1 and 200
    or p_description is null or length(p_description)>4000 or p_active is null then
    raise exception 'INVALID_PRODUCT' using errcode='22023';
  end if;
  if p_id is null then
    insert into public.products(sku,name,category_id,description,active)
    values(upper(trim(p_sku)),trim(p_name),p_category,trim(p_description),p_active) returning id into target;
  else
    select * into current_product from public.products where id=p_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_revision is distinct from current_product.revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
    if current_product.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode='22023'; end if;
    update public.products set sku=upper(trim(p_sku)),name=trim(p_name),category_id=p_category,description=trim(p_description),active=p_active
    where id=p_id returning id into target;
  end if;
  return target;
end;
$$;
revoke all on function public.save_admin_product(uuid,bigint,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_product(uuid,bigint,text,text,uuid,text,boolean) to authenticated;

create function public.archive_admin_product(p_id uuid, p_expected_revision bigint, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_archived is null then raise exception 'INVALID_PRODUCT' using errcode='22023'; end if;
  select revision into current_revision from public.products where id=p_id for update;
  if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
  if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
  update public.products set active=false,archived_at=case when p_archived then now() else null end where id=p_id;
end;
$$;
revoke all on function public.archive_admin_product(uuid,bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function public.archive_admin_product(uuid,bigint,boolean) to authenticated;

create function public.save_admin_unit(p_id uuid, p_product uuid, p_expected_revision bigint, p_name text, p_pieces integer, p_price bigint, p_minimum integer, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; existing public.product_units%rowtype; parent public.products%rowtype;
begin
  if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into parent from public.products where id=p_product for update;
  if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
  if parent.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 80 or trim(p_name) in ('قطعة','كيس','كانز','زجاجة')
    or p_pieces is null or p_pieces not between 2 and 1000000 or p_price is null or p_price not between 0 and 100000000
    or p_minimum is null or p_minimum not between 1 and 100000 or p_active is null then
    raise exception 'INVALID_WHOLESALE_UNIT' using errcode='22023';
  end if;
  if p_id is null then
    if (select count(*) from public.product_units where product_id=p_product)>=20 then raise exception 'UNIT_LIMIT' using errcode='22023'; end if;
    insert into public.product_units(product_id,name,pieces_per_unit,price_piastres,minimum_quantity,active)
    values(p_product,trim(p_name),p_pieces,p_price,p_minimum,p_active) returning id into target;
  else
    select * into existing from public.product_units where id=p_id and product_id=p_product for update;
    if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_revision is distinct from existing.revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
    if existing.pieces_per_unit <> p_pieces and (
      exists(select 1 from public.inventory where product_id=p_product and (quantity_pieces>0 or reserved_pieces>0))
      or exists(select 1 from public.stock_movements where product_id=p_product)
    ) then raise exception 'UNIT_CONVERSION_LOCKED' using errcode='22023'; end if;
    update public.product_units set name=trim(p_name),pieces_per_unit=p_pieces,price_piastres=p_price,minimum_quantity=p_minimum,active=p_active
    where id=p_id returning id into target;
  end if;
  return target;
end;
$$;
revoke all on function public.save_admin_unit(uuid,uuid,bigint,text,integer,bigint,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_unit(uuid,uuid,bigint,text,integer,bigint,integer,boolean) to authenticated;

create function public.set_inventory_by_unit(p_product uuid,p_unit uuid,p_quantity bigint,p_expected_version bigint,p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare factor integer;
begin
  if not private.has_permission('inventory.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform 1 from public.products where id=p_product for share;
  select pieces_per_unit into factor from public.product_units where id=p_unit and product_id=p_product for share;
  if not found or p_quantity is null or p_quantity not between 0 and 1000000000 then raise exception 'INVALID_STOCK_UPDATE' using errcode='22023'; end if;
  perform public.adjust_inventory(p_product,p_quantity*factor,p_expected_version,p_source);
end;
$$;
revoke all on function public.set_inventory_by_unit(uuid,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.set_inventory_by_unit(uuid,uuid,bigint,bigint,text) to authenticated;

create function public.save_admin_settings(p_expected_revision bigint,p_free_above bigint,p_stale_hours integer,p_policy text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if not private.has_permission('settings.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_free_above is null or p_free_above not between 0 and 100000000 or p_stale_hours is null or p_stale_hours not between 1 and 720
    or p_policy is null or p_policy not in ('block','warn') then raise exception 'INVALID_SETTINGS' using errcode='22023'; end if;
  select revision into current_revision from public.store_settings where id for update;
  if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
  update public.store_settings set free_delivery_above_piastres=p_free_above,stock_stale_hours=p_stale_hours,stale_stock_policy=p_policy where id;
end;
$$;
revoke all on function public.save_admin_settings(bigint,bigint,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_settings(bigint,bigint,integer,text) to authenticated;

create function public.admin_products(p_query text default '',p_category uuid default null,p_state text default 'all',p_sort text default 'sku',p_after uuid default null,p_limit integer default 25)
returns table(id uuid,sku text,name text,category_name text,active boolean,archived_at timestamptz,unit_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cursor_product public.products%rowtype;
begin
  if not private.has_permission('catalog.read') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_query is null or length(p_query)>100 or p_state is null or p_state not in ('all','active','inactive','archived')
    or p_sort is null or p_sort not in ('sku','name') or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'INVALID_CATALOG_QUERY' using errcode='22023';
  end if;
  if p_after is not null then
    select * into cursor_product from public.products where products.id=p_after;
    if not found then raise exception 'INVALID_CURSOR' using errcode='22023'; end if;
  end if;
  return query select p.id,p.sku,p.name,c.name,p.active,p.archived_at,
    (select count(*) from public.product_units u where u.product_id=p.id)
    from public.products p join public.categories c on c.id=p.category_id
    where (p_category is null or p.category_id=p_category)
      and (trim(p_query)='' or p.sku=upper(trim(p_query)) or p.search_document @@ plainto_tsquery('simple'::regconfig,private.normalize_search(p_query)))
      and (p_state='all' or (p_state='archived' and p.archived_at is not null)
        or (p_state='active' and p.active and p.archived_at is null) or (p_state='inactive' and not p.active and p.archived_at is null))
      and (p_after is null or (p_sort='sku' and (p.sku,p.id)>(cursor_product.sku,cursor_product.id))
        or (p_sort='name' and (p.name,p.id)>(cursor_product.name,cursor_product.id)))
    order by case when p_sort='sku' then p.sku else p.name end,p.id limit p_limit;
end;
$$;
revoke all on function public.admin_products(text,uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_products(text,uuid,text,text,uuid,integer) to authenticated;

commit;
