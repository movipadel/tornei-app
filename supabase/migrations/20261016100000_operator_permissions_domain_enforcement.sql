-- Phase 2: DB-authoritative permission enforcement for delegable RPC operations.
create or replace function public.operator_has_permission(p_actor uuid,p_permission text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.staff_users s
    where s.id=p_actor and s.is_active and (
      s.role='admin' or (
        s.role='staff' and exists (
          select 1 from public.staff_permissions p
          where p.staff_user_id=s.id and p.permission_key=p_permission
        )
      )
    )
  );
$$;

revoke all on function public.operator_has_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.operator_has_permission(uuid,text) to service_role;

create or replace function public.league_assert_admin(p_actor_id uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.operator_has_permission(p_actor_id,'monday_league.manage') then
    raise exception using errcode='P0001',message='ML_ADMIN_REQUIRED';
  end if;
end;
$$;

revoke all on function public.league_assert_admin(uuid) from public,anon,authenticated;
grant execute on function public.league_assert_admin(uuid) to service_role;
create or replace function public.player_profile_write_operator(p_actor uuid,p_player uuid,p_expected_version integer,p_data jsonb,p_movi_level numeric,p_internal_notes text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_version integer;new_version integer;old_level numeric;slot jsonb;
begin
 if not public.operator_has_permission(p_actor,'players.manage') then raise exception 'PLAYER_OPERATOR_REQUIRED' using errcode='42501'; end if;perform player_identity_lock();perform player_profile_validate_payload(p_data);
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
revoke all on function public.player_profile_write_operator(uuid,uuid,integer,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.player_profile_write_operator(uuid,uuid,integer,jsonb,numeric,text) to service_role;

comment on function public.operator_has_permission(uuid,text) is 'Phase 2 DB-authoritative Admin bypass or exact active Staff permission check.';
comment on function public.league_assert_admin(uuid) is 'Historical name retained for RPC compatibility; authorizes active Admin or monday_league.manage.';
comment on function public.player_profile_write_operator(uuid,uuid,integer,jsonb,numeric,text) is 'Normal player-profile edit for active Admin or players.manage; identity reconciliation remains Admin-only.';