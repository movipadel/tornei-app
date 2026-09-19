param([string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe')

$ErrorActionPreference = 'Stop'
$env:DO_NOT_TRACK = '1'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('phase2c-cancel-' + [guid]::NewGuid().ToString('N'))
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
VALUES ('75000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',50,0,'PHASE2C CONCURRENCY','catalog');
INSERT INTO public.store_order_items(id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,unit_price_euro,total_euro)
VALUES ('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','PF08 TEST PRODUCT A STOCK 10','PF08 BLUE','PF08-M',2,25,50);
"@ | Out-Null

  $before = [int](Invoke-LocalSql "SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001';")
  $a = Start-LocalSql 'yes' "SET ROLE service_role; SELECT public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000011','75000000-0000-4000-8000-000000000001','Concurrent decision',true);"
  $b = Start-LocalSql 'no' "SET ROLE service_role; SELECT public.cancel_physical_store_order('aaaaaaaa-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000012','75000000-0000-4000-8000-000000000001','Concurrent decision',false);"
  $outA = Wait-LocalSql $a
  $outB = Wait-LocalSql $b

  $check = Invoke-LocalSql @"
SELECT status || '|' || cancellation_reintegrate_stock::text || '|' ||
       (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008001') || '|' ||
       (SELECT count(*) FROM public.business_operation_idempotency WHERE operation='store_order_cancel' AND user_id='00000000-0000-4000-8000-000000001001' AND status='committed')
FROM public.store_orders WHERE id='75000000-0000-4000-8000-000000000001';
"@
  $parts = $check.Trim().Split('|')
  if ($parts[0] -ne 'cancelled' -or [int]$parts[3] -ne 2) { throw "Invalid terminal/idempotency state: $check" }
  $expectedStock = if ($parts[1] -eq 'true') { $before + 2 } else { $before }
  if ([int]$parts[2] -ne $expectedStock) { throw "Stock does not match first terminal decision: $check" }
  if (($outA + $outB | Select-String -Pattern '"applied": true' -AllMatches).Matches.Count -ne 1) {
    throw "Expected exactly one applied cancellation: $outA $outB"
  }

  Write-Output 'PHASE2C_CONCURRENCY_PASS: one terminal decision, one exact stock outcome, two committed safe command results.'
}
finally {
  & npx --no-install supabase db reset 2>&1 | Out-Null
  $resolved = [IO.Path]::GetFullPath($tempRoot)
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolved.StartsWith($systemTemp,[StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolved).StartsWith('phase2c-cancel-',[StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
