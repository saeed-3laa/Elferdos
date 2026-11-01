begin;

-- Database sequence coordinates concurrent creates; gaps are normal after rollbacks.
create sequence private.product_sku_sequence as bigint;
revoke all on sequence private.product_sku_sequence from public, anon, authenticated, service_role;

create or replace function public.save_admin_product(p_id uuid, p_expected_revision bigint, p_sku text, p_name text, p_category uuid, p_description text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; current_product public.products%rowtype;
  requested_sku text := nullif(upper(trim(p_sku)), '');
  code_number text;
begin
  if not private.has_permission('catalog.write') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if (requested_sku is not null and requested_sku !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$')
    or p_name is null or length(trim(p_name)) not between 1 and 200
    or p_description is null or length(p_description)>4000 or p_active is null then
    raise exception 'INVALID_PRODUCT' using errcode='22023';
  end if;
  if p_id is null then
    if requested_sku is not null then
      insert into public.products(sku,name,category_id,description,active)
      values(requested_sku,trim(p_name),p_category,trim(p_description),p_active) returning id into target;
    else
      loop
        code_number := nextval('private.product_sku_sequence'::regclass)::text;
        insert into public.products(sku,name,category_id,description,active)
        values('FD-' || lpad(code_number,greatest(6,length(code_number)),'0'),trim(p_name),p_category,trim(p_description),p_active)
        on conflict (sku) do nothing returning id into target;
        -- Skip any code previously entered manually; never overwrite its product.
        exit when target is not null;
      end loop;
    end if;
  else
    select * into current_product from public.products where id=p_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_revision is distinct from current_product.revision then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
    if current_product.archived_at is not null then raise exception 'PRODUCT_ARCHIVED' using errcode='22023'; end if;
    update public.products set sku=coalesce(requested_sku,current_product.sku),name=trim(p_name),category_id=p_category,description=trim(p_description),active=p_active
    where id=p_id returning id into target;
  end if;
  return target;
end;
$$;
revoke all on function public.save_admin_product(uuid,bigint,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.save_admin_product(uuid,bigint,text,text,uuid,text,boolean) to authenticated;

commit;
