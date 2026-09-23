$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$database = @("-h", "127.0.0.1", "-p", "55022", "-U", "postgres", "-d", "postgres")
$env:PGPASSWORD = "postgres"

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

$client = "e" * 64
$identity = "f" * 64
$otherClient = "1" * 64
$otherIdentity = "2" * 64
$base = "2026-09-23 12:00:00+00"
$cleanup = "DELETE FROM public.legacy_login_rate_limits WHERE bucket_key IN ('$client','$identity','$otherClient','$otherIdentity');"

try {
  Sql $cleanup | Out-Null
  1..7 | ForEach-Object {
    $value = Sql "SELECT public.consume_legacy_login_rate_limit('$client','$identity','$base'::timestamptz)->>'allowed';"
    if ($value -ne "true") { throw "unexpected early block" }
  }

  $query = "SELECT public.consume_legacy_login_rate_limit('$client','$identity','$base'::timestamptz)->>'allowed';"
  $jobs = @(
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$query
    Start-Job -ScriptBlock { param($p,$d,$q) $env:PGPASSWORD='postgres'; & $p @d -v ON_ERROR_STOP=1 -At -c $q } -ArgumentList $psql,$database,$query
  )
  $results = @($jobs | Wait-Job | Receive-Job | Where-Object { $_ -in @("true","false") })
  $jobs | Remove-Job -Force
  if (($results | Where-Object { $_ -eq "true" }).Count -ne 1 -or ($results | Where-Object { $_ -eq "false" }).Count -ne 1) {
    throw "threshold race did not serialize: $($results -join ',')"
  }
  $other = Sql "SELECT public.consume_legacy_login_rate_limit('$otherClient','$otherIdentity','$base'::timestamptz)->>'allowed';"
  if ($other -ne "true") { throw "separate client was blocked" }
  Write-Output "MOVI Auth final remediation concurrency PASS: threshold race serialized and separate client remained independent."
}
finally {
  Sql $cleanup | Out-Null
}
