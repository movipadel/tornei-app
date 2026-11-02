begin;

do $$
declare
  v_staff uuid:=gen_random_uuid();
  v_user uuid:=gen_random_uuid();
  v_other uuid:=gen_random_uuid();
  v_pending_user uuid:=gen_random_uuid();
  v_membership uuid:=gen_random_uuid();
  v_other_membership uuid:=gen_random_uuid();
  v_pending_membership uuid:=gen_random_uuid();
  v_expired uuid;
  v_pending uuid;
  v_result jsonb;
  v_media uuid;
  v_today date:=(now() at time zone 'Europe/Rome')::date;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Certificate Admin','cert-admin@example.invalid','admin',true);
  insert into public.users(id,full_name,phone,email,gender,age_confirmed_at)
    values(v_user,'Synthetic Certificate User','3400999001','cert-user@example.invalid','M',now()),
          (v_other,'Synthetic Other User','3400999002','cert-other@example.invalid','F',now()),
          (v_pending_user,'Synthetic Pending User','3400999003','cert-pending@example.invalid','M',now());
  insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
    values(v_membership,v_user,'approved','TEST-CERT-1','RSSMRA90A01H501U',now(),v_staff,'ASC'),
          (v_other_membership,v_other,'approved','TEST-CERT-2','VRDLGI90A01H501W',now(),v_staff,'ASC'),
          (v_pending_membership,v_pending_user,'pending_review','TEST-CERT-3','RSSMRA90A01H501U',null,null,'ASC');
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_user,'synthetic/expired.pdf','pending_review',v_today-1) returning id into v_expired;
  v_result:=public.review_moviback_certificate(v_membership,v_expired,'approve',null,v_staff);
  if v_result->>'error_code'<>'CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED' then raise exception 'expired approval allowed: %',v_result; end if;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_user,'synthetic/replacement.pdf','pending_review',v_today+30) returning id into v_pending;
  if (select status from public.medical_certificates where id=v_expired)<>'superseded' then raise exception 'old pending not superseded'; end if;
  if (select count(*) from public.medical_certificates where user_id=v_user and status='pending_review')<>1 then raise exception 'pending cardinality'; end if;
  v_result:=public.review_moviback_certificate(v_other_membership,v_pending,'approve',null,v_staff);
  if v_result->>'error_code'<>'CERTIFICATE_MEMBERSHIP_MISMATCH' then raise exception 'wrong membership accepted'; end if;
  v_result:=public.review_moviback_certificate(v_membership,v_pending,'approve',null,v_staff);
  if coalesce((v_result->>'ok')::boolean,false) is not true then raise exception 'valid approval failed: %',v_result; end if;
  if (select count(*) from public.medical_certificates where user_id=v_user and status='pending_review')<>0 then raise exception 'approved certificate remains pending'; end if;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_user,'synthetic/reject.pdf','pending_review',v_today+20) returning id into v_pending;
  v_result:=public.review_moviback_certificate(v_membership,v_pending,'reject','Documento illeggibile',v_staff);
  if v_result->>'certificate_status'<>'rejected' or
     (select count(*) from public.medical_certificates where user_id=v_user and status='pending_review')<>0 then
    raise exception 'rejected certificate still actionable: %',v_result;
  end if;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_pending_user,'synthetic/pending-expired.pdf','pending_review',v_today-1) returning id into v_pending;
  v_result:=public.review_moviback_membership_c6(v_pending_membership,v_pending,'approve',null,null,v_staff);
  if v_result->>'error_code'<>'CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED' or
     (select status from public.loyalty_memberships where id=v_pending_membership)<>'pending_review' then
    raise exception 'expired pending membership approval allowed: %',v_result;
  end if;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_pending_user,'synthetic/pending-member.pdf','pending_review',v_today+30) returning id into v_pending;
  v_result:=public.review_moviback_certificate(v_pending_membership,v_pending,'approve',null,v_staff);
  if v_result->>'certificate_status'<>'approved' or
     (select status from public.loyalty_memberships where id=v_pending_membership)<>'pending_review' then
    raise exception 'certificate review changed pending membership: %',v_result;
  end if;
  v_result:=public.review_moviback_membership_c6(v_pending_membership,v_pending,'approve',null,null,v_staff);
  if v_result->>'membership_status'<>'approved' then raise exception 'explicit membership approval failed: %',v_result; end if;

  if (select status from public.current_user_media_consent(v_user)) is not null then raise exception 'new user has consent'; end if;
  v_media:=public.record_user_media_consent(v_user,'granted','profile',v_user,null,'v1');
  if (select status from public.current_user_media_consent(v_user))<>'granted' then raise exception 'grant missing'; end if;
  perform public.record_user_media_consent(v_user,'revoked','profile',v_user,null,'v1');
  if (select status from public.current_user_media_consent(v_user))<>'revoked' then raise exception 'revoke not current'; end if;
  begin
    update public.user_media_consent_events set status='granted' where id=v_media;
    raise exception 'append-only update allowed';
  exception when check_violation then null; end;
  if (select count(*) from public.user_media_consent_events where user_id=v_user)<>2 then raise exception 'history lost'; end if;
