\set ON_ERROR_STOP on
begin;
grant execute on function public.review_moviback_membership_c5(uuid,text,text,text,uuid) to service_role;
drop function public.review_moviback_membership_c6(uuid,uuid,text,text,text,uuid);

do $$
declare
  v_staff uuid := gen_random_uuid();
  v_approve_user uuid := gen_random_uuid();
  v_reject_user uuid := gen_random_uuid();
  v_approve_membership uuid := gen_random_uuid();
  v_reject_membership uuid := gen_random_uuid();
  v_result jsonb;
begin
  if to_regprocedure('public.review_moviback_membership_c6(uuid,uuid,text,text,text,uuid)') is not null or
     not has_function_privilege('service_role', 'public.review_moviback_membership_c5(uuid,text,text,text,uuid)', 'EXECUTE') then
    raise exception 'pre-migration RPC state is incorrect';
  end if;
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Pre Transition Admin','pre-transition-admin@example.invalid','admin',true);
  insert into public.users(id,full_name,phone,email,gender)
    values(v_approve_user,'Synthetic Pre Transition Approve','3400999201','pre-transition-approve@example.invalid','M'),
          (v_reject_user,'Synthetic Pre Transition Reject','3400999202','pre-transition-reject@example.invalid','F');
  insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,membership_type)
    values(v_approve_membership,v_approve_user,'pending_review','TEST-PRE-TRANSITION-A','RSSMRA90A01H501U','ASC'),
          (v_reject_membership,v_reject_user,'pending_review','TEST-PRE-TRANSITION-R','RSSMRA90A01H501U','ASC');
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_approve_user,'synthetic/pre-transition-approve.pdf','pending_review',current_date+30),
          (v_reject_user,'synthetic/pre-transition-reject.pdf','pending_review',current_date+30);

  v_result := public.review_moviback_membership_c5(v_approve_membership,'approve',null,null,v_staff);
  if v_result->>'membership_status'<>'approved' or
     (select status from public.medical_certificates where user_id=v_approve_user)<>'approved' then
    raise exception 'C5 membership approve failed: %',v_result;
  end if;
  v_result := public.review_moviback_membership_c5(v_reject_membership,'reject','Synthetic rejection',null,v_staff);
  if v_result->>'membership_status'<>'rejected' or
     (select status from public.medical_certificates where user_id=v_reject_user)<>'rejected' then
    raise exception 'C5 membership reject failed: %',v_result;
  end if;
end $$;

rollback;
