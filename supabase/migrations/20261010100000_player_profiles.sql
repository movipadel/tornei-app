begin;

create function public.text_array_is_unique(p_values text[]) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select coalesce(cardinality(p_values),0)=(select count(distinct value) from unnest(coalesce(p_values,'{}')) value)
$$;

create table public.player_profiles (
 player_identity_id uuid primary key references public.player_identities(id) on delete restrict,
 descriptive_level text check (descriptive_level in ('principiante','intermedio','avanzato')),
 preferred_clubs text[] not null default '{}',
 available_other_clubs boolean,
 preferred_match_types text[] not null default '{}',
 available_last_minute boolean,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by_user_id uuid references public.users(id) on delete restrict,
 updated_by_admin_id uuid references public.staff_users(id) on delete restrict,
 check (preferred_clubs <@ array['Revello','Saluzzo','Manta','Costigliole','Centallo']::text[]),
 check (public.text_array_is_unique(preferred_clubs)),
 check (preferred_match_types <@ array['male','female','mixed','any']::text[]),
 check (public.text_array_is_unique(preferred_match_types)),
 check (not ('any'=any(preferred_match_types)) or cardinality(preferred_match_types)=1),
 check (num_nonnulls(updated_by_user_id,updated_by_admin_id)<=1)
);

create table public.player_profile_availability (
 player_identity_id uuid not null references public.player_profiles(player_identity_id) on delete cascade,
 weekday smallint not null check(weekday between 1 and 7),
 time_window text not null check(time_window in ('morning','lunch','afternoon','evening')),
 primary key(player_identity_id,weekday,time_window)
);

create table public.player_admin_profiles (
 player_identity_id uuid primary key references public.player_identities(id) on delete restrict,
 movi_level numeric(2,1) check(movi_level in (2.0,2.5,3.0,3.5,4.0,4.5,5.0)),
 movi_level_updated_at timestamptz,
 movi_level_updated_by_admin_id uuid references public.staff_users(id) on delete restrict,
 internal_notes text not null default '' check(length(internal_notes)<=5000),
 updated_at timestamptz not null default now(),
 updated_by_admin_id uuid not null references public.staff_users(id) on delete restrict,
 check ((movi_level is null and movi_level_updated_at is null and movi_level_updated_by_admin_id is null)
     or (movi_level is not null and movi_level_updated_at is not null and movi_level_updated_by_admin_id is not null))
);

-- Future matching queries: containment for controlled multi-selects and slot lookup.
create index player_profiles_clubs_gin_idx on public.player_profiles using gin(preferred_clubs);
create index player_profiles_match_types_gin_idx on public.player_profiles using gin(preferred_match_types);
create index player_profile_availability_slot_idx on public.player_profile_availability(weekday,time_window,player_identity_id);
create index player_admin_profiles_level_idx on public.player_admin_profiles(movi_level) where movi_level is not null;

alter table public.player_profiles enable row level security;
alter table public.player_profile_availability enable row level security;
alter table public.player_admin_profiles enable row level security;
revoke all on public.player_profiles,public.player_profile_availability,public.player_admin_profiles from anon,authenticated;
grant all on public.player_profiles,public.player_profile_availability,public.player_admin_profiles to service_role;

