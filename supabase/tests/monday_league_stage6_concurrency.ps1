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
    param($Exe,$Db,$Query); $Query | & $Exe $Db -X -At 2>&1
  } }
  $jobs | Wait-Job | Out-Null
  $output = ($jobs | Receive-Job) -join "`n"
  $jobs | Remove-Job -Force
  return $output
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_stage6_results_contests.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + "COMMIT;"
$cleanup = @'
BEGIN;
DELETE FROM public.league_audit_events WHERE season_id='63000000-0000-4000-8000-000000000001';
UPDATE public.league_matches SET current_result_id=NULL,current_special_outcome_id=NULL WHERE phase_id='66000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id='66000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phase_teams WHERE phase_id='66000000-0000-4000-8000-000000000001';
DELETE FROM public.league_rounds WHERE phase_id='66000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phases WHERE id='66000000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='63000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='63000000-0000-4000-8000-000000000001';
DELETE FROM public.staff_users WHERE id='62000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '61000000-0000-4000-8000-00000000000%';
COMMIT;
'@

$score20 = '''[{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]''::jsonb'
$score21 = '''[{"homeGames":6,"awayGames":2},{"homeGames":4,"awayGames":6},{"homeGames":7,"awayGames":5}]''::jsonb'
$admin = "'62000000-0000-4000-8000-000000000001'"

