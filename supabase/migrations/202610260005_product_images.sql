begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,2097152,array['image/webp']);

-- Retain a tombstone on removal so old forms cannot overwrite a newer change.
create table public.product_images (
  product_id uuid primary key references public.products(id) on delete cascade,
  storage_path text unique,
  width integer,
  height integer,
  revision bigint not null default 1,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((storage_path is null and width is null and height is null) or
    (storage_path is not null and width is not null and height is not null and width between 1 and 1600 and height between 1 and 1600))
);
alter table public.product_images enable row level security;
revoke all on public.product_images from public,anon,authenticated;
grant select on public.product_images to authenticated;
grant all on public.product_images to service_role;
create policy product_images_staff_read on public.product_images for select to authenticated
using(private.has_permission('catalog.read'));

-- Only the trusted upload handler can attach paths, after decoding and re-encoding
-- the image. Actor comes from its verified server session, never from a form field.
create function public.commit_product_image(p_actor uuid,p_product uuid,p_expected_revision bigint,p_path text,p_width integer,p_height integer)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.product_images%rowtype; previous_json jsonb; saved_json jsonb; parent public.products%rowtype;
begin
  if not exists(select 1 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active
    where s.user_id=p_actor and s.active and (s.role='OWNER' or exists(
      select 1 from public.role_permissions rp where rp.role=s.role and rp.permission='catalog.write')))
    then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into parent from public.products where id=p_product for update;
  if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
  if parent.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode='22023'; end if;
  select * into previous from public.product_images where product_id=p_product for update;
  if found then previous_json := to_jsonb(previous); end if;
  if p_expected_revision is distinct from coalesce(previous.revision,0) then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
  if p_path is null then
    if p_width is not null or p_height is not null then raise exception 'INVALID_IMAGE' using errcode='22023'; end if;
  elsif p_path !~ ('^' || p_product::text || '/[0-9a-f-]{36}\.webp$')
    or p_width is null or p_height is null or p_width not between 1 and 1600 or p_height not between 1 and 1600
    or not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_path) then
      raise exception 'INVALID_IMAGE' using errcode='22023';
  end if;
  insert into public.product_images(product_id,storage_path,width,height,revision,updated_by)
  values(p_product,p_path,p_width,p_height,coalesce(previous.revision,0)+1,p_actor)
  on conflict(product_id) do update set storage_path=excluded.storage_path,width=excluded.width,height=excluded.height,
    revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
  returning to_jsonb(product_images.*) into saved_json;
  insert into public.audit_logs(actor_id,entity,operation,before_data,after_data)
    values(p_actor,'product_images',case when previous_json is null then 'INSERT' else 'UPDATE' end,previous_json,saved_json);
end;
$$;
revoke all on function public.commit_product_image(uuid,uuid,bigint,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.commit_product_image(uuid,uuid,bigint,text,integer,integer) to service_role;

drop function public.browse_catalog(text,uuid,integer);
create function public.browse_catalog(p_query text default '',p_after uuid default null,p_limit integer default 25)
returns table(unit_id uuid,product_id uuid,name text,sku text,category_name text,
  unit_name text,pieces_per_unit integer,minimum_quantity integer,price_piastres bigint,available boolean,
  image_path text,image_width integer,image_height integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_query is null or length(p_query)>100 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'INVALID_CATALOG_QUERY' using errcode='22023'; end if;
  return query select u.id,p.id,p.name,p.sku,c.name,u.name,u.pieces_per_unit,u.minimum_quantity,u.price_piastres,
    (i.quantity_pieces-i.reserved_pieces >= u.minimum_quantity::bigint*u.pieces_per_unit
      and (s.stale_stock_policy='warn' or coalesce(i.stock_updated_at >= now()-make_interval(hours=>s.stock_stale_hours),false))),
    image.storage_path,image.width,image.height
  from public.product_units u join public.products p on p.id=u.product_id
    join public.categories c on c.id=p.category_id join public.inventory i on i.product_id=p.id
    cross join public.store_settings s left join public.product_images image on image.product_id=p.id
  where u.active and p.active and p.archived_at is null and c.active and (p_after is null or u.id>p_after)
    and (trim(p_query)='' or p.sku=upper(trim(p_query))
      or p.search_document @@ plainto_tsquery('simple'::regconfig,private.normalize_search(p_query)))
  order by u.id limit p_limit;
end;
$$;
revoke all on function public.browse_catalog(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.browse_catalog(text,uuid,integer) to anon,authenticated;
commit;
