-- One-time production repair proposal. DO NOT RUN without separate authorization.
-- Apply the certified Crazy Winter point-rule migration first. This script changes
-- only points on the eight existing 18 November circuit_result rows.
begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_tournament constant uuid := '67d59802-a4c5-4ced-b983-b47237a5620b';
  v_run constant uuid := 'f7103cc4-198f-4886-85b8-a66f433aa444';
  v_circuit constant uuid := 'b669378b-7e76-4a84-939a-914dba452a70';
  v_group constant uuid := '5c7311d8-5603-48cc-943b-01cb28252c55';
  v_scale constant jsonb := '{"1":450,"2":400,"3":350,"4":300,"5":250,"6":200,"7":150,"8":100}'::jsonb;
  v_rule_count integer;
  v_rules jsonb;
  v_rows integer;
  v_identified integer;
  v_correct_group integer;
  v_zero integer;
  v_positions integer[];
  v_before jsonb;
  v_after jsonb;
  v_result_count integer;
  v_total integer;
  v_updated integer;
begin
  -- Serializes the canonical materialization RPC, which locks this tournament.
  perform 1 from public.tournaments t
  where t.id = v_tournament and t.circuit_id = v_circuit
    and t.category = 'Libero' and t.level = 'principiante'
  for update;
  if not found then raise exception 'CRAZY_WINTER_TOURNAMENT_CHANGED'; end if;

  if not exists (
    select 1 from public.tournament_runs r
    where r.id = v_run and r.tournament_id = v_tournament
      and r.mode = 'baraonda' and r.status = 'completed'
  ) then raise exception 'CRAZY_WINTER_RUN_CHANGED'; end if;

  select count(*), coalesce(jsonb_object_agg(placement::text, points), '{}'::jsonb)
    into v_rule_count, v_rules
  from public.circuit_points_rules
  where circuit_id = v_circuit and min_admissions = 8 and max_admissions = 8
    and rule_type = 'placement' and stage is null;
  if v_rule_count <> 8 or v_rules <> v_scale then
    raise exception 'CRAZY_WINTER_POINT_RULES_NOT_CERTIFIED';
  end if;
  if (select count(*) from public.circuit_points_rules where circuit_id = v_circuit) <> 8 then
    raise exception 'CRAZY_WINTER_UNEXPECTED_POINT_RULE';
  end if;

  -- Lock every result for this tournament, including any unexpected extra row.
  perform 1 from public.circuit_results r
  where r.source_tournament_id = v_tournament for update;

  select count(*), count(distinct r.player_identity_id),
         count(*) filter (where r.ranking_group_id = v_group and r.circuit_id = v_circuit),
         count(*) filter (where r.points = 0),
         array_agg(r.placement order by r.placement),
         jsonb_agg(to_jsonb(r) - 'points' order by r.id)
    into v_rows, v_identified, v_correct_group, v_zero, v_positions, v_before
  from public.circuit_results r
  where r.source_tournament_id = v_tournament;

  if v_rows <> 8 or v_identified <> 8 or v_correct_group <> 8 or v_zero <> 8
     or v_positions is distinct from array[1,2,3,4,5,6,7,8] then
    raise exception 'CRAZY_WINTER_RESULT_PRECHECK_FAILED';
  end if;

  select count(*), coalesce(sum(points), 0) into v_result_count, v_total
  from public.circuit_results where ranking_group_id = v_group;
  if v_result_count <> 24 or v_total <> 4400 then
    raise exception 'CRAZY_WINTER_RANKING_BASELINE_CHANGED';
  end if;

  update public.circuit_results r
  set points = case r.placement
    when 1 then 450 when 2 then 400 when 3 then 350 when 4 then 300
    when 5 then 250 when 6 then 200 when 7 then 150 when 8 then 100
  end
  where r.source_tournament_id = v_tournament
    and r.ranking_group_id = v_group and r.points = 0;
  get diagnostics v_updated = row_count;
  if v_updated <> 8 then raise exception 'CRAZY_WINTER_REPAIR_ROW_COUNT_CHANGED'; end if;

  select jsonb_agg(to_jsonb(r) - 'points' order by r.id)
    into v_after from public.circuit_results r
  where r.source_tournament_id = v_tournament;
  if v_after is distinct from v_before then
    raise exception 'CRAZY_WINTER_NON_POINT_DATA_CHANGED';
  end if;
  if (select coalesce(sum(points), 0) from public.circuit_results
      where source_tournament_id = v_tournament) <> 2200 then
    raise exception 'CRAZY_WINTER_STAGE_POINTS_POSTCHECK_FAILED';
  end if;

  select count(*), coalesce(sum(points), 0) into v_result_count, v_total
  from public.circuit_results where ranking_group_id = v_group;
  if v_result_count <> 24 or v_total <> 6600 then
    raise exception 'CRAZY_WINTER_RANKING_POSTCHECK_FAILED';
  end if;
end;
$$;

commit;
