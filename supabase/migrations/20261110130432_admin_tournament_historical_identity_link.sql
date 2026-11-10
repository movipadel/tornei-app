begin;

-- Admin-only, single-statement transaction for a historical registration slot.
-- No circuit, run, result, ranking, snapshot, or legacy user_id field is touched.
create function public.admin_tournament_link_registration_identity(
  p_actor uuid, p_tournament uuid, p_registration uuid, p_data jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  t public.tournaments%rowtype;
  r public.tournament_registrations%rowtype;
  p public.player_identities%rowtype;
  u public.users%rowtype;
  resolved jsonb;
  slot text;
  kind text;
  old_identity uuid;
  other_identity uuid;
  snapshot_name text;
  snapshot_phone text;
  snapshot_gender text;
  new_name text;
  new_phone text;
begin
  if not exists (
    select 1 from public.staff_users s where s.id=p_actor and s.is_active
      and (s.role='admin' or exists (
        select 1 from public.staff_permissions sp
        where sp.staff_user_id=s.id and sp.permission_key='tournaments.manage'
      ))
  ) then raise exception 'TOURNAMENT_PERMISSION_REQUIRED'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or p_data->>'confirmed'<>'true'
  then raise exception 'LINK_CONFIRMATION_REQUIRED'; end if;
  slot:=p_data->>'slot';
  kind:=p_data->>'kind';
  if slot not in ('p1','p2') or slot is null then raise exception 'REGISTRATION_SLOT_INVALID'; end if;
  if kind not in ('identity','account','new') or kind is null then raise exception 'PLAYER_SELECTION_REQUIRED'; end if;

  -- Lock in the same order as admin_tournament_register_players, preventing a
  -- concurrent registration or link from bypassing duplicate checks.
  perform public.player_identity_lock();
  select * into t from public.tournaments where id=p_tournament for update;
  if t.id is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  select * into r from public.tournament_registrations
    where id=p_registration and tournament_id=t.id for update;
  if r.id is null then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if slot='p2' and (t.type<>'Coppie fisse' or nullif(btrim(coalesce(r.p2_name,'')),'') is null)
  then raise exception 'REGISTRATION_SLOT_INVALID'; end if;

  if slot='p1' then
    old_identity:=r.p1_player_identity_id; other_identity:=r.p2_player_identity_id;
    snapshot_name:=r.p1_name; snapshot_phone:=r.p1_phone; snapshot_gender:=r.p1_gender;
  else
    old_identity:=r.p2_player_identity_id; other_identity:=r.p1_player_identity_id;
    snapshot_name:=r.p2_name; snapshot_phone:=r.p2_phone; snapshot_gender:=r.p2_gender;
  end if;
  if snapshot_name is distinct from p_data->>'expected_name'
     or snapshot_phone is distinct from p_data->>'expected_phone'
     or r.is_reserve is distinct from (p_data->>'expected_is_reserve')::boolean
     or old_identity is distinct from (p_data->>'expected_current_identity_id')::uuid
  then raise exception 'REGISTRATION_CHANGED'; end if;
  if old_identity is not null then
    if exists (
      select 1 from public.player_identities current_player
      where current_player.id=old_identity and current_player.status='active'
        and current_player.merged_into_player_id is null
        and (current_player.account_user_id is null or exists (
          select 1 from public.users current_account
          where current_account.id=current_player.account_user_id
            and current_account.identity_status='active' and current_account.merged_into_user_id is null
        ))
    ) then raise exception 'REGISTRATION_ALREADY_LINKED'; end if;
  end if;

  if kind='identity' then
    select * into p from public.player_identities
      where id=(p_data->>'player_identity_id')::uuid for update;
    if p.id is null or p.status<>'active' or public.player_identity_canonical(p.id)<>p.id
    then raise exception 'ACTIVE_CANONICAL_PLAYER_REQUIRED'; end if;
    if p.full_name is distinct from p_data->>'expected_candidate_name'
       or p.normalized_phone is distinct from p_data->>'expected_candidate_phone'
    then raise exception 'CANDIDATE_CHANGED'; end if;
  elsif kind='account' then
    select * into u from public.users
      where id=(p_data->>'account_user_id')::uuid for update;
    if u.id is null or u.identity_status<>'active' or u.merged_into_user_id is not null
    then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
    if u.full_name is distinct from p_data->>'expected_candidate_name'
       or u.phone is distinct from p_data->>'expected_candidate_phone'
       or exists (select 1 from public.player_identities linked
                  where linked.account_user_id=u.id and linked.status<>'merged')
    then raise exception 'CANDIDATE_CHANGED'; end if;
    resolved:=public.player_profile_resolve_account(u.id);
    if resolved->>'state'<>'linked' then raise exception 'ACCOUNT_IDENTITY_REVIEW_REQUIRED'; end if;
    select * into p from public.player_identities
      where id=(resolved->>'player_id')::uuid for update;
    if p.id is null or p.status<>'active' or public.player_identity_canonical(p.id)<>p.id
       or p.account_user_id is distinct from u.id
    then raise exception 'ACTIVE_CANONICAL_PLAYER_REQUIRED'; end if;
  else
    new_name:=btrim(coalesce(p_data->>'full_name',''));
    new_phone:=public.normalize_user_mobile_e164(p_data->>'phone');
    if length(new_name) not between 2 and 200 or new_phone is null
    then raise exception 'NAME_PHONE_REQUIRED'; end if;
    if nullif(p_data->>'gender','') is not null and p_data->>'gender' not in ('M','F')
    then raise exception 'GENDER_INVALID'; end if;
    if exists (select 1 from public.player_identities
               where status='active' and normalized_phone=new_phone)
       or exists (select 1 from public.users
                  where identity_status='active' and public.normalize_user_mobile_e164(phone)=new_phone)
       or exists (select 1 from public.player_identity_cases
                  where status in ('open','in_review')
                    and (evidence->>'phone'=new_phone or evidence->>'normalized_phone'=new_phone))
    then raise exception 'EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED'; end if;
    if exists (select 1 from public.player_identities
               where status='active' and public.player_identity_name(full_name)=public.player_identity_name(new_name))
       or exists (select 1 from public.users
                  where identity_status='active' and public.player_identity_name(full_name)=public.player_identity_name(new_name))
       or exists (select 1 from public.player_identity_identifiers
                  where public.player_identity_name(source_name)=public.player_identity_name(new_name))
    then
      if p_data->>'confirmed_conflict'<>'true'
      then raise exception 'POSSIBLE_PLAYER_CONFLICT_CONFIRMATION_REQUIRED'; end if;
    end if;
    insert into public.player_identities(full_name,normalized_phone,gender)
      values(new_name,new_phone,coalesce(nullif(p_data->>'gender',''),snapshot_gender))
      returning * into p;
    insert into public.player_identity_events(player_identity_id,actor_admin_id,action,details)
      values(p.id,p_actor,'admin_created',jsonb_build_object(
        'source','historical_tournament_registration','tournament_id',t.id,
        'registration_id',r.id,'slot',slot));
  end if;

  if p.id=other_identity then raise exception 'SAME_PLAYER_TWICE'; end if;
  if snapshot_gender is not null and p.gender is not null and snapshot_gender<>p.gender
  then raise exception 'GENDER_CONFLICT'; end if;
  if p.account_user_id is not null and not exists (
    select 1 from public.users where id=p.account_user_id
      and identity_status='active' and merged_into_user_id is null
  ) then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
  if exists (
    select 1 from public.tournament_registrations other_reg
    where other_reg.tournament_id=t.id and other_reg.id<>r.id
      and (other_reg.p1_player_identity_id=p.id or other_reg.p2_player_identity_id=p.id
        or public.normalize_user_mobile_e164(other_reg.p1_phone)=p.normalized_phone
        or public.normalize_user_mobile_e164(other_reg.p2_phone)=p.normalized_phone)
  ) then raise exception 'PLAYER_ALREADY_REGISTERED'; end if;

  if slot='p1' then
    update public.tournament_registrations set p1_player_identity_id=p.id where id=r.id;
  else
    update public.tournament_registrations set p2_player_identity_id=p.id where id=r.id;
  end if;
  insert into public.player_identity_events(player_identity_id,actor_admin_id,action,details)
    values(p.id,p_actor,'historical_registration_linked',jsonb_build_object(
      'tournament_id',t.id,'registration_id',r.id,'slot',slot,
      'previous_player_identity_id',old_identity));
  return jsonb_build_object('registration_id',r.id,'slot',slot,'player_identity_id',p.id);
end $$;

revoke all on function public.admin_tournament_link_registration_identity(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.admin_tournament_link_registration_identity(uuid,uuid,uuid,jsonb)
  to service_role;

commit;
