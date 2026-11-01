begin;

alter table public.profiles
  add column delivery_address text not null default '' check (length(delivery_address) <= 1000),
  add column area text not null default '' check (length(area) <= 100);
grant update(delivery_address, area) on public.profiles to authenticated;

create or replace function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null and new.phone <> '' then
    insert into public.profiles(id, phone, full_name, shop_name, delivery_address, area, delivery_notes)
    values (new.id, '+' || ltrim(new.phone, '+'),
      left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160),
      left(coalesce(new.raw_user_meta_data ->> 'shop_name', ''), 160),
      left(coalesce(new.raw_user_meta_data ->> 'delivery_address', ''), 1000),
      left(coalesce(new.raw_user_meta_data ->> 'area', ''), 100),
      left(coalesce(new.raw_user_meta_data ->> 'delivery_notes', ''), 1000));
  end if;
  return new;
end;
$$;
revoke all on function private.on_auth_user_created() from public, anon, authenticated;

-- Cross-instance fixed windows. Identifiers are HMAC hashes, never raw phones/IPs.
create table private.auth_rate_limits (
  bucket_hash text not null check (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (bucket_hash, window_start)
);
alter table private.auth_rate_limits enable row level security;
revoke all on private.auth_rate_limits from public, anon, authenticated, service_role;
create index auth_limits_expiry_idx on private.auth_rate_limits(expires_at);

create function public.consume_auth_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare start_at timestamptz; count_now integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' or p_max is null or p_max not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 60 and 86400 then
    raise exception 'INVALID_RATE_LIMIT' using errcode = '22023';
  end if;
  start_at := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into private.auth_rate_limits(bucket_hash, window_start, expires_at, attempts)
  values (p_bucket, start_at, start_at + make_interval(secs => p_window_seconds), 1)
  on conflict (bucket_hash, window_start) do update
    set attempts = least(private.auth_rate_limits.attempts + 1, p_max + 1)
  returning attempts into count_now;
  delete from private.auth_rate_limits where (bucket_hash, window_start) in (
    select bucket_hash, window_start from private.auth_rate_limits
    where expires_at < clock_timestamp() - interval '1 day' order by expires_at limit 50
  );
  return count_now <= p_max;
end;
$$;
revoke all on function public.consume_auth_limit(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.consume_auth_limit(text, integer, integer) to service_role;

-- Serialize address changes per customer and require the active delivery zone.
-- Direct writes are removed so concurrent forms cannot create competing defaults.
revoke insert, update, delete on public.customer_addresses from authenticated;
create function public.save_customer_address(p_id uuid, p_zone uuid, p_address text, p_notes text, p_default boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare customer uuid := auth.uid(); target uuid; make_default boolean;
begin
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
revoke all on function public.save_customer_address(uuid, uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_customer_address(uuid, uuid, text, text, boolean) to authenticated;

create function public.delete_customer_address(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare customer uuid := auth.uid(); next_default uuid;
begin
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
revoke all on function public.delete_customer_address(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_customer_address(uuid) to authenticated;

commit;
