begin;
alter table public.order_items drop constraint order_items_quantity_check;
alter table public.order_items add constraint order_items_quantity_check check(quantity>=0);
alter table public.order_items add column returned_quantity integer not null default 0 check(returned_quantity>=0);
create table public.order_returns(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
 customer_id uuid not null references public.profiles(id),request_id uuid not null unique,request_payload jsonb not null,
 status text not null default 'REQUESTED' check(status in('REQUESTED','APPROVED','REJECTED')),
 reason text not null check(length(trim(reason)) between 3 and 500),lines jsonb not null,
 amount bigint not null check(amount>=0),before_data jsonb not null,after_data jsonb not null,
 created_by uuid not null references public.profiles(id),reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=500)
);
create unique index one_pending_return_per_order on public.order_returns(order_id) where status='REQUESTED';
create index returns_customer_idx on public.order_returns(customer_id,created_at desc,id);
create index returns_pending_idx on public.order_returns(status,created_at,id);
alter table public.order_returns enable row level security;
revoke all on public.order_returns from public,anon,authenticated;
grant select on public.order_returns to authenticated;
create policy returns_read on public.order_returns for select to authenticated using(
 (customer_id=auth.uid() and private.is_active_customer()) or private.has_permission('orders.read'));
alter table public.customer_notifications drop constraint notification_kind_payload;
alter table public.customer_notifications add constraint notification_kind_payload check(
 (kind='amendment' and amendment_id is not null) or(kind in('delivery','return') and amendment_id is null));

