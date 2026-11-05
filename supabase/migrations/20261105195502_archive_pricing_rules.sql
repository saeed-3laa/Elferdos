begin;

alter table public.pricing_rules add column archived_at timestamptz;
alter table public.pricing_rules add constraint archived_pricing_rule_is_inactive
  check (archived_at is null or not active);

create function public.archive_pricing_rule(p_id uuid, p_revision bigint, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_permission('catalog.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null or p_archived is null then
    raise exception 'INVALID_ARCHIVE_REQUEST' using errcode = '22023';
  end if;

  update public.pricing_rules
  set archived_at = case when p_archived then now() else null end,
      active = false
  where id = p_id and revision = p_revision
    and (archived_at is not null) <> p_archived;

  if not found then
    raise exception 'EDIT_CONFLICT' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.archive_pricing_rule(uuid, bigint, boolean) from public, anon, authenticated, service_role;
grant execute on function public.archive_pricing_rule(uuid, bigint, boolean) to authenticated;

commit;
