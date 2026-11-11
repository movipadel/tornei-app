begin;

alter table public.tournaments
  add column circuit_ranking_group_id uuid references public.circuit_ranking_groups(id) on delete restrict;

create index tournaments_circuit_ranking_group_idx
  on public.tournaments(circuit_ranking_group_id)
  where circuit_ranking_group_id is not null;

create function public.tournament_ranking_destination_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare g public.circuit_ranking_groups%rowtype;
begin
  if new.circuit_ranking_group_id is not null then
    select * into g from public.circuit_ranking_groups where id = new.circuit_ranking_group_id;
    if not found or new.circuit_id is distinct from g.circuit_id
      or lower(coalesce(new.level, '')) <> g.level then
      raise exception 'RANKING_DESTINATION_INVALID';
    end if;
  end if;
  if tg_op = 'UPDATE' and
    (new.category is distinct from old.category or
     new.circuit_ranking_group_id is distinct from old.circuit_ranking_group_id or
     new.circuit_id is distinct from old.circuit_id or
     new.level is distinct from old.level) and
    (exists(select 1 from public.tournament_runs where tournament_id = old.id)
     or old.closed_at is not null or old.circuit_snapshot_created
     or exists(select 1 from public.circuit_results where source_tournament_id = old.id)) then
    raise exception 'TOURNAMENT_CATEGORY_FROZEN';
  end if;
  return new;
end;
$$;

create trigger tournament_ranking_destination_guard
before insert or update of category, circuit_ranking_group_id, circuit_id, level
on public.tournaments for each row
execute function public.tournament_ranking_destination_guard();

create function public.tournament_run_category_lock() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  perform 1 from public.tournaments where id = new.tournament_id for update;
  return new;
end;
$$;
create trigger tournament_run_category_lock before insert on public.tournament_runs
for each row execute function public.tournament_run_category_lock();

