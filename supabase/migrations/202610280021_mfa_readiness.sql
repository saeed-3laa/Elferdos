begin;
create or replace function public.deployment_security_status() returns jsonb language sql stable security definer set search_path='' as $$
 with staff as(select p.id from public.profiles p join public.staff_assignments s on s.user_id=p.id where p.account_kind='STAFF' and p.active and s.active),
 pending as(select s.id from staff s join auth.users u on u.id=s.id where u.email is null or u.email_confirmed_at is null or not exists(select 1 from auth.mfa_factors f where f.user_id=s.id and f.factor_type='totp' and f.status='verified'))
 select jsonb_build_object('admin_mfa_required',(select admin_mfa_required from private.deployment_security where id),'active_staff',(select count(*) from staff),'pending_mfa_staff',(select count(*) from pending));
$$;
revoke all on function public.deployment_security_status() from public,anon,authenticated,service_role;
grant execute on function public.deployment_security_status() to service_role;
commit;