end $$;

do $$
declare
  v_staff uuid:=gen_random_uuid();
  v_users uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_today date:=(now() at time zone 'Europe/Rome')::date;
  v_count integer;
  v_before integer;
  v_after integer;
  v_events text[]:=array['moviback.certificate.expiring_30d','moviback.certificate.expiring_7d',
    'moviback.certificate.grace_started','moviback.certificate.standby_started'];
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Notification Admin','notification-admin@example.invalid','admin',true);
  for i in 1..5 loop
    insert into public.users(id,full_name,phone,email,gender)
      values(v_users[i],'Synthetic Notification User','34009991'||lpad(i::text,2,'0'),
        'notification-user-'||i||'@example.invalid','M');
    insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
      values(gen_random_uuid(),v_users[i],'approved','TEST-NOTIFY-'||i,'RSSMRA90A01H501U',now(),v_staff,'ASC');
    insert into public.medical_certificates(user_id,file_path,status,expiry_date,uploaded_at)
      values(v_users[i],'synthetic/notify-'||i||'.pdf','approved',
        v_today+case i when 1 then 30 when 2 then 7 when 3 then -1 when 4 then -61 else 0 end,now());
  end loop;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date,uploaded_at)
    values(v_users[1],'synthetic/historical.pdf','approved',v_today+7,now()-interval '1 day'),
          (v_users[1],'synthetic/superseded.pdf','superseded',v_today+30,now()+interval '1 day');
  update public.user_notification_preferences set transactional_email_enabled=false where user_id=v_users[2];
  select count(*) into v_before from public.notification_events where recipient_user_id=any(v_users);
  perform public.enqueue_moviback_certificate_expiry_events(now());
  select count(*) into v_after from public.notification_events where recipient_user_id=any(v_users);
  if v_after-v_before<>4 then raise exception 'expected four milestone events, got %',v_after-v_before; end if;
  perform public.enqueue_moviback_certificate_expiry_events(now());
  select count(*) into v_count from public.notification_events where recipient_user_id=any(v_users);
  if v_count<>v_after then raise exception 'scanner not idempotent'; end if;
  for i in 1..4 loop
    if not exists(select 1 from public.notification_events
      where recipient_user_id=v_users[i] and event_type=v_events[i]) then raise exception 'missing milestone %',i; end if;
  end loop;
  if exists(select 1 from public.notification_events where recipient_user_id=v_users[5]) then
    raise exception 'expiry date incorrectly emitted a grace/standby event';
  end if;
  if not exists(select 1 from public.notification_deliveries d join public.notification_events e on e.id=d.event_id
    where e.recipient_user_id=v_users[2] and d.status='skipped') then raise exception 'email preference ignored'; end if;
  insert into public.medical_certificates(user_id,file_path,status,expiry_date,uploaded_at)
    values(v_users[1],'synthetic/current-replacement.pdf','approved',v_today+30,now()+interval '1 minute');
  perform public.enqueue_moviback_certificate_expiry_events(now());
  if (select count(*) from public.notification_events where recipient_user_id=v_users[1]
      and event_type='moviback.certificate.expiring_30d')<>2 then
    raise exception 'replacement certificate did not receive its own event key';
  end if;
  if (timestamptz '2026-10-31 23:30:00+00' at time zone 'Europe/Rome')::date<>date '2026-11-01' then
    raise exception 'Rome midnight milestone boundary incorrect';
  end if;
