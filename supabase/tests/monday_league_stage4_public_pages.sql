\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.league_seasons(id,name,slug,status,published_at) VALUES
  ('61000000-0000-4000-8000-000000000001','S4 Draft','s4-draft','draft',NULL),
  ('61000000-0000-4000-8000-000000000002','S4 Draft Timestamped','s4-draft-timestamped','draft',now()),
  ('61000000-0000-4000-8000-000000000003','S4 Public','s4-public','phase1',now() - interval '1 minute');

INSERT INTO public.league_phases(id,season_id,code,name,sequence,status)
VALUES ('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','phase1','Fase 1',1,'generated');

DO $test$
DECLARE visible_season uuid; visible_phase uuid;
BEGIN
  SELECT id INTO visible_season
  FROM public.league_seasons
  WHERE status IN ('phase1','phase2','completed')
    AND published_at IS NOT NULL
    AND published_at <= now()
  ORDER BY published_at DESC
  LIMIT 1;
  IF visible_season <> '61000000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'S4_PUBLICATION_GATE_FAILED';
  END IF;

  SELECT id INTO visible_phase
  FROM public.league_phases
  WHERE season_id=visible_season AND status IN ('generated','in_progress','finalized');
  IF visible_phase <> '62000000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'S4_VISIBLE_PHASE_FAILED';
  END IF;

  IF has_table_privilege('anon','public.league_seasons','SELECT')
    OR has_table_privilege('authenticated','public.league_matches','SELECT')
    OR has_function_privilege('anon','public.league_get_standings(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'S4_BASE_TABLE_SECURITY_FAILED';
  END IF;
END
$test$;

ROLLBACK;
SELECT 'monday_league_stage4_public_pages: ok' AS result;
