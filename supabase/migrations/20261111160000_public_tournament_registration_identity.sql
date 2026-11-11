begin;

-- Called only by the authenticated application route with the service role.
-- Identity resolution and registration either both commit or both roll back.
create or replace function public.public_tournament_register_self(
  p_user uuid, p_tournament uuid, p_companion_identity uuid,
  p_companion_name text, p_companion_phone text, p_companion_gender text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  t public.tournaments%rowtype;
  u public.users%rowtype;
  p1 public.player_identities%rowtype;
  p2 public.player_identities%rowtype;
  p2_account public.users%rowtype;
  resolved jsonb;
  g1 text;
  g2 text;
  n2 text;
  ph2 text;
  key1 text;
  key2 text;
  main_count integer;
  reserve_flag boolean;
  next_position integer;
  new_id uuid;
begin
  perform public.player_identity_lock();
  select * into t from public.tournaments where id=p_tournament for update;
  if t.id is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not t.registrations_open then raise exception 'REGISTRATIONS_CLOSED'; end if;
  if t.circuit_id is not null and not exists (
    select 1 from public.circuit_ranking_groups g
    where g.circuit_id=t.circuit_id and g.level=lower(t.level)
      and ((t.circuit_ranking_group_id is not null and g.id=t.circuit_ranking_group_id)
        or (t.circuit_ranking_group_id is null and g.category=t.category))
  ) then raise exception 'CIRCUIT_RANKING_GROUP_REQUIRED'; end if;

  select * into u from public.users where id=p_user and identity_status='active' for update;
  if u.id is null then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
  resolved:=public.player_profile_resolve_account(u.id);
  -- Preserve the resolver's review case while creating no registration.
  if resolved->>'state'<>'linked' then return jsonb_build_object('state','review'); end if;
  select * into p1 from public.player_identities
    where id=(resolved->>'player_id')::uuid and status='active' for update;
  if p1.id is null or public.player_identity_canonical(p1.id)<>p1.id
    or p1.account_user_id is distinct from u.id then
    raise exception 'ACTIVE_CANONICAL_PLAYER_REQUIRED';
  end if;
  if p1.gender is not null and u.gender is not null and p1.gender<>u.gender then
    raise exception 'PLAYER1_GENDER_CONFLICT';
  end if;
  g1:=coalesce(p1.gender,u.gender);

  if t.type='Coppie fisse' then
    if p_companion_identity is not null then
      select * into p2 from public.player_identities
        where id=p_companion_identity and status='active' for update;
      if p2.id is null or public.player_identity_canonical(p2.id)<>p2.id
        or p2.id=p1.id then raise exception 'COMPANION_SELECTION_INVALID'; end if;
      if p2.account_user_id is not null then
        select * into p2_account from public.users
          where id=p2.account_user_id and identity_status='active' for update;
        if p2_account.id is null then raise exception 'COMPANION_ACCOUNT_INACTIVE'; end if;
        if p2.gender is not null and p2_account.gender is not null
          and p2.gender<>p2_account.gender then raise exception 'COMPANION_GENDER_CONFLICT'; end if;
      end if;
      n2:=p2.full_name;
      ph2:=p2.normalized_phone;
      g2:=coalesce(p2.gender,p2_account.gender);
    else
      -- A typed name is a snapshot only. Public callers cannot create or link identities.
      n2:=btrim(coalesce(p_companion_name,''));
      ph2:=public.normalize_user_mobile_e164(p_companion_phone);
      if length(n2) not between 2 and 200 or ph2 is null then
        raise exception 'COMPANION_NAME_PHONE_REQUIRED';
      end if;
      if p_companion_gender is not null and p_companion_gender not in ('M','F') then
        raise exception 'COMPANION_GENDER_INVALID';
      end if;
      g2:=p_companion_gender;
    end if;
  elsif p_companion_identity is not null or nullif(btrim(coalesce(p_companion_name,'')),'') is not null
    or nullif(btrim(coalesce(p_companion_phone,'')),'') is not null or p_companion_gender is not null then
    raise exception 'COMPANION_NOT_ALLOWED';
  end if;

  if t.type='Baraonda' and t.category='Misto' and g1 is null then
    raise exception 'MIXED_GENDER_REQUIRED'; end if;
  if t.type='Coppie fisse' and t.category='Misto' and (g1 is null or g2 is null) then
    raise exception 'MIXED_GENDER_REQUIRED'; end if;
  if t.category='Maschile' and (g1='F' or g2='F') then
    raise exception 'CATEGORY_GENDER_MISMATCH'; end if;
  if t.category='Femminile' and (g1='M' or g2='M') then
    raise exception 'CATEGORY_GENDER_MISMATCH'; end if;

  key1:=public.movi_activity_phone_key(p1.normalized_phone);
  key2:=public.movi_activity_phone_key(ph2);
  if t.circuit_id is not null and (key1='' or (t.type='Coppie fisse' and key2='')) then
    raise exception 'CIRCUIT_PHONE_REQUIRED'; end if;
  if t.type='Coppie fisse' and key1=key2 then raise exception 'SAME_PHONE_TWICE'; end if;
  if exists (
    select 1 from public.tournament_registrations r where r.tournament_id=t.id
      and (r.user_id=u.id or r.p1_player_identity_id=p1.id or r.p2_player_identity_id=p1.id
        or (p2.id is not null and (r.p1_player_identity_id=p2.id or r.p2_player_identity_id=p2.id))
        or (t.circuit_id is not null and (
          public.movi_activity_phone_key(r.p1_phone) in (key1,key2)
          or public.movi_activity_phone_key(r.p2_phone) in (key1,key2))))
  ) then raise exception 'PLAYER_ALREADY_REGISTERED'; end if;

  if t.type='Baraonda' and t.category='Misto' then
    select count(*) into main_count from public.tournament_registrations r
      where r.tournament_id=t.id and not r.is_reserve and r.p1_gender=g1;
    reserve_flag:=main_count>=floor(t.max_participants/2);
  else
    select count(*) into main_count from public.tournament_registrations r
      where r.tournament_id=t.id and not r.is_reserve;
    reserve_flag:=main_count>=t.max_participants;
  end if;
  select coalesce(max(position),0)+1 into next_position
    from public.tournament_registrations where tournament_id=t.id and is_reserve=reserve_flag;
  insert into public.tournament_registrations(
    tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender,
    p2_name,p2_phone,p2_gender,user_id,p1_player_identity_id,p2_player_identity_id
  ) values (
    t.id,next_position,reserve_flag,p1.full_name,p1.normalized_phone,g1,
    n2,ph2,g2,u.id,p1.id,p2.id
  ) returning id into new_id;
  return jsonb_build_object('id',new_id,'is_reserve',reserve_flag,'position',next_position,
    'p1_name',p1.full_name,'p1_phone',p1.normalized_phone,'p1_player_identity_id',p1.id,
    'p2_name',n2,'p2_player_identity_id',p2.id);
end $$;

revoke all on function public.public_tournament_register_self(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.public_tournament_register_self(uuid,uuid,uuid,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