end $$;

do $$
declare
  v_staff uuid:=gen_random_uuid();
  v_canonical uuid:=gen_random_uuid();
  v_source uuid:=gen_random_uuid();
  v_minor uuid:=gen_random_uuid();
  v_signup uuid:=gen_random_uuid();
  v_auth uuid:=gen_random_uuid();
  v_consumed boolean;
  v_state text;
begin
  insert into public.staff_users(id,full_name,email,role,is_active)
    values(v_staff,'Synthetic Consent Admin','consent-admin@example.invalid','admin',true);
  insert into public.users(id,full_name,phone,email,gender,age_confirmed_at)
    values(v_canonical,'Synthetic Canonical','3400999201','consent-canonical@example.invalid','M',now()),
          (v_source,'Synthetic Source','3400999202','consent-source@example.invalid','F',now()),
          (v_minor,'Synthetic Unconfirmed Age','3400999203','consent-unconfirmed@example.invalid','M',null),
          (v_signup,'Synthetic Signup','3400999204','consent-signup@example.invalid','F',now());
  if (select status from public.current_user_media_consent(v_canonical)) is not null then
    raise exception 'absence of consent was not preserved';
  end if;
  if has_table_privilege('authenticated','public.user_media_consent_events','INSERT') or
     has_function_privilege('authenticated',
       'public.record_user_media_consent(uuid,text,text,uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'direct authenticated media consent write is permitted';
  end if;
  perform public.record_user_media_consent(v_source,'granted','profile',v_source,null,'v1');
  perform public.record_user_media_consent(v_canonical,'revoked','profile',v_canonical,null,'v1');
  update public.users set identity_status='merged',merged_into_user_id=v_canonical,merged_at=now(),updated_at=now() where id=v_source;
  if (select status from public.current_user_media_consent(v_canonical))<>'revoked' then raise exception 'older grant overrode revoke'; end if;
  if (select count(*) from public.user_media_consent_events where user_id in (v_source,v_canonical))<>2 then raise exception 'merge lost consent history'; end if;
  begin
    perform public.record_user_media_consent(v_minor,'granted','profile',v_minor,null,'v1');
    raise exception 'grant without age confirmation allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_user_media_consent(v_canonical,'granted','paper_import',null,v_staff,'v1');
    raise exception 'admin grant without evidence allowed';
  exception when invalid_parameter_value then null; end;
  perform public.record_user_media_consent(v_canonical,'granted','paper_import',null,v_staff,'v1','signed-paper-form');
  if (select status from public.current_user_media_consent(v_canonical))<>'granted' then raise exception 'admin grant missing'; end if;
  if (select marketing_accepted from public.users where id=v_canonical) is distinct from false or
     (select privacy_accepted_at from public.users where id=v_canonical) is not null then
    raise exception 'media consent changed independent marketing/privacy fields';
  end if;
  insert into auth.users(id,email,aud,role) values(v_auth,'consent-auth@example.invalid','authenticated','authenticated');
  update public.users set auth_user_id=v_auth,auth_migration_state='linked' where id=v_signup;
  insert into public.user_media_signup_intents(auth_user_id,grant_requested) values(v_auth,true);
  v_consumed:=public.consume_user_media_signup_intent(v_auth);
  select status into v_state from public.current_user_media_consent(v_signup);
  if not v_consumed or v_state<>'granted' or
     exists(select 1 from public.user_media_signup_intents where auth_user_id=v_auth) then
    raise exception 'signup media intent was not consumed after canonical linking: consumed %, state %',v_consumed,v_state;
  end if;
  if public.consume_user_media_signup_intent(v_auth) then raise exception 'signup intent was consumed twice'; end if;
end $$;

rollback;
