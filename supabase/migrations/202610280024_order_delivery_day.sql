begin;
alter table public.orders add column delivery_date date;
alter table public.customer_notifications alter column amendment_id drop not null;
alter table public.customer_notifications add column kind text not null default 'amendment';
alter table public.customer_notifications add constraint notification_kind_payload check(
 (kind='amendment' and amendment_id is not null) or(kind='delivery' and amendment_id is null));

create function public.schedule_order_delivery(p_order uuid,p_revision bigint,p_date date) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; today date:=(statement_timestamp() at time zone 'Africa/Cairo')::date; note text;
begin
 if not private.has_permission('orders.write') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_date is null or p_date<today or p_date>today+2 then raise exception 'INVALID_DELIVERY_DATE' using errcode='22023';end if;
 select * into o from public.orders where id=p_order for update;
 if not found then raise exception 'ORDER_UNAVAILABLE';end if;
 if o.status not in('CONFIRMED','READY') then raise exception 'ORDER_NOT_EDITABLE';end if;
 -- A repeated save of the same day has no second event or notification.
 if o.delivery_date=p_date then return;end if;
 if o.revision is distinct from p_revision then raise exception 'EDIT_CONFLICT' using errcode='40001';end if;
 note:=case when o.delivery_date is null then 'تم تحديد موعد التوصيل: ' else 'تم تغيير موعد التوصيل من '||to_char(o.delivery_date,'DD/MM/YYYY')||' إلى ' end||to_char(p_date,'DD/MM/YYYY');
 update public.orders set delivery_date=p_date,revision=revision+1 where id=p_order;
 insert into public.order_events(order_id,status,note,actor_id) values(p_order,o.status,note,auth.uid());
 insert into public.customer_notifications(customer_id,order_id,title,message,kind)
 values(o.customer_id,p_order,case when o.delivery_date is null then 'تم تحديد موعد توصيل طلبك' else 'تم تغيير موعد توصيل طلبك' end,note,'delivery');
 insert into public.audit_logs(actor_id,entity,operation,before_data,after_data)
 values(auth.uid(),'order_delivery','UPDATE',jsonb_build_object('order_id',p_order,'delivery_date',o.delivery_date),jsonb_build_object('order_id',p_order,'delivery_date',p_date));
end;
$$;
revoke all on function public.schedule_order_delivery(uuid,bigint,date) from public,anon,authenticated,service_role;
grant execute on function public.schedule_order_delivery(uuid,bigint,date) to authenticated;
commit;
