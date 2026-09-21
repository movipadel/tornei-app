$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"
$BaseUrl = "http://127.0.0.1:3198"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -X -v ON_ERROR_STOP=1 -At 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed: $output" }
  return ($output -join "`n")
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_prerelease_h3_captain_context.sql" -Raw
$fixture = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + @'
UPDATE public.league_result_submissions SET submitted_at=now()-interval '49 hours'
WHERE id='a1900000-0000-4000-8000-000000000001';
UPDATE public.league_seasons SET public_visibility='public',published_at=now()
WHERE id='a1300000-0000-4000-8000-000000000001';
COMMIT;
'@
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

$statusRaw = npx supabase status -o json | Out-String
if ($LASTEXITCODE -ne 0) { throw "Cannot verify local Supabase" }
$status = $statusRaw | ConvertFrom-Json
if ($null -ne $status.linked_project -or $status.API_URL -ne "http://127.0.0.1:55021" -or $status.DB_URL -ne $Database) {
  throw "Safety stop: unexpected Supabase target"
}

$env:NEXT_PUBLIC_SUPABASE_URL = $status.API_URL
$env:SUPABASE_URL = $status.API_URL
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:USER_COOKIE_SECRET = "h3-local-user-runtime-secret-with-at-least-32-characters"
$env:STAFF_COOKIE_SECRET = "h3-local-staff-runtime-secret-with-at-least-32-characters"
$stdout = Join-Path $env:TEMP "monday-league-h3-next.stdout.log"
$stderr = Join-Path $env:TEMP "monday-league-h3-next.stderr.log"
$server = $null

try {
  [void](Sql $cleanup)
  [void](Sql $fixture)
  $node = (Get-Command node -ErrorAction Stop).Source
  $server = Start-Process -FilePath $node -ArgumentList @("node_modules/next/dist/bin/next","start","-p","3198") `
    -WorkingDirectory (Resolve-Path "$PSScriptRoot\..\..") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $probe = Invoke-WebRequest -Uri "$BaseUrl/api/monday-league" -SkipHttpErrorCheck -TimeoutSec 2
      if ($probe.StatusCode -in 200,404) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw "Local Next server did not become ready" }

  $login = Invoke-WebRequest -Uri "$BaseUrl/api/user/login" -Method Post -ContentType "application/json" `
    -Body (@{ full_name="H3 Captain A"; phone="+390000013101"; email="h3-a@example.invalid"; gender="M"; privacy_accepted=$true; terms_accepted=$true; age_confirmed=$true; marketing_accepted=$false } | ConvertTo-Json) `
    -SkipHttpErrorCheck
  if ($login.StatusCode -ne 200) { throw "Local captain login failed: $($login.StatusCode) $($login.Content)" }
  $setCookie = [string]$login.Headers["Set-Cookie"]
  if ($setCookie -notmatch "user_session=([^;]+)") { throw "Local login did not return a user session" }
  $headers = @{ Cookie = "user_session=$($Matches[1])" }

  $response = Invoke-WebRequest -Uri "$BaseUrl/api/monday-league/teams/h3-a" -Headers $headers -SkipHttpErrorCheck
  if ($response.StatusCode -ne 200) { throw "Team API failed: $($response.StatusCode) $($response.Content)" }
  $body = $response.Content | ConvertFrom-Json
  if (-not $body.available -or -not $body.found) { throw "Team API did not return the public H3 fixture" }
  if ($body.captain.match_id -ne "a1800000-0000-4000-8000-000000000002" -or -not $body.captain.can_submit_lineup -or $body.captain.lineup_locked) {
    throw "Team API did not expose the next actionable lineup match"
  }
  if ($body.captain.result.match_id -ne "a1800000-0000-4000-8000-000000000001" -or
      $body.captain.result.effective_status -ne "confirmed" -or
      $body.captain.result.can_submit_result -or $body.captain.result.can_contest_result) {
    throw "Team API result context did not preserve final historical state"
  }
  $prior = @($body.team.schedule | Where-Object id -eq "a1800000-0000-4000-8000-000000000001")
  if ($prior.Count -ne 1 -or $null -eq $prior[0].result) { throw "Prior result disappeared from team history" }

  Write-Output "monday_league_prerelease_h3_endpoint: ok"
}
finally {
  if ($null -ne $server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  [void](Sql $cleanup)
  Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
}
