$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -X -v ON_ERROR_STOP=1 -At 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed: $output" }
  return ($output -join "`n")
}

function Race([string]$Left,[string]$Right) {
  $jobs = @($Left,$Right) | ForEach-Object { Start-Job -ArgumentList $Psql,$Database,$_ -ScriptBlock {
    param($Exe,$Db,$Query); $Query | & $Exe $Db -X -v ON_ERROR_STOP=1 -At 2>&1
  } }
  $jobs | Wait-Job | Out-Null
  $outputs = @($jobs | ForEach-Object { (Receive-Job $_) -join "`n" })
  $jobs | Remove-Job -Force
  return $outputs
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_stage9_completion.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + "COMMIT;"
$cleanup = @'
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM public.communications WHERE event_key LIKE 'league:93000000-0000-4000-8000-000000000001:%';
DELETE FROM public.league_notification_events WHERE season_id='93000000-0000-4000-8000-000000000001';
DELETE FROM public.league_audit_events WHERE season_id='93000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id IN(SELECT id FROM public.league_phases WHERE season_id='93000000-0000-4000-8000-000000000001');
DELETE FROM public.league_rounds WHERE phase_id IN(SELECT id FROM public.league_phases WHERE season_id='93000000-0000-4000-8000-000000000001');
DELETE FROM public.league_phase_teams WHERE phase_id IN(SELECT id FROM public.league_phases WHERE season_id='93000000-0000-4000-8000-000000000001');
DELETE FROM public.league_phases WHERE season_id='93000000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='93000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id='92000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '91000000-0000-4000-8000-00000000000%';
COMMIT;
'@
$complete = "SET ROLE service_role; SELECT public.league_complete_season('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',public.league_phase2_completion_readiness('93000000-0000-4000-8000-000000000001')->>'fingerprint');"

try {
  [void](Sql $cleanup); [void](Sql $setup)
  $outputs = Race $complete $complete
  if (@($outputs | Where-Object { $_ -match '"created"\s*:\s*true' }).Count -ne 1 -or @($outputs | Where-Object { $_ -match '"replayed"\s*:\s*true' }).Count -ne 1) { throw "Completion race was not create+replay: $outputs" }
  if ((Sql "SELECT status||':'||(SELECT count(*) FROM public.league_audit_events WHERE season_id='93000000-0000-4000-8000-000000000001' AND event_type='season_completed') FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001';").Trim() -ne 'completed:1') { throw "Completion race state invalid" }

  [void](Sql $cleanup); [void](Sql $setup)
  $correct = @'
SET ROLE service_role;
SELECT public.league_admin_correct_result('92000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000a','confirmed','[{"homeGames":6,"awayGames":1},{"homeGames":6,"awayGames":2}]','race correction');
'@
  $outputs = Race $complete $correct
  $state = (Sql "SELECT status||':'||(SELECT count(*) FROM public.league_audit_events WHERE season_id='93000000-0000-4000-8000-000000000001' AND event_type='season_completed') FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001';").Trim()
  if ($state -notin @('completed:1','phase2:0')) { throw "Completion/correction race state invalid: $state $outputs" }

  [void](Sql $cleanup); [void](Sql $setup)
  [void](Sql "UPDATE public.league_result_submissions SET status='submitted',submitter_type='captain',submitted_by_staff_id=NULL,submitted_by_user_id='91000000-0000-4000-8000-000000000001',submitted_at=now()-interval '1 hour',confirmed_at=NULL WHERE id='99000000-0000-4000-8000-00000000000a'; UPDATE public.league_matches SET match_status='submitted' WHERE id='98000000-0000-4000-8000-00000000000a';")
  $contest = "SET ROLE service_role; SELECT public.league_away_captain_contest_result('91000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000a','late race');"
  $outputs = Race $complete $contest
  $safe = (Sql "SELECT status||':'||(SELECT count(*) FROM public.league_result_contests WHERE match_id='98000000-0000-4000-8000-00000000000a' AND status='open') FROM public.league_seasons WHERE id='93000000-0000-4000-8000-000000000001';").Trim()
  if ($safe -ne 'phase2:1') { throw "Completion/contest race violated finality: $safe $outputs" }

  [void](Sql $cleanup); [void](Sql $setup)
  [void](Sql @'
INSERT INTO public.league_notification_events(event_type,season_id,match_id,team_id,recipient_user_id,idempotency_key,due_at,title,body,payload)
VALUES('match_reminder','93000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-00000000000a','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','s9-scan-race',now(),'x','x','{"schedule_version":0}');
'@)
  $outputs = Race $complete "SET ROLE service_role; SELECT public.league_scan_due_notifications(now(),100);"
  if ((Sql "SELECT status FROM public.league_notification_events WHERE idempotency_key='s9-scan-race';").Trim() -ne 'skipped') { throw "Completion/scanner race failed to suppress reminder: $outputs" }
  Write-Output "monday_league_stage9_concurrency: ok"
}
finally { [void](Sql $cleanup) }
