begin;
create table private.deployment_security(id boolean primary key default true check(id),admin_mfa_required boolean not null default false);
insert into private.deployment_security default values;
alter table private.deployment_security enable row level security;
revoke all on private.deployment_security from public,anon,authenticated,service_role;
create function private.admin_mfa_satisfied() returns boolean language sql stable security definer set search_path='' as $$
 select not admin_mfa_required or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2' from private.deployment_security where id;
$$;
revoke all on function private.admin_mfa_satisfied() from public,anon,authenticated,service_role;
create or replace function private.has_permission(required_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_account() and private.admin_mfa_satisfied() and exists(select 1 from public.staff_assignments s where s.user_id=auth.uid() and s.active and
 (s.role='OWNER' or exists(select 1 from public.role_permissions rp where rp.role=s.role and rp.permission=required_permission)));
$$;
create or replace function public.get_staff_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',s.role,'permissions',case when s.role='OWNER' then
 (select jsonb_agg(permission order by permission) from(select permission from public.role_permissions union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write','inventory.read','inventory.write'])) all_permissions)
 else(select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) from public.role_permissions where role=s.role)end,
 'mfa_required',(select admin_mfa_required from private.deployment_security where id),
 'mfa_verified',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2')
 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=auth.uid() and s.active and private.is_active_account();
$$;
-- Enabling MFA is a deployment operation, not a customer- or staff-editable value.
-- After testing enrollment and recovery on staging, the deployment administrator
-- enables it with: update private.deployment_security set admin_mfa_required=true where id;
-- The local environment keeps the rollout switch false to avoid silently
-- locking an existing real owner out before they enroll their own authenticator.
create function public.deployment_security_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin_mfa_required',admin_mfa_required) from private.deployment_security where id;
$$;
revoke all on function public.deployment_security_status() from public,anon,authenticated,service_role;
grant execute on function public.deployment_security_status() to service_role;
commit;
