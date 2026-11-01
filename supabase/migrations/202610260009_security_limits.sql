begin;
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
 insert into public.order_events(order_id,status,actor_id,note) values(target,'NEW',customer,'إرسال الطلب وحجز الكميات');
 return target;
end;
$$;


commit;