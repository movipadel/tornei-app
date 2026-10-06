begin;

alter table public.movi_requests
  add column group_size smallint,
  add column required_player_side text;

update public.movi_requests
set group_size = case when has_partner then 2 else 1 end
where request_type = 'gioca';

alter table public.movi_requests
  drop constraint movi_requests_type_fields_valid,
  drop column has_partner;

alter table public.movi_requests
  add constraint movi_requests_required_player_side_valid check (
    required_player_side is null or required_player_side in ('right','left','any')
  ),
  add constraint movi_requests_group_fields_valid check (
    (
      request_type = 'gioca'
      and group_size in (1,2,3)
      and (
        (group_size in (1,2) and required_player_side is null)
        or
        (group_size = 3 and required_player_side is not null and required_player_side in ('right','left','any'))
      )
      and match_type is not null
      and training_type is null
      and training_goal is null
    )
    or
    (
      request_type = 'allenati'
      and group_size is null
      and required_player_side is null
      and match_type is null
      and training_type is not null
      and training_goal is not null
    )
  );

comment on column public.movi_requests.group_size is
  'Gioca party size: 1 requester alone, 2 existing players, 3 players seeking the fourth; NULL for Allenati.';
comment on column public.movi_requests.required_player_side is
  'Direct preferred side for the missing fourth player when group_size=3; distinct from requester playing_side.';

commit;
