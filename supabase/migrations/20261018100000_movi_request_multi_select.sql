begin;

-- Drop only constraints that describe the three fields changing from scalar to arrays.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.movi_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~ '(match_type|training_type|training_goal)'
  loop
    execute format('alter table public.movi_requests drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.movi_requests
  alter column match_type type text[] using case when match_type is null then null else array[match_type] end,
  alter column training_type type text[] using case when training_type is null then null else array[training_type] end,
  alter column training_goal type text[] using case when training_goal is null then null else array[training_goal] end;

alter table public.movi_requests
  add constraint movi_requests_match_types_valid check (
    match_type is null or (
      cardinality(match_type) between 1 and 4
      and match_type <@ array['male','female','mixed','any']::text[]
      and array_position(match_type,null) is null
      and public.text_array_is_unique(match_type)
      and (not ('any'=any(match_type)) or cardinality(match_type)=1)
    )
  ),
  add constraint movi_requests_training_types_valid check (
    training_type is null or (
      cardinality(training_type) between 1 and 4
      and training_type <@ array['individual','pair','group','advice']::text[]
      and array_position(training_type,null) is null
      and public.text_array_is_unique(training_type)
      and (not ('advice'=any(training_type)) or cardinality(training_type)=1)
    )
  ),
  add constraint movi_requests_training_goals_valid check (
    training_goal is null or (
      cardinality(training_goal) between 1 and 5
      and training_goal <@ array['learn','technique','match','regular','other']::text[]
      and array_position(training_goal,null) is null
      and public.text_array_is_unique(training_goal)
    )
  ),
  add constraint movi_requests_type_fields_valid check (
    (request_type='gioca' and match_type is not null and has_partner is not null and training_type is null and training_goal is null)
    or
    (request_type='allenati' and match_type is null and has_partner is null and training_type is not null and training_goal is not null)
  );

comment on column public.movi_requests.match_type is 'Selected Gioca match types. any is exclusive when present.';
comment on column public.movi_requests.training_type is 'Selected Allenati training types. advice is exclusive when present.';
comment on column public.movi_requests.training_goal is 'Selected Allenati goals; multiple goals including other are allowed.';

commit;
