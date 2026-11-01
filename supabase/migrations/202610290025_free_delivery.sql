begin;
-- Keep existing order/payment snapshots unchanged; new quotes and explicit
-- amendments use free delivery regardless of zone or subtotal.
update public.delivery_zones set fee_piastres=0 where fee_piastres<>0;
update public.store_settings set free_delivery_above_piastres=0 where free_delivery_above_piastres<>0;
alter table public.delivery_zones alter column fee_piastres set default 0;
alter table public.delivery_zones add constraint zones_delivery_is_free check(fee_piastres=0);
alter table public.store_settings alter column free_delivery_above_piastres set default 0;
alter table public.store_settings add constraint delivery_threshold_retired check(free_delivery_above_piastres=0);

create or replace function public.save_admin_reference(p_kind text, p_id uuid, p_expected_revision bigint, p_name text, p_active boolean, p_fee bigint default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; current_revision bigint;
begin
  if p_kind not in ('category','zone') or p_kind is null then raise exception 'INVALID_REFERENCE' using errcode = '22023'; end if;
  if not private.has_permission(case when p_kind = 'zone' then 'settings.write' else 'catalog.write' end) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 or p_active is null
    or p_fee is null or p_fee not between 0 and 100000000 then raise exception 'INVALID_REFERENCE' using errcode = '22023'; end if;
  if p_kind = 'category' then
    if p_id is null then
      insert into public.categories(name, active) values(trim(p_name),p_active) returning id into target;
    else
      select revision into current_revision from public.categories where id=p_id for update;
      if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
      if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
      update public.categories set name=trim(p_name),active=p_active where id=p_id returning id into target;
    end if;
  else
    if p_id is null then
      insert into public.delivery_zones(name, active, fee_piastres) values(trim(p_name),p_active,0) returning id into target;
    else
      select revision into current_revision from public.delivery_zones where id=p_id for update;
      if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
      if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
      update public.delivery_zones set name=trim(p_name),active=p_active,fee_piastres=0 where id=p_id returning id into target;
    end if;
  end if;
  return target;
end;
$$;

create or replace function public.save_admin_settings(p_expected_revision bigint,p_free_above bigint,p_stale_hours integer,p_policy text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  if not private.has_permission('settings.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_free_above is null or p_free_above not between 0 and 100000000 or p_stale_hours is null or p_stale_hours not between 1 and 720
    or p_policy is null or p_policy not in ('block','warn') then raise exception 'INVALID_SETTINGS' using errcode='22023'; end if;
  select revision into current_revision from public.store_settings where id for update;
  if p_expected_revision is distinct from current_revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
  update public.store_settings set free_delivery_above_piastres=0,stock_stale_hours=p_stale_hours,stale_stock_policy=p_policy where id;
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
 fee:=0;
 return jsonb_build_object('lines',lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'address',address_data);
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
 fee:=0;
 if sub+fee>1000000000000 or base>1000000000000 then raise exception 'ORDER_LIMIT'; end if;
 select coalesce(sum(amount),0) into paid from public.order_payments where order_id=p_order;
 if paid>sub+fee then raise exception 'AMENDMENT_REQUIRES_REFUND'; end if;
 return jsonb_build_object('before',jsonb_build_object('lines',before_lines,'base_total',o.base_total,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'status',o.status),
  'after',jsonb_build_object('lines',after_lines,'base_total',base,'subtotal',sub,'delivery_fee',fee,'total',sub+fee,'status','CONFIRMED'),'changes',changes,'paid',paid);
end;
$$;
commit;
