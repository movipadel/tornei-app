-- Keep account recovery dependent on canonical customer certainty only.
-- Open circuit/league result reviews remain separate sporting decisions.
begin;
create or replace function public.admin_prepare_incomplete_activation_email_repair(
  p_public_user_id uuid, p_actor_staff_id uuid, p_new_email text,
  p_reason text, p_operation_id uuid, p_dry_run boolean default true
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,storage as $$
declare
  v_user public.users%rowtype;
  v_auth_id uuid;
  v_auth auth.users%rowtype;
  v_draft public.user_auth_onboarding%rowtype;
  v_count integer;
  v_player_id uuid;
  v_new_email text := public.normalize_user_email(p_new_email);
  v_operation public.account_activation_email_repair_operations%rowtype;
begin
  if not p_dry_run then
    if p_operation_id is null or p_actor_staff_id is null
       or not exists(select 1 from public.staff_users s where s.id=p_actor_staff_id
                     and s.role='admin' and s.is_active) then
      raise exception 'ACCOUNT_REPAIR_ADMIN_REQUIRED' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('account-email-repair:'||p_public_user_id::text,0));
    perform 1 from public.users where id=p_public_user_id for update;
  end if;
  select * into v_operation from public.account_activation_email_repair_operations
    where public_user_id=p_public_user_id and state='prepared' limit 1;
  if found then
    if p_dry_run or p_operation_id=v_operation.id then
      return jsonb_build_object('state','prepared','operation_id',v_operation.id,
        'auth_user_id',v_operation.old_auth_user_id,'current_email',v_operation.old_email,
        'new_email',v_operation.new_email);
    end if;
    return jsonb_build_object('state','blocked','reason','repair_in_progress');
  end if;
  if p_operation_id is not null then
    select * into v_operation from public.account_activation_email_repair_operations where id=p_operation_id;
    if found then
      return jsonb_build_object('state',case when v_operation.public_user_id=p_public_user_id
        and v_operation.state='completed' then 'completed' else 'blocked' end);
    end if;
  end if;
  select * into v_user from public.users where id=p_public_user_id;
  if not found then return jsonb_build_object('state','blocked','reason','profile_missing'); end if;
  if v_user.identity_status<>'active' or v_user.merged_into_user_id is not null
     or v_user.auth_user_id is not null or v_user.auth_migration_state<>'activation_pending'
     or public.normalize_user_email(v_user.email) is null then
    return jsonb_build_object('state','blocked','reason','profile_not_incomplete');
  end if;
  select count(*),min(o.auth_user_id::text)::uuid into v_count,v_auth_id
  from public.user_auth_onboarding o join auth.users a on a.id=o.auth_user_id
  where o.flow='activation' and o.state='pending_verification'
    and o.linked_public_user_id is null
    and public.normalize_user_email(o.normalized_email)=public.normalize_user_email(v_user.email)
    and public.normalize_user_email(a.email)=public.normalize_user_email(v_user.email)
    and o.normalized_phone=public.normalize_user_mobile_e164(v_user.phone)
    and public.normalize_user_person_name(o.full_name)=public.normalize_user_person_name(v_user.full_name);
  if v_count<>1 then return jsonb_build_object('state','blocked','reason','onboarding_ambiguous'); end if;
  select * into v_auth from auth.users where id=v_auth_id;
  select * into v_draft from public.user_auth_onboarding where auth_user_id=v_auth_id;
  if v_auth.email_confirmed_at is not null or v_auth.confirmed_at is not null
     or v_auth.phone_confirmed_at is not null or nullif(v_auth.email_change,'') is not null
     or v_auth.last_sign_in_at is not null
     or exists(select 1 from auth.sessions where user_id=v_auth_id)
     or exists(select 1 from storage.objects where owner_id=v_auth_id::text)
     or exists(select 1 from public.users where auth_user_id=v_auth_id)
     or (select count(*) from auth.users a
         where public.normalize_user_email(a.email)=public.normalize_user_email(v_user.email))<>1
     or (select count(*) from auth.identities i where i.user_id=v_auth_id)<>1
     or not exists(select 1 from auth.identities i where i.user_id=v_auth_id
         and public.normalize_user_email(i.email)=public.normalize_user_email(v_user.email))
     or exists(select 1 from public.users u where u.id<>v_user.id
         and u.identity_status='active' and u.merged_into_user_id is null
         and (public.normalize_user_email(u.email)=public.normalize_user_email(v_user.email)
           or public.normalize_user_mobile_e164(u.phone)=public.normalize_user_mobile_e164(v_user.phone))) then
    return jsonb_build_object('state','blocked','reason','auth_or_identity_conflict');
  end if;
  select count(*),min(id::text)::uuid into v_count,v_player_id from public.player_identities
    where account_user_id=v_user.id and status='active';
  if v_count>1
     or exists(select 1 from public.player_identity_cases c
       where c.status in ('open','in_review')
         and (
           (v_user.id=any(c.account_ids)
             and (c.source_kind in ('account','account_profile','account_merge','circuit_account')
               or c.decision->>'state'='requires_account_resolution'))
           or (v_player_id=any(c.player_ids)
             and c.case_type='identity_data_conflict' and c.source_kind='admin_identity')
         ))
     or exists(select 1 from public.user_duplicate_review_members m
       join public.user_duplicate_review_groups g on g.id=m.group_id
       where m.user_id=v_user.id and m.included
         and g.state in ('pending_review','conflict','manual_only')) then
    return jsonb_build_object('state','blocked','reason','identity_review_required');
  end if;
  if p_dry_run then
    return jsonb_build_object('state','eligible','auth_user_id',v_auth_id,
      'current_email',v_user.email,'email_confirmed',false);
  end if;
  if v_new_email is null or char_length(v_new_email)>254
     or v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_new_email=public.normalize_user_email(v_user.email)
     or char_length(btrim(coalesce(p_reason,''))) not between 8 and 1000 then
    return jsonb_build_object('state','blocked','reason','invalid_input');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('movi-auth-email:'||v_new_email,0));
  if public.account_activation_repair_email_conflict(v_user.id,v_auth_id,v_new_email) then
    return jsonb_build_object('state','blocked','reason','target_email_conflict');
  end if;
  insert into public.account_activation_email_repair_operations(
    id,public_user_id,old_auth_user_id,actor_staff_id,old_email,new_email,reason,state)
  values(p_operation_id,v_user.id,v_auth_id,p_actor_staff_id,v_user.email,v_new_email,btrim(p_reason),'prepared');
  update public.users set auth_migration_state='review_required',updated_at=now() where id=v_user.id;
  insert into public.account_activation_email_repair_events(
    operation_id,actor_staff_id,public_user_id,old_auth_user_id,event_type,old_email,new_email,
    previous_auth_state,resulting_auth_state,previous_onboarding_state,resulting_onboarding_state,
    previous_migration_state,resulting_migration_state,reason)
  values(p_operation_id,p_actor_staff_id,v_user.id,v_auth_id,
    'ACCOUNT_ACTIVATION_EMAIL_CORRECTION_PREPARED',v_user.email,v_new_email,
    'unconfirmed','unconfirmed','pending_verification','pending_verification',
    'activation_pending','review_required',btrim(p_reason));
  return jsonb_build_object('state','prepared','operation_id',p_operation_id,
    'auth_user_id',v_auth_id,'current_email',v_user.email,'new_email',v_new_email);
end $$;
commit;
