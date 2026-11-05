begin;
-- Retain legacy quantity rules for history, but exclude them from all new quotes.
-- Editing one explicitly converts it to a quantity-independent offer. No stored
-- order prices, financial ledgers, inventory or availability values are changed.
create or replace function private.best_price(p_customer uuid,p_unit uuid,p_quantity integer,p_at timestamptz) returns jsonb
language sql stable set search_path='' as $$
 with candidates as (
 select u.price_piastres price,null::uuid rule_id,'السعر الأساسي'::text label,0 priority
 from public.product_units u where u.id=p_unit
 union all
 select case when r.kind='fixed' then r.value else (u.price_piastres*(10000-r.value)+5000)/10000 end,
 r.id,r.name,1 from public.pricing_rules r cross join public.product_units u join public.products p on p.id=u.product_id
 where u.id=p_unit and r.active and p_at>=r.starts_at and p_at<r.ends_at and r.minimum_quantity=1
 and (r.customer_id is null or r.customer_id=p_customer)
 and (r.unit_id is null or r.unit_id=u.id) and (r.product_id is null or r.product_id=p.id) and (r.category_id is null or r.category_id=p.category_id)
 ) select jsonb_build_object('price',price,'rule_id',rule_id,'label',label) from candidates order by price,priority,rule_id limit 1;
$$;
revoke all on function private.best_price(uuid,uuid,integer,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.save_pricing_rule(p_id uuid,p_revision bigint,p_name text,p_unit uuid,p_product uuid,p_category uuid,p_customer uuid,p_minimum integer,p_kind text,p_value bigint,p_starts timestamptz,p_ends timestamptz,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; old_revision bigint;
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_minimum is distinct from 1 then raise exception 'QUANTITY_TIERS_RETIRED'; end if;
 if p_id is null then
 insert into public.pricing_rules(name,unit_id,product_id,category_id,customer_id,minimum_quantity,kind,value,starts_at,ends_at,active)
 values(trim(p_name),p_unit,p_product,p_category,p_customer,p_minimum,p_kind,p_value,p_starts,p_ends,p_active) returning id into target;
 else
 select revision into old_revision from public.pricing_rules where id=p_id for update;
 if not found then raise exception 'RECORD_NOT_FOUND'; end if;
 if old_revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 update public.pricing_rules set name=trim(p_name),unit_id=p_unit,product_id=p_product,category_id=p_category,customer_id=p_customer,
 minimum_quantity=p_minimum,kind=p_kind,value=p_value,starts_at=p_starts,ends_at=p_ends,active=p_active where id=p_id returning id into target;
 end if; return target;
end;
$$;



create function public.search_pricing_targets(p_kind text,p_query text)
returns table(id uuid,label text,detail text)
language plpgsql stable security definer set search_path='' as $$
declare needle tsquery;
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_kind is null or p_kind not in('product','category','unit') or p_query is null or length(p_query)>100 then raise exception 'INVALID_SEARCH';end if;
 if trim(p_query)='' then return;end if;
 needle:=private.search_prefix(p_query);
 if p_kind='category' then
  return query select c.id,c.name,case when c.active then 'قسم مفعّل' else 'قسم غير مفعّل' end from public.categories c
  where to_tsvector('simple'::regconfig,private.normalize_search(c.name)) @@ needle order by c.name,c.id limit 8;
 elsif p_kind='product' then
  return query select p.id,p.name,p.sku from public.products p where p.archived_at is null and p.search_document @@ needle order by p.name,p.id limit 8;
 else
  return query select u.id,p.name||' — '||u.name,p.sku from public.product_units u join public.products p on p.id=u.product_id
  where p.archived_at is null and p.search_document @@ needle order by p.name,u.name,u.id limit 8;
 end if;
end;
$$;
revoke all on function public.search_pricing_targets(text,text) from public,anon,authenticated,service_role;
grant execute on function public.search_pricing_targets(text,text) to authenticated;

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
 with rules as materialized (select r.* from public.pricing_rules r where r.minimum_quantity=1 and r.active and r.customer_id is null and now()>=r.starts_at and now()<r.ends_at),
 eligible as materialized (
 select u.id uid,p.id pid,p.name pname,p.sku psku,c.name cname,u.name uname,u.pieces_per_unit pieces,u.minimum_quantity qty,u.price_piastres base,
 stock.available avail,image.storage_path path,image.width iw,image.height ih,p.description descr,
 case when exists(select 1 from rules r where r.minimum_quantity=1 and (r.unit_id is null or r.unit_id=u.id) and (r.product_id is null or r.product_id=p.id) and (r.category_id is null or r.category_id=p.category_id))
 then private.best_price(null,u.id,u.minimum_quantity,now()) else jsonb_build_object('price',u.price_piastres,'label','السعر الأساسي') end price
 from public.product_units u join public.products p on p.id=u.product_id join public.categories c on c.id=p.category_id
  left join public.product_images image on image.product_id=p.id
 cross join lateral(select p.available available) stock
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