create function private.return_quote(p_order uuid,p_items jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare o public.orders%rowtype;l public.order_items%rowtype;entry jsonb;qty integer;seen uuid[]:='{}';lines jsonb:='[]';
 removed_base bigint:=0;removed_sub bigint:=0;remaining_qty bigint;after_fee bigint;
begin
 select * into o from public.orders where id=p_order;
 if not found or o.status<>'DELIVERED' then raise exception 'RETURN_REQUIRES_DELIVERY';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'INVALID_RETURN';end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  if entry->>'quantity' is null or entry->>'quantity' !~ '^[0-9]{1,6}$' then raise exception 'INVALID_RETURN';end if;
  qty:=(entry->>'quantity')::integer;
  select * into l from public.order_items where order_id=p_order and unit_id=(entry->>'unit_id')::uuid;
  if not found or qty<1 or qty>l.quantity or l.unit_id=any(seen) then raise exception 'INVALID_RETURN_QUANTITY';end if;
  seen:=array_append(seen,l.unit_id);removed_base:=removed_base+qty::bigint*l.base_price;removed_sub:=removed_sub+qty::bigint*l.unit_price;
  lines:=lines||jsonb_build_array(jsonb_build_object('unit_id',l.unit_id,'product_id',l.product_id,'name',l.product_name,'unit',l.unit_name,'quantity',qty,'pieces',l.pieces_per_unit,'unit_price',l.unit_price));
 end loop;
 select coalesce(sum(quantity),0) into remaining_qty from public.order_items where order_id=p_order;
 select remaining_qty-coalesce(sum((value->>'quantity')::integer),0) into remaining_qty from jsonb_array_elements(lines);
 after_fee:=case when remaining_qty=0 then 0 else o.delivery_fee end;
 return jsonb_build_object('lines',lines,'amount',removed_sub+o.delivery_fee-after_fee,
  'before',jsonb_build_object('base_total',o.base_total,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'revision',o.revision),
  'after',jsonb_build_object('base_total',o.base_total-removed_base,'subtotal',o.subtotal-removed_sub,'delivery_fee',after_fee,'total',o.subtotal-removed_sub+after_fee));
end;
$$;
revoke all on function private.return_quote(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.request_order_return(p_order uuid,p_request uuid,p_items jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;existing public.order_returns%rowtype;q jsonb;payload jsonb;target uuid;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or not((o.customer_id=auth.uid() and private.is_active_customer()) or private.has_permission('orders.write')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_request is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_RETURN';end if;
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

create function public.review_order_return(p_return uuid,p_approve boolean,p_note text default '') returns void
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
  for stock in select i.product_id,sum((v->>'quantity')::bigint*(v->>'pieces')::bigint) pieces
    from jsonb_array_elements(r.lines) v join public.inventory i on i.product_id=(v->>'product_id')::uuid group by i.product_id order by i.product_id loop
   select quantity_pieces into previous from public.inventory where product_id=stock.product_id for update;
   if previous+stock.pieces>1000000000000 then raise exception 'STOCK_LIMIT';end if;
   update public.inventory set quantity_pieces=quantity_pieces+stock.pieces,stock_updated_at=now(),version=version+1 where product_id=stock.product_id;
   insert into public.stock_movements(product_id,previous_quantity,new_quantity,actor_id,source) values(stock.product_id,previous,previous+stock.pieces,auth.uid(),'مرتجع طلب رقم '||o.number);
  end loop;
  if exists(select 1 from jsonb_array_elements(r.lines) v where not exists(select 1 from public.inventory where product_id=(v->>'product_id')::uuid)) then raise exception 'INVENTORY_UNAVAILABLE';end if;
  update public.order_items l set quantity=l.quantity-(v->>'quantity')::integer,returned_quantity=l.returned_quantity+(v->>'quantity')::integer,
   line_total=l.unit_price*(l.quantity-(v->>'quantity')::integer) from jsonb_array_elements(r.lines) v where l.order_id=r.order_id and l.unit_id=(v->>'unit_id')::uuid;
  update public.orders set base_total=(q->'after'->>'base_total')::bigint,subtotal=(q->'after'->>'subtotal')::bigint,
   delivery_fee=(q->'after'->>'delivery_fee')::bigint,total=(q->'after'->>'total')::bigint,revision=revision+1 where id=r.order_id;
  update public.order_returns set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) where id=p_return;
 end if;
 insert into public.order_events(order_id,status,actor_id,note) values(o.id,o.status,auth.uid(),case when p_approve then 'اعتماد مرتجع وتحديث الفاتورة والمخزون' else 'رفض طلب المرتجع: '||trim(p_note) end);
 insert into public.customer_notifications(customer_id,order_id,title,message,kind) values(o.customer_id,o.id,
  case when p_approve then 'تم اعتماد مرتجع طلبك رقم ' else 'تمت مراجعة مرتجع طلبك رقم ' end||o.number,
  case when p_approve then 'تم تحديث كميات الفاتورة وإجماليها وإضافة المرتجع للمخزون. راجع حساب الطلب لمعرفة الرصيد المستحق.' else trim(p_note) end,'return');
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'order_returns','UPDATE',jsonb_build_object('id',r.id,'status',r.status,'order',r.before_data),jsonb_build_object('id',r.id,'status',case when p_approve then 'APPROVED' else 'REJECTED' end,'order',r.after_data));
end;
$$;

create function public.create_admin_return(p_order uuid,p_request uuid,p_items jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 target:=public.request_order_return(p_order,p_request,p_items,p_reason);
 perform public.review_order_return(target,true,p_reason);return target;
end;
$$;

create function public.cancel_customer_order(p_order uuid,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;stock record;
begin
 if not private.is_active_customer() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into o from public.orders where id=p_order and customer_id=auth.uid() for update;
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if o.status='CANCELLED' then return;end if;
 if o.status<>'CONFIRMED' then raise exception 'ORDER_NOT_CANCELLABLE';end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
 for stock in select i.product_id,sum(l.quantity::bigint*l.pieces_per_unit) pieces from public.order_items l join public.inventory i on i.product_id=l.product_id where l.order_id=p_order group by i.product_id order by i.product_id loop
  perform 1 from public.inventory where product_id=stock.product_id for update;
  update public.inventory set reserved_pieces=reserved_pieces-stock.pieces,version=version+1 where product_id=stock.product_id;
 end loop;
 update public.orders set status='CANCELLED',cancel_reason='إلغاء بواسطة العميل قبل التجهيز',revision=revision+1 where id=p_order;
 insert into public.order_events(order_id,status,actor_id,note) values(p_order,'CANCELLED',auth.uid(),'إلغاء بواسطة العميل قبل التجهيز');
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data) values(auth.uid(),'orders','UPDATE',jsonb_build_object('id',p_order,'status',o.status),jsonb_build_object('id',p_order,'status','CANCELLED','refund_due',(select coalesce(sum(amount),0) from public.order_payments where order_id=p_order)));
end;
$$;

create or replace function public.record_payment(p_order uuid,p_request uuid,p_amount bigint,p_method text,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;existing public.order_payments%rowtype;paid bigint;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE';end if;
 select * into existing from public.order_payments where request_id=p_request;
 if found then if existing.order_id<>p_order or existing.amount<>p_amount or existing.method<>p_method or existing.reference<>trim(p_reference) then raise exception 'IDEMPOTENCY_CONFLICT';end if;return;end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if p_request is null or p_amount is null or p_amount=0 or p_method not in('cash','instapay') or p_method is null or p_reference is null or length(trim(p_reference)) not between 1 and 200
  or paid+p_amount<0 or(p_amount>0 and(paid+p_amount>o.total or o.status='CANCELLED')) then raise exception 'INVALID_PAYMENT';end if;
 if o.status='DELIVERED' and exists(select 1 from public.order_returns where order_id=p_order and status='APPROVED') and p_amount<0 and -p_amount>greatest(paid-o.total,0) then raise exception 'INVALID_PAYMENT';end if;
 if (select count(*) from public.order_payments where order_id=p_order)>=200 then raise exception 'PAYMENT_LIMIT';end if;
 insert into public.order_payments(order_id,amount,method,reference,request_id,actor_id) values(p_order,p_amount,p_method,trim(p_reference),p_request,auth.uid());
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'order_payments','INSERT',jsonb_build_object('order_id',p_order,'amount',p_amount,'method',p_method));
end;
$$;
do $$declare fn regprocedure;begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('request_order_return','review_order_return','create_admin_return','cancel_customer_order') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
commit;
