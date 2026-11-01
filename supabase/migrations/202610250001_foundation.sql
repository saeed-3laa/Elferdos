begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.staff_role as enum ('OWNER', 'MANAGER', 'ORDER_STAFF', 'VIEWER');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  phone text unique not null check (phone ~ '^\+201[0125][0-9]{8}$'),
  full_name text not null default '' check (length(full_name) <= 160),
  shop_name text not null default '' check (length(shop_name) <= 160),
  delivery_notes text not null default '' check (length(delivery_notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_assignments (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.staff_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions(role, permission) values
  ('MANAGER', 'catalog.read'), ('MANAGER', 'catalog.write'),
  ('MANAGER', 'inventory.read'), ('MANAGER', 'inventory.write'),
  ('MANAGER', 'customers.read'), ('MANAGER', 'reports.read'),
  ('MANAGER', 'orders.read'), ('MANAGER', 'orders.write'),
  ('ORDER_STAFF', 'orders.read'), ('ORDER_STAFF', 'orders.write'),
  ('VIEWER', 'catalog.read');

create function private.has_permission(required_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_assignments s
    join public.profiles p on p.id = s.user_id and p.active
    where s.user_id = (select auth.uid()) and s.active
      and (s.role = 'OWNER' or exists (
        select 1 from public.role_permissions rp
        where rp.role = s.role and rp.permission = required_permission
      ))
  );
$$;
revoke all on function private.has_permission(text) from public;
grant execute on function private.has_permission(text) to authenticated;

create function private.is_active_customer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active);
$$;
revoke all on function private.is_active_customer() from public;
grant execute on function private.is_active_customer() to authenticated;

create function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Supabase stores phone identities without a leading plus.
  if new.phone is not null and new.phone <> '' then
    insert into public.profiles(id, phone, full_name, shop_name)
    values (new.id, '+' || ltrim(new.phone, '+'),
      left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160),
      left(coalesce(new.raw_user_meta_data ->> 'shop_name', ''), 160));
  end if;
  return new;
end;
$$;
revoke all on function private.on_auth_user_created() from public;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.on_auth_user_created();

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (length(trim(name)) between 1 and 100),
  fee_piastres bigint not null check (fee_piastres between 0 and 100000000),
  active boolean not null default false
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  address text not null check (length(trim(address)) between 5 and 1000),
  notes text not null default '' check (length(notes) <= 1000),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_customer_idx on public.customer_addresses(customer_id);
create index addresses_zone_idx on public.customer_addresses(zone_id);
create unique index addresses_default_idx on public.customer_addresses(customer_id) where is_default;

create table public.store_settings (
  id boolean primary key default true check (id),
  free_delivery_above_piastres bigint not null default 200000 check (free_delivery_above_piastres between 0 and 100000000),
  stock_stale_hours integer not null default 24 check (stock_stale_hours between 1 and 720),
  stale_stock_policy text not null default 'block' check (stale_stock_policy in ('block', 'warn'))
);
insert into public.store_settings default values;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (length(trim(name)) between 1 and 100),
  active boolean not null default true
);

create function private.normalize_search(value text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(translate(regexp_replace(value, '[ًٌٍَُِّْـ]', '', 'g'), 'أإآى', 'اااي'));
$$;
revoke all on function private.normalize_search(text) from public;
grant execute on function private.normalize_search(text) to authenticated;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null check (sku ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  name text not null check (length(trim(name)) between 1 and 200),
  category_id uuid not null references public.categories(id) on delete restrict,
  description text not null default '' check (length(description) <= 4000),
  active boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  search_document tsvector generated always as
    (to_tsvector('simple'::regconfig, private.normalize_search(name || ' ' || sku))) stored
);
create index products_category_idx on public.products(category_id);
create index products_search_idx on public.products using gin(search_document);
create index products_active_idx on public.products(id) where active and archived_at is null;

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  pieces_per_unit integer not null check (pieces_per_unit between 2 and 1000000),
  price_piastres bigint not null check (price_piastres between 0 and 100000000),
  minimum_quantity integer not null default 1 check (minimum_quantity between 1 and 100000),
  active boolean not null default true,
  unique (product_id, name)
);
create index units_active_idx on public.product_units(id) where active;

create table public.inventory (
  product_id uuid primary key references public.products(id) on delete restrict,
  quantity_pieces bigint not null default 0 check (quantity_pieces between 0 and 1000000000000),
  reserved_pieces bigint not null default 0 check (reserved_pieces >= 0 and reserved_pieces <= quantity_pieces),
  stock_updated_at timestamptz,
  version bigint not null default 0 check (version >= 0)
);

