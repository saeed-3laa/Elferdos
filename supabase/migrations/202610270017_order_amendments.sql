begin;
create table public.order_amendments(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
 customer_id uuid not null references public.profiles(id),revision bigint not null,request_id uuid not null unique,request_payload jsonb not null,
 before_data jsonb not null,after_data jsonb not null,changes jsonb not null,reason text not null check(length(trim(reason)) between 3 and 500),
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(order_id,revision)
);
create index amendments_order_idx on public.order_amendments(order_id,revision);
alter table public.order_amendments enable row level security;
revoke all on public.order_amendments from anon,authenticated;
grant select on public.order_amendments to authenticated;
create policy amendments_read on public.order_amendments for select to authenticated using
 ((customer_id=auth.uid() and private.is_active_customer()) or private.has_permission('orders.read'));

create table public.customer_notifications(
 id bigint generated always as identity primary key,customer_id uuid not null references public.profiles(id),
 order_id uuid not null references public.orders(id) on delete cascade,amendment_id uuid not null unique references public.order_amendments(id) on delete cascade,
 title text not null,message text not null,created_at timestamptz not null default now(),read_at timestamptz
);
create index notifications_customer_cursor_idx on public.customer_notifications(customer_id,id desc);
create index notifications_unread_idx on public.customer_notifications(customer_id,id) where read_at is null;
alter table public.customer_notifications enable row level security;
revoke all on public.customer_notifications from anon,authenticated;
revoke all on sequence public.customer_notifications_id_seq from anon,authenticated;
grant select on public.customer_notifications to authenticated;
create policy notifications_read on public.customer_notifications for select to authenticated using(customer_id=auth.uid() and private.is_active_customer());

create function public.mark_notification_read(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.customer_notifications set read_at=coalesce(read_at,now()) where id=p_id and customer_id=auth.uid();
 if not found then raise exception 'NOTIFICATION_UNAVAILABLE'; end if;
end;
$$;
create function public.notification_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('unread',(select count(*) from (select id from public.customer_notifications where customer_id=auth.uid() and read_at is null limit 100) n));
end;
$$;

create function private.amendment_quote(p_order uuid,p_revision bigint,p_items jsonb) returns jsonb
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
  if qty>line.quantity and not exists(select 1 from public.product_units u join public.products p on p.id=u.product_id join public.categories c on c.id=p.category_id join public.inventory i on i.product_id=p.id cross join public.store_settings s
    where u.id=line.unit_id and u.active and p.active and p.archived_at is null and c.active
    and(s.stale_stock_policy='warn' or coalesce(i.stock_updated_at>=now()-make_interval(hours=>s.stock_stale_hours),false))) then raise exception 'PRODUCT_UNAVAILABLE'; end if;
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
 if exists(with needed as(select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::bigint*(value->>'pieces_per_unit')::bigint) pieces from jsonb_array_elements(after_lines) group by 1),
  old as(select product_id,sum(quantity::bigint*pieces_per_unit) pieces from public.order_items where order_id=p_order group by product_id)
  select 1 from needed n join public.inventory i on i.product_id=n.product_id join old on old.product_id=n.product_id
  where n.pieces>i.quantity_pieces-i.reserved_pieces+old.pieces) then raise exception 'INSUFFICIENT_STOCK'; end if;
 fee:=case when sub>o.delivery_free_above_piastres then 0 else (o.address_snapshot->>'fee')::bigint end;
 if sub+fee>1000000000000 or base>1000000000000 then raise exception 'ORDER_LIMIT'; end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if paid>sub+fee then raise exception 'AMENDMENT_REQUIRES_REFUND'; end if;
 return jsonb_build_object('before',jsonb_build_object('lines',before_lines,'base_total',o.base_total,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'status',o.status),
  'after',jsonb_build_object('lines',after_lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'status','CONFIRMED'),'changes',changes,'paid',paid);
end;
$$;
revoke all on function private.amendment_quote(uuid,bigint,jsonb) from public,anon,authenticated,service_role;

create function public.preview_order_amendment(p_order uuid,p_revision bigint,p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return private.amendment_quote(p_order,p_revision,p_items);
end;
$$;
create function public.amend_order(p_order uuid,p_revision bigint,p_request uuid,p_items jsonb,p_reason text,p_expected jsonb) returns uuid
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
 perform 1 from public.inventory i where i.product_id in(select product_id from public.order_items where order_id=p_order) order by i.product_id for update;
 perform 1 from public.store_settings where id for share;
 quote:=private.amendment_quote(p_order,p_revision,p_items);
 if quote is distinct from p_expected then raise exception 'QUOTE_CHANGED' using errcode='40001'; end if;
 insert into public.order_amendments(order_id,customer_id,revision,request_id,request_payload,before_data,after_data,changes,reason,actor_id)
  values(p_order,o.customer_id,o.revision+1,p_request,payload,quote->'before',quote->'after',quote->'changes',trim(p_reason),auth.uid()) returning id into target;
 with old as(select product_id,sum(quantity::bigint*pieces_per_unit) pieces from public.order_items where order_id=p_order group by product_id),
  updated as(select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::bigint*(value->>'pieces_per_unit')::bigint) pieces from jsonb_array_elements(quote->'after'->'lines') group by 1)
 update public.inventory i set reserved_pieces=i.reserved_pieces-old.pieces+coalesce(updated.pieces,0),version=i.version+1
  from old left join updated on updated.product_id=old.product_id where i.product_id=old.product_id and old.pieces<>coalesce(updated.pieces,0);
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
do $$ declare fn regprocedure; begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('preview_order_amendment','amend_order','mark_notification_read','notification_summary') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
  execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
commit;
