begin;
alter table public.profiles alter column phone drop not null;
alter table public.profiles add column login_email text unique,add column legacy_staff_login boolean not null default false;
alter table public.profiles add constraint customer_phone_required check(account_kind='STAFF' or phone is not null);
alter table public.profiles add constraint staff_email_only check(login_email is null or(account_kind='STAFF' and login_email=lower(trim(login_email)) and length(login_email) between 3 and 254));
update public.profiles p set legacy_staff_login=true,login_email=lower(u.email) from auth.users u where p.id=u.id and p.account_kind='STAFF';
alter table private.deployment_security add column staff_email_login_required boolean not null default false;
create or replace function private.classify_staff() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.profiles p set account_kind='STAFF',login_email=coalesce(p.login_email,(select lower(u.email) from auth.users u where u.id=new.user_id)) where p.id=new.user_id;return new;end;
$$;
create function private.staff_email_ready(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and p.account_kind='STAFF' and u.email_confirmed_at is not null and lower(u.email)=p.login_email);
$$;
revoke all on function private.staff_email_ready(uuid) from public,anon,authenticated,service_role;
create or replace function private.has_permission(required_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_account() and private.admin_mfa_satisfied() and
 (private.staff_email_ready(auth.uid()) or(not(select staff_email_login_required from private.deployment_security where id) and exists(select 1 from public.profiles p where p.id=auth.uid() and p.legacy_staff_login))) and
 exists(select 1 from public.staff_assignments s where s.user_id=auth.uid() and s.active and(s.role='OWNER' or exists(select 1 from public.role_permissions rp where rp.role=s.role and rp.permission=required_permission)));
$$;
create or replace function public.get_staff_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',s.role,'permissions',case when s.role='OWNER' then
 (select jsonb_agg(permission order by permission) from(select permission from public.role_permissions union select unnest(array['settings.write','audit.read','staff.manage','catalog.read','catalog.write','inventory.read','inventory.write'])) a)
 else(select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) from public.role_permissions where role=s.role)end,
 'email_required',(select staff_email_login_required from private.deployment_security where id) or not p.legacy_staff_login,'email_ready',private.staff_email_ready(p.id),
 'mfa_required',(select admin_mfa_required from private.deployment_security where id),'mfa_verified',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2')
 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=auth.uid() and s.active and private.is_active_account();
$$;
create function public.provision_email_staff(p_actor uuid,p_target uuid,p_name text,p_role public.staff_role,p_phone text default null) returns void language plpgsql security definer set search_path='' as $$
declare email text;
begin
 perform pg_advisory_xact_lock(43662001);
 if not exists(select 1 from public.staff_assignments s join public.profiles p on p.id=s.user_id and p.active where s.user_id=p_actor and s.role='OWNER' and s.active) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 3 and 160 or p_role is null then raise exception 'INVALID_STAFF';end if;
 select lower(u.email) into email from auth.users u where u.id=p_target and nullif(u.phone,'') is null for update;
 if email is null or exists(select 1 from public.profiles where id=p_target) then raise exception 'NOT_NEW_STAFF_ACCOUNT';end if;
 insert into public.profiles(id,phone,full_name,account_kind,login_email) values(p_target,p_phone,trim(p_name),'STAFF',email);
 insert into public.staff_assignments(user_id,role,active) values(p_target,p_role,true);
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'staff_provisioning','INSERT',jsonb_build_object('user_id',p_target,'role',p_role,'email_login',true));
end;
$$;
revoke all on function public.provision_email_staff(uuid,uuid,text,public.staff_role,text) from public,anon,authenticated,service_role;
grant execute on function public.provision_email_staff(uuid,uuid,text,public.staff_role,text) to service_role;
create function public.request_staff_email(p_actor uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_email is null or length(p_email) not between 3 and 254 or p_email<>lower(trim(p_email)) then raise exception 'INVALID_EMAIL';end if;
 update public.profiles set login_email=p_email where id=p_actor and account_kind='STAFF' and active;
 if not found then raise exception 'STAFF_UNAVAILABLE';end if;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'staff_email_request','UPDATE',jsonb_build_object('user_id',p_actor,'verification_required',true));
end;
$$;
revoke all on function public.request_staff_email(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.request_staff_email(uuid,text) to service_role;
create function public.finish_staff_email_link(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.staff_email_ready(p_actor) then raise exception 'EMAIL_NOT_VERIFIED';end if;
 update public.profiles set legacy_staff_login=false where id=p_actor;
 delete from auth.sessions where user_id=p_actor;
 insert into public.audit_logs(actor_id,entity,operation,after_data) values(p_actor,'staff_email_verified','UPDATE',jsonb_build_object('user_id',p_actor));
end;
$$;
revoke all on function public.finish_staff_email_link(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finish_staff_email_link(uuid) to service_role;
create or replace function public.deployment_security_status() returns jsonb language sql stable security definer set search_path='' as $$
 with staff as(select p.id from public.profiles p join public.staff_assignments s on s.user_id=p.id where p.account_kind='STAFF' and p.active and s.active),pending as(select s.id from staff s where not private.staff_email_ready(s.id) or not exists(select 1 from auth.mfa_factors f where f.user_id=s.id and f.factor_type='totp' and f.status='verified'))
 select jsonb_build_object('admin_mfa_required',(select admin_mfa_required from private.deployment_security where id),'staff_email_login_required',(select staff_email_login_required from private.deployment_security where id),'active_staff',(select count(*) from staff),'pending_mfa_staff',(select count(*) from pending));
$$;
commit;
