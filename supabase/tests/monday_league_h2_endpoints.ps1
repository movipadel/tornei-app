$ErrorActionPreference = "Stop"
$Psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$Database = "postgresql://postgres:postgres@127.0.0.1:55022/postgres"
$BaseUrl = "http://127.0.0.1:3197"
$SeasonId = "a3000000-0000-4000-8000-000000000001"
$StaffId = "a2000000-0000-4000-8000-000000000001"

function Sql([string]$Query) {
  $output = $Query | & $Psql $Database -X -v ON_ERROR_STOP=1 -At 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL command failed: $output" }
  return ($output -join "`n")
}

$cleanup = @"
DELETE FROM public.league_phases WHERE season_id='$SeasonId';
DELETE FROM public.league_seasons WHERE id='$SeasonId';
DELETE FROM public.staff_users WHERE id='$StaffId';
"@
$setup = @"
INSERT INTO public.staff_users(id,full_name,email,password_hash,role,is_active)
VALUES('$StaffId','H2 Local Admin','h2-admin@example.invalid',extensions.crypt('h2-local-password',extensions.gen_salt('bf')),'admin',true);
INSERT INTO public.league_seasons(id,name,slug,status) VALUES('$SeasonId','H2 Local Season','h2-local-season','phase2');
INSERT INTO public.league_phases(id,season_id,code,name,sequence,status,source_phase_id) VALUES
 ('a6000000-0000-4000-8000-000000000001','$SeasonId','phase1','Fase 1',1,'generated',NULL),
 ('a6000000-0000-4000-8000-00000000000b','$SeasonId','serie_b','Serie B',3,'in_progress','a6000000-0000-4000-8000-000000000001'),
 ('a6000000-0000-4000-8000-00000000000a','$SeasonId','serie_a','Serie A',2,'in_progress','a6000000-0000-4000-8000-000000000001');
"@

$statusRaw = npx supabase status -o json | Out-String
if ($LASTEXITCODE -ne 0) { throw "Cannot verify local Supabase" }
$status = $statusRaw | ConvertFrom-Json
if ($null -ne $status.linked_project -or $status.API_URL -ne "http://127.0.0.1:55021" -or $status.DB_URL -ne $Database) {
  throw "Safety stop: unexpected Supabase target"
}

$env:NEXT_PUBLIC_SUPABASE_URL = $status.API_URL
$env:SUPABASE_URL = $status.API_URL
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
$env:STAFF_COOKIE_SECRET = "h2-local-runtime-secret-with-at-least-32-characters"
$env:USER_COOKIE_SECRET = "h2-local-user-secret-with-at-least-32-characters"
$stdout = Join-Path $env:TEMP "monday-league-h2-next.stdout.log"
$stderr = Join-Path $env:TEMP "monday-league-h2-next.stderr.log"
$server = $null

try {
  [void](Sql $cleanup)
  [void](Sql $setup)
  $node = (Get-Command node -ErrorAction Stop).Source
  $server = Start-Process -FilePath $node -ArgumentList @("node_modules/next/dist/bin/next","start","-p","3197") `
    -WorkingDirectory (Resolve-Path "$PSScriptRoot\..\..") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $probe = Invoke-WebRequest -Uri "$BaseUrl/api/admin/me" -SkipHttpErrorCheck -TimeoutSec 2
      if ($probe.StatusCode -in 200,401,403) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw "Local Next server did not become ready" }

  $web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $login = Invoke-WebRequest -Uri "$BaseUrl/api/admin/login" -Method Post -WebSession $web `
    -ContentType "application/x-www-form-urlencoded" -Body @{ email="h2-admin@example.invalid"; password="h2-local-password" } -SkipHttpErrorCheck
  if ($login.StatusCode -ne 200) { throw "Local admin login failed: $($login.StatusCode)" }
  $setCookie = [string]$login.Headers["Set-Cookie"]
  if ($setCookie -notmatch "staff_session=([^;]+)") { throw "Local admin login did not return a session cookie" }
  $authHeaders = @{ Cookie = "staff_session=$($Matches[1])" }

  $results = Invoke-WebRequest -Uri "$BaseUrl/api/admin/monday-league/results" -Headers $authHeaders -SkipHttpErrorCheck
  $standings = Invoke-WebRequest -Uri "$BaseUrl/api/admin/monday-league/standings" -Headers $authHeaders -SkipHttpErrorCheck
  if ($results.StatusCode -ne 200 -or $standings.StatusCode -ne 200) {
    throw "H2 endpoint returned non-success: results=$($results.StatusCode) $($results.Content); standings=$($standings.StatusCode) $($standings.Content)"
  }
  $resultsJson = $results.Content | ConvertFrom-Json
  $standingsJson = $standings.Content | ConvertFrom-Json
  if ($null -eq $resultsJson.data -or $null -eq $standingsJson.data) { throw "H2 endpoint returned null data" }
  $expected = "phase1,serie_a,serie_b"
  if (($resultsJson.data.phases.code -join ",") -ne $expected -or ($standingsJson.data.phases.code -join ",") -ne $expected) {
    throw "Phases are not ordered by sequence"
  }

  [void](Sql $cleanup)
  $emptyResults = Invoke-WebRequest -Uri "$BaseUrl/api/admin/monday-league/results" -Headers $authHeaders -SkipHttpErrorCheck
  $emptyStandings = Invoke-WebRequest -Uri "$BaseUrl/api/admin/monday-league/standings" -Headers $authHeaders -SkipHttpErrorCheck
  if ($emptyResults.StatusCode -ne 200 -or
      $emptyStandings.StatusCode -ne 200 -or
      $null -ne (($emptyResults.Content | ConvertFrom-Json).data) -or
      $null -ne (($emptyStandings.Content | ConvertFrom-Json).data)) {
    throw "Legitimate no-season state is not a successful null response"
  }
  Write-Output "monday_league_h2_endpoints: ok"
}
finally {
  [void](Sql $cleanup)
  if ($null -ne $server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
}