create function public.player_profile_validate_payload(p_data jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare clubs text[];matches text[];slots jsonb;
begin
 if jsonb_typeof(p_data)<>'object' or p_data is null then raise exception 'PROFILE_INVALID';end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('descriptive_level','preferred_clubs','available_other_clubs','preferred_match_types','available_last_minute','availability')) then raise exception 'PROFILE_FIELDS_INVALID';end if;
 if p_data->'preferred_clubs' is null or jsonb_typeof(p_data->'preferred_clubs')<>'array' then raise exception 'CLUBS_INVALID';end if;
 if p_data->'preferred_match_types' is null or jsonb_typeof(p_data->'preferred_match_types')<>'array' then raise exception 'MATCH_TYPES_INVALID';end if;
 if p_data->'availability' is null or jsonb_typeof(p_data->'availability')<>'array' or jsonb_array_length(p_data->'availability')>28 then raise exception 'AVAILABILITY_INVALID';end if;
 select coalesce(array_agg(value order by value),'{}') into clubs from jsonb_array_elements_text(p_data->'preferred_clubs');
 select coalesce(array_agg(value order by value),'{}') into matches from jsonb_array_elements_text(p_data->'preferred_match_types');
 if not clubs <@ array['Revello','Saluzzo','Manta','Costigliole','Centallo']::text[] or not text_array_is_unique(clubs) then raise exception 'CLUBS_INVALID';end if;
 if not matches <@ array['male','female','mixed','any']::text[] or not text_array_is_unique(matches) or ('any'=any(matches) and cardinality(matches)<>1) then raise exception 'MATCH_TYPES_INVALID';end if;
 if p_data->>'descriptive_level' is not null and p_data->>'descriptive_level' not in ('principiante','intermedio','avanzato') then raise exception 'LEVEL_INVALID';end if;
 if jsonb_typeof(p_data->'available_other_clubs') not in ('boolean','null') or jsonb_typeof(p_data->'available_last_minute') not in ('boolean','null') then raise exception 'BOOLEAN_INVALID';end if;
 select jsonb_agg(value) into slots from jsonb_array_elements(p_data->'availability');
 if exists(select 1 from jsonb_array_elements(coalesce(slots,'[]')) v where jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>2 or not (v ? 'weekday' and v ? 'time_window') or (v->>'weekday')!~'^[1-7]$' or v->>'time_window' not in ('morning','lunch','afternoon','evening')) then raise exception 'AVAILABILITY_INVALID';end if;
 if (select count(*) from jsonb_array_elements(coalesce(slots,'[]')))<>(select count(*) from (select distinct v->>'weekday',v->>'time_window' from jsonb_array_elements(coalesce(slots,'[]')) v) x) then raise exception 'AVAILABILITY_DUPLICATE';end if;
end $$;

create function public.player_profile_resolve_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u users%rowtype;pid uuid;phone text;phone_count integer;exact_count integer;cid uuid;
begin
 perform player_identity_lock();
 select * into u from users where id=p_user and identity_status='active' for update;
 if u.id is null then raise exception 'ACTIVE_ACCOUNT_REQUIRED';end if;
 select player_identity_canonical(id) into pid from player_identities where account_user_id=u.id;
 if pid is not null then
  if not exists(select 1 from player_identities where id=pid and status='active') then raise exception 'ACTIVE_PLAYER_REQUIRED';end if;
  return jsonb_build_object('state','linked','player_id',pid);
 end if;
 phone:=normalize_user_mobile_e164(u.phone);
 if phone is null or player_identity_name(u.full_name)='' then
  cid:=player_identity_case('ambiguous_account_link','account_profile',u.id::text,jsonb_build_object('reason','insufficient_identity','full_name',u.full_name,'phone',u.phone),'{}',array[u.id]);
  return jsonb_build_object('state','review','case_id',cid);
 end if;
 select count(*),count(*) filter(where player_identity_name(full_name)=player_identity_name(u.full_name) and (gender is null or u.gender is null or gender=u.gender))
 into phone_count,exact_count from player_identities where normalized_phone=phone and status='active';
 if phone_count=0 then
  insert into player_identities(full_name,normalized_phone,gender,account_user_id) values(btrim(u.full_name),phone,case when u.gender in ('M','F') then u.gender end,u.id) returning id into pid;
  insert into player_identity_events(player_identity_id,action,details) values(pid,'created_from_account_profile',jsonb_build_object('account_user_id',u.id));
  return jsonb_build_object('state','linked','player_id',pid,'created',true);
 elsif phone_count=1 and exact_count=1 then
  select id into pid from player_identities where normalized_phone=phone and status='active';
  return player_identity_link_account(pid,u.id);
 end if;
 cid:=player_identity_case('ambiguous_account_link','account_profile',u.id::text,jsonb_build_object('reason','ambiguous_players','full_name',u.full_name,'phone',phone),(select coalesce(array_agg(id),'{}') from player_identities where normalized_phone=phone and status='active'),array[u.id]);
 return jsonb_build_object('state','review','case_id',cid);
