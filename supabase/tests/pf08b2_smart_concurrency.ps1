param(
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('pf08b2r2-concurrency-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-LocalSql {
  param([string]$Sql)
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Local SQL failed: $($output -join [Environment]::NewLine)"
  }
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
    -WindowStyle Hidden `
    -PassThru
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

try {
  if (-not (Test-Path -LiteralPath $PsqlPath)) { throw "psql not found at $PsqlPath" }

  $statusLines = & npx supabase status 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'npx supabase status failed' }
  $status = ($statusLines | Where-Object { $_ -match '^\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if ($null -ne $status.linked_project) { throw 'Safety stop: Supabase project is linked' }
  if ($status.DB_URL -ne $expectedStatusUrl) { throw "Safety stop: unexpected DB_URL $($status.DB_URL)" }

  $identity = Invoke-LocalSql 'select current_database(),current_user,inet_server_addr(),inet_server_port();'
  if ($identity -notmatch '^postgres\|postgres\|') { throw "Safety stop: unexpected database identity $identity" }

  Invoke-LocalSql @"
UPDATE public.rewards_catalog SET fulfillment_type='service'
WHERE id='00000000-0000-4000-8000-000000009002';
"@ | Out-Null

  # Same-key race: exactly one new commit and one replay; only the new result can alert.
  $blocker = Start-LocalSql 'same-key-blocker' @"
BEGIN;
SELECT id FROM public.loyalty_memberships WHERE id='00000000-0000-4000-8000-000000002001' FOR UPDATE;
SELECT pg_sleep(4);
COMMIT;
"@
  Start-Sleep -Milliseconds 500
  $sameA = Start-LocalSql 'same-key-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','24000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000009002',NULL,NULL);
"@
  Start-Sleep -Milliseconds 250
  $sameB = Start-LocalSql 'same-key-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','24000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000009002',NULL,NULL);
"@
  $blockerResult = Wait-LocalSql $blocker
  $sameResultA = Wait-LocalSql $sameA
  $sameResultB = Wait-LocalSql $sameB
  if ($blockerResult.ExitCode -ne 0 -or $sameResultA.ExitCode -ne 0 -or $sameResultB.ExitCode -ne 0) {
    throw "Same-key race process failure: $($sameResultA.Error) $($sameResultB.Error)"
  }
  $sameOutput = $sameResultA.Output + $sameResultB.Output
  if (($sameOutput | Select-String -Pattern '"created": true' -AllMatches).Matches.Count -ne 1 -or
      ($sameOutput | Select-String -Pattern '"created": false' -AllMatches).Matches.Count -ne 1 -or
      ($sameOutput | Select-String -Pattern '"should_notify_staff": true' -AllMatches).Matches.Count -ne 1 -or
      ($sameOutput | Select-String -Pattern '"should_notify_staff": false' -AllMatches).Matches.Count -ne 1) {
    throw 'Same-key race did not return one notifying create and one non-notifying replay'
  }
  Invoke-LocalSql @"
DO `$test`$
DECLARE rid uuid;
BEGIN
 SELECT (result#>>'{data,id}')::uuid INTO rid
 FROM public.business_operation_idempotency
 WHERE operation='moviback_redemption' AND user_id='00000000-0000-4000-8000-000000001001'
   AND idempotency_key='24000000-0000-4000-8000-000000000001' AND status='committed';
 IF rid IS NULL
    OR (SELECT count(*) FROM public.reward_redemptions WHERE id=rid AND status='ready' AND fulfillment_type='service')<>1
    OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id=rid AND points_delta=-200)<>1
    OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id=rid)<>0 THEN
   RAISE EXCEPTION 'PF08B2R2_CONCURRENCY_SAME_KEY';
 END IF;
END `$test`$;
"@ | Out-Null

  # Two users compete for one finite reward unit under different keys.
  Invoke-LocalSql @"
INSERT INTO public.rewards_catalog(id,name,points_cost,is_active,stock_qty,reward_type,requires_store_variant,fulfillment_type)
VALUES ('00000000-0000-4000-8000-000000009201','PF08 SMART LAST REWARD',100,true,1,'club',false,'service');
"@ | Out-Null
  $rewardA = Start-LocalSql 'reward-race-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','24000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000009201',NULL,NULL);
"@
  $rewardB = Start-LocalSql 'reward-race-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001002','24000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000009201',NULL,NULL);
"@
  $rewardResultA = Wait-LocalSql $rewardA
  $rewardResultB = Wait-LocalSql $rewardB
  if ((@($rewardResultA,$rewardResultB) | Where-Object ExitCode -eq 0).Count -ne 1 -or
      (@($rewardResultA,$rewardResultB) | Where-Object ExitCode -ne 0).Count -ne 1 -or
      (($rewardResultA.Error + $rewardResultB.Error) -notmatch 'PF08_REWARD_OUT_OF_STOCK')) {
    throw 'Last-unit reward race did not produce exactly one winner and one expected loser'
  }
  Invoke-LocalSql @"
DO `$test`$
BEGIN
 IF (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009201')<>0
    OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id='00000000-0000-4000-8000-000000009201')<>1
    OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key IN ('24000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000003'))<>1 THEN
   RAISE EXCEPTION 'PF08B2R2_CONCURRENCY_LAST_REWARD';
 END IF;
END `$test`$;
"@ | Out-Null

  # Different rewards compete for the exact same one-unit null-size Store stock row.
  Invoke-LocalSql @"
UPDATE public.store_product_stock SET stock_qty=1 WHERE id='00000000-0000-4000-8000-000000008003';
INSERT INTO public.rewards_catalog(id,name,points_cost,is_active,stock_qty,reward_type,store_product_id,requires_store_variant,fulfillment_type)
VALUES
 ('00000000-0000-4000-8000-000000009202','PF08 SMART STORE RACE A',100,true,NULL,'club','00000000-0000-4000-8000-000000005003',false,'store_product'),
 ('00000000-0000-4000-8000-000000009203','PF08 SMART STORE RACE B',100,true,NULL,'club','00000000-0000-4000-8000-000000005003',false,'store_product');
"@ | Out-Null
  $storeA = Start-LocalSql 'store-race-a' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','24000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000009202','00000000-0000-4000-8000-000000006003',NULL);
"@
  $storeB = Start-LocalSql 'store-race-b' @"
SET ROLE service_role;
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001002','24000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000009203','00000000-0000-4000-8000-000000006003',NULL);
"@
  $storeResultA = Wait-LocalSql $storeA
  $storeResultB = Wait-LocalSql $storeB
  if ((@($storeResultA,$storeResultB) | Where-Object ExitCode -eq 0).Count -ne 1 -or
      (@($storeResultA,$storeResultB) | Where-Object ExitCode -ne 0).Count -ne 1 -or
      (($storeResultA.Error + $storeResultB.Error) -notmatch 'PF08_INSUFFICIENT_STORE_STOCK')) {
    throw 'Last-unit Store-stock race did not produce exactly one winner and one expected loser'
  }
  Invoke-LocalSql @"
DO `$test`$
DECLARE rid uuid;
BEGIN
 SELECT id INTO rid FROM public.reward_redemptions
 WHERE reward_id IN ('00000000-0000-4000-8000-000000009202','00000000-0000-4000-8000-000000009203');
 IF rid IS NULL
    OR (SELECT stock_qty FROM public.store_product_stock WHERE id='00000000-0000-4000-8000-000000008003')<>0
    OR (SELECT count(*) FROM public.reward_redemptions WHERE reward_id IN ('00000000-0000-4000-8000-000000009202','00000000-0000-4000-8000-000000009203'))<>1
    OR (SELECT count(*) FROM public.store_orders WHERE related_redemption_id=rid)<>1
    OR (SELECT count(*) FROM public.store_order_items WHERE order_id IN (SELECT id FROM public.store_orders WHERE related_redemption_id=rid))<>1
    OR (SELECT count(*) FROM public.business_operation_idempotency WHERE idempotency_key IN ('24000000-0000-4000-8000-000000000004','24000000-0000-4000-8000-000000000005'))<>1 THEN
   RAISE EXCEPTION 'PF08B2R2_CONCURRENCY_LAST_STORE_STOCK';
 END IF;
END `$test`$;
"@ | Out-Null

  Write-Output 'PF-08B2R2 concurrency PASS: same-key replay/no-alert, last reward unit, last Store-stock unit.'
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
