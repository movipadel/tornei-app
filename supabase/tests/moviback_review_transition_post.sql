\set ON_ERROR_STOP on
begin;

do $$
declare
  v_staff uuid := gen_random_uuid();
  v_approve_user uuid := gen_random_uuid();
  v_reject_user uuid := gen_random_uuid();
  v_approve_membership uuid := gen_random_uuid();
  v_reject_membership uuid := gen_random_uuid();
  v_approve_certificate uuid;
  v_reject_certificate uuid;
  v_result jsonb;
begin
  if not has_function_privilege('service_role', 'public.review_moviback_membership_c6(uuid,uuid,text,text,text,uuid)', 'EXECUTE') or
     has_function_privilege('service_role', 'public.review_moviback_membership_c5(uuid,text,text,text,uuid)', 'EXECUTE') then
    raise exception 'post-migration RPC privilege state is incorrect';
  end if;
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Transition Admin','transition-admin@example.invalid','admin',true);
  insert into public.users(id,full_name,phone,email,gender)
    values(v_approve_user,'Synthetic Transition Approve','3400999101','transition-approve@example.invalid','M'),
          (v_reject_user,'Synthetic Transition Reject','3400999102','transition-reject@example.invalid','F');
  insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type)
    values(v_approve_membership,v_approve_user,'pending_review','TEST-TRANSITION-A','RSSMRA90A01H501U','ASC'),
          (v_reject_membership,v_reject_user,'pending_review','TEST-TRANSITION-R','RSSMRA90A01H501U','ASC');
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_approve_user,'synthetic/transition-approve.pdf','pending_review',current_date+30)
    returning id into v_approve_certificate;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_reject_user,'synthetic/transition-reject.pdf','pending_review',current_date+30)
    returning id into v_reject_certificate;

  v_result := public.review_moviback_membership_c6(v_approve_membership,v_approve_certificate,'approve',null,null,v_staff);
  if v_result->>'membership_status'<>'approved' or
     (select status from public.medical_certificates where id=v_approve_certificate)<>'approved' then
    raise exception 'C6 membership approve failed: %',v_result;
  end if;
  v_result := public.review_moviback_membership_c6(v_reject_membership,v_reject_certificate,'reject','Synthetic rejection',null,v_staff);
  if v_result->>'membership_status'<>'rejected' or
     (select status from public.medical_certificates where id=v_reject_certificate)<>'rejected' then
    raise exception 'C6 membership reject failed: %',v_result;
  end if;
end $$;

rollback;
