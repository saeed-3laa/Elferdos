begin;
-- Sensitive actions and RLS reject an already-revoked JWT, not just its refresh.
create or replace function private.is_active_customer() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
 where p.id=auth.uid() and p.active and s.id=nullif(current_setting('request.jwt.claims',true)::jsonb->>'session_id','')::uuid);
$$;
create or replace function private.has_permission(required_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_customer() and exists(select 1 from public.staff_assignments s where s.user_id=auth.uid() and s.active and
 (s.role='OWNER' or exists(select 1 from public.role_permissions rp where rp.role=s.role and rp.permission=required_permission)));
$$;
drop policy profiles_read on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using((id=auth.uid() and private.is_active_customer()) or private.has_permission('customers.read'));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid() and private.is_active_customer()) with check(id=auth.uid() and active and private.is_active_customer());

create function public.manage_staff(p_target uuid,p_role public.staff_role,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(43662001);
 if p_target=auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
 if not exists(select 1 from public.profiles where id=p_target and active) then raise exception 'CUSTOMER_UNAVAILABLE'; end if;
 if exists(select 1 from public.staff_assignments where user_id=p_target and role='OWNER' and active) and
 (p_role<>'OWNER' or not p_active) and (select count(*) from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.role='OWNER' and s.active)<=1 then raise exception 'LAST_OWNER'; end if;
 insert into public.staff_assignments(user_id,role,active) values(p_target,p_role,p_active) on conflict(user_id) do update set role=excluded.role,active=excluded.active;
end;
$$;
create function public.manage_customer(p_target uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_active is null or p_target=auth.uid() or exists(select 1 from public.staff_assignments where user_id=p_target and role='OWNER' and active) then raise exception 'OWNER_PROTECTED'; end if;
 update public.profiles set active=p_active where id=p_target;
 if not found then raise exception 'CUSTOMER_UNAVAILABLE'; end if;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(auth.uid(),'customer_access','UPDATE',jsonb_build_object('id',p_target,'active',p_active));
end;
$$;
create function public.save_role_permissions(p_role public.staff_role,p_permissions text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission('staff.manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_role='OWNER' or p_role is null or p_permissions is null or cardinality(p_permissions)>10 or not p_permissions<@array['catalog.read','catalog.write','inventory.read','inventory.write','customers.read','reports.read','orders.read','orders.write','settings.write','audit.read']::text[] then raise exception 'INVALID_PERMISSIONS'; end if;
 if ('catalog.write'=any(p_permissions) and not 'catalog.read'=any(p_permissions)) or ('orders.write'=any(p_permissions) and not 'orders.read'=any(p_permissions)) or ('inventory.write'=any(p_permissions) and not 'inventory.read'=any(p_permissions)) then raise exception 'INVALID_PERMISSIONS'; end if;
 delete from public.role_permissions where role=p_role;
 insert into public.role_permissions(role,permission) select p_role,unnest(p_permissions) on conflict do nothing;
end;
$$;
create function public.complete_account_recovery(p_actor uuid,p_target uuid,p_reason text,p_new_phone text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=p_actor and s.role='OWNER' and s.active) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_target=p_actor or p_reason is null or length(trim(p_reason)) not between 5 and 500 or exists(select 1 from public.staff_assignments where user_id=p_target and role='OWNER' and active) then raise exception 'OWNER_PROTECTED'; end if;
 if p_new_phone is not null then update public.profiles set phone=p_new_phone where id=p_target; end if;
 delete from auth.sessions where user_id=p_target;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'account_recovery','UPDATE',jsonb_build_object('user_id',p_target,'reason',trim(p_reason),'phone_changed',p_new_phone is not null));
end;
$$;
revoke all on function public.complete_account_recovery(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_account_recovery(uuid,uuid,text,text) to service_role;

create table public.payment_settings(id boolean primary key default true check(id),instapay_recipient text not null default '' check(length(instapay_recipient)<=300),revision bigint not null default 0);
insert into public.payment_settings default values;
alter table public.payment_settings enable row level security;
revoke all on public.payment_settings from anon,authenticated;
grant select on public.payment_settings to authenticated;
create policy payment_settings_read on public.payment_settings for select to authenticated using(private.is_active_customer());
create trigger bump_revision before update on public.payment_settings for each row execute function private.bump_revision();
create trigger audit_change after insert or update or delete on public.payment_settings for each row execute function private.audit_change();
create function public.save_payment_settings(p_revision bigint,p_recipient text) returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;begin
 if not private.has_permission('settings.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select revision into current_revision from public.payment_settings where id for update;
 if p_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 update public.payment_settings set instapay_recipient=trim(p_recipient) where id;
end;
$$;

create function public.preview_price(p_unit uuid,p_quantity integer,p_customer uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_quantity is null or p_quantity not between 1 and 100000 then raise exception 'INVALID_QUANTITY'; end if;
 return private.best_price(p_customer,p_unit,p_quantity,now());
end;
$$;

create function public.sales_report(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 'products',(select coalesce(jsonb_agg(t),'[]') from(select i.product_id,i.product_name name,sum(i.quantity::bigint*i.pieces_per_unit) pieces,sum(i.line_total) value from public.order_items i join public.orders o on o.id=i.order_id where o.delivered_at>=start_time and o.delivered_at<end_time and o.status='DELIVERED' group by i.product_id,i.product_name order by sum(i.line_total) desc,i.product_id limit 50)t),
 'categories',(select coalesce(jsonb_agg(t),'[]') from(select i.category_name name,sum(i.line_total) value from public.order_items i join public.orders o on o.id=i.order_id where o.delivered_at>=start_time and o.delivered_at<end_time and o.status='DELIVERED' group by i.category_name order by sum(i.line_total) desc limit 50)t),
 'customers',(select coalesce(jsonb_agg(t),'[]') from(select customer_id,customer_snapshot->>'name' name,count(*) count,sum(total) value from public.orders where created_at>=start_time and created_at<end_time and status<>'CANCELLED' group by customer_id,customer_snapshot->>'name' order by count(*) desc,customer_id limit 50)t),
 'promotions',(select coalesce(jsonb_agg(t),'[]') from(select i.pricing_rule_id,i.price_label name,count(*) lines,sum((i.base_price-i.unit_price)*i.quantity) discount from public.order_items i join public.orders o on o.id=i.order_id where o.created_at>=start_time and o.created_at<end_time and o.status<>'CANCELLED' and i.pricing_rule_id is not null group by i.pricing_rule_id,i.price_label order by sum((i.base_price-i.unit_price)*i.quantity) desc limit 50)t),
 'low_stock',(select coalesce(jsonb_agg(t),'[]') from(select p.id,p.name,p.sku,i.quantity_pieces-i.reserved_pieces available_pieces,i.stock_updated_at from public.inventory i join public.products p on p.id=i.product_id where p.active and p.archived_at is null and i.quantity_pieces-i.reserved_pieces<coalesce((select min(u.pieces_per_unit::bigint*u.minimum_quantity)*5 from public.product_units u where u.product_id=p.id and u.active),0) order by i.quantity_pieces-i.reserved_pieces,p.id limit 50)t)) into result;
 return result;
end;
$$;

create table public.import_batches(id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),kind text not null check(kind in('products','stock')),status text not null check(status in('PREVIEW','APPLIED','FAILED')) default 'PREVIEW',rows jsonb not null,created_at timestamptz not null default now(),applied_at timestamptz,error text);
alter table public.import_batches enable row level security;
revoke all on public.import_batches from anon,authenticated;
grant select on public.import_batches to authenticated;
create index import_batches_actor_idx on public.import_batches(actor_id,created_at desc);
create policy imports_read on public.import_batches for select to authenticated using(actor_id=auth.uid() and (private.has_permission('catalog.write') or private.has_permission('inventory.write')));
create function public.preview_import(p_kind text,p_rows jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if not private.has_permission(case when p_kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in('products','stock') or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 or pg_column_size(p_rows)>2000000 then raise exception 'INVALID_IMPORT'; end if;
 insert into public.import_batches(actor_id,kind,rows) values(auth.uid(),p_kind,p_rows) returning id into target;return target;
end;
$$;
create function public.import_context(p_kind text,p_skus text[],p_categories text[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_permission(case when p_kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in('stock','products') or p_skus is null or cardinality(p_skus)>500 or cardinality(p_categories)>500 then raise exception 'INVALID_IMPORT'; end if;
 return jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'revision',p.revision,'archived_at',p.archived_at,
 'inventory',case when p_kind='stock' then (select jsonb_build_object('version',i.version,'quantity_pieces',i.quantity_pieces,'reserved_pieces',i.reserved_pieces) from public.inventory i where i.product_id=p.id) else null end,
 'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'pieces_per_unit',u.pieces_per_unit,'revision',u.revision)),'[]') from public.product_units u where u.product_id=p.id))),'[]') from public.products p where p.sku=any(p_skus)),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)),'[]') from public.categories c where c.name=any(p_categories)));
end;
$$;
create function public.apply_import(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.import_batches%rowtype;r jsonb;target uuid;begin
 select * into b from public.import_batches where id=p_batch and actor_id=auth.uid() for update;
 if not found then raise exception 'IMPORT_UNAVAILABLE'; end if;
 if not private.has_permission(case when b.kind='stock' then 'inventory.write' else 'catalog.write' end) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
do $$ declare fn regprocedure; begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('manage_staff','manage_customer','save_role_permissions','save_payment_settings','preview_price','sales_report','preview_import','apply_import','import_context') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);execute format('grant execute on function %s to authenticated',fn);
 end loop;
end $$;
commit;
