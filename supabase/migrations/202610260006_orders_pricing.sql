begin;
create table public.pricing_rules (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
 unit_id uuid references public.product_units(id), product_id uuid references public.products(id), category_id uuid references public.categories(id),
 customer_id uuid references public.profiles(id), minimum_quantity integer not null default 1 check(minimum_quantity between 1 and 100000),
 kind text not null check(kind in ('fixed','percent')), value bigint not null,
 starts_at timestamptz not null, ends_at timestamptz not null, active boolean not null default true, revision bigint not null default 0,
 check(ends_at>starts_at),check(num_nonnulls(unit_id,product_id,category_id)<=1),
 check((kind='fixed' and value between 0 and 100000000) or (kind='percent' and value between 1 and 10000))
);
create index pricing_unit_idx on public.pricing_rules(unit_id) where active;
create index pricing_product_idx on public.pricing_rules(product_id) where active;
create index pricing_category_idx on public.pricing_rules(category_id) where active;
create index pricing_customer_idx on public.pricing_rules(customer_id) where active;
create trigger bump_revision before update on public.pricing_rules for each row execute function private.bump_revision();
create trigger audit_change after insert or update or delete on public.pricing_rules for each row execute function private.audit_change();
alter table public.pricing_rules enable row level security;
revoke all on public.pricing_rules from anon,authenticated;
grant select on public.pricing_rules to authenticated;
create policy pricing_staff_read on public.pricing_rules for select to authenticated using(private.has_permission('catalog.write'));

create function private.best_price(p_customer uuid,p_unit uuid,p_quantity integer,p_at timestamptz) returns jsonb
language sql stable set search_path='' as $$
 with candidates as (
 select u.price_piastres price,null::uuid rule_id,'السعر الأساسي'::text label,0 priority
 from public.product_units u where u.id=p_unit
 union all
 select case when r.kind='fixed' then r.value else (u.price_piastres*(10000-r.value)+5000)/10000 end,
 r.id,r.name,1 from public.pricing_rules r cross join public.product_units u join public.products p on p.id=u.product_id
 where u.id=p_unit and r.active and p_at>=r.starts_at and p_at<r.ends_at and p_quantity>=r.minimum_quantity
 and (r.customer_id is null or r.customer_id=p_customer)
 and (r.unit_id is null or r.unit_id=u.id) and (r.product_id is null or r.product_id=p.id) and (r.category_id is null or r.category_id=p.category_id)
 ) select jsonb_build_object('price',price,'rule_id',rule_id,'label',label) from candidates order by price,priority,rule_id limit 1;
$$;
revoke all on function private.best_price(uuid,uuid,integer,timestamptz) from public,anon,authenticated,service_role;

create function public.save_pricing_rule(p_id uuid,p_revision bigint,p_name text,p_unit uuid,p_product uuid,p_category uuid,p_customer uuid,p_minimum integer,p_kind text,p_value bigint,p_starts timestamptz,p_ends timestamptz,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; old_revision bigint;
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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

create type public.order_status as enum('NEW','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED');
create sequence private.order_number_sequence;
create table public.orders (
 id uuid primary key default gen_random_uuid(), number bigint unique not null default nextval('private.order_number_sequence'),
 customer_id uuid not null references public.profiles(id), request_id uuid not null, request_payload jsonb not null,
 status public.order_status not null default 'NEW', payment_method text not null check(payment_method in ('cash','instapay')),
 customer_snapshot jsonb not null,address_snapshot jsonb not null,
 base_total bigint not null check(base_total>=0),subtotal bigint not null check(subtotal>=0),delivery_fee bigint not null check(delivery_fee>=0),
 total bigint not null check(total=subtotal+delivery_fee and total<=1000000000000),
 notes text not null default '' check(length(notes)<=1000),cancel_reason text,revision bigint not null default 0,
 created_at timestamptz not null default now(),delivered_at timestamptz,
 unique(customer_id,request_id)
);
create index orders_customer_cursor_idx on public.orders(customer_id,number desc);
create index orders_status_date_idx on public.orders(status,created_at desc,number);
create index orders_created_idx on public.orders(created_at,number);
create table public.order_items (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),
 product_id uuid not null references public.products(id),unit_id uuid not null references public.product_units(id),
 product_name text not null,sku text not null,category_name text not null,unit_name text not null,pieces_per_unit integer not null,
 quantity integer not null check(quantity>0),base_price bigint not null,unit_price bigint not null,line_total bigint not null,
 pricing_rule_id uuid references public.pricing_rules(id),price_label text not null,
 check(unit_price>=0 and line_total=unit_price*quantity),unique(order_id,unit_id)
);
create index order_items_product_idx on public.order_items(product_id,order_id);
create table public.order_events (
 id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),
 status public.order_status not null,note text not null default '',actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id,id);
