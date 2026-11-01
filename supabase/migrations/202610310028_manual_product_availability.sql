begin;
-- Manual product availability replaces stock accounting. Historical ledgers and
-- invoice/payment snapshots are preserved; they no longer drive ordering.
alter table public.products add column available boolean not null default true;
update public.products p set available=exists(select 1 from public.product_units u join public.inventory i on i.product_id=u.product_id cross join public.store_settings s where u.product_id=p.id and u.active and i.quantity_pieces-i.reserved_pieces>=u.minimum_quantity::bigint*u.pieces_per_unit and(s.stale_stock_policy='warn' or coalesce(i.stock_updated_at>=now()-make_interval(hours=>s.stock_stale_hours),false)));
drop trigger if exists initialize_inventory on public.products;
-- The historical table is retained for recovery only, with no client access.
revoke all on public.inventory,public.stock_movements from anon,authenticated;
revoke all on function public.adjust_inventory(uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.set_inventory_by_unit(uuid,uuid,bigint,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.save_admin_settings(bigint,bigint,integer,text) from public,anon,authenticated,service_role;
create function public.save_product_availability(p_product uuid,p_revision bigint,p_available boolean) returns void language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into p from public.products where id=p_product for update;
 if not found or p.archived_at is not null then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if p_available is null then raise exception 'INVALID_AVAILABILITY';end if;
 if p.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
 if p.available is distinct from p_available then update public.products set available=p_available where id=p_product;end if;
end;
$$;
create function public.save_product_with_availability(p_id uuid,p_expected_revision bigint,p_sku text,p_name text,p_category uuid,p_description text,p_active boolean,p_available boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;version bigint;
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_available is null then raise exception 'INVALID_AVAILABILITY';end if;
 target:=public.save_admin_product(p_id,p_expected_revision,p_sku,p_name,p_category,p_description,p_active);
 select revision into version from public.products where id=target for update;
 perform public.save_product_availability(target,version,p_available);
 return target;
end;
$$;
revoke all on function public.save_product_availability(uuid,bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function public.save_product_with_availability(uuid,bigint,text,text,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.save_product_availability(uuid,bigint,boolean),public.save_product_with_availability(uuid,bigint,text,text,uuid,text,boolean,boolean) to authenticated;

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
  left join public.product_images image on image.product_id=p.id
 cross join lateral(select p.available available) stock
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

create or replace function private.order_quote(p_customer uuid,p_items jsonb,p_address uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare entry jsonb; u record; price jsonb; lines jsonb:='[]'; qty integer; sub bigint:=0; base bigint:=0; fee bigint;
 address_data jsonb; settings public.store_settings%rowtype; seen uuid[]:='{}';
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_CART'; end if;
 select jsonb_build_object('id',a.id,'address',a.address,'notes',a.notes,'zone',z.name,'zone_id',z.id,'fee',z.fee_piastres)
 into address_data from public.customer_addresses a join public.delivery_zones z on z.id=a.zone_id and z.active
 where a.id=p_address and a.customer_id=p_customer;
 if address_data is null then raise exception 'INVALID_ADDRESS'; end if;
 select * into settings from public.store_settings where id;
 for entry in select value from jsonb_array_elements(p_items) loop
 if entry->>'quantity' is null or entry->>'quantity' !~ '^[0-9]{1,6}$' then raise exception 'INVALID_QUANTITY'; end if;
 qty:=(entry->>'quantity')::integer;
 select pu.*,p.name product_name,p.sku,p.category_id,c.name category_name
 into u from public.product_units pu join public.products p on p.id=pu.product_id and p.active and p.available and p.archived_at is null
 join public.categories c on c.id=p.category_id and c.active 
 where pu.id=(entry->>'unit_id')::uuid and pu.active;
 if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if u.id=any(seen) then raise exception 'DUPLICATE_UNIT'; end if; seen:=array_append(seen,u.id);
 if qty<u.minimum_quantity or qty>100000 then raise exception 'INVALID_QUANTITY'; end if;
 price:=private.best_price(p_customer,u.id,qty,now());
 sub:=sub+(price->>'price')::bigint*qty; base:=base+u.price_piastres*qty;
 if sub>1000000000000 or base>1000000000000 then raise exception 'ORDER_LIMIT'; end if;
 lines:=lines||jsonb_build_array(jsonb_build_object('unit_id',u.id,'product_id',u.product_id,'name',u.product_name,'sku',u.sku,
 'category_name',u.category_name,'unit_name',u.name,'pieces_per_unit',u.pieces_per_unit,'quantity',qty,'base_price',u.price_piastres,
 'unit_price',(price->>'price')::bigint,'line_total',(price->>'price')::bigint*qty,'rule_id',price->'rule_id','price_label',price->>'label'));
 end loop;
 fee:=0;
 return jsonb_build_object('lines',lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'address',address_data);
end;
$$;

create or replace function public.submit_order(p_request uuid,p_items jsonb,p_address uuid,p_method text,p_notes text,p_expected_quote jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare customer uuid:=auth.uid(); existing public.orders%rowtype; payload jsonb; quote jsonb; target uuid; line jsonb;
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or p_method is null or p_method not in ('cash','instapay') or p_notes is null or length(p_notes)>1000 then raise exception 'INVALID_ORDER'; end if;
 -- One lock per customer serializes idempotency checks; unrelated customers remain independent.
 perform 1 from public.profiles where id=customer for update;
 payload:=jsonb_build_object('items',p_items,'address',p_address,'method',p_method,'notes',p_notes);
 select * into existing from public.orders where customer_id=customer and request_id=p_request;
 if found then
 if existing.request_payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return existing.id;
 end if;
 if not public.consume_auth_limit(md5('order:'||customer::text)||md5('order-limit:'||customer::text),30,3600) then raise exception 'ORDER_RATE_LIMIT'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_CART'; end if;
 -- Stable ordering prevents deadlocks when carts contain the same products in different orders.
 perform 1 from public.products p where p.id in(select u.product_id from jsonb_array_elements(p_items) j join public.product_units u on u.id=(j->>'unit_id')::uuid) order by p.id for share;
 perform 1 from public.product_units u where u.id in(select (j->>'unit_id')::uuid from jsonb_array_elements(p_items) j) order by u.id for share;
 perform 1 from public.customer_addresses where id=p_address and customer_id=customer for share;
 perform 1 from public.delivery_zones z join public.customer_addresses a on a.zone_id=z.id where a.id=p_address for share of z;
 perform 1 from public.store_settings where id for share;
 quote:=private.order_quote(customer,p_items,p_address);
 if quote is distinct from p_expected_quote then raise exception 'QUOTE_CHANGED' using errcode='40001'; end if;
 insert into public.orders(customer_id,request_id,request_payload,payment_method,customer_snapshot,address_snapshot,base_total,subtotal,delivery_fee,total,notes)
 select customer,p_request,payload,p_method,jsonb_build_object('name',full_name,'phone',phone,'shop',shop_name),quote->'address',
 (quote->>'base_total')::bigint,(quote->>'subtotal')::bigint,(quote->>'delivery_fee')::bigint,(quote->>'total')::bigint,p_notes from public.profiles where id=customer returning id into target;
 for line in select value from jsonb_array_elements(quote->'lines') loop
 insert into public.order_items(order_id,product_id,unit_id,product_name,sku,category_name,unit_name,pieces_per_unit,quantity,base_price,unit_price,line_total,pricing_rule_id,price_label)
 values(target,(line->>'product_id')::uuid,(line->>'unit_id')::uuid,line->>'name',line->>'sku',line->>'category_name',line->>'unit_name',
 (line->>'pieces_per_unit')::integer,(line->>'quantity')::integer,(line->>'base_price')::bigint,(line->>'unit_price')::bigint,(line->>'line_total')::bigint,(line->>'rule_id')::uuid,line->>'price_label');
 end loop;
 insert into public.order_events(order_id,status,actor_id,note) values(target,'CONFIRMED',customer,'إرسال الطلب');
 return target;
end;
$$;

create or replace function public.transition_order(p_order uuid,p_revision bigint,p_status public.order_status,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; stock record;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE'; end if;
 if not private.has_permission('orders.write') and not(o.customer_id=auth.uid() and private.is_active_customer() and o.status='CONFIRMED' and p_status='CANCELLED') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if p_note is null or length(p_note)>1000 or (p_status='CANCELLED' and length(trim(p_note))<3) then raise exception 'INVALID_NOTE'; end if;
 if not ((o.status='CONFIRMED' and p_status='READY') or(o.status='READY' and p_status='DELIVERED')
 or(o.status in('CONFIRMED','READY') and p_status='CANCELLED')) then raise exception 'INVALID_TRANSITION'; end if;
 if p_status='DELIVERED' and (select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)<>o.total then raise exception 'PAYMENT_REQUIRED'; end if;
 if p_status='CANCELLED' and (select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)>0 then raise exception 'PAYMENT_REQUIRES_REFUND'; end if;
 update public.orders set status=p_status,revision=revision+1,cancel_reason=case when p_status='CANCELLED' then trim(p_note) else cancel_reason end,
  delivered_at=case when p_status='DELIVERED' then now() else delivered_at end where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,p_status,auth.uid(),p_note);
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'orders','UPDATE',to_jsonb(o),jsonb_build_object('id',p_order,'status',p_status,'note',p_note));
end;
$$;

create or replace function private.amendment_quote(p_order uuid,p_revision bigint,p_items jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare o public.orders%rowtype; entry jsonb; line public.order_items%rowtype; qty integer; seen uuid[]:='{}';
 before_lines jsonb; after_lines jsonb:='[]'; changes jsonb:='[]'; base bigint:=0; sub bigint:=0; fee bigint; paid bigint;
begin
 select * into o from public.orders where id=p_order;
 if not found then raise exception 'ORDER_UNAVAILABLE'; end if;
 if o.status not in('CONFIRMED','READY') then raise exception 'ORDER_NOT_EDITABLE'; end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_CART'; end if;
 if (select count(*) from public.order_amendments where order_id=p_order)>=100 then raise exception 'AMENDMENT_LIMIT'; end if;
 select jsonb_agg(to_jsonb(l) order by l.unit_id) into before_lines from public.order_items l where l.order_id=p_order;
 for entry in select value from jsonb_array_elements(p_items) loop
  if entry->>'quantity' is null or entry->>'quantity' !~ '^[0-9]{1,6}$' then raise exception 'INVALID_QUANTITY'; end if;
  qty:=(entry->>'quantity')::integer;
  if qty>100000 then raise exception 'INVALID_QUANTITY'; end if;
  select * into line from public.order_items where order_id=p_order and unit_id=(entry->>'unit_id')::uuid;
  if not found then raise exception 'INVALID_ORDER_ITEM'; end if;
  if line.unit_id=any(seen) then raise exception 'DUPLICATE_UNIT'; end if;seen:=array_append(seen,line.unit_id);
  if qty>line.quantity and not exists(select 1 from public.product_units u join public.products p on p.id=u.product_id join public.categories c on c.id=p.category_id
    where u.id=line.unit_id and u.active and p.active and p.available and p.archived_at is null and c.active) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if qty>0 then
   after_lines:=after_lines||jsonb_build_array(to_jsonb(line)||jsonb_build_object('quantity',qty,'line_total',line.unit_price*qty));
   base:=base+line.base_price*qty;sub:=sub+line.unit_price*qty;
  end if;
 end loop;
 if jsonb_array_length(after_lines)=0 then raise exception 'EMPTY_ORDER'; end if;
 select jsonb_agg(value order by value->>'unit_id') into after_lines from jsonb_array_elements(after_lines);
 for line in select * from public.order_items where order_id=p_order order by unit_id loop
  select (value->>'quantity')::integer into qty from jsonb_array_elements(after_lines) where (value->>'unit_id')::uuid=line.unit_id;
  qty:=coalesce(qty,0);
  if qty<>line.quantity then changes:=changes||jsonb_build_array(jsonb_build_object('unit_id',line.unit_id,'name',line.product_name,'sku',line.sku,'unit',line.unit_name,'before',line.quantity,'after',qty,'unit_price',line.unit_price)); end if;
 end loop;
 if jsonb_array_length(changes)=0 then raise exception 'NO_ORDER_CHANGES'; end if;
 fee:=0;
 if sub+fee>1000000000000 or base>1000000000000 then raise exception 'ORDER_LIMIT'; end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if paid>sub+fee then raise exception 'AMENDMENT_REQUIRES_REFUND'; end if;
 return jsonb_build_object('before',jsonb_build_object('lines',before_lines,'base_total',o.base_total,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'status',o.status),
  'after',jsonb_build_object('lines',after_lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'status','CONFIRMED'),'changes',changes,'paid',paid);
end;
$$;

create or replace function public.amend_order(p_order uuid,p_revision bigint,p_request uuid,p_items jsonb,p_reason text,p_expected jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; previous public.order_amendments%rowtype; payload jsonb; quote jsonb; target uuid;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_NOTE'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE'; end if;
 payload:=jsonb_build_object('order',p_order,'revision',p_revision,'items',p_items,'reason',trim(p_reason),'expected',p_expected);
 select * into previous from public.order_amendments where request_id=p_request;
 if found then
  if previous.actor_id<>auth.uid() or previous.request_payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return previous.id;
 end if;
 perform 1 from public.products p where p.id in(select product_id from public.order_items where order_id=p_order) order by p.id for share;
 perform 1 from public.product_units u where u.id in(select unit_id from public.order_items where order_id=p_order) order by u.id for share;
 perform 1 from public.store_settings where id for share;
 quote:=private.amendment_quote(p_order,p_revision,p_items);
 if quote is distinct from p_expected then raise exception 'QUOTE_CHANGED' using errcode='40001'; end if;
 insert into public.order_amendments(order_id,customer_id,revision,request_id,request_payload,before_data,after_data,changes,reason,actor_id)
  values(p_order,o.customer_id,o.revision+1,p_request,payload,quote->'before',quote->'after',quote->'changes',trim(p_reason),auth.uid()) returning id into target;
 delete from public.order_items l where order_id=p_order and not exists(select 1 from jsonb_array_elements(quote->'after'->'lines') j where (j->>'unit_id')::uuid=l.unit_id);
 update public.order_items l set quantity=(j->>'quantity')::integer,line_total=(j->>'line_total')::bigint from jsonb_array_elements(quote->'after'->'lines') j
  where l.order_id=p_order and l.unit_id=(j->>'unit_id')::uuid;
 update public.orders set base_total=(quote->'after'->>'base_total')::bigint,subtotal=(quote->'after'->>'subtotal')::bigint,
  delivery_fee=(quote->'after'->>'delivery_fee')::bigint,total=(quote->'after'->>'total')::bigint,status='CONFIRMED',revision=revision+1 where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,'CONFIRMED',auth.uid(),'تعديل الطلب: '||trim(p_reason));
 insert into public.customer_notifications(customer_id,order_id,amendment_id,title,message) values(o.customer_id,p_order,target,
  'تم تعديل طلبك رقم '||o.number,trim(p_reason));
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'order_amendments','INSERT',quote->'before',jsonb_build_object('id',target,'order_id',p_order,'after',quote->'after','reason',trim(p_reason)));
 return target;
end;
$$;

create or replace function public.cancel_customer_order(p_order uuid,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;stock record;
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into o from public.orders where id=p_order and customer_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if o.status='CANCELLED' then return;end if;
 if o.status<>'CONFIRMED' then raise exception 'ORDER_NOT_CANCELLABLE';end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
 update public.orders set status='CANCELLED',cancel_reason='إلغاء بواسطة العميل قبل التجهيز',revision=revision+1 where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,'CANCELLED',auth.uid(),'إلغاء بواسطة العميل قبل التجهيز');
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'orders','UPDATE',jsonb_build_object('id',p_order,'status',o.status),jsonb_build_object('id',p_order,'status','CANCELLED','refund_due',(select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)));
end;
$$;

create or replace function public.review_order_return(p_return uuid,p_approve boolean,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.order_returns%rowtype;o public.orders%rowtype;q jsonb;items jsonb;stock record;previous bigint;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_approve is null or p_note is null or length(p_note)>500 then raise exception 'INVALID_RETURN';end if;
 select * into r from public.order_returns where id=p_return;
 if not found then raise exception 'RETURN_UNAVAILABLE';end if;
 select * into o from public.orders where id=r.order_id for update;
 select * into r from public.order_returns where id=p_return for update;
 if r.status=(case when p_approve then 'APPROVED' else 'REJECTED' end) then return;end if;
 if r.status<>'REQUESTED' then raise exception 'RETURN_ALREADY_REVIEWED';end if;
 if not p_approve then
  if length(trim(p_note))<3 then raise exception 'RETURN_REJECTION_REASON';end if;
  update public.order_returns set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) where id=p_return;
 else
  select jsonb_agg(jsonb_build_object('unit_id',value->'unit_id','quantity',value->'quantity')) into items from jsonb_array_elements(r.lines);
  q:=private.return_quote(r.order_id,items);
  if q->'before' is distinct from r.before_data or q->'after' is distinct from r.after_data then raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
  update public.order_items l set quantity=l.quantity-(v->>'quantity')::integer,returned_quantity=l.returned_quantity+(v->>'quantity')::integer,
   line_total=l.unit_price*(l.quantity-(v->>'quantity')::integer) from jsonb_array_elements(r.lines) v where l.order_id=r.order_id and l.unit_id=(v->>'unit_id')::uuid;
  update public.orders set base_total=(q->'after'->>'base_total')::bigint,subtotal=(q->'after'->>'subtotal')::bigint,
   delivery_fee=(q->'after'->>'delivery_fee')::bigint,total=(q->'after'->>'total')::bigint,revision=revision+1 where id=r.order_id;
  update public.order_returns set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) where id=p_return;
 end if;
 insert into public.order_events(order_id,status,actor_id,note) values(o.id,o.status,auth.uid(),case when p_approve then 'اعتماد مرتجع وتحديث الفاتورة' else 'رفض طلب المرتجع: '||trim(p_note) end);
 insert into public.customer_notifications(customer_id,order_id,title,message,kind) values(o.customer_id,o.id,
  case when p_approve then 'تم اعتماد مرتجع طلبك رقم ' else 'تمت مراجعة مرتجع طلبك رقم ' end||o.number,
  case when p_approve then 'تم تحديث كميات الفاتورة وإجماليها. راجع حساب الطلب لمعرفة الرصيد المستحق.' else trim(p_note) end,'return');
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'order_returns','UPDATE',jsonb_build_object('id',r.id,'status',r.status,'order',r.before_data),jsonb_build_object('id',r.id,'status',case when p_approve then 'APPROVED' else 'REJECTED' end,'order',r.after_data));
end;
$$;

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

create or replace function public.save_admin_unit(p_id uuid, p_product uuid, p_expected_revision bigint, p_name text, p_pieces integer, p_price bigint, p_minimum integer, p_active boolean)
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
    update public.product_units set name=trim(p_name),pieces_per_unit=p_pieces,price_piastres=p_price,minimum_quantity=p_minimum,active=p_active
    where id=p_id returning id into target;
  end if;
  return target;
end;
$$;

create or replace function public.sales_report(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_time timestamptz;end_time timestamptz; result jsonb;
begin
 if not private.has_permission('reports.read') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'INVALID_DATE_RANGE'; end if;
 start_time:=p_from::timestamp at time zone 'Africa/Cairo';end_time:=(p_to+1)::timestamp at time zone 'Africa/Cairo';
 select jsonb_build_object('from',p_from,'to',p_to,
 'order_count',(select count(*) from public.orders where created_at>=start_time and created_at<end_time),
 'order_value',(select coalesce(sum(total),0) from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED'),
 'delivered_sales',(select coalesce(sum(total),0) from public.orders where delivered_at>=start_time and delivered_at<end_time and status='DELIVERED'),
 'before_discount',(select coalesce(sum(base_total),0) from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED'),
 'after_discount',(select coalesce(sum(subtotal),0) from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED'),
 'collected',(select coalesce(sum(amount),0) from public.order_payments where created_at>=start_time and created_at<end_time and amount>0),
 'refunded',(select coalesce(-sum(amount),0) from public.order_payments where created_at>=start_time and created_at<end_time and amount<0),
 'statuses',(select coalesce(jsonb_agg(t),'[]') from(select status,count(*) count from public.orders where created_at>=start_time and created_at<end_time group by status)t),
 'daily',(select coalesce(jsonb_agg(t),'[]') from(select (created_at at time zone 'Africa/Cairo')::date "day",count(*) count,sum(total) value from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED' group by 1 order by 1)t),
 'monthly',(select coalesce(jsonb_agg(t),'[]') from(select to_char(created_at at time zone 'Africa/Cairo','YYYY-MM') "month",count(*) count,sum(total) value from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED' group by 1 order by 1)t),
 'products',(select coalesce(jsonb_agg(t),'[]') from(select i.product_id,max(i.product_name) name,sum(i.quantity::bigint*i.pieces_per_unit) pieces,sum(i.line_total) value from public.order_items i join public.orders o on o.id=i.order_id where o.delivered_at>=start_time and o.delivered_at<end_time and o.status='DELIVERED' group by i.product_id order by sum(i.line_total) desc,i.product_id limit 50)t),
 'categories',(select coalesce(jsonb_agg(t),'[]') from(select i.category_name name,sum(i.line_total) value from public.order_items i join public.orders o on o.id=i.order_id where o.delivered_at>=start_time and o.delivered_at<end_time and o.status='DELIVERED' group by i.category_name order by sum(i.line_total) desc limit 50)t),
 'customers',(select coalesce(jsonb_agg(t),'[]') from(select customer_id,max(customer_snapshot->>'name') name,count(*) count,sum(total) value from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED' group by customer_id order by count(*) desc,customer_id limit 50)t),
 'promotions',(select coalesce(jsonb_agg(t),'[]') from(select i.pricing_rule_id,i.price_label name,count(*) lines,sum((i.base_price-i.unit_price)*i.quantity) discount from public.order_items i join public.orders o on o.id=i.order_id where o.created_at>=start_time and o.created_at<end_time and o.status<>'CANCELLED' and i.pricing_rule_id is not null group by i.pricing_rule_id,i.price_label order by sum((i.base_price-i.unit_price)*i.quantity) desc limit 50)t),
 'low_stock','[]'::jsonb) into result;
 return result;
end;
$$;

create or replace function public.preview_import(p_kind text,p_rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if p_kind is distinct from 'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if not private.has_permission(case when p_kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in('products','stock') or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 or pg_column_size(p_rows)>2000000 then raise exception 'INVALID_IMPORT'; end if;
 insert into public.import_batches(actor_id,kind,rows) values(auth.uid(),p_kind,p_rows) returning id into target;return target;
end;
$$;

create or replace function public.import_context(p_kind text,p_skus text[],p_categories text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_kind is distinct from 'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if not private.has_permission(case when p_kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in('stock','products') or p_skus is null or cardinality(p_skus)>500 or cardinality(p_categories)>500 then raise exception 'INVALID_IMPORT'; end if;
 return jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'revision',p.revision,'archived_at',p.archived_at,
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'pieces_per_unit',u.pieces_per_unit,'revision',u.revision)),'[]') from public.product_units u where u.product_id=p.id))),'[]') from public.products p where p.sku=any(p_skus)),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)),'[]') from public.categories c where c.name=any(p_categories)));
end;
$$;

create or replace function public.apply_import(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.import_batches%rowtype;r jsonb;target uuid;begin
 select * into b from public.import_batches where id=p_batch and actor_id=auth.uid() for update;
 if not found then raise exception 'IMPORT_UNAVAILABLE'; end if;
 if not private.has_permission(case when b.kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if b.kind<>'products' then raise exception 'INVENTORY_RETIRED'; end if;
 if b.status='APPLIED' then return; end if;
 -- Lock every referenced product in one order before any row mutation.
 perform 1 from public.products p where p.sku in(select value->>'sku' from jsonb_array_elements(b.rows)) order by p.id for update;
 for r in select value from jsonb_array_elements(b.rows) order by value->>'sku' loop
 if b.kind='stock' then
 perform public.set_inventory_by_unit((r->>'product_id')::uuid,(r->>'unit_id')::uuid,(r->>'quantity')::bigint,(r->>'version')::bigint,'استيراد Excel '||b.id);
 else
 target:=public.save_admin_product(nullif(r->>'id','')::uuid,(r->>'revision')::bigint,r->>'sku',r->>'name',(r->>'category_id')::uuid,coalesce(r->>'description',''),(r->>'active')::boolean);
 if r->>'unit_name' is not null then perform public.save_admin_unit(nullif(r->>'unit_id','')::uuid,target,coalesce((r->>'unit_revision')::bigint,0),r->>'unit_name',(r->>'pieces')::integer,(r->>'price')::bigint,(r->>'minimum')::integer,true); end if;
 end if;
 end loop;
 update public.import_batches set status='APPLIED',applied_at=now() where id=p_batch;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'import_batches','UPDATE',jsonb_build_object('id',p_batch,'kind',b.kind,'row_count',jsonb_array_length(b.rows)));
end;
$$;
commit;
