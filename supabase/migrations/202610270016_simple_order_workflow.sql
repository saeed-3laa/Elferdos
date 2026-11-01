begin;
alter table public.orders alter column status set default 'CONFIRMED';
alter table public.orders add column delivery_free_above_piastres bigint;
update public.orders set delivery_free_above_piastres=(select free_delivery_above_piastres from public.store_settings where id);
alter table public.orders alter column delivery_free_above_piastres set not null;
alter table public.orders add constraint order_delivery_threshold_valid check(delivery_free_above_piastres>=0);
create function private.order_delivery_policy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.delivery_free_above_piastres:=(select free_delivery_above_piastres from public.store_settings where id);
 return new;
end;
$$;
revoke all on function private.order_delivery_policy() from public,anon,authenticated,service_role;
create trigger orders_capture_delivery_policy before insert on public.orders for each row execute function private.order_delivery_policy();

-- Keep historical events intact; normalize the current operational state only.
update public.orders set status=case when status='OUT_FOR_DELIVERY' then 'READY'::public.order_status else 'CONFIRMED'::public.order_status end,revision=revision+1
 where status in('NEW','PREPARING','OUT_FOR_DELIVERY');

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
 insert into public.order_events(order_id,status,actor_id,note) values(target,'CONFIRMED',customer,'إرسال الطلب وحجز الكميات');
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
 if p_status in('DELIVERED','CANCELLED') then
  if p_status='CANCELLED' and (select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)>0 then raise exception 'PAYMENT_REQUIRES_REFUND'; end if;
  for stock in select i.* from public.inventory i where i.product_id in(select product_id from public.order_items where order_id=p_order) order by i.product_id for update loop
   update public.inventory set reserved_pieces=reserved_pieces-(select sum(quantity::bigint*pieces_per_unit) from public.order_items where order_id=p_order and product_id=stock.product_id),
    quantity_pieces=quantity_pieces-case when p_status='DELIVERED' then (select sum(quantity::bigint*pieces_per_unit) from public.order_items where order_id=p_order and product_id=stock.product_id) else 0 end,
    version=version+1 where product_id=stock.product_id;
   if p_status='DELIVERED' then insert into public.stock_movements(product_id,previous_quantity,new_quantity,actor_id,source)
    select stock.product_id,stock.quantity_pieces,quantity_pieces,auth.uid(),'تسليم وتحصيل طلب '||o.number from public.inventory where product_id=stock.product_id; end if;
  end loop;
 end if;
 update public.orders set status=p_status,revision=revision+1,cancel_reason=case when p_status='CANCELLED' then trim(p_note) else cancel_reason end,
  delivered_at=case when p_status='DELIVERED' then now() else delivered_at end where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,p_status,auth.uid(),p_note);
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'orders','UPDATE',to_jsonb(o),jsonb_build_object('id',p_order,'status',p_status,'note',p_note));
end;
$$;

create table private.order_completions(
 order_id uuid primary key references public.orders(id) on delete cascade,request_id uuid not null unique,
 actor_id uuid not null references public.profiles(id),method text not null,reference text not null,source_revision bigint not null,expected_remaining bigint not null
);
alter table private.order_completions enable row level security;
revoke all on private.order_completions from public,anon,authenticated,service_role;
create function public.complete_order(p_order uuid,p_revision bigint,p_request uuid,p_method text,p_reference text,p_expected_remaining bigint) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; completion private.order_completions%rowtype; paid bigint;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_request is null or p_method is null or p_method not in('cash','instapay') or p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_expected_remaining is null or p_expected_remaining<0 then raise exception 'INVALID_PAYMENT'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE'; end if;
 select * into completion from private.order_completions where order_id=p_order;
 if found then
  if completion.request_id=p_request and completion.actor_id=auth.uid() and completion.method=p_method and completion.reference=trim(p_reference) and completion.source_revision=p_revision and completion.expected_remaining=p_expected_remaining then return; end if;
  raise exception 'IDEMPOTENCY_CONFLICT';
 end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if o.status<>'READY' then raise exception 'INVALID_TRANSITION'; end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if o.total-paid<>p_expected_remaining then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if paid<o.total then perform public.record_payment(p_order,p_request,o.total-paid,p_method,trim(p_reference)); end if;
 perform public.transition_order(p_order,p_revision,'DELIVERED','تم استلام كامل المبلغ وإتمام الطلب: '||trim(p_reference));
 insert into private.order_completions values(p_order,p_request,auth.uid(),p_method,trim(p_reference),p_revision,p_expected_remaining);
end;
$$;
revoke all on function public.complete_order(uuid,bigint,uuid,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.complete_order(uuid,bigint,uuid,text,text,bigint) to authenticated;
commit;
