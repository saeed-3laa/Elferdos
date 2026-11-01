begin;
alter table public.customer_addresses add column from_profile boolean not null default false;
create unique index customer_shop_address_idx on public.customer_addresses(customer_id) where from_profile;

-- All address writers serialize on the customer profile. Never guess a zone
-- from a fuzzy name: it determines fees and whether delivery is supported.
create function private.sync_shop_address(p_customer uuid,p_zone uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.profiles; target uuid; zone uuid; matches integer;
begin
 select * into p from public.profiles where id=p_customer for update;
 if not found then return null; end if;
 select count(*),(array_agg(z.id))[1] into matches,zone from public.delivery_zones z
 where z.active and private.normalize_search(trim(z.name))=private.normalize_search(trim(p.area));
 select a.id into target from public.customer_addresses a where a.customer_id=p.id and a.from_profile;
 if p_zone is not null then
  select z.id into zone from public.delivery_zones z where z.id=p_zone and z.active;
  matches:=case when zone is null then 0 else 1 end;
 elsif matches>1 and target is not null then
  select z.id into zone from public.customer_addresses a join public.delivery_zones z on z.id=a.zone_id
   where a.id=target and z.active and private.normalize_search(trim(z.name))=private.normalize_search(trim(p.area));
  if zone is not null then matches:=1; end if;
 end if;
 if matches<>1 or length(trim(p.delivery_address))<10 then
  -- The former shop address must not remain selected after its zone changes
  -- to an unresolved name. Historic orders retain independent snapshots.
  if target is not null then delete from public.customer_addresses where id=target; end if;
  return null;
 end if;
 if target is null then
  select a.id into target from public.customer_addresses a where a.customer_id=p.id
   and a.zone_id=zone and trim(a.address)=trim(p.delivery_address) order by a.is_default desc,a.created_at,a.id limit 1;
 end if;
 if target is not null then
  update public.customer_addresses set address=trim(p.delivery_address),notes=p.delivery_notes,zone_id=zone,from_profile=true where id=target;
 elsif (select count(*) from public.customer_addresses where customer_id=p.id)<25 then
  insert into public.customer_addresses(customer_id,zone_id,address,notes,is_default,from_profile)
  values(p.id,zone,trim(p.delivery_address),p.delivery_notes,
   not exists(select 1 from public.customer_addresses where customer_id=p.id and is_default),true) returning id into target;
 end if;
 return target;
end;
$$;
revoke all on function private.sync_shop_address(uuid,uuid) from public,anon,authenticated,service_role;

create function private.on_shop_address_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then perform private.sync_shop_address(new.id);
 elsif (new.delivery_address,new.area,new.delivery_notes) is distinct from (old.delivery_address,old.area,old.delivery_notes)
 then perform private.sync_shop_address(new.id); end if;
 return new;
end;
$$;
revoke all on function private.on_shop_address_changed() from public,anon,authenticated,service_role;
create trigger profiles_shop_address after insert or update of delivery_address,area,delivery_notes on public.profiles
 for each row execute function private.on_shop_address_changed();

-- Upgrade existing accounts, reusing matching saved addresses and preserving
-- any alternative delivery address explicitly chosen as default.
do $$ declare p uuid; begin
 for p in select id from public.profiles order by id loop perform private.sync_shop_address(p); end loop;
end $$;

create function public.save_shop_delivery_zone(p_zone uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare customer uuid:=auth.uid(); zone_name text; target uuid;
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.profiles where id=customer for update;
 select name into zone_name from public.delivery_zones where id=p_zone and active for share;
 if not found then raise exception 'ZONE_UNAVAILABLE'; end if;
 if (select length(trim(delivery_address)) from public.profiles where id=customer)<10 then raise exception 'INVALID_ADDRESS'; end if;
 update public.profiles set area=zone_name where id=customer;
 target:=private.sync_shop_address(customer,p_zone);
 if target is null then raise exception 'ADDRESS_LIMIT'; end if;
 return target;
end;
$$;
revoke all on function public.save_shop_delivery_zone(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_shop_delivery_zone(uuid) to authenticated;
commit;
