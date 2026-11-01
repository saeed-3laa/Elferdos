begin;
-- Staff may export the current default contact address only with customer-read
-- permission. Other saved addresses remain private to the customer.
create policy addresses_default_staff_read on public.customer_addresses for select to authenticated using(is_default and private.has_permission('customers.read'));
create or replace function public.request_order_return(p_order uuid,p_request uuid,p_items jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;existing public.order_returns%rowtype;q jsonb;payload jsonb;target uuid;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not((o.customer_id=auth.uid() and private.is_active_customer()) or private.has_permission('orders.write')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_request is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_RETURN';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or pg_column_size(p_items)>64000 then raise exception 'INVALID_RETURN';end if;
 payload:=jsonb_build_object('order',p_order,'items',p_items,'reason',trim(p_reason));
 select * into existing from public.order_returns where request_id=p_request;
 if found then if existing.created_by<>auth.uid() or existing.request_payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return existing.id;end if;
 if exists(select 1 from public.order_returns where order_id=p_order and status='REQUESTED') then raise exception 'RETURN_PENDING';end if;
 if (select count(*) from public.order_returns where order_id=p_order)>=100 then raise exception 'RETURN_LIMIT';end if;
 q:=private.return_quote(p_order,p_items);
 insert into public.order_returns(order_id,customer_id,request_id,request_payload,reason,lines,amount,before_data,after_data,created_by)
 values(p_order,o.customer_id,p_request,payload,trim(p_reason),q->'lines',(q->>'amount')::bigint,q->'before',q->'after',auth.uid()) returning id into target;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'order_returns','INSERT',jsonb_build_object('id',target,'order_id',p_order,'status','REQUESTED'));
 return target;
end;
$$;
commit;