end $$;

create function public.player_profile_write_user(p_user uuid,p_expected_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare resolved jsonb;pid uuid;current_version integer;new_version integer;slot jsonb;
begin
 perform player_profile_validate_payload(p_data);
 resolved:=player_profile_resolve_account(p_user);
 if resolved->>'state'<>'linked' then return resolved;end if;
 pid:=(resolved->>'player_id')::uuid;
 select version into current_version from player_profiles where player_identity_id=pid for update;
 if current_version is null then
  if p_expected_version is not null then raise exception 'STALE_PROFILE';end if;
  insert into player_profiles(player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,updated_by_user_id)
  values(pid,p_data->>'descriptive_level',array(select jsonb_array_elements_text(p_data->'preferred_clubs')),nullif(p_data->>'available_other_clubs','null')::boolean,array(select jsonb_array_elements_text(p_data->'preferred_match_types')),nullif(p_data->>'available_last_minute','null')::boolean,p_user);
  new_version:=1;
 else
  if p_expected_version is null or p_expected_version<>current_version then raise exception 'STALE_PROFILE';end if;
  new_version:=current_version+1;
  update player_profiles set descriptive_level=p_data->>'descriptive_level',preferred_clubs=array(select jsonb_array_elements_text(p_data->'preferred_clubs')),available_other_clubs=nullif(p_data->>'available_other_clubs','null')::boolean,preferred_match_types=array(select jsonb_array_elements_text(p_data->'preferred_match_types')),available_last_minute=nullif(p_data->>'available_last_minute','null')::boolean,version=new_version,updated_at=now(),updated_by_user_id=p_user,updated_by_admin_id=null where player_identity_id=pid;
 end if;
 delete from player_profile_availability where player_identity_id=pid;
 for slot in select value from jsonb_array_elements(p_data->'availability') loop
  insert into player_profile_availability values(pid,(slot->>'weekday')::smallint,slot->>'time_window');
 end loop;
 return jsonb_build_object('state','saved','player_id',pid,'version',new_version);
end $$;

create function public.player_profile_write_admin(p_actor uuid,p_player uuid,p_expected_version integer,p_data jsonb,p_movi_level numeric,p_internal_notes text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_version integer;new_version integer;old_level numeric;slot jsonb;
begin
 perform player_identity_admin(p_actor);perform player_identity_lock();perform player_profile_validate_payload(p_data);
 if not exists(select 1 from player_identities where id=p_player and status in ('active','archived')) then raise exception 'PLAYER_NOT_EDITABLE';end if;
 if p_movi_level is not null and p_movi_level not in (2.0,2.5,3.0,3.5,4.0,4.5,5.0) then raise exception 'MOVI_LEVEL_INVALID';end if;
 if length(coalesce(p_internal_notes,''))>5000 then raise exception 'NOTES_TOO_LONG';end if;
 select version into current_version from player_profiles where player_identity_id=p_player for update;
 if current_version is null then
  if p_expected_version is not null then raise exception 'STALE_PROFILE';end if;
  insert into player_profiles(player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,updated_by_admin_id)
  values(p_player,p_data->>'descriptive_level',array(select jsonb_array_elements_text(p_data->'preferred_clubs')),nullif(p_data->>'available_other_clubs','null')::boolean,array(select jsonb_array_elements_text(p_data->'preferred_match_types')),nullif(p_data->>'available_last_minute','null')::boolean,p_actor);
  new_version:=1;
 else
  if p_expected_version is null or p_expected_version<>current_version then raise exception 'STALE_PROFILE';end if;
  new_version:=current_version+1;
  update player_profiles set descriptive_level=p_data->>'descriptive_level',preferred_clubs=array(select jsonb_array_elements_text(p_data->'preferred_clubs')),available_other_clubs=nullif(p_data->>'available_other_clubs','null')::boolean,preferred_match_types=array(select jsonb_array_elements_text(p_data->'preferred_match_types')),available_last_minute=nullif(p_data->>'available_last_minute','null')::boolean,version=new_version,updated_at=now(),updated_by_admin_id=p_actor,updated_by_user_id=null where player_identity_id=p_player;
 end if;
 delete from player_profile_availability where player_identity_id=p_player;
 for slot in select value from jsonb_array_elements(p_data->'availability') loop insert into player_profile_availability values(p_player,(slot->>'weekday')::smallint,slot->>'time_window');end loop;
 select movi_level into old_level from player_admin_profiles where player_identity_id=p_player for update;
 insert into player_admin_profiles(player_identity_id,movi_level,movi_level_updated_at,movi_level_updated_by_admin_id,internal_notes,updated_by_admin_id)
 values(p_player,p_movi_level,case when p_movi_level is null then null else now() end,case when p_movi_level is null then null else p_actor end,coalesce(p_internal_notes,''),p_actor)
 on conflict(player_identity_id) do update set movi_level=excluded.movi_level,
  movi_level_updated_at=case when player_admin_profiles.movi_level is distinct from excluded.movi_level then excluded.movi_level_updated_at else player_admin_profiles.movi_level_updated_at end,
  movi_level_updated_by_admin_id=case when player_admin_profiles.movi_level is distinct from excluded.movi_level then excluded.movi_level_updated_by_admin_id else player_admin_profiles.movi_level_updated_by_admin_id end,
  internal_notes=excluded.internal_notes,updated_at=now(),updated_by_admin_id=p_actor;
 insert into player_identity_events(player_identity_id,actor_admin_id,action,details) values(p_player,p_actor,'profile_updated',jsonb_build_object('version',new_version,'movi_level_changed',old_level is distinct from p_movi_level));
 return jsonb_build_object('state','saved','player_id',p_player,'version',new_version);
end $$;

revoke all on function public.text_array_is_unique(text[]),public.player_profile_validate_payload(jsonb),public.player_profile_resolve_account(uuid),public.player_profile_write_user(uuid,integer,jsonb),public.player_profile_write_admin(uuid,uuid,integer,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.player_profile_write_user(uuid,integer,jsonb),public.player_profile_write_admin(uuid,uuid,integer,jsonb,numeric,text) to service_role;

create function public.player_profile_identity_after_update() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];
begin
 if old.normalized_phone is distinct from new.normalized_phone then
  select array_agg(id order by id) into ids from player_identities where status<>'merged' and normalized_phone=new.normalized_phone;
  if cardinality(ids)>1 then
   perform player_identity_case('identity_data_conflict','admin_identity',new.id::text,jsonb_build_object('reason','phone_conflict_after_correction','full_name',new.full_name,'phone',new.normalized_phone),ids);
  end if;
 end if;
 if old.status<>'merged' and new.status='merged' and new.merged_into_player_id is not null then
  if exists(select 1 from player_profiles where player_identity_id=old.id) and not exists(select 1 from player_profiles where player_identity_id=new.merged_into_player_id) then
   insert into player_profiles(player_identity_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,version,updated_at,updated_by_user_id,updated_by_admin_id)
   select new.merged_into_player_id,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,1,now(),updated_by_user_id,updated_by_admin_id from player_profiles where player_identity_id=old.id;
   insert into player_profile_availability(player_identity_id,weekday,time_window) select new.merged_into_player_id,weekday,time_window from player_profile_availability where player_identity_id=old.id;
  end if;
  if exists(select 1 from player_admin_profiles where player_identity_id=old.id) and not exists(select 1 from player_admin_profiles where player_identity_id=new.merged_into_player_id) then
   insert into player_admin_profiles(player_identity_id,movi_level,movi_level_updated_at,movi_level_updated_by_admin_id,internal_notes,updated_at,updated_by_admin_id)
   select new.merged_into_player_id,movi_level,movi_level_updated_at,movi_level_updated_by_admin_id,internal_notes,now(),updated_by_admin_id from player_admin_profiles where player_identity_id=old.id;
  end if;
 end if;
 return new;
end $$;
create trigger player_profile_identity_after_update after update of normalized_phone,status on public.player_identities for each row execute function public.player_profile_identity_after_update();
revoke all on function public.player_profile_identity_after_update() from public,anon,authenticated,service_role;

commit;
