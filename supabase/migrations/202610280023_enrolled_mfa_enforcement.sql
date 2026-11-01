begin;
-- An enrolled administrator must never fall back to password-only access,
-- even while other legacy administrators are still being migrated.
create function private.admin_mfa_required() returns boolean language sql stable security definer set search_path='' as $$
 select (select admin_mfa_required from private.deployment_security where id) or exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.factor_type='totp' and f.status='verified');
$$;
revoke all on function private.admin_mfa_required() from public,anon,authenticated,service_role;
create or replace function private.admin_mfa_satisfied() returns boolean language sql stable security definer set search_path='' as $$
 select not private.admin_mfa_required() or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2';
$$;
create or replace function public.get_staff_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',s.role,'permissions',case when s.role='OWNER' then
 (select jsonb_agg(permission order by permission) from(select permission from public.role_permissions union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write','inventory.read','inventory.write'])) a)
 else(select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) from public.role_permissions where role=s.role)end,
 'email_required',(select staff_email_login_required from private.deployment_security where id) or not p.legacy_staff_login,'email_ready',private.staff_email_ready(p.id),
 'mfa_required',private.admin_mfa_required(),'mfa_verified',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2')
 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=auth.uid() and s.active and private.is_active_account();
$$;
commit;
