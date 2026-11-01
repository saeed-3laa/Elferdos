begin;
create index products_public_sku_idx on public.products(sku,id) where active and archived_at is null;
create index products_public_name_idx on public.products(name,id) where active and archived_at is null;
create index products_public_category_sku_idx on public.products(category_id,sku,id) where active and archived_at is null;
create index products_public_category_name_idx on public.products(category_id,name,id) where active and archived_at is null;
create index units_public_product_id_idx on public.product_units(product_id,id) where active;
create or replace function public.browse_catalog(p_query text default '',p_after uuid default null,p_limit integer default 25,p_category uuid default null,p_sort text default 'sku',p_available boolean default false)
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
commit;
