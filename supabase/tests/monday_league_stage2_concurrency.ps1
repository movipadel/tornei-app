param([string]$Container = "supabase_db_tornei-app")

$ErrorActionPreference = "Stop"

function Invoke-LocalSql([string]$Sql) {
  $output = $Sql | docker exec -i $Container psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed." }
  return ($output -join "`n")
}

$setup = @'
BEGIN;
INSERT INTO public.users (id, full_name, phone, email, gender) VALUES
 ('37000000-0000-4000-8000-000000000001','Concurrency Captain 1','+390000007101','ml-concurrency-1@example.invalid','M'),
 ('37000000-0000-4000-8000-000000000002','Concurrency Captain 2','+390000007102','ml-concurrency-2@example.invalid','F'),
 ('37000000-0000-4000-8000-000000000003','Concurrency Captain 3','+390000007103','ml-concurrency-3@example.invalid','M'),
 ('37000000-0000-4000-8000-000000000004','Concurrency Captain 4','+390000007104','ml-concurrency-4@example.invalid','F');
INSERT INTO public.staff_users (id, full_name, email, role, is_active)
 VALUES ('38000000-0000-4000-8000-000000000001','Concurrency Admin','ml-concurrency-admin@example.invalid','admin',true);
INSERT INTO public.league_seasons (id,name,slug) VALUES
 ('33000000-0000-4000-8000-000000000001','Concurrency Season','concurrency-season');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams (id,season_id,name,slug,captain_player_id) VALUES
 ('35000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','Concurrency Team 1','concurrency-team-1','36000000-0000-4000-8000-000000000001'),
 ('35000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000001','Concurrency Team 2','concurrency-team-2','36000000-0000-4000-8000-000000000002'),
 ('35000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000001','Concurrency Team 3','concurrency-team-3','36000000-0000-4000-8000-000000000003'),
 ('35000000-0000-4000-8000-000000000004','33000000-0000-4000-8000-000000000001','Concurrency Team 4','concurrency-team-4','36000000-0000-4000-8000-000000000004');
INSERT INTO public.league_team_players (id,team_id,display_name,user_id) VALUES
 ('36000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','Captain 1','37000000-0000-4000-8000-000000000001'),
 ('36000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000002','Captain 2','37000000-0000-4000-8000-000000000002'),
 ('36000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000003','Captain 3','37000000-0000-4000-8000-000000000003'),
 ('36000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000004','Captain 4','37000000-0000-4000-8000-000000000004');
INSERT INTO public.league_phases (id,season_id,code,name,sequence) VALUES
 ('34000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','phase1','Phase 1',1);
COMMIT;
'@

$generate = @'
WITH args AS (
 SELECT
   ARRAY['35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000004']::uuid[] AS ordered,
   ARRAY['35000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000003']::uuid[] AS tied,
   '[{"roundNumber":1,"byeTeamId":null,"matches":[{"homeTeamId":"35000000-0000-4000-8000-000000000001","awayTeamId":"35000000-0000-4000-8000-000000000004"},{"homeTeamId":"35000000-0000-4000-8000-000000000002","awayTeamId":"35000000-0000-4000-8000-000000000003"}]},{"roundNumber":2,"byeTeamId":null,"matches":[{"homeTeamId":"35000000-0000-4000-8000-000000000004","awayTeamId":"35000000-0000-4000-8000-000000000003"},{"homeTeamId":"35000000-0000-4000-8000-000000000001","awayTeamId":"35000000-0000-4000-8000-000000000002"}]},{"roundNumber":3,"byeTeamId":null,"matches":[{"homeTeamId":"35000000-0000-4000-8000-000000000002","awayTeamId":"35000000-0000-4000-8000-000000000004"},{"homeTeamId":"35000000-0000-4000-8000-000000000003","awayTeamId":"35000000-0000-4000-8000-000000000001"}]}]'::jsonb AS rounds
), payload AS (
 SELECT *, jsonb_build_object(
   'phaseId','34000000-0000-4000-8000-000000000001',
   'algorithmVersion','circle-ha-v1','orderedTeamIds',to_jsonb(ordered),
   'tieBreakOrder',to_jsonb(tied),'rounds',rounds
 )::text AS body FROM args
)
SELECT public.league_generate_phase1(
 '38000000-0000-4000-8000-000000000001',
 '34000000-0000-4000-8000-000000000001', ordered, tied, 'circle-ha-v1',
 encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex'), body, rounds,
 '{"invariantViolations":[],"maxStreak":2,"totalDoubleStreaks":4,"totalTriplePlusStreaks":0,"alternationPercentage":66.7,"teams":[]}'::jsonb
) FROM payload;
'@

$cleanup = @'
DELETE FROM public.league_audit_events WHERE season_id = '33000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id = '34000000-0000-4000-8000-000000000001';
DELETE FROM public.league_rounds WHERE phase_id = '34000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phase_teams WHERE phase_id = '34000000-0000-4000-8000-000000000001';
DELETE FROM public.league_generation_runs WHERE phase_id = '34000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phases WHERE id = '34000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id = '33000000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id = '38000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '37000000-0000-4000-8000-00000000000%';
'@

try {
  [void](Invoke-LocalSql $setup)
  $jobs = 1..2 | ForEach-Object {
    Start-Job -ArgumentList $Container, $generate -ScriptBlock {
      param($DbContainer, $Sql)
      $Sql | docker exec -i $DbContainer psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres
      if ($LASTEXITCODE -ne 0) { throw "Concurrent generator call failed." }
    }
  }
  $jobs | Wait-Job | Out-Null
  $results = ($jobs | Receive-Job) -join "`n"
  $jobs | Remove-Job -Force

  if ($results -notmatch '"created": true' -or $results -notmatch '"replayed": true') {
    throw "Expected one create and one idempotent replay. Results: $results"
  }
  $counts = Invoke-LocalSql "SELECT count(*) || ':' || (SELECT count(*) FROM public.league_rounds WHERE phase_id='34000000-0000-4000-8000-000000000001') FROM public.league_matches WHERE phase_id='34000000-0000-4000-8000-000000000001';"
  if ($counts.Trim() -ne "6:3") { throw "Concurrent calls duplicated structure: $counts" }
  Write-Output "monday_league_stage2_concurrency: ok (one create, one replay, 6 matches, 3 rounds)"
}
finally {
  [void](Invoke-LocalSql $cleanup)
}
