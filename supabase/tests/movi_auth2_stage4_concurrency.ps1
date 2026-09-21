$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$database = @("-h", "127.0.0.1", "-p", "55022", "-U", "postgres", "-d", "postgres")
$env:PGPASSWORD = "postgres"
if (-not (Test-Path -LiteralPath $psql)) { throw "psql not found at $psql" }
function Sql([string]$query) {
  $out = & $psql @database -v ON_ERROR_STOP=1 -At -c $query
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
  return ($out | Out-String).Trim()
}
$target = Sql "SELECT current_database() || '|' || inet_server_port();"
if ($target -ne "postgres|5432") { throw "Unexpected database target: $target" }
$staff = "fa000000-0000-4000-8000-000000000001"
$source = "fa200000-0000-4000-8000-000000000001"
$canonical = "fa200000-0000-4000-8000-000000000002"
$cleanup = @"
SET session_replication_role=replica;
DELETE FROM public.user_moviback_reconciliation_evidence WHERE source_user_id='$source' OR canonical_user_id='$canonical';
DELETE FROM public.user_merge_journal WHERE source_user_id='$source' OR canonical_user_id='$canonical';
DELETE FROM public.user_duplicate_review_decisions WHERE group_id IN (SELECT group_id FROM public.user_duplicate_review_members WHERE user_id IN('$source','$canonical'));
DELETE FROM public.user_merge_operations WHERE source_user_id='$source' OR canonical_user_id='$canonical';
DELETE FROM public.user_duplicate_review_members WHERE user_id IN('$source','$canonical');
DELETE FROM public.user_duplicate_review_groups WHERE signal_value='stage4.concurrent@example.invalid';
DELETE FROM public.user_duplicate_scan_runs WHERE actor_staff_id='$staff';
DELETE FROM public.users WHERE id IN('$source','$canonical');
DELETE FROM public.staff_users WHERE id='$staff';
SET session_replication_role=origin;
"@
try {
  Sql $cleanup | Out-Null
  Sql @"
INSERT INTO public.staff_users(id,full_name,email,role) VALUES('$staff','Stage4 Concurrency','stage4-concurrency@example.invalid','admin');
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('$source','Concurrent Source','3479300001','stage4.concurrent@example.invalid','M'),
 ('$canonical','Concurrent Canonical','3479300002',' STAGE4.CONCURRENT@EXAMPLE.INVALID ','M');
SELECT public.run_user_duplicate_scan('$staff');
"@ | Out-Null
  $group = Sql "SELECT id FROM public.user_duplicate_review_groups WHERE signal_type='normalized_email' AND signal_value='stage4.concurrent@example.invalid';"
  $fieldWinners = "{`"full_name`":`"$canonical`",`"phone`":`"$canonical`",`"email`":`"$canonical`",`"gender`":`"$canonical`"}"
  $fieldWinnersSql = $fieldWinners.Replace("'", "''")
  Sql "SELECT public.save_user_duplicate_review_decision('$group','approved','$canonical','$source',ARRAY['$source','$canonical']::uuid[],'$fieldWinnersSql'::jsonb,'concurrency test','$staff');" | Out-Null
  $created = Sql "WITH x AS (SELECT public.create_reviewed_user_merge_operation('$group','$source','$staff','scan versus merge') d) SELECT (d->>'operation_id')||'|'||(d->'preview'->>'fingerprint') FROM x;"
  $parts = $created.Split('|')
  $scanCommand = "SELECT public.run_user_duplicate_scan('$staff')->>'state';"
  $mergeCommand = "SELECT public.execute_reviewed_user_merge('$($parts[0])','$($parts[1])','$staff')->>'state';"
  $jobs = @(
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$scanCommand
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$mergeCommand
  )
  $results = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
  if (($results | Where-Object { $_ -eq 'completed' }).Count -ne 2) { throw "scan/merge did not both complete: $($results -join ',')" }
  $safe = Sql "SELECT count(*) FROM public.users WHERE id='$source' AND identity_status='merged' AND merged_into_user_id='$canonical';"
  if ([int]$safe -ne 1) { throw "scan versus merge left an unsafe source state" }
  Write-Output "Stage 4 concurrency passed: operational scan and reviewed merge serialized safely."
}
finally { Sql $cleanup | Out-Null }
