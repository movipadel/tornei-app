begin;

-- Customer-management decisions have their own append-only trail. Agreement
-- audit events cannot represent a customer without a corporate agreement.
create table public.moviback_customer_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  membership_id uuid not null,
  certificate_id uuid,
  event_type text not null check (event_type in ('certificate_approved','certificate_rejected','membership_reactivated')),
  actor_staff_id uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index moviback_customer_audit_membership_idx
  on public.moviback_customer_audit_events (membership_id, created_at desc);

create function public.prevent_moviback_customer_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception using errcode='P0001', message='MOVIBACK_CUSTOMER_AUDIT_APPEND_ONLY';
end; $$;
create trigger moviback_customer_audit_append_only
before update or delete on public.moviback_customer_audit_events
for each row execute function public.prevent_moviback_customer_audit_mutation();

alter table public.moviback_customer_audit_events enable row level security;
revoke all on public.moviback_customer_audit_events from public,anon,authenticated;
grant select,insert on public.moviback_customer_audit_events to service_role;
revoke all on function public.prevent_moviback_customer_audit_mutation() from public,anon,authenticated;

create or replace function public.review_moviback_certificate(
  p_membership_id uuid, p_certificate_id uuid, p_action text,
  p_notes text, p_actor_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_membership public.loyalty_memberships%rowtype;
  v_certificate public.medical_certificates%rowtype;
  v_now timestamptz;
begin
  if p_action not in ('approve','reject') then
    return jsonb_build_object('ok',false,'error_code','INVALID_ACTION');
  end if;
  if p_actor_staff_id is null or not exists (
    select 1 from public.staff_users where id=p_actor_staff_id and is_active and role='admin'
  ) then return jsonb_build_object('ok',false,'error_code','OPERATOR_INVALID'); end if;
  select * into v_membership from public.loyalty_memberships
    where id=p_membership_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_FOUND'); end if;
  if not exists (select 1 from public.users u where u.id=v_membership.user_id and u.identity_status='active')
     or (select count(*) from public.loyalty_memberships where user_id=v_membership.user_id)<>1 then
    return jsonb_build_object('ok',false,'error_code','CUSTOMER_IDENTITY_CONFLICT');
  end if;
  if v_membership.status not in ('pending_review','approved') and not (
    v_membership.status='suspended' and v_membership.suspension_reason='Uscita volontaria utente'
  ) then return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_REVIEWABLE'); end if;
  select * into v_certificate from public.medical_certificates
    where id=p_certificate_id for update;
  if not found or v_certificate.user_id<>v_membership.user_id then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_MEMBERSHIP_MISMATCH');
  end if;
  if v_certificate.status<>'pending_review' then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_NOT_PENDING');
  end if;
  if btrim(coalesce(v_certificate.file_path,''))='' then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_MISSING');
  end if;
  if p_action='approve' and (v_certificate.expiry_date is null or v_certificate.expiry_date<current_date) then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED');
  end if;
  if p_action='reject' and btrim(coalesce(p_notes,''))='' then
    return jsonb_build_object('ok',false,'error_code','REJECTION_REASON_REQUIRED');
  end if;
  v_now:=clock_timestamp();
  update public.medical_certificates
     set status=case when p_action='approve' then 'approved' else 'rejected' end,
         reviewed_at=v_now, reviewed_by=p_actor_staff_id,
         notes=case when p_action='approve' then coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Certificato approvato da Admin') else btrim(p_notes) end
   where id=p_certificate_id;
  insert into public.moviback_customer_audit_events
    (user_id,membership_id,certificate_id,event_type,actor_staff_id,before_state,after_state,reason)
  values (v_membership.user_id,v_membership.id,v_certificate.id,
    case when p_action='approve' then 'certificate_approved' else 'certificate_rejected' end,
    p_actor_staff_id,
    jsonb_build_object('certificate_status',v_certificate.status,'membership_status',v_membership.status,'suspension_reason',v_membership.suspension_reason),
    jsonb_build_object('certificate_status',case when p_action='approve' then 'approved' else 'rejected' end,'membership_status',v_membership.status,'suspension_reason',v_membership.suspension_reason),
    nullif(btrim(coalesce(p_notes,'')),''));
  return jsonb_build_object('ok',true,'certificate_id',p_certificate_id,
    'certificate_status',case when p_action='approve' then 'approved' else 'rejected' end,
    'membership_status',v_membership.status);
end; $$;

create function public.reactivate_moviback_membership_admin(
  p_membership_id uuid, p_actor_staff_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_membership public.loyalty_memberships%rowtype;
  v_certificate public.medical_certificates%rowtype;
  v_now timestamptz;
begin
  if p_actor_staff_id is null or not exists (
    select 1 from public.staff_users where id=p_actor_staff_id and is_active and role='admin'
  ) then return jsonb_build_object('ok',false,'error_code','OPERATOR_INVALID'); end if;
  if length(btrim(coalesce(p_reason,'')))<8 or length(p_reason)>500 then
    return jsonb_build_object('ok',false,'error_code','REENTRY_REASON_REQUIRED');
  end if;
  select * into v_membership from public.loyalty_memberships where id=p_membership_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_FOUND'); end if;
  if v_membership.status<>'suspended' or v_membership.suspension_reason<>'Uscita volontaria utente' then
    return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_REACTIVATABLE');
  end if;
  if not exists (select 1 from public.users u where u.id=v_membership.user_id and u.identity_status='active')
     or (select count(*) from public.loyalty_memberships where user_id=v_membership.user_id)<>1 then
    return jsonb_build_object('ok',false,'error_code','CUSTOMER_IDENTITY_CONFLICT');
  end if;
  if not v_membership.fee_paid or length(btrim(coalesce(v_membership.tax_code,''))) not between 11 and 16 then
    return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_ELIGIBLE');
  end if;
  select * into v_certificate from public.medical_certificates
    where user_id=v_membership.user_id and status='approved'
    order by uploaded_at desc,id desc limit 1 for share;
  if not found or v_certificate.expiry_date is null or v_certificate.expiry_date<current_date-60 then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_NOT_ELIGIBLE');
  end if;
  v_now:=clock_timestamp();
  update public.loyalty_memberships set status='approved',suspended_at=null,suspension_reason=null,updated_at=v_now
    where id=v_membership.id;
  insert into public.moviback_customer_audit_events
    (user_id,membership_id,certificate_id,event_type,actor_staff_id,before_state,after_state,reason)
  values(v_membership.user_id,v_membership.id,v_certificate.id,'membership_reactivated',p_actor_staff_id,
    jsonb_build_object('membership_status',v_membership.status,'suspension_reason',v_membership.suspension_reason,'suspended_at',v_membership.suspended_at),
    jsonb_build_object('membership_status','approved','suspension_reason',null,'suspended_at',null),
    btrim(p_reason));
  return jsonb_build_object('ok',true,'membership_status','approved','certificate_id',v_certificate.id);
end; $$;

revoke all on function public.review_moviback_certificate(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_moviback_certificate(uuid,uuid,text,text,uuid) to service_role;
revoke all on function public.reactivate_moviback_membership_admin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reactivate_moviback_membership_admin(uuid,uuid,text) to service_role;

commit;
