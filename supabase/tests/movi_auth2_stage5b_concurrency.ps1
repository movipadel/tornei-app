$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$database = @("-h", "127.0.0.1", "-p", "55022", "-U", "postgres", "-d", "postgres")
$env:PGPASSWORD = "postgres"
if (-not (Test-Path -LiteralPath $psql)) { throw "psql not found at $psql" }
if (Test-Path -LiteralPath "supabase/.temp/project-ref") { throw "Linked Supabase project is not allowed" }
$status = npx supabase status -o json | ConvertFrom-Json
if ($status.API_URL -ne "http://127.0.0.1:55021" -or $status.DB_URL -notmatch "127\.0\.0\.1:55022") {
  throw "Unexpected Supabase target"
}
function Sql([string]$query) {
  $out = & $psql @database -v ON_ERROR_STOP=1 -At -c $query
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
  return ($out | Out-String).Trim()
}
function Race([string]$left,[string]$right) {
  $jobs = @(
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$left
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$right
  )
  $results = $jobs | Wait-Job | Receive-Job
  $failed = $jobs | Where-Object State -eq 'Failed'
  $jobs | Remove-Job -Force
  if ($failed) { throw "concurrent command failed" }
  return $results
}

$ids = @(
  '5bc00000-0000-4000-8000-000000000001','5bc00000-0000-4000-8000-000000000002',
  '5bc00000-0000-4000-8000-000000000003','5bc00000-0000-4000-8000-000000000004',
  '5bc00000-0000-4000-8000-000000000005','5bc00000-0000-4000-8000-000000000006'
)
$authIds = @('5ba00000-0000-4000-8000-000000000001','5ba00000-0000-4000-8000-000000000002')
$idList = ($ids | ForEach-Object { "'$_'" }) -join ','
$authList = ($authIds | ForEach-Object { "'$_'" }) -join ','
$cleanup = @"
SET session_replication_role=replica;
DELETE FROM public.user_legacy_login_events WHERE public_user_id IN($idList);
DELETE FROM public.user_auth_migration_events WHERE public_user_id IN($idList) OR auth_user_id IN($authList);
DELETE FROM public.user_auth_link_events WHERE public_user_id IN($idList) OR auth_user_id IN($authList);
DELETE FROM public.user_auth_onboarding WHERE auth_user_id IN($authList);
DELETE FROM public.user_identity_aliases WHERE source_user_id IN($idList) OR canonical_user_id IN($idList);
DELETE FROM public.users WHERE id IN($idList) OR auth_user_id IN($authList);
DELETE FROM auth.users WHERE id IN($authList);
SET session_replication_role=origin;
"@
$legacyEventBaseline = 0

try {
  Sql $cleanup | Out-Null
  $legacyEventBaseline = [long](Sql "SELECT coalesce(max(id),0) FROM public.user_legacy_login_events;")
  Sql @"
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES
 ('$($authIds[0])','stage5b-race-link@example.invalid',now(),now(),now()),
 ('$($authIds[1])','stage5b-race-signup@example.invalid',now(),now(),now());
INSERT INTO public.users(id,full_name,phone,email,gender) VALUES
 ('$($ids[0])','Activation Race','3479700001','stage5b-race-activation@example.invalid','M'),
 ('$($ids[1])','Link Race','3479700002','stage5b-race-link@example.invalid','F'),
 ('$($ids[2])','Merge Canonical','3479700003','stage5b-race-canonical@example.invalid','M'),
 ('$($ids[3])','Merge Source','3479700004','stage5b-race-merge@example.invalid','F'),
 ('$($ids[4])','Double Login','3479700005','stage5b-race-double@example.invalid','M');
SELECT public.prepare_user_auth_signup('$($authIds[1])','Signup Race','3479700006','F',true,true,true,false);
"@ | Out-Null

  $double = Race `
    "SELECT public.legacy_user_login_lookup('3479700005','stage5b-race-double@example.invalid')->>'state';" `
    "SELECT public.legacy_user_login_lookup('+39 347 970 0005','STAGE5B-RACE-DOUBLE@EXAMPLE.INVALID')->>'state';"
  if (($double | Where-Object { $_ -eq 'legacy_allowed' }).Count -ne 2) { throw "two legacy logins did not both succeed" }
  if ([int](Sql "SELECT count(*) FROM public.users WHERE id='$($ids[4])';") -ne 1) { throw "double login duplicated profile" }

  Race `
    "SELECT public.legacy_user_login_lookup('3479700001','stage5b-race-activation@example.invalid')->>'state';" `
    "SELECT public.start_user_auth_migration('$($ids[0])')->>'state';" | Out-Null
  if ((Sql "SELECT auth_migration_state FROM public.users WHERE id='$($ids[0])';") -ne 'activation_pending') { throw "activation race lost state" }

  $link = Race `
    "SELECT public.legacy_user_login_lookup('3479700002','stage5b-race-link@example.invalid')->>'state';" `
    "SELECT public.resolve_and_link_verified_auth_user('$($authIds[0])')->>'state';"
  if (-not ($link -contains 'linked')) { throw "link race did not link" }
  if ([int](Sql "SELECT count(*) FROM public.users WHERE id='$($ids[1])' AND auth_user_id='$($authIds[0])';") -ne 1) { throw "link race changed identity" }

  Race `
    "SELECT public.legacy_user_login_lookup('3479700004','stage5b-race-merge@example.invalid')->>'state';" `
    "UPDATE public.users SET identity_status='merged',merged_into_user_id='$($ids[2])',merged_at=now() WHERE id='$($ids[3])'; SELECT 'merged';" | Out-Null
  if ((Sql "SELECT identity_status FROM public.users WHERE id='$($ids[3])';") -ne 'merged') { throw "merge race did not converge" }

  $signup = Race `
    "SELECT public.legacy_user_login_lookup('3479700006','stage5b-race-signup@example.invalid')->>'state';" `
    "SELECT public.finalize_verified_auth_signup('$($authIds[1])')->>'state';"
  if (-not ($signup -contains 'linked')) { throw "signup race did not create linked Auth profile" }
  if ([int](Sql "SELECT count(*) FROM public.users WHERE public.normalize_user_email(email)='stage5b-race-signup@example.invalid';") -ne 1) { throw "signup race duplicated identity" }

  Write-Output "Stage 5B concurrency passed: login/activation, login/link, login/merge, dual login and signup/login converge without duplicate users."
}
finally {
  Sql "SET session_replication_role=replica; DELETE FROM public.user_legacy_login_events WHERE id>$legacyEventBaseline; SET session_replication_role=origin;" | Out-Null
  Sql $cleanup | Out-Null
}
