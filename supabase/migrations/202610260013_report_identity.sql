begin;
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
 'low_stock',(select coalesce(jsonb_agg(t),'[]') from(select p.id,p.name,p.sku,i.quantity_pieces-i.reserved_pieces available_pieces,i.stock_updated_at from public.inventory i join public.products p on p.id=i.product_id where p.active and p.archived_at is null and i.quantity_pieces-i.reserved_pieces<coalesce((select min(u.pieces_per_unit::bigint*u.minimum_quantity)*5 from public.product_units u where u.product_id=p.id and u.active),0) order by i.quantity_pieces-i.reserved_pieces,p.id limit 50)t)) into result;
 return result;
end;
$$;


commit;