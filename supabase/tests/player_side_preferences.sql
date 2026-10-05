begin;

do $$
declare
  profile_count_before bigint;
  request_count_before bigint;
  sample_player uuid;
  sample_user uuid;
  sample_request uuid;
  current_version integer;
  saved jsonb;
begin
  select count(*) into profile_count_before from public.player_profiles;
  select count(*) into request_count_before from public.movi_requests;

  select p.player_identity_id,p.updated_by_user_id,p.version
    into sample_player,sample_user,current_version
  from public.player_profiles p
  where p.updated_by_user_id is not null
  limit 1;

  if sample_player is not null and sample_user is not null then
    saved:=public.player_profile_write_user(sample_user,current_version,jsonb_build_object(
      'descriptive_level','intermedio',
      'preferred_side','right',
      'preferred_clubs',jsonb_build_array('Manta'),
      'available_other_clubs',true,
      'preferred_match_types',jsonb_build_array('any'),
      'available_last_minute',false,
      'availability',jsonb_build_array()
    ));
    if (select preferred_side from public.player_profiles where player_identity_id=sample_player) <> 'right' then raise exception 'right not persisted'; end if;

    saved:=public.player_profile_write_user(sample_user,(saved->>'version')::integer,jsonb_build_object(
      'descriptive_level','intermedio',
      'preferred_side','left',
      'preferred_clubs',jsonb_build_array('Manta'),
      'available_other_clubs',true,
      'preferred_match_types',jsonb_build_array('any'),
      'available_last_minute',false,
      'availability',jsonb_build_array()
    ));
    saved:=public.player_profile_write_user(sample_user,(saved->>'version')::integer,jsonb_build_object(
      'descriptive_level','intermedio',
      'preferred_side','any',
      'preferred_clubs',jsonb_build_array('Manta'),
      'available_other_clubs',true,
      'preferred_match_types',jsonb_build_array('any'),
      'available_last_minute',false,
      'availability',jsonb_build_array()
    ));
    perform public.player_profile_write_user(sample_user,(saved->>'version')::integer,jsonb_build_object(
      'descriptive_level','intermedio',
      'preferred_side',null,
      'preferred_clubs',jsonb_build_array('Manta'),
      'available_other_clubs',true,
      'preferred_match_types',jsonb_build_array('any'),
      'available_last_minute',false,
      'availability',jsonb_build_array()
    ));
    if (select preferred_side from public.player_profiles where player_identity_id=sample_player) is not null then raise exception 'null not persisted'; end if;

    begin
      perform public.player_profile_write_user(sample_user,(select version from public.player_profiles where player_identity_id=sample_player),jsonb_build_object(
        'descriptive_level','intermedio','preferred_side','center','preferred_clubs',jsonb_build_array(),
        'available_other_clubs',null,'preferred_match_types',jsonb_build_array(),
        'available_last_minute',null,'availability',jsonb_build_array()
      ));
      raise exception 'invalid profile side accepted';
    exception when others then
      if sqlerrm not like '%SIDE_INVALID%' then raise; end if;
    end;

    begin
      perform public.player_profile_write_user(sample_user,(select version from public.player_profiles where player_identity_id=sample_player),jsonb_build_object(
        'descriptive_level','intermedio','preferred_side',jsonb_build_array('left'),'preferred_clubs',jsonb_build_array(),
        'available_other_clubs',null,'preferred_match_types',jsonb_build_array(),
        'available_last_minute',null,'availability',jsonb_build_array()
      ));
      raise exception 'array profile side accepted';
    exception when others then
      if sqlerrm not like '%SIDE_INVALID%' then raise; end if;
    end;
  end if;

  select id into sample_request from public.movi_requests limit 1;
  if sample_request is not null then
    update public.movi_requests set playing_side='left' where id=sample_request;
    begin
      update public.movi_requests set playing_side='center' where id=sample_request;
      raise exception 'invalid request side accepted';
    exception when check_violation then null;
    end;
    update public.movi_requests set playing_side=null where id=sample_request;
  end if;

  if (select count(*) from public.player_profiles) <> profile_count_before then raise exception 'profile row count changed'; end if;
  if (select count(*) from public.movi_requests) <> request_count_before then raise exception 'request row count changed'; end if;
end $$;

rollback;