create table public.order_payments (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),amount bigint not null check(amount<>0),
 method text not null check(method in ('cash','instapay')),reference text not null check(length(trim(reference)) between 1 and 200),
 request_id uuid not null unique,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index order_payments_order_idx on public.order_payments(order_id);
do $$ declare t text; begin foreach t in array array['orders','order_items','order_events','order_payments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop; end $$;
revoke all on sequence private.order_number_sequence from public,anon,authenticated,service_role;
revoke all on sequence public.order_events_id_seq from anon,authenticated;
create policy orders_read on public.orders for select to authenticated using((customer_id=auth.uid() and private.is_active_customer()) or private.has_permission('orders.read'));
create policy items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy events_read on public.order_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy payments_read on public.order_payments for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));

create function private.order_quote(p_customer uuid,p_items jsonb,p_address uuid) returns jsonb
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
 select pu.*,p.name product_name,p.sku,p.category_id,c.name category_name,i.quantity_pieces,i.reserved_pieces,i.stock_updated_at
 into u from public.product_units pu join public.products p on p.id=pu.product_id and p.active and p.archived_at is null
 join public.categories c on c.id=p.category_id and c.active join public.inventory i on i.product_id=p.id
 where pu.id=(entry->>'unit_id')::uuid and pu.active;
 if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if u.id=any(seen) then raise exception 'DUPLICATE_UNIT'; end if; seen:=array_append(seen,u.id);
 if qty<u.minimum_quantity or qty>100000 then raise exception 'INVALID_QUANTITY'; end if;
 if settings.stale_stock_policy='block' and (u.stock_updated_at is null or u.stock_updated_at<now()-make_interval(hours=>settings.stock_stale_hours)) then raise exception 'STALE_STOCK'; end if;
 if qty::bigint*u.pieces_per_unit>u.quantity_pieces-u.reserved_pieces then raise exception 'INSUFFICIENT_STOCK'; end if;
 price:=private.best_price(p_customer,u.id,qty,now());
 sub:=sub+(price->>'price')::bigint*qty; base:=base+u.price_piastres*qty;
 if sub>1000000000000 or base>1000000000000 then raise exception 'ORDER_LIMIT'; end if;
 lines:=lines||jsonb_build_array(jsonb_build_object('unit_id',u.id,'product_id',u.product_id,'name',u.product_name,'sku',u.sku,
 'category_name',u.category_name,'unit_name',u.name,'pieces_per_unit',u.pieces_per_unit,'quantity',qty,'base_price',u.price_piastres,
 'unit_price',(price->>'price')::bigint,'line_total',(price->>'price')::bigint*qty,'rule_id',price->'rule_id','price_label',price->>'label'));
 end loop;
 -- Multiple units may draw on the same product: check their combined requirement.
 if exists(select 1 from jsonb_array_elements(lines) l join public.inventory i on i.product_id=(l->>'product_id')::uuid
 group by i.product_id,i.quantity_pieces,i.reserved_pieces having sum((l->>'quantity')::bigint*(l->>'pieces_per_unit')::bigint)>i.quantity_pieces-i.reserved_pieces) then raise exception 'INSUFFICIENT_STOCK'; end if;
 fee:=case when sub>settings.free_delivery_above_piastres then 0 else (address_data->>'fee')::bigint end;
 return jsonb_build_object('lines',lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'address',address_data);
end;
$$;
revoke all on function private.order_quote(uuid,jsonb,uuid) from public,anon,authenticated,service_role;

