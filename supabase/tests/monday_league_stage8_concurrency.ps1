$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -X -v ON_ERROR_STOP=1 -At 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed: $output" }
  return ($output -join "`n")
}

function Race([string]$Query) {
  $jobs = 1..2 | ForEach-Object { Start-Job -ArgumentList $Psql,$Database,$Query -ScriptBlock {
    param($Exe,$Db,$Sql); $Sql | & $Exe $Db -X -v ON_ERROR_STOP=1 -At 2>&1
  } }
  $jobs | Wait-Job | Out-Null
  $outputs = @($jobs | ForEach-Object { (Receive-Job $_) -join "`n" })
  $jobs | Remove-Job -Force
  return $outputs
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_stage8_phase2.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + "COMMIT;"
$cleanup = @'
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM public.communications WHERE event_key LIKE 'league:83000000-0000-4000-8000-000000000001:%';
DELETE FROM public.league_notification_events WHERE season_id='83000000-0000-4000-8000-000000000001';
DELETE FROM public.league_audit_events WHERE season_id='83000000-0000-4000-8000-000000000001';
UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=NULL WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001');
DELETE FROM public.league_result_submissions WHERE match_id IN (SELECT id FROM public.league_matches WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001'));
DELETE FROM public.league_match_special_outcomes WHERE match_id IN (SELECT id FROM public.league_matches WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001'));
DELETE FROM public.league_matches WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001');
DELETE FROM public.league_phase_teams WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001');
DELETE FROM public.league_rounds WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001');
DELETE FROM public.league_generation_runs WHERE phase_id IN (SELECT id FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001');
DELETE FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='83000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='83000000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id='82000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '81000000-0000-4000-8000-00000000000%';
COMMIT;
'@

$call = @'
SET ROLE service_role;
SELECT public.league_generate_phase2(
 '82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
 public.league_phase2_readiness('83000000-0000-4000-8000-000000000001')->>'fingerprint',
 '86000000-0000-4000-8000-00000000000a','86000000-0000-4000-8000-00000000000b',
 '[{"roundNumber":1,"byeTeamId":null,"matches":[{"homeTeamId":"84000000-0000-4000-8000-000000000001","awayTeamId":"84000000-0000-4000-8000-000000000002"}]}]',
 '[{"roundNumber":1,"byeTeamId":null,"matches":[{"homeTeamId":"84000000-0000-4000-8000-000000000003","awayTeamId":"84000000-0000-4000-8000-000000000004"}]}]',
 '{"invariantViolations":[]}','{"invariantViolations":[]}');
'@

try {
  [void](Sql $cleanup)
  [void](Sql $setup)
  $outputs = Race $call
  if (@($outputs | Where-Object { $_ -match '"created"\s*:\s*true' }).Count -ne 1) { throw "Expected one creator: $outputs" }
  if (@($outputs | Where-Object { $_ -match '"replayed"\s*:\s*true' }).Count -ne 1) { throw "Expected one replay: $outputs" }
  $state = (Sql "SELECT count(*)||':'||(SELECT count(*) FROM public.league_generation_runs WHERE generation_kind='phase2_split' AND phase_id='86000000-0000-4000-8000-00000000000a')||':'||(SELECT count(*) FROM public.league_phase_teams WHERE phase_id IN('86000000-0000-4000-8000-00000000000a','86000000-0000-4000-8000-00000000000b')) FROM public.league_phases WHERE season_id='83000000-0000-4000-8000-000000000001' AND code IN('serie_a','serie_b');").Trim()
  if ($state -ne '2:1:4') { throw "Invalid post-race state: $state" }
  Write-Output "monday_league_stage8_concurrency: ok"
}
finally { [void](Sql $cleanup) }
