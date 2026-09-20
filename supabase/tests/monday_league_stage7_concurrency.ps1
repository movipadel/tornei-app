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
  } }
  $jobs | Wait-Job | Out-Null
  $outputs = @($jobs | ForEach-Object { (Receive-Job $_) -join "`n" })
  $jobs | Remove-Job -Force
  return $outputs
}

$source = Get-Content -LiteralPath "$PSScriptRoot\monday_league_stage7_notifications.sql" -Raw
$setup = $source.Substring(0,$source.IndexOf("SET LOCAL ROLE service_role;")) + "COMMIT;"
$cleanup = @'
BEGIN;
DELETE FROM public.communications WHERE event_key LIKE 'league:73000000-0000-4000-8000-000000000001:%';
DELETE FROM public.league_audit_events WHERE season_id='73000000-0000-4000-8000-000000000001';
DELETE FROM public.league_notification_events WHERE season_id='73000000-0000-4000-8000-000000000001';
DELETE FROM public.league_matches WHERE phase_id='76000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phase_teams WHERE phase_id='76000000-0000-4000-8000-000000000001';
DELETE FROM public.league_rounds WHERE phase_id='76000000-0000-4000-8000-000000000001';
DELETE FROM public.league_phases WHERE id='76000000-0000-4000-8000-000000000001';
DELETE FROM public.league_teams WHERE season_id='73000000-0000-4000-8000-000000000001';
DELETE FROM public.league_seasons WHERE id='73000000-0000-4000-8000-000000000001';
DELETE FROM public.league_venues WHERE id='76000000-0000-4000-8000-000000000010';
DELETE FROM public.staff_users WHERE id='72000000-0000-4000-8000-000000000001';
DELETE FROM public.users WHERE id::text LIKE '71000000-0000-4000-8000-00000000000%';
COMMIT;
'@

try {
  [void](Sql $setup)
  [void](Sql @"
INSERT INTO public.league_notification_events(event_type,season_id,match_id,team_id,recipient_user_id,idempotency_key,due_at,title,body)
VALUES('match_reminder','73000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001',
'74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','s7-concurrency-single',now(),'S7','S7');
"@)
  $left = "SELECT id FROM public.league_claim_notification_events('79000000-0000-4000-8000-000000000011',1);"
  $right = "SELECT id FROM public.league_claim_notification_events('79000000-0000-4000-8000-000000000012',1);"
  $outputs = Race $left $right
  $claimed = @($outputs | Where-Object { $_ -match '^[0-9a-f-]{36}$' })
  if ($claimed.Count -ne 1) { throw "Expected one total claim, got $($claimed.Count): $outputs" }
  $state = (Sql "SELECT status||':'||attempts||':'||(locked_by IS NOT NULL)::int FROM public.league_notification_events WHERE idempotency_key='s7-concurrency-single';").Trim()
  if ($state -ne 'processing:1:1') { throw "Invalid claim state: $state" }
  Write-Output "monday_league_stage7_concurrency: ok"
}
finally { [void](Sql $cleanup) }
