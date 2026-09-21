$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -X -v ON_ERROR_STOP=1 -At 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed: $output" }
  return ($output -join "`n")
}

function Race([string]$Left, [string]$Right) {
  $jobs = @($Left,$Right) | ForEach-Object { Start-Job -ArgumentList $Psql,$Database,$_ -ScriptBlock {
    param($Exe,$Db,$Query); $Query | & $Exe $Db -X -v ON_ERROR_STOP=1 -At 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql exited $LASTEXITCODE" }
  } }
  $jobs | Wait-Job | Out-Null
  $failed = $jobs | Where-Object State -ne "Completed"
  $output = ($jobs | Receive-Job) -join "`n"
  $jobs | Remove-Job -Force
  if ($failed) { throw "H3 race process failed: $output" }
  return $output
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_prerelease_h3_captain_context.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + "COMMIT;"
$cleanup = @'
BEGIN;
DELETE FROM public.league_audit_events WHERE season_id='a1300000-0000-4000-8000-000000000001';
DELETE FROM public.league_notification_events WHERE season_id='a1300000-0000-4000-8000-000000000001';
DELETE FROM public.league_result_contests WHERE match_id::text LIKE 'a1800000-0000-4000-8000-%';
UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=NULL WHERE phase_id::text LIKE 'a1600000-0000-4000-8000-%';
DELETE FROM public.league_matches WHERE phase_id::text LIKE 'a1600000-0000-4000-8000-%';
DELETE FROM public.league_phase_teams WHERE phase_id::text LIKE 'a1600000-0000-4000-8000-%';
DELETE FROM public.league_rounds WHERE phase_id::text LIKE 'a1600000-0000-4000-8000-%';
DELETE FROM public.league_phases WHERE season_id='a1300000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='a1300000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='a1300000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id='a1200000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE 'a1100000-0000-4000-8000-%';
COMMIT;
'@

$captain = "'a1100000-0000-4000-8000-000000000001'"
$team = "'a1400000-0000-4000-8000-000000000001'"
$oldMatch = "'a1800000-0000-4000-8000-000000000001'"
$nextMatch = "a1800000-0000-4000-8000-000000000002"
$oldResult = "'a1900000-0000-4000-8000-000000000001'"
$admin = "'a1200000-0000-4000-8000-000000000001'"

try {
  [void](Sql $cleanup)
  [void](Sql $setup)
  [void](Sql "UPDATE public.league_result_submissions SET submitted_at=now()-interval '47 hours' WHERE id=$oldResult;")

  # A. A context read racing contest opening may return either consistent snapshot;
  # after commit the open contest must keep the old match relevant.
  $read = "SELECT public.league_get_captain_context($captain,$team);"
  $open = "SELECT public.league_away_captain_contest_result($captain,$oldMatch,$oldResult,'H3 concurrent open');"
  [void](Race $read $open)
  if ((Sql "SELECT public.league_get_captain_context($captain,$team)->>'match_id';").Trim() -ne $oldMatch.Trim("'")) { throw "Contest-open race advanced incorrectly." }

  # B. Resolution and a context read serialize through authoritative write state;
  # after resolution the context advances.
  $contest = (Sql "SELECT id FROM public.league_result_contests WHERE result_submission_id=$oldResult AND status='open';").Trim()
  $resolve = "SELECT public.league_admin_resolve_contest($admin,$oldMatch,$oldResult,'$contest','reject','[]'::jsonb,'H3 concurrent resolve');"
  [void](Race $read $resolve)
  if ((Sql "SELECT public.league_get_captain_context($captain,$team)->>'match_id';").Trim() -ne $nextMatch) { throw "Contest-resolution race did not advance." }

  # C. At exact equality the Stage 6 deadline is closed, whether or not the
  # persistence finalizer wins first.
  [void](Sql "UPDATE public.league_result_submissions SET status='submitted',confirmed_at=NULL,submitted_at=now()-interval '48 hours' WHERE id=$oldResult; UPDATE public.league_matches SET match_status='submitted' WHERE id=$oldMatch;")
  $finalize = "SELECT public.league_finalize_expired_result($oldResult);"
  [void](Race $read $finalize)
  if ((Sql "SELECT public.league_get_captain_context($captain,$team)->>'match_id';").Trim() -ne $nextMatch) { throw "Exact-boundary race pinned the old match." }

  # D. A read racing reschedule is snapshot-consistent. The next read must use
  # the new authoritative deadline; write commands retain their own guards.
  $before = (Sql "SELECT scheduled_at::text FROM public.league_matches WHERE id='$nextMatch';").Trim()
  $reschedule = "UPDATE public.league_matches SET scheduled_at=scheduled_at+interval '7 days',schedule_version=schedule_version+1 WHERE id='$nextMatch';"
  [void](Race $read $reschedule)
  $after = (Sql "SELECT scheduled_at::text FROM public.league_matches WHERE id='$nextMatch';").Trim()
  if ($before -eq $after) { throw "Reschedule race did not update the fixture." }
  if ((Sql "SELECT public.league_get_captain_context($captain,$team)->>'match_id';").Trim() -ne $nextMatch) { throw "Reschedule race lost the next fixture." }

  Write-Output "monday_league_prerelease_h3_concurrency: ok"
}
finally { [void](Sql $cleanup) }
