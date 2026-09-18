param(
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'
$env:DO_NOT_TRACK = '1'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('pf08b2r3-concurrency-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-LocalSql {
  param([string]$Sql)
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local SQL failed: $($output -join [Environment]::NewLine)" }
  return ($output -join [Environment]::NewLine)
}

function Start-LocalSql {
  param([string]$Name, [string]$Sql)
  $sqlPath = Join-Path $tempRoot ($Name + '.sql')
  $stdoutPath = Join-Path $tempRoot ($Name + '.out')
  $stderrPath = Join-Path $tempRoot ($Name + '.err')
  [IO.File]::WriteAllText($sqlPath, "\set ON_ERROR_STOP on`r`n$Sql`r`n")
  $process = Start-Process -FilePath $PsqlPath `
    -ArgumentList @($dbUrl, '-X', '-At', '-f', ('"' + $sqlPath + '"')) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden -PassThru
  return [pscustomobject]@{ Process=$process; Stdout=$stdoutPath; Stderr=$stderrPath }
}

function Wait-LocalSql {
  param($Job)
  $Job.Process.WaitForExit()
  return [pscustomobject]@{
    ExitCode=$Job.Process.ExitCode
    Output=if (Test-Path $Job.Stdout) { Get-Content -LiteralPath $Job.Stdout -Raw } else { '' }
    Error=if (Test-Path $Job.Stderr) { Get-Content -LiteralPath $Job.Stderr -Raw } else { '' }
  }
}

function Assert-TwoSuccesses {
  param($A, $B, [string]$Label)
  if ($A.ExitCode -ne 0 -or $B.ExitCode -ne 0) {
    throw "$Label expected two successes: $($A.Error) $($B.Error)"
  }
}

try {
  if (-not (Test-Path -LiteralPath $PsqlPath)) { throw "psql not found at $PsqlPath" }

  $statusLines = & npx --no-install supabase status -o json 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'npx supabase status failed' }
  $status = ($statusLines -join [Environment]::NewLine) | ConvertFrom-Json
  if ($null -ne $status.linked_project) { throw 'Safety stop: Supabase project is linked' }
  if ($status.DB_URL -ne $expectedStatusUrl) { throw 'Safety stop: unexpected local database URL' }
  $identity = Invoke-LocalSql 'select current_database(),current_user,inet_server_addr(),inet_server_port();'
  if ($identity -notmatch '^postgres\|postgres\|') { throw "Safety stop: unexpected database identity $identity" }

  Invoke-LocalSql @"
INSERT INTO public.store_products(id,category_id,line_id,name,base_price_euro,base_price_points,allow_euro,allow_points,allow_mixed,is_active,sort_order)
VALUES
 ('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','PF08B2R3 CONCURRENT TRACKED',0,0,false,true,false,true,920),
 ('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000004001','00000000-0000-4000-8000-000000004101','PF08B2R3 CONCURRENT STOCKLESS',0,0,false,true,false,true,921);
INSERT INTO public.store_product_colors(id,product_id,color_name,is_active,sort_order)
VALUES
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','TRACKED',true,1),
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','METADATA ONLY',true,1);
INSERT INTO public.store_product_sizes(id,product_id,size_label,is_active,sort_order)
VALUES
 ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','UNICA',true,1),
 ('43000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','UNICA',true,1);
INSERT INTO public.store_product_stock(id,product_id,color_id,size_id,stock_qty,sku,is_active)
VALUES ('44000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',1,'PF08B2R3-LAST',true);
INSERT INTO public.rewards_catalog(id,name,points_cost,is_active,stock_qty,reward_type,store_product_id,requires_store_variant,fulfillment_type)
VALUES
 ('45000000-0000-4000-8000-000000000001','PF08B2R3 TRACKED RACE',100,true,NULL,'club','41000000-0000-4000-8000-000000000001',false,'store_product'),
 ('45000000-0000-4000-8000-000000000002','PF08B2R3 STOCKLESS RACE',100,true,NULL,'club','41000000-0000-4000-8000-000000000002',false,'store_product');
"@ | Out-Null

  # One finite stock unit under different users/keys: exactly one winner.
  $trackedA = Start-LocalSql 'tracked-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',NULL,NULL);
"@
  $trackedB = Start-LocalSql 'tracked-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001002','46000000-0000-4000-8000-000000000002','45000000-0000-4000-8000-000000000001',NULL,NULL);
"@
  $trackedResultA = Wait-LocalSql $trackedA
  $trackedResultB = Wait-LocalSql $trackedB
  if ((@($trackedResultA,$trackedResultB) | Where-Object ExitCode -eq 0).Count -ne 1 -or
      (@($trackedResultA,$trackedResultB) | Where-Object ExitCode -ne 0).Count -ne 1 -or
      (($trackedResultA.Error + $trackedResultB.Error) -notmatch 'PF08_INSUFFICIENT_STORE_STOCK')) {
    throw 'Tracked last-unit race did not produce one winner and one expected loser'
  }
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT stock_qty FROM public.store_product_stock WHERE id='44000000-0000-4000-8000-000000000001')<>0
    OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id='45000000-0000-4000-8000-000000000001')<>1
    OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id IN (SELECT id FROM public.reward_redemptions WHERE reward_id='45000000-0000-4000-8000-000000000001'))<>1 THEN
   RAISE EXCEPTION 'PF08B2R3_CONCURRENCY_TRACKED';
 END IF;
END `$test`$;
"@ | Out-Null

  # Stockless/untracked inventory does not serialize unrelated customers.
  $stocklessA = Start-LocalSql 'stockless-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000003','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $stocklessB = Start-LocalSql 'stockless-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001002','46000000-0000-4000-8000-000000000004','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $stocklessResultA = Wait-LocalSql $stocklessA
  $stocklessResultB = Wait-LocalSql $stocklessB
  Assert-TwoSuccesses $stocklessResultA $stocklessResultB 'Stockless different-user race'
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT count(*) FROM public.reward_redemptions WHERE reward_id='45000000-0000-4000-8000-000000000002')<>2
    OR (SELECT count(*) FROM public.store_product_stock WHERE product_id='41000000-0000-4000-8000-000000000002')<>0
    OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id IN (SELECT id FROM public.reward_redemptions WHERE reward_id='45000000-0000-4000-8000-000000000002'))<>2 THEN
   RAISE EXCEPTION 'PF08B2R3_CONCURRENCY_STOCKLESS_USERS';
 END IF;
END `$test`$;
"@ | Out-Null

  # Same user + same key: one commit and one replay, never duplicate work/alert.
  $sameA = Start-LocalSql 'same-key-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000005','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $sameB = Start-LocalSql 'same-key-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000005','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $sameResultA = Wait-LocalSql $sameA
  $sameResultB = Wait-LocalSql $sameB
  Assert-TwoSuccesses $sameResultA $sameResultB 'Stockless same-key race'
  $sameOutput = $sameResultA.Output + $sameResultB.Output
  if (($sameOutput | Select-String -Pattern '"created": true' -AllMatches).Matches.Count -ne 1 -or
      ($sameOutput | Select-String -Pattern '"created": false' -AllMatches).Matches.Count -ne 1 -or
      ($sameOutput | Select-String -Pattern '"should_notify_staff": true' -AllMatches).Matches.Count -ne 1) {
    throw 'Same-key race did not return one create and one replay'
  }
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT count(*) FROM public.business_operation_idempotency WHERE user_id='00000000-0000-4000-8000-000000001001' AND idempotency_key='46000000-0000-4000-8000-000000000005')<>1
    OR (SELECT count(*) FROM public.reward_redemptions WHERE id=(SELECT (result#>>'{data,id}')::uuid FROM public.business_operation_idempotency WHERE user_id='00000000-0000-4000-8000-000000001001' AND idempotency_key='46000000-0000-4000-8000-000000000005'))<>1 THEN
   RAISE EXCEPTION 'PF08B2R3_CONCURRENCY_SAME_KEY';
 END IF;
END `$test`$;
"@ | Out-Null

  # Same user + different keys is intentionally two independent redemptions.
  $differentA = Start-LocalSql 'different-key-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000006','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $differentB = Start-LocalSql 'different-key-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','46000000-0000-4000-8000-000000000007','45000000-0000-4000-8000-000000000002',NULL,NULL);
"@
  $differentResultA = Wait-LocalSql $differentA
  $differentResultB = Wait-LocalSql $differentB
  Assert-TwoSuccesses $differentResultA $differentResultB 'Stockless different-key race'
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT count(*) FROM public.business_operation_idempotency WHERE user_id='00000000-0000-4000-8000-000000001001' AND idempotency_key IN ('46000000-0000-4000-8000-000000000006','46000000-0000-4000-8000-000000000007'))<>2 THEN
   RAISE EXCEPTION 'PF08B2R3_CONCURRENCY_DIFFERENT_KEYS';
 END IF;
END `$test`$;
"@ | Out-Null

  Write-Output 'PF-08B2R3 concurrency PASS: finite last unit, stockless parallelism, same-key replay, different keys.'
}
finally {
  # Return the local database to the reproducible migration/seed baseline.
  & npx --no-install supabase db reset 2>&1 | Out-Null
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  $resolvedSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedTemp).StartsWith('pf08b2r3-concurrency-', [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