create function public.admin_tournament_prepare_mixed(
  p_actor uuid, p_tournament uuid, p_action text,
  p_registration uuid default null, p_slot text default null,
  p_gender text default null, p_confirm boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare t public.tournaments%rowtype;
declare r public.tournament_registrations%rowtype;
declare g public.circuit_ranking_groups%rowtype;
declare male_count integer;
declare female_count integer;
declare unknown_count integer;
declare player_count integer;
declare reason text;
begin
  if not exists(select 1 from public.staff_users s where s.id = p_actor and s.is_active
    and (s.role = 'admin' or exists(select 1 from public.staff_permissions sp
      where sp.staff_user_id = s.id and sp.permission_key = 'tournaments.manage'))) then
    raise exception 'TOURNAMENT_PERMISSION_REQUIRED';
  end if;
  if p_action = 'eligibility' then
    select * into t from public.tournaments where id = p_tournament;
  else
    select * into t from public.tournaments where id = p_tournament for update;
  end if;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if p_action = 'set_gender' then
    if p_gender is null or p_gender not in ('M','F') or p_slot is null or p_slot not in ('p1','p2') or p_registration is null
      or not p_confirm then raise exception 'GENDER_CONFIRMATION_REQUIRED'; end if;
    if exists(select 1 from public.tournament_runs where tournament_id = t.id)
      or t.closed_at is not null or t.circuit_snapshot_created
      or exists(select 1 from public.circuit_results where source_tournament_id = t.id) then
      raise exception 'TOURNAMENT_CATEGORY_FROZEN'; end if;
    select * into r from public.tournament_registrations
      where id = p_registration and tournament_id = t.id for update;
    if not found or (p_slot = 'p2' and nullif(btrim(r.p2_name),'') is null) then
      raise exception 'REGISTRATION_SLOT_INVALID'; end if;
    if p_slot = 'p1' then
      update public.tournament_registrations set p1_gender = p_gender where id = r.id;
    else
      update public.tournament_registrations set p2_gender = p_gender where id = r.id;
    end if;
  elsif p_action not in ('eligibility','convert_misto','convert_libero') then
    raise exception 'ACTION_INVALID';
  end if;

  select count(*) filter(where p1_gender = 'M'),
         count(*) filter(where p1_gender = 'F'),
         count(*) filter(where p1_gender is null), count(*)
  into male_count, female_count, unknown_count, player_count
  from public.tournament_registrations
  where tournament_id = t.id and not is_reserve;

  if t.type <> 'Baraonda' then reason := 'SOLO_BARAONDA';
  elsif exists(select 1 from public.tournament_runs where tournament_id = t.id) then
    reason := 'RUN_GIA_CREATA';
  elsif t.closed_at is not null or t.circuit_snapshot_created
    or exists(select 1 from public.circuit_results where source_tournament_id = t.id) then
    reason := 'TAPPA_GIA_CONCLUSA';
  elsif t.circuit_id is null then reason := 'CIRCUITO_RICHIESTO';
  elsif t.circuit_ranking_group_id is null then reason := 'CLASSIFICA_ESPPLICITA_RICHIESTA';
  elsif t.registrations_open then reason := 'CHIUDI_ISCRIZIONI';
  elsif player_count < 4 or mod(player_count,2) <> 0 then reason := 'NUMERO_GIOCATORI_NON_PARi';
  elsif unknown_count > 0 then reason := 'GENERE_NON_INDICATO';
  elsif male_count <> female_count then reason := 'GENERI_NON_BILANCIATI';
  end if;
  if t.circuit_ranking_group_id is not null then
    select * into g from public.circuit_ranking_groups where id=t.circuit_ranking_group_id;
    if not found or g.circuit_id <> t.circuit_id or g.level <> lower(t.level) then
      reason := 'CLASSIFICA_NON_VALIDA'; end if;
  end if;
  if p_action = 'convert_misto' then
    if t.category <> 'Libero' then raise exception 'CATEGORY_CONVERSION_INVALID'; end if;
    if reason is not null then raise exception '%', reason; end if;
    if not p_confirm then raise exception 'CATEGORY_CONFIRMATION_REQUIRED'; end if;
    update public.tournaments set category='Misto' where id=t.id;
  elsif p_action = 'convert_libero' then
    if t.category <> 'Misto' or not p_confirm then raise exception 'CATEGORY_CONVERSION_INVALID'; end if;
    if exists(select 1 from public.tournament_runs where tournament_id=t.id)
      or t.closed_at is not null or t.circuit_snapshot_created
      or exists(select 1 from public.circuit_results where source_tournament_id=t.id) then
      raise exception 'TOURNAMENT_CATEGORY_FROZEN'; end if;
    update public.tournaments set category='Libero' where id=t.id;
  end if;
  return jsonb_build_object('eligible', reason is null, 'reason', reason,
    'male_count', male_count, 'female_count', female_count,
    'unknown_count', unknown_count, 'player_count', player_count,
    'ranking_group_id', t.circuit_ranking_group_id,
    'ranking_category', g.category, 'ranking_level', g.level);
end;
$$;

revoke all on function public.admin_tournament_prepare_mixed(uuid,uuid,text,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_tournament_prepare_mixed(uuid,uuid,text,uuid,text,text,boolean) to service_role;

-- Preserve the existing atomic materialization and identity resolution; only destination validation changes.
create or replace function public.player_identity_materialize_circuit(p_tournament uuid,p_run uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t tournaments%rowtype;r jsonb;pid uuid;n integer:=0;src jsonb;srcs jsonb;ref text;runmode text;
begin
 perform player_identity_lock();
 select * into t from tournaments where id=p_tournament for update;
 select mode into runmode from tournament_runs where id=p_run and tournament_id=p_tournament for update;
 if t.circuit_id is null or runmode is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'CIRCUIT_SOURCE_INVALID';end if;
 delete from circuit_results where source_tournament_id=p_tournament;
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'circuit_id')::uuid<>t.circuit_id or (r->>'source_tournament_id')::uuid<>t.id or not exists(select 1 from circuit_ranking_groups where id=(r->>'ranking_group_id')::uuid and circuit_id=t.circuit_id and level=lower(t.level) and ((t.circuit_ranking_group_id is not null and id=t.circuit_ranking_group_id) or (t.circuit_ranking_group_id is null and category=t.category))) then raise exception 'CIRCUIT_GROUP_INVALID';end if;
  if runmode='fixed_pairs' then
   select jsonb_agg(x.obj) into srcs from (
    select jsonb_build_object('ref',t.id||':registration:'||reg.id||':p1','name',reg.p1_name,'phone',reg.p1_phone,'gender',reg.p1_gender,'account',reg.user_id) obj
    from tournament_run_pairs pair join tournament_registrations reg on reg.id=pair.registration_id where pair.run_id=p_run and reg.tournament_id=t.id and movi_activity_phone_key(reg.p1_phone)=r->>'player_key'
    union all
    select jsonb_build_object('ref',t.id||':registration:'||reg.id||':p2','name',reg.p2_name,'phone',reg.p2_phone,'gender',reg.p2_gender,'account',null)
    from tournament_run_pairs pair join tournament_registrations reg on reg.id=pair.registration_id where pair.run_id=p_run and reg.tournament_id=t.id and movi_activity_phone_key(reg.p2_phone)=r->>'player_key'
   ) x;
  else
   select jsonb_agg(jsonb_build_object('ref',t.id||':participant:'||p.id,'name',p.name,'phone',p.phone,'gender',upper(p.sex),'account',p.user_id)) into srcs
   from tournament_run_participants p where p.run_id=p_run and movi_activity_phone_key(p.phone)=r->>'player_key';
  end if;
  pid:=null;
  if jsonb_array_length(srcs)=1 and player_identity_name(srcs->0->>'name')=player_identity_name(r->>'player_name') then
   src:=srcs->0;ref:=src->>'ref';
   pid:=player_identity_resolve_circuit(ref,r->>'player_key',src->>'name',src->>'phone',src->>'gender',(src->>'account')::uuid);
  else
   select player_identity_canonical(player_identity_id) into pid from player_identity_identifiers where source_kind='circuit' and source_ref=t.id||':key:'||(r->>'player_key') and source_name=player_identity_name(r->>'player_name') and normalized_phone is not distinct from normalize_user_mobile_e164(r->>'player_phone');
   if pid is null then perform player_identity_case('circuit_identity_ambiguity','circuit',t.id||':key:'||(r->>'player_key'),jsonb_build_object('reason','source_not_unique','full_name',r->>'player_name','phone',r->>'player_phone','player_key',r->>'player_key'));end if;
  end if;
  insert into circuit_results(circuit_id,ranking_group_id,source_tournament_id,tournament_name,tournament_type,tournament_date,player_key,player_name,player_phone,placement,points,player_identity_id)
  values(t.circuit_id,(r->>'ranking_group_id')::uuid,t.id,r->>'tournament_name',r->>'tournament_type',(r->>'tournament_date')::date,r->>'player_key',r->>'player_name',r->>'player_phone',(r->>'placement')::integer,(r->>'points')::integer,pid);
  n:=n+1;
 end loop;
 update tournament_runs set status='completed' where id=p_run;
 update tournaments set registrations_open=false where id=t.id;
 return n;
end $$;

-- Keep Admin registration transaction/identity behavior unchanged; validate the explicit destination when present.
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
    select 1 from public.circuit_ranking_groups g where g.circuit_id=t.circuit_id and g.level=lower(t.level) and ((t.circuit_ranking_group_id is not null and g.id=t.circuit_ranking_group_id) or (t.circuit_ranking_group_id is null and g.category=t.category))
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


commit;
