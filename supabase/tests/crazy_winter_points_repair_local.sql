-- Local synthetic, rollback-only test. The runner injects the exact repair DO
-- statement at the marker below; the production script is never executed here.
\set ON_ERROR_STOP on
begin;
set transaction isolation level serializable;

do $$
begin
  if exists (select 1 from public.tournaments where id = '67d59802-a4c5-4ced-b983-b47237a5620b')
     or exists (select 1 from public.circuits where id = 'b669378b-7e76-4a84-939a-914dba452a70') then
    raise exception 'CRAZY_WINTER_LOCAL_REPAIR_FIXTURE_COLLISION';
  end if;
end;
$$;

insert into public.circuits (id, name, slug, tournament_type, status)
values ('b669378b-7e76-4a84-939a-914dba452a70',
        'Baraonda CRAZY WINTER', 'crazy-winter-repair-local-test', 'Baraonda', 'active');
insert into public.circuit_ranking_groups (id, circuit_id, category, level)
values ('5c7311d8-5603-48cc-943b-01cb28252c55',
        'b669378b-7e76-4a84-939a-914dba452a70', 'Libero', 'principiante');
insert into public.tournaments
  (id, name, type, category, date, time, location, max_participants, level, circuit_id,
   circuit_ranking_group_id)
values ('67d59802-a4c5-4ced-b983-b47237a5620b', 'Synthetic Crazy Winter',
        'Baraonda', 'Libero', '2026-11-18', '20:00', 'Local test', 8, 'principiante',
        'b669378b-7e76-4a84-939a-914dba452a70',
        '5c7311d8-5603-48cc-943b-01cb28252c55');
insert into public.tournament_runs (id, tournament_id, mode, category, status)
values ('f7103cc4-198f-4886-85b8-a66f433aa444',
        '67d59802-a4c5-4ced-b983-b47237a5620b', 'baraonda', 'libero', 'completed');

\ir ../migrations/20261118230228_crazy_winter_placement_points.sql

insert into public.player_identities (id, full_name, normalized_phone)
select ('99999999-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'Synthetic Player ' || i, '+3934700000' || lpad(i::text, 2, '0')
from generate_series(1, 8) i;

insert into public.circuit_results
  (circuit_id, ranking_group_id, source_tournament_id, tournament_name,
   tournament_type, tournament_date, player_key, player_name, placement, points,
   player_identity_id)
select 'b669378b-7e76-4a84-939a-914dba452a70',
       '5c7311d8-5603-48cc-943b-01cb28252c55',
       '67d59802-a4c5-4ced-b983-b47237a5620b', 'Synthetic Crazy Winter',
       'Baraonda', '2026-11-18', '39900000' || lpad(i::text, 2, '0'),
       'Synthetic Player ' || i, i, 0,
       ('99999999-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 8) i;

insert into public.circuit_results
  (circuit_id, ranking_group_id, tournament_name, tournament_type,
   player_key, player_name, placement, points)
select 'b669378b-7e76-4a84-939a-914dba452a70',
       '5c7311d8-5603-48cc-943b-01cb28252c55',
       'Synthetic Historical Stage', 'Baraonda',
       'historical-' || i, 'Synthetic Historical ' || i, i, 275
from generate_series(1, 16) i;

-- INJECT_EXACT_REPAIR_DO_STATEMENT

do $$
declare v_scale jsonb;
begin
  select jsonb_object_agg(placement::text, points) into v_scale
  from public.circuit_results
  where source_tournament_id = '67d59802-a4c5-4ced-b983-b47237a5620b';
  if v_scale <> '{"1":450,"2":400,"3":350,"4":300,"5":250,"6":200,"7":150,"8":100}'::jsonb
     or (select count(*) from public.circuit_results
         where ranking_group_id = '5c7311d8-5603-48cc-943b-01cb28252c55') <> 24
     or (select sum(points) from public.circuit_results
         where ranking_group_id = '5c7311d8-5603-48cc-943b-01cb28252c55') <> 6600 then
    raise exception 'CRAZY_WINTER_LOCAL_REPAIR_POSTCHECK_FAILED';
  end if;
end;
$$;

rollback;