create function public.quote_order(p_items jsonb,p_address uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return private.order_quote(auth.uid(),p_items,p_address);
end;
$$;

create function public.submit_order(p_request uuid,p_items jsonb,p_address uuid,p_method text,p_notes text,p_expected_quote jsonb) returns uuid
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
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_CART'; end if;
 -- Stable ordering prevents deadlocks when carts contain the same products in different orders.
 perform 1 from public.products p where p.id in(select u.product_id from jsonb_array_elements(p_items) j join public.product_units u on u.id=(j->>'unit_id')::uuid) order by p.id for share;
 perform 1 from public.product_units u where u.id in(select (j->>'unit_id')::uuid from jsonb_array_elements(p_items) j) order by u.id for share;
 perform 1 from public.inventory i where i.product_id in(select u.product_id from jsonb_array_elements(p_items) j join public.product_units u on u.id=(j->>'unit_id')::uuid) order by i.product_id for update;
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
 update public.inventory i set reserved_pieces=i.reserved_pieces+x.pieces,version=version+1
 from(select product_id,sum(quantity::bigint*pieces_per_unit)::bigint pieces from public.order_items where order_id=target group by product_id) x where i.product_id=x.product_id;
 insert into public.order_events(order_id,status,actor_id,note) values(target,'NEW',customer,'إرسال الطلب وحجز الكميات');
 return target;
end;
$$;

create function public.transition_order(p_order uuid,p_revision bigint,p_status public.order_status,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; stock record;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE'; end if;
 if not private.has_permission('orders.write') and not(o.customer_id=auth.uid() and private.is_active_customer() and o.status='NEW' and p_status='CANCELLED') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if p_note is null or length(p_note)>1000 or (p_status='CANCELLED' and length(trim(p_note))<3) then raise exception 'INVALID_NOTE'; end if;
 if not ((o.status='NEW' and p_status='CONFIRMED') or(o.status='CONFIRMED' and p_status='PREPARING') or(o.status='PREPARING' and p_status='READY')
 or(o.status='READY' and p_status='OUT_FOR_DELIVERY') or(o.status='OUT_FOR_DELIVERY' and p_status='DELIVERED')
 or(o.status in ('NEW','CONFIRMED','PREPARING','READY') and p_status='CANCELLED')) then raise exception 'INVALID_TRANSITION'; end if;
 if p_status in ('DELIVERED','CANCELLED') then
 if p_status='CANCELLED' and (select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)>0 then raise exception 'PAYMENT_REQUIRES_REFUND'; end if;
 for stock in select i.* from public.inventory i where i.product_id in(select product_id from public.order_items where order_id=p_order) order by i.product_id for update loop
 update public.inventory set reserved_pieces=reserved_pieces-(select sum(quantity::bigint*pieces_per_unit) from public.order_items where order_id=p_order and product_id=stock.product_id),
 quantity_pieces=quantity_pieces-case when p_status='DELIVERED' then (select sum(quantity::bigint*pieces_per_unit) from public.order_items where order_id=p_order and product_id=stock.product_id) else 0 end,
 version=version+1 where product_id=stock.product_id;
 if p_status='DELIVERED' then insert into public.stock_movements(product_id,previous_quantity,new_quantity,actor_id,source)
 select stock.product_id,stock.quantity_pieces,quantity_pieces,auth.uid(),'تسليم طلب '||o.number from public.inventory where product_id=stock.product_id; end if;
 end loop;
 end if;
 update public.orders set status=p_status,revision=revision+1,cancel_reason=case when p_status='CANCELLED' then trim(p_note) else cancel_reason end,
 delivered_at=case when p_status='DELIVERED' then now() else delivered_at end where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,p_status,auth.uid(),p_note);
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'orders','UPDATE',to_jsonb(o),jsonb_build_object('id',p_order,'status',p_status,'note',p_note));
end;
$$;

create function public.record_payment(p_order uuid,p_request uuid,p_amount bigint,p_method text,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; existing public.order_payments%rowtype; paid bigint;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status='CANCELLED' then raise exception 'ORDER_UNAVAILABLE'; end if;
 select * into existing from public.order_payments where request_id=p_request;
 if found then
 if existing.order_id<>p_order or existing.amount<>p_amount or existing.method<>p_method or existing.reference<>trim(p_reference) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return; end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if p_request is null or p_amount is null or p_amount=0 or paid+p_amount<0 or paid+p_amount>o.total then raise exception 'INVALID_PAYMENT'; end if;
 if (select count(*) from public.order_payments where order_id=p_order)>=200 then raise exception 'PAYMENT_LIMIT'; end if;
 insert into public.order_payments(order_id,amount,method,reference,request_id,actor_id) values(p_order,p_amount,p_method,trim(p_reference),p_request,auth.uid());
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'order_payments','INSERT',jsonb_build_object('order_id',p_order,'amount',p_amount,'method',p_method));
end;
$$;

create function public.admin_orders(p_after bigint default null,p_status text default '',p_search text default '',p_from date default null,p_to date default null)
returns setof public.orders language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('orders.read') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_search is null or length(p_search)>160 then raise exception 'INVALID_QUERY'; end if;
 return query select o.* from public.orders o where (p_after is null or o.number<p_after)
 and (coalesce(p_status,'')='' or o.status::text=p_status)
 and (p_from is null or o.created_at >= p_from::timestamp at time zone 'Africa/Cairo')
 and (p_to is null or o.created_at < (p_to+1)::timestamp at time zone 'Africa/Cairo')
 and (trim(p_search)='' or o.number::text=trim(p_search) or private.normalize_search(o.customer_snapshot->>'name') like '%'||private.normalize_search(trim(p_search))||'%'
 or o.customer_snapshot->>'phone' like '%'||trim(p_search)||'%')
 order by o.number desc limit 25;
end;
$$;
do $$ declare fn regprocedure; begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('save_pricing_rule','quote_order','submit_order','transition_order','record_payment','admin_orders') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
 execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
commit;
