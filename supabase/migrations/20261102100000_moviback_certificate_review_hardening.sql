begin;

-- Requires 20261102095000 and the separate historical duplicate remediation.

-- Replacement is serialized per customer before the partial unique index is checked.
create function public.moviback_supersede_pending_certificate()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.status <> 'pending_review' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  update public.medical_certificates
     set status='superseded', notes='Sostituito da un nuovo certificato'
   where user_id=new.user_id and status='pending_review' and id<>new.id;
  return new;
end; $$;

create trigger moviback_supersede_pending_certificate_before_insert
before insert or update of status on public.medical_certificates
for each row execute function public.moviback_supersede_pending_certificate();

-- A pre-existing duplicate must be handled explicitly before this migration.
create unique index medical_certificates_one_pending_per_user
on public.medical_certificates(user_id) where status='pending_review';

create function public.review_moviback_certificate(
  p_membership_id uuid, p_certificate_id uuid, p_action text,
  p_notes text, p_actor_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_membership public.loyalty_memberships%rowtype;
  v_certificate public.medical_certificates%rowtype;
  v_now timestamptz := transaction_timestamp();
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
  if v_membership.status not in ('pending_review','approved') then
    return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_REVIEWABLE');
  end if;
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
  update public.medical_certificates
     set status=case when p_action='approve' then 'approved' else 'rejected' end,
         reviewed_at=v_now, reviewed_by=p_actor_staff_id,
         notes=case when p_action='approve' then coalesce(nullif(btrim(coalesce(p_notes,'')),''),'Certificato approvato da Admin') else btrim(p_notes) end
   where id=p_certificate_id;
  return jsonb_build_object('ok',true,'certificate_id',p_certificate_id,
    'certificate_status',case when p_action='approve' then 'approved' else 'rejected' end,
    'membership_status',v_membership.status);
end; $$;

revoke all on function public.moviback_supersede_pending_certificate() from public,anon,authenticated;
revoke all on function public.review_moviback_certificate(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_moviback_certificate(uuid,uuid,text,text,uuid) to service_role;

-- Membership review retains the C5 fee and convention transaction, but the
-- certificate target is now explicit and the approval date rule is shared.
create function public.review_moviback_membership_c6(
  p_membership_id uuid, p_certificate_id uuid, p_action text,
  p_rejection_reason text, p_certificate_note text, p_actor_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_now timestamptz:=transaction_timestamp();
  v_membership public.loyalty_memberships%rowtype;
  v_certificate public.medical_certificates%rowtype;
  v_entitlement public.moviback_agreement_entitlements%rowtype;
  v_code public.moviback_agreement_codes%rowtype;
  v_agreement public.moviback_agreements%rowtype;
  v_reason text;
begin
  if p_action not in ('approve','reject') then return jsonb_build_object('ok',false,'error_code','INVALID_ACTION'); end if;
  if p_actor_staff_id is null or not exists(select 1 from public.staff_users where id=p_actor_staff_id and is_active and role='admin') then
    return jsonb_build_object('ok',false,'error_code','OPERATOR_INVALID');
  end if;
  select * into v_membership from public.loyalty_memberships where id=p_membership_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_FOUND'); end if;
  if v_membership.status<>'pending_review' then return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_REVIEWABLE'); end if;
  select * into v_certificate from public.medical_certificates where id=p_certificate_id for update;
  if not found or v_certificate.user_id<>v_membership.user_id then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_MEMBERSHIP_MISMATCH');
  end if;
  if v_certificate.status not in ('pending_review','approved') then return jsonb_build_object('ok',false,'error_code','CERTIFICATE_NOT_REVIEWABLE'); end if;
  if btrim(coalesce(v_certificate.file_path,''))='' then return jsonb_build_object('ok',false,'error_code','CERTIFICATE_MISSING'); end if;
  if p_action='reject' then
    if btrim(coalesce(p_rejection_reason,''))='' then return jsonb_build_object('ok',false,'error_code','REJECTION_REASON_REQUIRED'); end if;
    if v_certificate.status='pending_review' then
      update public.medical_certificates set status='rejected',reviewed_at=v_now,reviewed_by=p_actor_staff_id,
        notes=btrim(p_rejection_reason) where id=v_certificate.id;
    end if;
    update public.loyalty_memberships set status='rejected',rejection_reason=btrim(p_rejection_reason),rejected_at=v_now,updated_at=v_now
      where id=v_membership.id;
    select * into v_entitlement from public.moviback_agreement_entitlements
      where membership_id=v_membership.id and status='pending' order by created_at desc limit 1;
    if found then
      insert into public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state,reason)
      values(v_entitlement.agreement_id,v_entitlement.code_id,v_entitlement.id,'membership_rejected_reservation_retained',p_actor_staff_id,
        jsonb_build_object('membership_id',v_membership.id,'entitlement_status','pending'),btrim(p_rejection_reason));
    end if;
    return jsonb_build_object('ok',true,'membership_status','rejected','certificate_id',v_certificate.id,
      'convention_status',case when v_entitlement.id is null then null else 'pending' end);
  end if;
  if v_certificate.expiry_date is null or
     (v_certificate.status='pending_review' and v_certificate.expiry_date<current_date) or
     (v_certificate.status='approved' and v_certificate.expiry_date<current_date-60) then
    return jsonb_build_object('ok',false,'error_code','CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED');
  end if;
  if length(btrim(coalesce(v_membership.tax_code,''))) not between 11 and 16 then
    return jsonb_build_object('ok',false,'error_code','MEMBERSHIP_NOT_ELIGIBLE');
  end if;
  if v_certificate.status='pending_review' then
    update public.medical_certificates set status='approved',reviewed_at=v_now,reviewed_by=p_actor_staff_id,
      notes=coalesce(nullif(btrim(coalesce(p_certificate_note,'')),''),'Certificato approvato con la richiesta MoviBack')
      where id=v_certificate.id;
  end if;
  if v_membership.fee_points>0 and not v_membership.fee_paid then
    insert into public.loyalty_transactions(membership_id,type,source,euro_amount,points_delta,notes)
    values(v_membership.id,'redeem','membership_fee',null,-v_membership.fee_points,
      'Costo tessera '||coalesce(v_membership.membership_type,'MoviBack')||': '||v_membership.fee_points||' punti');
  end if;
  update public.loyalty_memberships set status='approved',approved_at=v_now,approved_by=p_actor_staff_id,fee_paid=true,updated_at=v_now
    where id=v_membership.id;
  select * into v_entitlement from public.moviback_agreement_entitlements
    where membership_id=v_membership.id and status='pending' and revoked_at is null
    order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok',true,'membership_status','approved','certificate_id',v_certificate.id,'convention_status',null); end if;
  select * into v_code from public.moviback_agreement_codes where id=v_entitlement.code_id for update;
  select * into v_agreement from public.moviback_agreements where id=v_entitlement.agreement_id for share;
  v_reason:=case
    when v_code.id is null or v_code.claimed_by_membership_id is distinct from v_membership.id then 'code_reservation_invalid'
    when v_code.status='revoked' or v_code.revoked_at is not null then 'code_revoked'
    when v_code.status='expired' or (v_code.valid_until is not null and v_now>=v_code.valid_until) then 'code_expired'
    when v_code.status<>'reserved' then 'code_reservation_invalid'
    when v_now<v_code.valid_from then 'code_not_yet_valid'
    when v_agreement.id is null then 'agreement_missing'
    when v_agreement.status='suspended' then 'agreement_suspended'
    when v_agreement.status='revoked' then 'agreement_revoked'
    when v_agreement.status<>'active' then 'agreement_'||v_agreement.status
    when v_now<v_agreement.valid_from then 'agreement_not_yet_valid'
    when v_agreement.valid_until is not null and v_now>=v_agreement.valid_until then 'agreement_expired'
    else null end;
  if v_reason is null then
    update public.moviback_agreement_codes set status='used' where id=v_code.id;
    update public.moviback_agreement_entitlements set status='active',activated_at=v_now,effective_from=v_now,
      effective_until=v_agreement.valid_until,updated_at=v_now where id=v_entitlement.id returning * into v_entitlement;
    insert into public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state)
    values(v_agreement.id,v_code.id,v_entitlement.id,'entitlement_activated_on_membership_approval',p_actor_staff_id,
      jsonb_build_object('membership_id',v_membership.id,'status','active','effective_from',v_now,'code_status','used'));
    return jsonb_build_object('ok',true,'membership_status','approved','certificate_id',v_certificate.id,'convention_status','active','entitlement_id',v_entitlement.id);
  end if;
  if v_code.id is not null and v_code.status='reserved' then
    if v_reason='code_expired' then update public.moviback_agreement_codes set status='expired' where id=v_code.id;
    else update public.moviback_agreement_codes set status='closed' where id=v_code.id; end if;
  end if;
  update public.moviback_agreement_entitlements set status='not_activated',not_activation_reason=v_reason,updated_at=v_now
    where id=v_entitlement.id returning * into v_entitlement;
  insert into public.moviback_agreement_audit_events(agreement_id,code_id,entitlement_id,event_type,actor_staff_id,after_state,reason)
  values(v_entitlement.agreement_id,v_entitlement.code_id,v_entitlement.id,'entitlement_not_activated_on_membership_approval',p_actor_staff_id,
    jsonb_build_object('membership_id',v_membership.id,'status','not_activated','code_status',
      (select status from public.moviback_agreement_codes where id=v_entitlement.code_id)),v_reason);
  return jsonb_build_object('ok',true,'membership_status','approved','certificate_id',v_certificate.id,'convention_status','not_activated',
    'convention_reason',v_reason,'entitlement_id',v_entitlement.id);
end; $$;

revoke all on function public.review_moviback_membership_c5(uuid,text,text,text,uuid) from service_role;
revoke all on function public.review_moviback_membership_c6(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_moviback_membership_c6(uuid,uuid,text,text,text,uuid) to service_role;

commit;
