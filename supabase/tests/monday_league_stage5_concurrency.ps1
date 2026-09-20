$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed." }
  return ($output -join "`n")
}
function Race([string]$Left, [string]$Right) {
  $jobs = @($Left,$Right) | ForEach-Object { Start-Job -ArgumentList $Psql,$Database,$_ -ScriptBlock {
    param($Exe,$Db,$Query); $Query | & $Exe $Db -At 2>&1
  } }
  $jobs | Wait-Job | Out-Null
  $result = ($jobs | Receive-Job) -join "`n"
  $jobs | Remove-Job -Force
  return $result
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_stage5_captain_lineups.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + @'
UPDATE public.league_seasons SET status='phase1' WHERE id='53000000-0000-4000-8000-000000000001';
UPDATE public.league_phases SET status='generated' WHERE id='56000000-0000-4000-8000-000000000001';
COMMIT;
'@
$cleanup = @'
BEGIN;
DELETE FROM public.league_audit_events WHERE season_id='53000000-0000-4000-8000-000000000001';
UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=NULL WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phase_teams WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_rounds WHERE phase_id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phases WHERE id='56000000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='53000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001';
DELETE FROM public.league_season_deletion_log WHERE season_id='53000000-0000-4000-8000-000000000001';
DELETE FROM public.league_audit_events WHERE actor_staff_id='52000000-0000-4000-8000-000000000001' OR actor_user_id::text LIKE '51000000-0000-4000-8000-00000000000%' OR entity_id IN ('53000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002','58000000-0000-4000-8000-000000000001');
DELETE FROM public.staff_users WHERE id='52000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '51000000-0000-4000-8000-00000000000%';
COMMIT;
'@

try {
  [void](Sql $setup)
  $captain = "SELECT public.league_write_lineup('51000000-0000-4000-8000-000000000001',NULL,'58000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',ARRAY['55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002']::uuid[],NULL);"
  $captainReverse = "SELECT public.league_write_lineup('51000000-0000-4000-8000-000000000001',NULL,'58000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',ARRAY['55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001']::uuid[],NULL);"
  [void](Race $captain $captainReverse)
  if ((Sql "SELECT count(*)||':'||count(*) FILTER(WHERE status='current')||':'||max(revision) FROM public.league_lineups WHERE match_id='58000000-0000-4000-8000-000000000001' AND team_id='54000000-0000-4000-8000-000000000001';").Trim() -ne "2:1:2") { throw "Captain submissions were not serialized." }

  $admin = "SELECT public.league_write_lineup(NULL,'52000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',ARRAY['55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002']::uuid[],'Race admin override');"
  [void](Race $captain $admin)
  if ((Sql "SELECT count(*) FILTER(WHERE status='current')||':'||max(revision) FROM public.league_lineups WHERE match_id='58000000-0000-4000-8000-000000000001' AND team_id='54000000-0000-4000-8000-000000000001';").Trim() -ne "1:4") { throw "Captain/admin race lost revision evidence." }

  $reschedule = "BEGIN; UPDATE public.league_matches SET scheduled_at=now()+interval '4 hours' WHERE id='58000000-0000-4000-8000-000000000001'; SELECT pg_sleep(0.15); COMMIT;"
  [void](Race $captain $reschedule)
  if ((Sql "SELECT count(*) FILTER(WHERE status='current') FROM public.league_lineups WHERE match_id='58000000-0000-4000-8000-000000000001' AND team_id='54000000-0000-4000-8000-000000000001';").Trim() -ne "1") { throw "Reschedule/submit race broke current lineup uniqueness." }

  $visible = "SELECT public.league_set_season_visibility('52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','public');"
  $hidden = "SELECT public.league_set_season_visibility('52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','hidden');"
  [void](Race $visible $hidden)
  if ((Sql "SELECT public_visibility IN ('public','hidden') FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001';").Trim() -ne "t") { throw "Visibility race produced invalid state." }

  [void](Sql "UPDATE public.league_seasons SET status='draft' WHERE id='53000000-0000-4000-8000-000000000001'; UPDATE public.league_phases SET status='draft' WHERE id='56000000-0000-4000-8000-000000000001';")
  $roster = "SELECT public.league_captain_replace_roster_preseason('51000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','[{`"player_id`":`"55000000-0000-4000-8000-000000000001`",`"display_name`":`"S5 Captain A`"},{`"player_id`":`"55000000-0000-4000-8000-000000000002`",`"display_name`":`"S5 Player A`"}]'::jsonb);"
  $start = "UPDATE public.league_seasons SET status='phase1' WHERE id='53000000-0000-4000-8000-000000000001';"
  [void](Race $roster $start)
  if ((Sql "SELECT status FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001';").Trim() -ne "phase1") { throw "Season-start race did not converge." }

  [void](Sql "UPDATE public.league_seasons SET status='completed' WHERE id='53000000-0000-4000-8000-000000000001';")
  $archive = "SELECT public.league_archive_season('52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001');"
  $delete = "SELECT public.league_delete_season('52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','S5 Season','59000000-0000-4000-8000-000000000001');"
  [void](Race $archive $delete)
  if ((Sql "SELECT count(*) FROM public.league_seasons WHERE id='53000000-0000-4000-8000-000000000001';").Trim() -ne "0") { throw "Archive/delete race did not serialize to deletion." }
  if ((Sql "SELECT (public.league_delete_season('52000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','S5 Season','59000000-0000-4000-8000-000000000001')->>'duplicate')::boolean;").Trim() -ne "t") { throw "Duplicate delete was not idempotent." }
  Write-Output "monday_league_stage5_concurrency: ok"
}
finally { [void](Sql $cleanup) }
