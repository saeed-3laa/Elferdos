begin;
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
 -- Preserve partial digits, including a leading zero. Normalized Egyptian
 -- numbers already contain the local 01 prefix after their country prefix.
 if p_scope in('catalog','products','pricing') then
  return query select p.id,p.name,p.sku,p.sku from public.products p
  join public.categories c on c.id=p.category_id
  where p.search_document @@ needle and (p_category is null or p.category_id=p_category)
  and (p_scope<>'catalog' or (p.active and p.archived_at is null and c.active and exists(
    select 1 from public.product_units u where u.product_id=p.id and u.active and (not p_available or p.available))))
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
commit;
