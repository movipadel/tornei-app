-- Crazy Winter: the two certified eight-player stages used this exact scale.
-- Rules belong to the circuit, so the same Libero destination works for
-- operationally Libero and Misto Baraonda tournaments.
do $$
declare
  v_circuit constant uuid := 'b669378b-7e76-4a84-939a-914dba452a70';
  v_group constant uuid := '5c7311d8-5603-48cc-943b-01cb28252c55';
  v_expected constant jsonb := '{"1":450,"2":400,"3":350,"4":300,"5":250,"6":200,"7":150,"8":100}'::jsonb;
  v_count integer;
  v_scale jsonb;
begin
  -- Keep the precheck and insert in one atomic statement against concurrent edits.
  lock table public.circuit_points_rules in share row exclusive mode;

  if not exists (
    select 1 from public.circuits c
    where c.id = v_circuit and c.name = 'Baraonda CRAZY WINTER'
      and c.tournament_type = 'Baraonda' and c.status = 'active'
  ) or not exists (
    select 1 from public.circuit_ranking_groups g
    where g.id = v_group and g.circuit_id = v_circuit
      and g.category = 'Libero' and g.level = 'principiante'
  ) then
    raise exception 'CRAZY_WINTER_TARGET_CHANGED';
  end if;

  select count(*), coalesce(
    jsonb_object_agg(r.placement::text, r.points) filter (
      where r.rule_type = 'placement' and r.min_admissions = 8
        and r.max_admissions = 8 and r.stage is null
    ), '{}'::jsonb
  ) into v_count, v_scale
  from public.circuit_points_rules r where r.circuit_id = v_circuit;

  -- An exact previous application is a no-op. Partial or different rules fail.
  if v_count = 8 and v_scale = v_expected then
    return;
  end if;
  if v_count <> 0 then
    raise exception 'CRAZY_WINTER_POINTS_RULE_CONFLICT';
  end if;

  insert into public.circuit_points_rules
    (circuit_id, min_admissions, max_admissions, rule_type, placement, stage, points)
  select v_circuit, 8, 8, 'placement', v.placement, null, v.points
  from (values (1,450),(2,400),(3,350),(4,300),
               (5,250),(6,200),(7,150),(8,100)) as v(placement,points);

  if (select count(*) from public.circuit_points_rules where circuit_id = v_circuit) <> 8 then
    raise exception 'CRAZY_WINTER_POINTS_RULE_POSTCHECK_FAILED';
  end if;
end;
$$;
