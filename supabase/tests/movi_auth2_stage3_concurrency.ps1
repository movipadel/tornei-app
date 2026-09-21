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
$cleanup = @"
SET session_replication_role=replica;
DELETE FROM public.user_merge_journal WHERE source_user_id::text LIKE 'e2%';
DELETE FROM public.user_identity_aliases WHERE source_user_id::text LIKE 'e2%' OR canonical_user_id::text LIKE 'e2%';
DELETE FROM public.user_merge_operations WHERE source_user_id::text LIKE 'e2%' OR canonical_user_id::text LIKE 'e2%';
DELETE FROM public.user_duplicate_review_members WHERE user_id::text LIKE 'e2%';
DELETE FROM public.users WHERE id::text LIKE 'e2000000-0000-4000-8000-0000000000%';
DELETE FROM auth.users WHERE id::text LIKE 'e1000000-0000-4000-8000-0000000000%';
SET session_replication_role=origin;
"@
try {
  Sql $cleanup | Out-Null
  Sql @"
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('e2000000-0000-4000-8000-000000000001','Replay Source','3478000001','replay-s.stage3@example.invalid','M'),
 ('e2000000-0000-4000-8000-000000000002','Replay Canonical','3478000002','replay-c.stage3@example.invalid','M'),
 ('e2000000-0000-4000-8000-000000000003','Chain A','3478000003','chain-a.stage3@example.invalid','F'),
 ('e2000000-0000-4000-8000-000000000004','Chain B','3478000004','chain-b.stage3@example.invalid','F'),
 ('e2000000-0000-4000-8000-000000000005','Chain C','3478000005','chain-c.stage3@example.invalid','F'),
 ('e2000000-0000-4000-8000-000000000006','Race Source','3478000006','race.stage3@example.invalid','M'),
 ('e2000000-0000-4000-8000-000000000007','Race Canonical','3478000007','race-c.stage3@example.invalid','M');
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at)
 VALUES('e1000000-0000-4000-8000-000000000001','race.stage3@example.invalid',now(),now(),now());
"@ | Out-Null

  function NewOperation($source,$canonical,$reason) {
    return Sql "WITH x AS (SELECT public.create_user_merge_operation('$source','$canonical',NULL,'$reason',NULL) d) SELECT (d->>'operation_id')||'|'||(d->'preview'->>'fingerprint') FROM x;"
  }
  $replay = (NewOperation 'e2000000-0000-4000-8000-000000000001' 'e2000000-0000-4000-8000-000000000002' 'concurrent replay').Split('|')
  $command = "SELECT public.execute_user_merge('$($replay[0])','$($replay[1])',NULL)->>'state';"
  $jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$command }
  $results = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
  if (($results | Where-Object { $_ -eq 'completed' }).Count -ne 2) { throw "Concurrent replay did not converge" }

  $ab = (NewOperation 'e2000000-0000-4000-8000-000000000003' 'e2000000-0000-4000-8000-000000000004' 'chain ab').Split('|')
  $bc = (NewOperation 'e2000000-0000-4000-8000-000000000004' 'e2000000-0000-4000-8000-000000000005' 'chain bc').Split('|')
  $cmdAB = "SELECT public.execute_user_merge('$($ab[0])','$($ab[1])',NULL)->>'state';"
  $cmdBC = "SELECT public.execute_user_merge('$($bc[0])','$($bc[1])',NULL)->>'state';"
  $jobs = @(
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$cmdAB
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$cmdBC
  )
  $null = $jobs | Wait-Job | Receive-Job; $jobs | Remove-Job
  $brokenChain = Sql "SELECT count(*) FROM public.users s JOIN public.users c ON c.id=s.merged_into_user_id WHERE s.id IN('e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000004') AND c.identity_status='merged';"
  if ([int]$brokenChain -ne 0) { throw "Canonical was concurrently merged into another source" }

  $race = (NewOperation 'e2000000-0000-4000-8000-000000000006' 'e2000000-0000-4000-8000-000000000007' 'activation race').Split('|')
  $mergeCmd = "SELECT public.execute_user_merge('$($race[0])','$($race[1])',NULL)->>'state';"
  $activationCmd = "SELECT public.resolve_and_link_verified_auth_user('e1000000-0000-4000-8000-000000000001')->>'state';"
  $jobs = @(
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -At -c $q } -ArgumentList $psql,$database,$mergeCmd
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -At -c $q } -ArgumentList $psql,$database,$activationCmd
  )
  $null = $jobs | Wait-Job | Receive-Job -ErrorAction SilentlyContinue; $jobs | Remove-Job
  $unsafe = Sql "SELECT count(*) FROM public.users WHERE id='e2000000-0000-4000-8000-000000000006' AND identity_status='merged' AND auth_user_id IS NOT NULL;"
  if ([int]$unsafe -ne 0) { throw "Activation/merge race produced an authorized merged source" }
  Write-Output "Stage 3 concurrency passed: replay, canonical-chain exclusion, activation race."
}
finally { Sql $cleanup | Out-Null }
