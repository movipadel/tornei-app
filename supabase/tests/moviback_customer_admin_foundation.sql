\set ON_ERROR_STOP on
begin;

do $$
declare
  v_staff uuid:=gen_random_uuid();
  v_auth uuid:=gen_random_uuid();
  v_user uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_member uuid:=gen_random_uuid();
  v_other_member uuid:=gen_random_uuid();
  v_cert uuid;
  v_other_cert uuid;
  v_result jsonb;
  v_balance bigint;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Customer Admin','customer-admin@example.invalid','admin',true);
  insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
    values(v_auth,'customer-linked@example.invalid',now(),now(),now());
  insert into public.users(id,full_name,phone,email,gender,auth_user_id,auth_migration_state)
    values(v_user,'Synthetic Linked Customer','3400999301','customer-linked@example.invalid','F',v_auth,'linked');
  insert into public.player_identities(full_name,normalized_phone,gender,account_user_id)
    values('Synthetic Linked Customer','+393400999301','F',v_user);
  insert into public.users(id,full_name,phone,email,gender)
    values(v_other,'Synthetic Other Customer','3400999302','other-customer@example.invalid','M');
  insert into public.loyalty_memberships(id,user_id,status,suspension_reason,suspended_at,membership_code,tax_code,membership_type,fee_paid,approved_at)
    values(v_member,v_user,'suspended','Uscita volontaria utente',now()-interval '1 day','TEST-CUSTOMER-ADMIN-1','RSSMRA90A01H501U','ASC',true,now()-interval '90 days'),
          (v_other_member,v_other,'suspended','Sospensione amministrativa',now()-interval '1 day','TEST-CUSTOMER-ADMIN-2','VRDLGI90A01H501W','ASC',true,now()-interval '90 days');
  insert into public.loyalty_transactions(membership_id,type,source,points_delta)
    values(v_member,'earn','club_payment',100);
  select coalesce(sum(points_delta),0) into v_balance from public.loyalty_transactions where membership_id=v_member;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_user,'synthetic/customer-admin.pdf','pending_review',current_date+90) returning id into v_cert;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_other,'synthetic/other-customer.pdf','pending_review',current_date+90) returning id into v_other_cert;

  v_result:=public.reactivate_moviback_membership_admin(v_member,v_staff,'Rientro richiesto dal cliente');
  if v_result->>'error_code'<>'CERTIFICATE_NOT_ELIGIBLE' then raise exception 'reactivation before review permitted: %',v_result; end if;
  v_result:=public.review_moviback_certificate(v_other_member,v_other_cert,'approve',null,v_staff);
  if v_result->>'error_code'<>'MEMBERSHIP_NOT_REVIEWABLE' then raise exception 'non-reversible suspension review permitted: %',v_result; end if;
  v_result:=public.review_moviback_certificate(v_member,v_cert,'approve',null,v_staff);
  if v_result->>'certificate_status'<>'approved' or v_result->>'membership_status'<>'suspended' then
    raise exception 'suspended certificate approval failed: %',v_result;
  end if;
  if not exists(select 1 from public.loyalty_memberships where id=v_member and status='suspended' and suspension_reason='Uscita volontaria utente') then
    raise exception 'certificate review reactivated membership';
  end if;
  if not exists(select 1 from public.moviback_customer_audit_events where membership_id=v_member and certificate_id=v_cert and event_type='certificate_approved' and actor_staff_id=v_staff and before_state->>'membership_status'='suspended' and after_state->>'membership_status'='suspended') then
    raise exception 'certificate audit missing';
  end if;
  if (select coalesce(sum(points_delta),0) from public.loyalty_transactions where membership_id=v_member)<>v_balance then
    raise exception 'certificate review changed points';
  end if;
  v_result:=public.reactivate_moviback_membership_admin(v_other_member,v_staff,'Rientro richiesto dal cliente');
  if v_result->>'error_code'<>'MEMBERSHIP_NOT_REACTIVATABLE' then raise exception 'non-reversible membership reactivated: %',v_result; end if;
  v_result:=public.reactivate_moviback_membership_admin(v_member,v_staff,'Rientro richiesto dal cliente');
  if v_result->>'membership_status'<>'approved' then raise exception 'explicit reactivation failed: %',v_result; end if;
  if not exists(select 1 from public.loyalty_memberships where id=v_member and status='approved' and suspension_reason is null and suspended_at is null) then
    raise exception 'membership state after reactivation invalid';
  end if;
  if not exists(select 1 from public.moviback_customer_audit_events where membership_id=v_member and event_type='membership_reactivated' and actor_staff_id=v_staff and before_state->>'suspension_reason'='Uscita volontaria utente' and after_state->>'membership_status'='approved') then
    raise exception 'reactivation audit missing';
  end if;
  if (select coalesce(sum(points_delta),0) from public.loyalty_transactions where membership_id=v_member)<>v_balance then
    raise exception 'reactivation changed points';
  end if;
  if has_function_privilege('anon','public.reactivate_moviback_membership_admin(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.reactivate_moviback_membership_admin(uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.reactivate_moviback_membership_admin(uuid,uuid,text)','EXECUTE') then
    raise exception 'reactivation RPC grants invalid';
  end if;
  begin
    update public.moviback_customer_audit_events set reason='tampered' where membership_id=v_member;
    raise exception 'audit update permitted';
  exception when raise_exception then
    if sqlerrm='audit update permitted' then raise; end if;
  end;
end $$;

rollback;
