begin;

alter table public.tournament_registrations
  add column if not exists p1_player_identity_id uuid references public.player_identities(id) on update restrict on delete restrict,
  add column if not exists p2_player_identity_id uuid references public.player_identities(id) on update restrict on delete restrict;

create index if not exists tournament_registrations_p1_identity_idx on public.tournament_registrations(tournament_id,p1_player_identity_id) where p1_player_identity_id is not null;
create index if not exists tournament_registrations_p2_identity_idx on public.tournament_registrations(tournament_id,p2_player_identity_id) where p2_player_identity_id is not null;

-- A single RPC is the transaction boundary for identity resolution/creation and
-- registration. The new references are deliberately not read by circuit scoring.
create or replace function public.admin_tournament_register_players(p_actor uuid,p_tournament uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  t public.tournaments%rowtype;
  slot jsonb;
  p public.player_identities%rowtype;
  u public.users%rowtype;
  resolved jsonb;
  ids uuid[] := '{}'::uuid[];
  names text[] := '{}'::text[];
  phones text[] := '{}'::text[];
  genders text[] := '{}'::text[];
  accounts uuid[] := '{}'::uuid[];
  v_phone text;
  v_full_name text;
  slot_kind text;
  i integer;
  main_count integer;
  next_position integer;
  reserve_flag boolean;
  new_id uuid;
begin
  if not exists (
    select 1 from public.staff_users s where s.id=p_actor and s.is_active
      and (s.role='admin' or exists(select 1 from public.staff_permissions sp where sp.staff_user_id=s.id and sp.permission_key='tournaments.manage'))
  ) then raise exception 'TOURNAMENT_PERMISSION_REQUIRED'; end if;
  if jsonb_typeof(p_data)<>'object' or p_data is null then raise exception 'INVALID_PAYLOAD'; end if;
  perform public.player_identity_lock();
  select * into t from public.tournaments where id=p_tournament for update;
  if t.id is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not t.registrations_open then raise exception 'REGISTRATIONS_CLOSED'; end if;
  if t.circuit_id is not null and not exists (
    select 1 from public.circuit_ranking_groups g where g.circuit_id=t.circuit_id and g.category=t.category and g.level=lower(t.level)
  ) then raise exception 'CIRCUIT_RANKING_GROUP_REQUIRED'; end if;

  for i in 1..(case when t.type='Coppie fisse' then 2 else 1 end) loop
    slot:=p_data->('p'||i);
    if jsonb_typeof(slot)<>'object' then raise exception 'PLAYER_SELECTION_REQUIRED'; end if;
    slot_kind:=slot->>'kind';
    if slot_kind='identity' then
      select * into p from public.player_identities where id=(slot->>'player_identity_id')::uuid and status='active' for update;
      if p.id is null or public.player_identity_canonical(p.id)<>p.id then raise exception 'ACTIVE_CANONICAL_PLAYER_REQUIRED'; end if;
    elsif slot_kind='account' then
      if slot->>'confirmed'<>'true' then raise exception 'ACCOUNT_RESOLUTION_CONFIRMATION_REQUIRED'; end if;
      select * into u from public.users where id=(slot->>'account_user_id')::uuid and identity_status='active' for update;
      if u.id is null then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
      resolved:=public.player_profile_resolve_account(u.id);
      if resolved->>'state'<>'linked' then raise exception 'ACCOUNT_IDENTITY_REVIEW_REQUIRED'; end if;
      select * into p from public.player_identities where id=(resolved->>'player_id')::uuid and status='active' for update;
      if p.id is null then raise exception 'ACTIVE_CANONICAL_PLAYER_REQUIRED'; end if;
    elsif slot_kind='new' then
      if slot->>'confirmed'<>'true' then raise exception 'NEW_PLAYER_CONFIRMATION_REQUIRED'; end if;
      v_full_name:=btrim(coalesce(slot->>'full_name',''));
      v_phone:=public.normalize_user_mobile_e164(slot->>'phone');
      if length(v_full_name) not between 2 and 200 or v_phone is null then raise exception 'NAME_PHONE_REQUIRED'; end if;
      if nullif(slot->>'gender','') is not null and slot->>'gender' not in ('M','F') then raise exception 'GENDER_INVALID'; end if;
      if exists(select 1 from public.player_identities where status='active' and normalized_phone=v_phone)
         or exists(select 1 from public.users where identity_status='active' and public.normalize_user_mobile_e164(users.phone)=v_phone)
         or exists(select 1 from public.player_identity_cases where status in ('open','in_review') and (evidence->>'phone'=v_phone or evidence->>'normalized_phone'=v_phone))
      then raise exception 'EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED'; end if;
      if exists(select 1 from public.player_identities where status='active' and public.player_identity_name(player_identities.full_name)=public.player_identity_name(v_full_name))
         or exists(select 1 from public.users where identity_status='active' and public.player_identity_name(users.full_name)=public.player_identity_name(v_full_name))
         or exists(select 1 from public.player_identity_identifiers where public.player_identity_name(source_name)=public.player_identity_name(v_full_name))
      then
        if slot->>'confirmed_conflict'<>'true' then raise exception 'POSSIBLE_PLAYER_CONFLICT_CONFIRMATION_REQUIRED'; end if;
      end if;
      insert into public.player_identities(full_name,normalized_phone,gender)
      values(v_full_name,v_phone,nullif(slot->>'gender','')) returning * into p;
      insert into public.player_identity_events(player_identity_id,actor_admin_id,action,details)
      values(p.id,p_actor,'admin_created',jsonb_build_object('source','tournament_registration','tournament_id',t.id));
    else raise exception 'PLAYER_SELECTION_REQUIRED'; end if;
    if p.id=any(ids) then raise exception 'SAME_PLAYER_TWICE'; end if;
    if nullif(slot->>'gender','') is not null and slot->>'gender' not in ('M','F') then raise exception 'GENDER_INVALID'; end if;
    if p.gender is not null and nullif(slot->>'gender','') is not null and p.gender<>slot->>'gender' then raise exception 'GENDER_CONFLICT'; end if;
    if p.account_user_id is not null and not exists(select 1 from public.users where id=p.account_user_id and identity_status='active') then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
    if exists (
      select 1 from public.tournament_registrations r where r.tournament_id=t.id
        and (r.p1_player_identity_id=p.id or r.p2_player_identity_id=p.id
          or public.normalize_user_mobile_e164(r.p1_phone)=p.normalized_phone
          or public.normalize_user_mobile_e164(r.p2_phone)=p.normalized_phone)
    ) then raise exception 'PLAYER_ALREADY_REGISTERED'; end if;
    ids:=array_append(ids,p.id);
    names:=array_append(names,p.full_name);
    phones:=array_append(phones,p.normalized_phone);
    genders:=array_append(genders,coalesce(p.gender,nullif(slot->>'gender','')));
    accounts:=array_append(accounts,p.account_user_id);
  end loop;
  if t.type='Coppie fisse' and phones[1]=phones[2] then raise exception 'SAME_PHONE_TWICE'; end if;
  if t.type='Baraonda' and t.category='Misto' and genders[1] is null then raise exception 'MIXED_GENDER_REQUIRED'; end if;
  if t.category='Maschile' and (genders[1]='F' or (t.type='Coppie fisse' and genders[2]='F')) then raise exception 'CATEGORY_GENDER_MISMATCH'; end if;
  if t.category='Femminile' and (genders[1]='M' or (t.type='Coppie fisse' and genders[2]='M')) then raise exception 'CATEGORY_GENDER_MISMATCH'; end if;

  if t.type='Baraonda' and t.category='Misto' then
    select count(*) into main_count from public.tournament_registrations r where r.tournament_id=t.id and not r.is_reserve and r.p1_gender=genders[1];
    reserve_flag:=main_count>=floor(t.max_participants/2);
  else
    select count(*) into main_count from public.tournament_registrations r where r.tournament_id=t.id and not r.is_reserve;
    reserve_flag:=main_count>=t.max_participants;
  end if;
  select coalesce(max(position),0)+1 into next_position from public.tournament_registrations where tournament_id=t.id and is_reserve=reserve_flag;
  insert into public.tournament_registrations(tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender,notes,user_id,p1_player_identity_id,p2_player_identity_id)
  values(t.id,next_position,reserve_flag,names[1],phones[1],genders[1],
    case when t.type='Coppie fisse' then names[2] end,
    case when t.type='Coppie fisse' then phones[2] end,
    case when t.type='Coppie fisse' then genders[2] end,
    nullif(btrim(coalesce(p_data->>'notes','')),''),accounts[1],ids[1],
    case when t.type='Coppie fisse' then ids[2] end) returning id into new_id;
  return jsonb_build_object('id',new_id,'is_reserve',reserve_flag,'position',next_position,'p1_player_identity_id',ids[1],
    'p2_player_identity_id',case when t.type='Coppie fisse' then ids[2] end);
end $$;

revoke all on function public.admin_tournament_register_players(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_tournament_register_players(uuid,uuid,jsonb) to service_role;

commit;
