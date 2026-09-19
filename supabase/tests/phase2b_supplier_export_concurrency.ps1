param([string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe')

$ErrorActionPreference = 'Stop'
$env:DO_NOT_TRACK = '1'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('phase2b-export-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-LocalSql([string]$Sql) {
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output -join [Environment]::NewLine) }
  return ($output -join [Environment]::NewLine)
}

function Start-LocalSql([string]$Name, [string]$Sql) {
  $sqlPath = Join-Path $tempRoot ($Name + '.sql')
  $outPath = Join-Path $tempRoot ($Name + '.out')
  $errPath = Join-Path $tempRoot ($Name + '.err')
  [IO.File]::WriteAllText($sqlPath, "\set ON_ERROR_STOP on`r`n$Sql`r`n")
  $process = Start-Process -FilePath $PsqlPath -ArgumentList @($dbUrl,'-X','-At','-f',('"' + $sqlPath + '"')) `
    -RedirectStandardOutput $outPath -RedirectStandardError $errPath -WindowStyle Hidden -PassThru
  return [pscustomobject]@{ Process=$process; Out=$outPath; Err=$errPath }
}

function Wait-LocalSql($Job) {
  $Job.Process.WaitForExit()
  if ($Job.Process.ExitCode -ne 0) { throw (Get-Content -LiteralPath $Job.Err -Raw) }
  return Get-Content -LiteralPath $Job.Out -Raw
}

try {
  $status = ((& npx --no-install supabase status -o json 2>$null) -join [Environment]::NewLine) | ConvertFrom-Json
  if ($null -ne $status.linked_project -or $status.DB_URL -ne $expectedStatusUrl) {
    throw 'Safety stop: Supabase is not the expected unlinked local target'
  }

  Invoke-LocalSql @"
SET ROLE service_role;
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,order_type)
VALUES ('63000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'PHASE2B CONCURRENCY','catalog');
INSERT INTO public.store_order_items(id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,unit_price_euro,total_euro)
VALUES ('63000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','PF08 TEST PRODUCT A STOCK 10','PF08 BLUE','PF08-M',1,25,25);
"@ | Out-Null

  $a = Start-LocalSql 'a' "SET ROLE service_role; SELECT public.claim_supplier_export_batch('63000000-0000-4000-8000-000000000011','race-a');"
  $b = Start-LocalSql 'b' "SET ROLE service_role; SELECT public.claim_supplier_export_batch('63000000-0000-4000-8000-000000000012','race-b');"
  $outA = Wait-LocalSql $a
  $outB = Wait-LocalSql $b
  $combined = $outA + $outB
  if (($combined | Select-String -Pattern '"created": true' -AllMatches).Matches.Count -ne 1 -or
      ($combined | Select-String -Pattern '"empty": true' -AllMatches).Matches.Count -ne 1) {
    throw "Concurrent claims did not produce one batch and one empty result: $combined"
  }

  $check = Invoke-LocalSql @"
SELECT count(*) || '|' || count(DISTINCT supplier_export_batch_id)
FROM public.store_order_items
WHERE id='63000000-0000-4000-8000-000000000002' AND supplier_export_batch_id IS NOT NULL;
"@
  if ($check.Trim() -ne '1|1') { throw "Duplicate batch membership: $check" }

  $winnerKey = if ($outA -match '"created": true') { '63000000-0000-4000-8000-000000000011' } else { '63000000-0000-4000-8000-000000000012' }
  $replay = Invoke-LocalSql "SET ROLE service_role; SELECT public.claim_supplier_export_batch('$winnerKey','retry');"
  if ($replay -notmatch '"replayed": true') { throw 'Retry did not regenerate the existing batch membership' }

  Write-Output 'PHASE2B_CONCURRENCY_PASS: one claim, one empty concurrent result, immutable membership, same-key replay.'
}
finally {
  & npx --no-install supabase db reset 2>&1 | Out-Null
  $resolved = [IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolved.StartsWith($systemTemp,[StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolved).StartsWith('phase2b-export-',[StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
