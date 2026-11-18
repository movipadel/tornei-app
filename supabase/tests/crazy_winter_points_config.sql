\set ON_ERROR_STOP on
begin;

do $$
begin
  if exists (select 1 from public.circuits where id = 'b669378b-7e76-4a84-939a-914dba452a70')
     or exists (select 1 from public.circuit_ranking_groups where id = '5c7311d8-5603-48cc-943b-01cb28252c55') then
    raise exception 'CRAZY_WINTER_LOCAL_FIXTURE_COLLISION';
  end if;
end;
$$;

insert into public.circuits (id, name, slug, tournament_type, status)
values ('b669378b-7e76-4a84-939a-914dba452a70',
        'Baraonda CRAZY WINTER', 'crazy-winter-points-local-test', 'Baraonda', 'active');
insert into public.circuit_ranking_groups (id, circuit_id, category, level)
values ('5c7311d8-5603-48cc-943b-01cb28252c55',
        'b669378b-7e76-4a84-939a-914dba452a70', 'Libero', 'principiante');

\ir ../migrations/20261118230228_crazy_winter_placement_points.sql
\ir ../migrations/20261118230228_crazy_winter_placement_points.sql

do $$
declare v_scale jsonb;
begin
  select jsonb_object_agg(placement::text, points) into v_scale
  from public.circuit_points_rules
  where circuit_id = 'b669378b-7e76-4a84-939a-914dba452a70'
    and min_admissions = 8 and max_admissions = 8
    and rule_type = 'placement' and stage is null;
  if (select count(*) from public.circuit_points_rules
      where circuit_id = 'b669378b-7e76-4a84-939a-914dba452a70') <> 8
     or v_scale <> '{"1":450,"2":400,"3":350,"4":300,"5":250,"6":200,"7":150,"8":100}'::jsonb then
    raise exception 'CRAZY_WINTER_LOCAL_CONFIG_TEST_FAILED';
  end if;
end;
$$;

rollback;
