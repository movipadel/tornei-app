param([string]$Container = "supabase_db_tornei-app")
$ErrorActionPreference = "Stop"

function Sql([string]$Query) {
  $output = $Query | docker exec -i $Container psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed." }
  return ($output -join "`n")
}
function Race([string]$Left, [string]$Right) {
  $jobs = @($Left, $Right) | ForEach-Object { Start-Job -ArgumentList $Container, $_ -ScriptBlock { param($C,$Q); $Q | docker exec -i $C psql -At -U postgres -d postgres 2>&1 } }
  $jobs | Wait-Job | Out-Null; $result = ($jobs | Receive-Job) -join "`n"; $jobs | Remove-Job -Force; return $result
}

$setup = @'
BEGIN;
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('51000000-0000-4000-8000-000000000001','S3 Race Captain 1','+390000005101','ml-s3-race-1@example.invalid','M'),
 ('51000000-0000-4000-8000-000000000002','S3 Race Captain 2','+390000005102','ml-s3-race-2@example.invalid','F');
INSERT INTO public.staff_users(id,full_name,email,role,is_active) VALUES ('52000000-0000-4000-8000-000000000001','S3 Race Admin','ml-s3-race@example.invalid','admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES ('53000000-0000-4000-8000-000000000001','S3 Race','s3-race','phase1');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.league_teams(id,season_id,name,slug,captain_player_id) VALUES
 ('54000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','Race Team 1','race-team-1','55000000-0000-4000-8000-000000000001'),
 ('54000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001','Race Team 2','race-team-2','55000000-0000-4000-8000-000000000002');
INSERT INTO public.league_team_players(id,team_id,display_name,user_id) VALUES
 ('55000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','Race Captain 1','51000000-0000-4000-8000-000000000001'),
 ('55000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000002','Race Captain 2','51000000-0000-4000-8000-000000000002');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status) VALUES ('56000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','phase1','Phase 1',1,'generated');
INSERT INTO public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) VALUES
 ('56000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',1,1),('56000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002',2,2);
INSERT INTO public.league_rounds(id,phase_id,round_number) VALUES ('57000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001',1);
INSERT INTO public.league_matches(id,phase_id,round_id,home_team_id,away_team_id) VALUES ('58000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002');
INSERT INTO public.league_match_team_slots(match_id,round_id,team_id,side) VALUES
 ('58000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','home'),
 ('58000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002','away');
COMMIT;
'@
$cleanup = @'
DELETE FROM public.league_audit_events WHERE season_id='53000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_rounds WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phase_teams WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phases WHERE id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id='52000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');
'@

try {
  [void](Sql $setup)
  $slot = (Sql "SELECT s.id FROM public.league_venue_slots s JOIN public.league_venues v ON v.id=s.venue_id WHERE v.code='COSTIGLIOLE' AND s.local_time='20:00';").Trim()
  $schedule = "SELECT public.league_schedule_round('52000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001',1,'2026-10-19','[{`"matchId`":`"58000000-0000-4000-8000-000000000001`",`"venueSlotId`":`"$slot`"}]');"
  $scheduleRace = Race $schedule $schedule
  if ((Sql "SELECT schedule_version||':'||(SELECT count(*) FROM public.league_matches WHERE id='58000000-0000-4000-8000-000000000001' AND match_status='scheduled') FROM public.league_rounds WHERE id='57000000-0000-4000-8000-000000000001';").Trim() -ne "2:1" -or $scheduleRace -notmatch "ML_SCHEDULE_VERSION_CONFLICT") { throw "Schedule race was not serialized: $scheduleRace" }

  $submit = "SELECT public.league_admin_submit_result('52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','[{`"homeGames`":6,`"awayGames`":4},{`"homeGames`":6,`"awayGames`":2}]');"
  $submitRace = Race $submit $submit
  if ((Sql "SELECT count(*) FROM public.league_result_submissions WHERE match_id='58000000-0000-4000-8000-000000000001';").Trim() -ne "1" -or $submitRace -notmatch "ML_RESULT_MATCH_STATE_INVALID|ML_RESULT_ALREADY_EXISTS") { throw "Submit race was not serialized: $submitRace" }

  $current = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='58000000-0000-4000-8000-000000000001';").Trim()
  $confirm = "SELECT public.league_admin_confirm_result('52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','$current');"
  $correct = "SELECT public.league_admin_correct_result('52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','$current','submitted','[{`"homeGames`":6,`"awayGames`":4},{`"homeGames`":4,`"awayGames`":6},{`"homeGames`":7,`"awayGames`":5}]','Race correction');"
  $revisionRace = Race $confirm $correct
  if ($revisionRace -notmatch "ML_RESULT_VERSION_CONFLICT") { throw "Confirm/correction race allowed both transitions: $revisionRace" }

  $current = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='58000000-0000-4000-8000-000000000001';").Trim()
  $status = (Sql "SELECT status FROM public.league_result_submissions WHERE id='$current';").Trim()
  $special = "SELECT public.league_set_match_special_outcome('52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','$current',NULL,'walkover','54000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'Race walkover');"
  $correct2 = "SELECT public.league_admin_correct_result('52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','$current','$status','[{`"homeGames`":6,`"awayGames`":1},{`"homeGames`":6,`"awayGames`":2}]','Race second correction');"
  $outcomeRace = Race $special $correct2
  $shape = (Sql "SELECT ((current_result_id IS NULL)::int+(current_special_outcome_id IS NULL)::int) FROM public.league_matches WHERE id='58000000-0000-4000-8000-000000000001';").Trim()
  if ($outcomeRace -notmatch "ML_OUTCOME_VERSION_CONFLICT|ML_RESULT_VERSION_CONFLICT" -or $shape -ne "1") { throw "Special/result race broke authoritative outcome: $outcomeRace" }
  Write-Output "monday_league_stage3_concurrency: ok (schedule, submit, confirm/correct, special/result races serialized)"
}
finally { [void](Sql $cleanup) }
