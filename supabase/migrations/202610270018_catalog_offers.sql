begin;
create or replace function private.browse_catalog_standard(p_query text default '',p_after uuid default null,p_limit integer default 25,p_category uuid default null,p_sort text default 'sku',p_available boolean default false)
returns table(unit_id uuid,product_id uuid,name text,sku text,category_name text,unit_name text,pieces_per_unit integer,minimum_quantity integer,price_piastres bigint,available boolean,image_path text,image_width integer,image_height integer,base_price_piastres bigint,price_label text,description text)
language plpgsql stable security definer set search_path='' as $$
declare cursor_value text;sort_column text;
begin
 if p_query is null or length(p_query)>100 or p_limit is null or p_limit not between 1 and 50 or p_sort is null or p_sort not in('sku','name') or p_available is null then raise exception 'INVALID_CATALOG_QUERY'; end if;
 sort_column:=case when p_sort='name' then 'name' else 'sku' end;
 if p_after is not null then select case when p_sort='name' then p.name else p.sku end into cursor_value from public.product_units u join public.products p on p.id=u.product_id where u.id=p_after;if not found then raise exception 'INVALID_CURSOR';end if;end if;
 -- The identifier comes exclusively from the whitelist above. EXECUTE plans for
 -- this search/filter instead of reusing a generic CASE-based sort plan.
 return query execute format($query$
 with page as materialized(
 select u.id unit_id,p.id product_id,p.name,p.sku,c.name category_name,u.name unit_name,u.pieces_per_unit,u.minimum_quantity,u.price_piastres base_price_piastres,
 stock.available,image.storage_path image_path,image.width image_width,image.height image_height,p.description
 from public.product_units u join public.products p on p.id=u.product_id join public.categories c on c.id=p.category_id
 join public.inventory i on i.product_id=p.id cross join public.store_settings s left join public.product_images image on image.product_id=p.id
 cross join lateral(select i.quantity_pieces-i.reserved_pieces>=u.minimum_quantity::bigint*u.pieces_per_unit and
 (s.stale_stock_policy='warn' or coalesce(i.stock_updated_at>=now()-make_interval(hours=>s.stock_stale_hours),false)) available) stock
 where u.active and p.active and p.archived_at is null and c.active and ($4 is null or p.category_id=$4)
 and (not $6 or stock.available) and ($2 is null or (p.%I,u.id)>($5,$2))
 and (trim($1)='' or p.sku=upper(trim($1)) or p.search_document @@ plainto_tsquery('simple'::regconfig,private.normalize_search($1)))
 order by p.%I,u.id limit $3
 ),priced as materialized(select page.*,private.best_price(null,page.unit_id,page.minimum_quantity,now()) price from page)
 select p.unit_id,p.product_id,p.name,p.sku,p.category_name,p.unit_name,p.pieces_per_unit,p.minimum_quantity,(p.price->>'price')::bigint,
 p.available,p.image_path,p.image_width,p.image_height,p.base_price_piastres,p.price->>'label',p.description from priced p order by p.%I,p.unit_id
 $query$,sort_column,sort_column,sort_column) using p_query,p_after,p_limit,p_category,cursor_value,p_available;
end;
$$;

revoke all on function private.browse_catalog_standard(text,uuid,integer,uuid,text,boolean) from public,anon,authenticated,service_role;
create index pricing_public_window_idx on public.pricing_rules(starts_at,ends_at) where active and customer_id is null;
create or replace function public.browse_catalog(p_query text default '',p_after uuid default null,p_limit integer default 25,p_category uuid default null,p_sort text default 'offers',p_available boolean default false)
returns table(unit_id uuid,product_id uuid,name text,sku text,category_name text,unit_name text,pieces_per_unit integer,minimum_quantity integer,price_piastres bigint,available boolean,image_path text,image_width integer,image_height integer,base_price_piastres bigint,price_label text,description text)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_sort in ('sku','name') then
 return query select * from private.browse_catalog_standard(p_query,p_after,p_limit,p_category,p_sort,p_available); return;
 end if;
 if p_sort is distinct from 'offers' or p_query is null or length(p_query)>100 or p_limit is null or p_limit not between 1 and 50 or p_available is null then raise exception 'INVALID_CATALOG_QUERY'; end if;
 if p_after is not null and not exists(select 1 from public.product_units where id=p_after) then raise exception 'INVALID_CURSOR'; end if;
 return query
 with rules as materialized (select r.* from public.pricing_rules r where r.active and r.customer_id is null and now()>=r.starts_at and now()<r.ends_at),
 eligible as materialized (
 select u.id uid,p.id pid,p.name pname,p.sku psku,c.name cname,u.name uname,u.pieces_per_unit pieces,u.minimum_quantity qty,u.price_piastres base,
 stock.available avail,image.storage_path path,image.width iw,image.height ih,p.description descr,
 case when exists(select 1 from rules r where r.minimum_quantity<=u.minimum_quantity and (r.unit_id is null or r.unit_id=u.id) and (r.product_id is null or r.product_id=p.id) and (r.category_id is null or r.category_id=p.category_id))
 then private.best_price(null,u.id,u.minimum_quantity,now()) else jsonb_build_object('price',u.price_piastres,'label','السعر الأساسي') end price
 from public.product_units u join public.products p on p.id=u.product_id join public.categories c on c.id=p.category_id
 join public.inventory i on i.product_id=p.id cross join public.store_settings s left join public.product_images image on image.product_id=p.id
 cross join lateral(select i.quantity_pieces-i.reserved_pieces>=u.minimum_quantity::bigint*u.pieces_per_unit and (s.stale_stock_policy='warn' or coalesce(i.stock_updated_at>=now()-make_interval(hours=>s.stock_stale_hours),false)) available) stock
 where u.active and p.active and p.archived_at is null and c.active and (p_category is null or p.category_id=p_category)
 and (not p_available or stock.available) and (trim(p_query)='' or p.sku=upper(trim(p_query)) or p.search_document @@ plainto_tsquery('simple'::regconfig,private.normalize_search(p_query)))
 ),ranked as materialized(select e.*,case when (e.price->>'price')::bigint<e.base then 0 else 1 end priority from eligible e),
 cursor_row as(select r.priority,r.psku,r.uid from ranked r where r.uid=p_after)
 select r.uid,r.pid,r.pname,r.psku,r.cname,r.uname,r.pieces,r.qty,(r.price->>'price')::bigint,r.avail,r.path,r.iw,r.ih,r.base,r.price->>'label',r.descr
 from ranked r where p_after is null or (r.priority,r.psku,r.uid)>(select cr.priority,cr.psku,cr.uid from cursor_row cr)
 order by r.priority,r.psku,r.uid limit p_limit;
end;
$$;
commit;
