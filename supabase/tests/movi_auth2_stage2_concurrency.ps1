$ErrorActionPreference = "Stop"

$status = npx supabase status -o json | ConvertFrom-Json
if ($status.API_URL -ne "http://127.0.0.1:55021" -or $status.DB_URL -notmatch "127\.0\.0\.1:55022") {
  throw "Stage 2 concurrency tests require the verified local Supabase target"
}

$container = "supabase_db_tornei-app"
function Invoke-Stage2Sql([string]$Sql) {
  $output = docker exec $container psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
  return ($output | Out-String).Trim()
}

$cleanup = @"
DELETE FROM public.users WHERE email LIKE '%concurrency.stage2@example.invalid';
DELETE FROM auth.users WHERE id::text LIKE 'c1000000-0000-4000-8000-00000000000%';
"@

try {
  Invoke-Stage2Sql $cleanup | Out-Null
  Invoke-Stage2Sql @"
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('c1000000-0000-4000-8000-000000000001','activation.concurrency.stage2@example.invalid',now(),now(),now()),
 ('c1000000-0000-4000-8000-000000000002','signup-a.concurrency.stage2@example.invalid',now(),now(),now()),
 ('c1000000-0000-4000-8000-000000000003','signup-b.concurrency.stage2@example.invalid',now(),now(),now()),
 ('c1000000-0000-4000-8000-000000000004','race.concurrency.stage2@example.invalid',now(),now(),now()),
 ('c1000000-0000-4000-8000-000000000005',' RACE.CONCURRENCY.STAGE2@EXAMPLE.INVALID ',now(),now(),now());
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('c2000000-0000-4000-8000-000000000001','Concurrent Activation','3476000001','activation.concurrency.stage2@example.invalid','M'),
 ('c2000000-0000-4000-8000-000000000002','Activation Signup Race','3476000004','race.concurrency.stage2@example.invalid','F');
SELECT public.prepare_user_auth_signup('c1000000-0000-4000-8000-000000000002','Signup A','3476000002','M',true,true,true,false);
SELECT public.prepare_user_auth_signup('c1000000-0000-4000-8000-000000000003','Signup B','+39 347 600 0002','F',true,true,true,false);
SELECT public.prepare_user_auth_signup('c1000000-0000-4000-8000-000000000005','Race Signup','3476000005','F',true,true,true,false);
"@ | Out-Null

  $activationSql = "SELECT public.resolve_and_link_verified_auth_user('c1000000-0000-4000-8000-000000000001')->>'state';"
  $jobs = 1..2 | ForEach-Object { Start-Job -ScriptBlock { param($c,$s) docker exec $c psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $s } -ArgumentList $container,$activationSql }
  $activationResults = $jobs | Wait-Job | Receive-Job
  $jobs | Remove-Job
  if (($activationResults | Where-Object { $_ -eq "linked" }).Count -ne 2) { throw "Concurrent activation did not converge" }

  $signupSqlA = "SELECT public.finalize_verified_auth_signup('c1000000-0000-4000-8000-000000000002')->>'state';"
  $signupSqlB = "SELECT public.finalize_verified_auth_signup('c1000000-0000-4000-8000-000000000003')->>'state';"
  $jobs = @(
    Start-Job -ScriptBlock { param($c,$s) docker exec $c psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $s } -ArgumentList $container,$signupSqlA
    Start-Job -ScriptBlock { param($c,$s) docker exec $c psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $s } -ArgumentList $container,$signupSqlB
  )
  $signupResults = $jobs | Wait-Job | Receive-Job
  $jobs | Remove-Job
  if (($signupResults | Where-Object { $_ -eq "linked" }).Count -ne 1 -or ($signupResults | Where-Object { $_ -eq "conflict" }).Count -ne 1) {
    throw "Normalized-phone concurrent signup was not deterministic"
  }

  $raceActivation = "SELECT public.resolve_and_link_verified_auth_user('c1000000-0000-4000-8000-000000000004')->>'state';"
  $raceSignup = "SELECT public.finalize_verified_auth_signup('c1000000-0000-4000-8000-000000000005')->>'state';"
  $jobs = @(
    Start-Job -ScriptBlock { param($c,$s) docker exec $c psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $s } -ArgumentList $container,$raceActivation
    Start-Job -ScriptBlock { param($c,$s) docker exec $c psql -v ON_ERROR_STOP=1 -At -U postgres -d postgres -c $s } -ArgumentList $container,$raceSignup
  )
  $raceResults = $jobs | Wait-Job | Receive-Job
  $jobs | Remove-Job
  if (($raceResults | Where-Object { $_ -eq "linked" }).Count -ne 1 -or ($raceResults | Where-Object { $_ -eq "conflict" }).Count -ne 1) {
    throw "Activation/signup race was not deterministic"
  }

  Write-Output "Stage 2 concurrency passed: activation replay, normalized-phone signup, activation/signup race."
}
finally {
  Invoke-Stage2Sql $cleanup | Out-Null
}