try {
  [void](Sql $setup)

  # 1. Home captain double-submit: one authoritative revision only.
  $submitM1 = "SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001',$score20);"
  [void](Race $submitM1 $submitM1)
  if ((Sql "SELECT count(*)||':'||count(*) FILTER(WHERE id=(SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000001')) FROM public.league_result_submissions WHERE match_id='68000000-0000-4000-8000-000000000001';").Trim() -ne "1:1") { throw "Double submit split authority." }

  # H1 race A: contest opening versus special outcome.
  $m1Result = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000001';").Trim()
  $contestM1 = "SELECT public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000001','$m1Result','Special race');"
  $specialM1 = "SELECT public.league_set_match_special_outcome($admin,'68000000-0000-4000-8000-000000000001','$m1Result',NULL,'walkover','64000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'Special race');"
  [void](Race $contestM1 $specialM1)
  if ((Sql "SELECT count(*) FROM public.league_result_contests c JOIN public.league_matches m ON m.id=c.match_id WHERE c.match_id='68000000-0000-4000-8000-000000000001' AND c.status='open' AND m.current_special_outcome_id IS NOT NULL;").Trim() -ne '0') { throw "Contest/special race left an unresolved replaced outcome." }

  # 2. Captain submit versus admin special outcome.
  $submitM2 = "SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000003','68000000-0000-4000-8000-000000000002',$score20);"
  $specialM2 = "SELECT public.league_set_match_special_outcome($admin,'68000000-0000-4000-8000-000000000002',NULL,NULL,'walkover','64000000-0000-4000-8000-000000000003',true,3,0,true,false,2,0,12,0,'Race ruling');"
  [void](Race $submitM2 $specialM2)
  if ((Sql "SELECT ((current_result_id IS NOT NULL)::int+(current_special_outcome_id IS NOT NULL)::int) FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000002';").Trim() -ne "1") { throw "Submit/special race split authority." }

  # 3-4. Deadline equality and double-contest.
  [void](Sql "UPDATE public.league_matches SET scheduled_at=now()-interval '1 hour' WHERE id='68000000-0000-4000-8000-000000000003'; SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000003',$score20);")
  $m3Result = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000003';").Trim()
  $contestM3 = "SELECT public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000003','68000000-0000-4000-8000-000000000003','$m3Result','Race contest');"
  [void](Race $contestM3 $contestM3)
  if ((Sql "SELECT count(*) FROM public.league_result_contests WHERE result_submission_id='$m3Result' AND status='open';").Trim() -ne "1") { throw "Double contest created multiple open rows." }

  # 5. Contest versus finalization at the exact deadline: finalization wins, no open contest.
  [void](Sql "SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000004',$score20);")
  $m4Result = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000004';").Trim()
  [void](Sql "UPDATE public.league_result_submissions SET submitted_at=now()-interval '48 hours' WHERE id='$m4Result';")
  $contestM4 = "SELECT public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000004','68000000-0000-4000-8000-000000000004','$m4Result','Boundary contest');"
  $finalizeM4 = "SELECT public.league_finalize_expired_result('$m4Result');"
  [void](Race $contestM4 $finalizeM4)
  if ((Sql "SELECT status||':'||(SELECT count(*) FROM public.league_result_contests WHERE result_submission_id='$m4Result' AND status='open') FROM public.league_result_submissions WHERE id='$m4Result';").Trim() -ne "confirmed:0") { throw "Contest/finalize boundary diverged." }

  # 6. Contest opening versus admin correction serializes on match/result locks.
  [void](Sql "SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000005',$score20);")
  $m5Result = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000005';").Trim()
  $contestM5 = "SELECT public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000004','68000000-0000-4000-8000-000000000005','$m5Result','Race correction');"
  $correctM5 = "SELECT public.league_admin_correct_result($admin,'68000000-0000-4000-8000-000000000005','$m5Result','submitted',$score21,'Admin race');"
  [void](Race $contestM5 $correctM5)
  if ((Sql "SELECT count(*) FROM public.league_result_submissions WHERE match_id='68000000-0000-4000-8000-000000000005' AND status<>'superseded';").Trim() -ne "1") { throw "Contest/correction split authority." }
  if ((Sql "SELECT count(*) FROM public.league_result_contests c JOIN public.league_result_submissions r ON r.id=c.result_submission_id WHERE c.match_id='68000000-0000-4000-8000-000000000005' AND c.status='open' AND r.status='superseded';").Trim() -ne '0') { throw "Contest/correction race superseded an unresolved result." }

  # H1 race C: explicit resolution versus special outcome. Either ordering is valid,
  # but the special outcome can only win after the contest has been resolved.
  $m3Contest = (Sql "SELECT id FROM public.league_result_contests WHERE match_id='68000000-0000-4000-8000-000000000003' AND status='open';").Trim()
  $resolveM3 = "SELECT public.league_admin_resolve_contest($admin,'68000000-0000-4000-8000-000000000003','$m3Result','$m3Contest','reject','[]'::jsonb,'Resolve special race');"
  $specialM3 = "SELECT public.league_set_match_special_outcome($admin,'68000000-0000-4000-8000-000000000003','$m3Result',NULL,'walkover','64000000-0000-4000-8000-000000000001',true,3,0,true,false,2,0,12,0,'Resolved special race');"
  [void](Race $resolveM3 $specialM3)
  if ((Sql "SELECT count(*) FROM public.league_result_contests WHERE id='$m3Contest' AND status='open';").Trim() -ne '0') { throw "Resolution/special race left the contest open." }

  # 7-10. Resolve versus correction, two corrections, stale correction and contest on superseded revision.
  [void](Sql "SELECT public.league_captain_submit_result('61000000-0000-4000-8000-000000000003','68000000-0000-4000-8000-000000000006',$score20);")
  $m6Result = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000006';").Trim()
  [void](Sql "SELECT public.league_away_captain_contest_result('61000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000006','$m6Result','Resolve race');")
  $m6Contest = (Sql "SELECT id FROM public.league_result_contests WHERE result_submission_id='$m6Result' AND status='open';").Trim()
  $resolveM6 = "SELECT public.league_admin_resolve_contest($admin,'68000000-0000-4000-8000-000000000006','$m6Result','$m6Contest','reject','[]'::jsonb,'Reject race');"
  $correctM6 = "SELECT public.league_admin_correct_result($admin,'68000000-0000-4000-8000-000000000006','$m6Result','contested',$score21,'Correct race');"
  [void](Race $resolveM6 $correctM6)
  if ((Sql "SELECT count(*) FROM public.league_result_submissions WHERE match_id='68000000-0000-4000-8000-000000000006' AND status<>'superseded';").Trim() -ne "1") { throw "Resolve/correction split authority." }
  $m6Current = (Sql "SELECT current_result_id FROM public.league_matches WHERE id='68000000-0000-4000-8000-000000000006';").Trim()
  $m6Status = (Sql "SELECT status FROM public.league_result_submissions WHERE id='$m6Current';").Trim()
  $twoCorrections = "SELECT public.league_admin_correct_result($admin,'68000000-0000-4000-8000-000000000006','$m6Current','$m6Status',$score20,'Second race');"
  [void](Race $twoCorrections $twoCorrections)
  if ((Sql "SELECT count(*) FROM public.league_result_submissions WHERE match_id='68000000-0000-4000-8000-000000000006' AND status<>'superseded';").Trim() -ne "1") { throw "Two corrections split authority." }
  if ((Sql "SELECT count(*) FROM public.league_result_contests c JOIN public.league_result_submissions r ON r.id=c.result_submission_id WHERE r.status='superseded' AND c.status='open';").Trim() -ne "0") { throw "Open contest remained on superseded revision." }

  Write-Output "monday_league_stage6_concurrency: ok"
}
finally { [void](Sql $cleanup) }