create function private.initialize_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory(product_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.initialize_inventory() from public;
create trigger initialize_inventory after insert on public.products
for each row execute function private.initialize_inventory();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  previous_quantity bigint not null,
  new_quantity bigint not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  source text not null check (length(trim(source)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index stock_movements_product_date_idx on public.stock_movements(product_id, created_at desc, id);
create index stock_movements_actor_idx on public.stock_movements(actor_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  entity text not null,
  operation text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_date_idx on public.audit_logs(created_at desc, id);
create index audit_actor_idx on public.audit_logs(actor_id);

create function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, entity, operation, before_data, after_data)
  values (auth.uid(), tg_table_name, tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_change() from public;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles', 'staff_assignments', 'role_permissions',
    'delivery_zones', 'customer_addresses', 'store_settings', 'categories', 'products',
    'product_units', 'inventory', 'stock_movements', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
  foreach table_name in array array['staff_assignments', 'role_permissions', 'delivery_zones',
    'store_settings', 'categories', 'products', 'product_units'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()', table_name);
  end loop;
end $$;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

grant select on public.profiles to authenticated;
grant update(full_name, shop_name, delivery_notes) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
using ((id = (select auth.uid()) and active) or private.has_permission('customers.read'));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()) and active) with check (id = (select auth.uid()) and active);

grant select, insert, update, delete on public.customer_addresses to authenticated;
create policy addresses_own on public.customer_addresses for all to authenticated
using (customer_id = (select auth.uid()) and private.is_active_customer())
with check (customer_id = (select auth.uid()) and private.is_active_customer());

grant select on public.delivery_zones, public.categories, public.store_settings to anon, authenticated;
create policy zones_public on public.delivery_zones for select to anon, authenticated using (active);
create policy categories_public on public.categories for select to anon, authenticated using (active);
create policy settings_public on public.store_settings for select to anon, authenticated using (true);

grant select, insert, update on public.categories, public.products, public.product_units to authenticated;
create policy categories_staff on public.categories for all to authenticated
using (private.has_permission('catalog.write')) with check (private.has_permission('catalog.write'));
create policy products_staff_read on public.products for select to authenticated using (private.has_permission('catalog.read'));
create policy products_staff_write on public.products for all to authenticated
using (private.has_permission('catalog.write')) with check (private.has_permission('catalog.write'));
create policy units_staff_read on public.product_units for select to authenticated using (private.has_permission('catalog.read'));
create policy units_staff_write on public.product_units for all to authenticated
using (private.has_permission('catalog.write')) with check (private.has_permission('catalog.write'));

grant insert, update on public.delivery_zones to authenticated;
grant update on public.store_settings to authenticated;
create policy zones_owner on public.delivery_zones for all to authenticated
using (private.has_permission('settings.write')) with check (private.has_permission('settings.write'));
create policy settings_owner on public.store_settings for update to authenticated
using (private.has_permission('settings.write')) with check (private.has_permission('settings.write'));

grant select on public.staff_assignments, public.role_permissions, public.inventory, public.stock_movements, public.audit_logs to authenticated;
create policy staff_owner_read on public.staff_assignments for select to authenticated using (private.has_permission('staff.manage'));
create policy permissions_owner_read on public.role_permissions for select to authenticated using (private.has_permission('staff.manage'));
create policy inventory_staff_read on public.inventory for select to authenticated using (private.has_permission('inventory.read'));
create policy movements_staff_read on public.stock_movements for select to authenticated using (private.has_permission('inventory.read'));
create policy audit_owner_read on public.audit_logs for select to authenticated using (private.has_permission('audit.read'));

create function public.adjust_inventory(p_product_id uuid, p_quantity bigint, p_expected_version bigint, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_stock public.inventory%rowtype;
begin
  if not private.has_permission('inventory.write') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000000000
    or p_source is null or length(trim(p_source)) not between 1 and 200 then
    raise exception 'INVALID_STOCK_UPDATE' using errcode = '22023';
  end if;
  select * into current_stock from public.inventory where product_id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode = '22023'; end if;
  if p_expected_version is distinct from current_stock.version then raise exception 'STOCK_VERSION_CONFLICT' using errcode = '40001'; end if;
  if p_quantity < current_stock.reserved_pieces then raise exception 'BELOW_RESERVED_STOCK' using errcode = '23514'; end if;
  update public.inventory set quantity_pieces = p_quantity, version = version + 1, stock_updated_at = now() where product_id = p_product_id;
  insert into public.stock_movements(product_id, previous_quantity, new_quantity, actor_id, source)
  values (p_product_id, current_stock.quantity_pieces, p_quantity, auth.uid(), trim(p_source));
end;
$$;
revoke all on function public.adjust_inventory(uuid, bigint, bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.adjust_inventory(uuid, bigint, bigint, text) to authenticated;

-- Deliberately privileged projection: returns only active public catalogue fields,
-- never customer-specific prices, exact stock counts, customer records or staff data.
create function public.browse_catalog(p_query text default '', p_after uuid default null, p_limit integer default 25)
returns table(unit_id uuid, product_id uuid, name text, sku text, category_name text,
  unit_name text, pieces_per_unit integer, minimum_quantity integer, price_piastres bigint, available boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_query is null or length(p_query) > 100 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'INVALID_CATALOG_QUERY' using errcode = '22023';
  end if;
  return query
    select u.id, p.id, p.name, p.sku, c.name, u.name, u.pieces_per_unit, u.minimum_quantity, u.price_piastres,
      (i.quantity_pieces - i.reserved_pieces >= u.minimum_quantity::bigint * u.pieces_per_unit
        and (s.stale_stock_policy = 'warn' or coalesce(i.stock_updated_at >= now() - make_interval(hours => s.stock_stale_hours), false)))
    from public.product_units u
    join public.products p on p.id = u.product_id
    join public.categories c on c.id = p.category_id
    join public.inventory i on i.product_id = p.id
    cross join public.store_settings s
    where u.active and p.active and p.archived_at is null and c.active
      and (p_after is null or u.id > p_after)
      and (trim(p_query) = '' or p.sku = upper(trim(p_query))
        or p.search_document @@ plainto_tsquery('simple'::regconfig, private.normalize_search(p_query)))
    order by u.id limit p_limit;
end;
$$;
revoke all on function public.browse_catalog(text, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.browse_catalog(text, uuid, integer) to anon, authenticated;

commit;
