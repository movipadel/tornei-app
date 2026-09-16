param(
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('pf08b2l-concurrency-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Invoke-LocalSql {
  param([string]$Sql)
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Local SQL failed: $($output -join [Environment]::NewLine)" }
  return ($output -join [Environment]::NewLine)
}

function Start-LocalSql {
  param([string]$Name,[string]$Sql)
  $sqlPath = Join-Path $tempRoot ($Name + '.sql')
  $stdoutPath = Join-Path $tempRoot ($Name + '.out')
  $stderrPath = Join-Path $tempRoot ($Name + '.err')
  [IO.File]::WriteAllText($sqlPath,"\set ON_ERROR_STOP on`r`n$Sql`r`n")
  $process = Start-Process -FilePath $PsqlPath `
    -ArgumentList @($dbUrl,'-X','-At','-f',('"' + $sqlPath + '"')) `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru
  return [pscustomobject]@{Process=$process;Stdout=$stdoutPath;Stderr=$stderrPath}
}

function Wait-LocalSql {
  param($Job)
  $Job.Process.WaitForExit()
  return [pscustomobject]@{
    ExitCode=$Job.Process.ExitCode
    Output=if(Test-Path $Job.Stdout){Get-Content -LiteralPath $Job.Stdout -Raw}else{''}
    Error=if(Test-Path $Job.Stderr){Get-Content -LiteralPath $Job.Stderr -Raw}else{''}
  }
}

try {
  if(-not(Test-Path -LiteralPath $PsqlPath)){throw "psql not found at $PsqlPath"}
  $statusLines=& npx supabase status 2>$null
  if($LASTEXITCODE -ne 0){throw 'npx supabase status failed'}
  $status=($statusLines|Where-Object{$_ -match '^\{'}|Select-Object -Last 1)|ConvertFrom-Json
  if($null -ne $status.linked_project){throw 'Safety stop: Supabase project is linked'}
  if($status.DB_URL -ne $expectedStatusUrl){throw "Safety stop: unexpected DB_URL $($status.DB_URL)"}
  $identity=Invoke-LocalSql 'select current_database(),current_user,inet_server_addr(),inet_server_port();'
  if($identity -notmatch '^postgres\|postgres\|'){throw "Safety stop: unexpected database identity $identity"}

  Invoke-LocalSql @"
UPDATE public.rewards_catalog SET fulfillment_type='service' WHERE id='00000000-0000-4000-8000-000000009002';
INSERT INTO public.rewards_catalog(id,name,description,points_cost,is_active,stock_qty,reward_type,requires_store_variant,fulfillment_type)
VALUES
 ('00000000-0000-4000-8000-000000009401','PF08L RACE PARTNER A','Race fixture.',100,true,2,'partner',false,'partner'),
 ('00000000-0000-4000-8000-000000009402','PF08L RACE SERVICE','Race fixture.',100,true,2,'club',false,'service'),
 ('00000000-0000-4000-8000-000000009403','PF08L RACE CUSTOM','Race fixture.',100,true,2,'club',false,'custom_physical'),
 ('00000000-0000-4000-8000-000000009404','PF08L RACE PARTNER B','Race fixture.',100,true,2,'partner',false,'partner');
"@ | Out-Null

  # 1. Concurrent same-key cancellation: one mutation and one replay.
  $cancelRid=Invoke-LocalSql @"
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','26000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000009401',NULL,NULL)#>>'{data,id}';
"@
  $cancelA=Start-LocalSql 'cancel-same-a' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000002','$cancelRid','Race cancellation');
"@
  $cancelB=Start-LocalSql 'cancel-same-b' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000002','$cancelRid','Race cancellation');
"@
  $cancelResultA=Wait-LocalSql $cancelA
  $cancelResultB=Wait-LocalSql $cancelB
  if($cancelResultA.ExitCode -ne 0 -or $cancelResultB.ExitCode -ne 0){throw "Same-key cancel failure: $($cancelResultA.Error) $($cancelResultB.Error)"}
  $cancelOutput=$cancelResultA.Output+$cancelResultB.Output
  if(($cancelOutput|Select-String -Pattern '"created": true' -AllMatches).Matches.Count -ne 1 -or
     ($cancelOutput|Select-String -Pattern '"created": false' -AllMatches).Matches.Count -ne 1){
    throw 'Concurrent same-key cancel did not produce one creator and one replay'
  }
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT status FROM public.reward_redemptions WHERE id='$cancelRid')<>'cancelled'
    OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id='$cancelRid' AND type='refund')<>1
    OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009401')<>2 THEN
   RAISE EXCEPTION 'PF08B2L_RACE_CANCEL_SAME_KEY'; END IF;
END `$test`$;
"@ | Out-Null

  # 2. Cancel versus delivery on an immediately-ready service: one terminal winner.
  $terminalRid=Invoke-LocalSql @"
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','26000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000009402',NULL,NULL)#>>'{data,id}';
"@
  $terminalCancel=Start-LocalSql 'terminal-cancel' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000004','$terminalRid','Cancel vs deliver');
"@
  $terminalDeliver=Start-LocalSql 'terminal-deliver' @"
SET ROLE service_role;
SELECT public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000005','$terminalRid');
"@
  $terminalCancelResult=Wait-LocalSql $terminalCancel
  $terminalDeliverResult=Wait-LocalSql $terminalDeliver
  if((@($terminalCancelResult,$terminalDeliverResult)|Where-Object ExitCode -eq 0).Count -ne 1 -or
     (@($terminalCancelResult,$terminalDeliverResult)|Where-Object ExitCode -ne 0).Count -ne 1 -or
     (($terminalCancelResult.Error+$terminalDeliverResult.Error) -notmatch 'PF08_INVALID_REDEMPTION_TRANSITION')){
    throw 'Cancel-versus-deliver race did not produce one legal terminal winner'
  }
  Invoke-LocalSql @"
DO `$test`$ DECLARE s text; refunds integer; BEGIN
 SELECT status INTO s FROM public.reward_redemptions WHERE id='$terminalRid';
 SELECT count(*) INTO refunds FROM public.loyalty_transactions WHERE related_redemption_id='$terminalRid' AND type='refund';
 IF s NOT IN ('cancelled','delivered') OR (s='cancelled' AND refunds<>1) OR (s='delivered' AND refunds<>0) THEN
   RAISE EXCEPTION 'PF08B2L_RACE_CANCEL_DELIVER'; END IF;
END `$test`$;
"@ | Out-Null

  # 3. Ready versus cancel on custom physical fulfillment: one coherent outcome.
  $readyRid=Invoke-LocalSql @"
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','26000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000009403',NULL,NULL)#>>'{data,id}';
"@
  Invoke-LocalSql @"
SET ROLE service_role;
SELECT public.process_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000007','$readyRid');
"@ | Out-Null
  $readyJob=Start-LocalSql 'ready-race' @"
SET ROLE service_role;
SELECT public.ready_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000008','$readyRid');
"@
  $readyCancelJob=Start-LocalSql 'ready-cancel-race' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000009','$readyRid','Ready vs cancel');
"@
  $readyResult=Wait-LocalSql $readyJob
  $readyCancelResult=Wait-LocalSql $readyCancelJob
  if((@($readyResult,$readyCancelResult)|Where-Object ExitCode -eq 0).Count -ne 1 -or
     (@($readyResult,$readyCancelResult)|Where-Object ExitCode -ne 0).Count -ne 1 -or
     (($readyResult.Error+$readyCancelResult.Error) -notmatch 'PF08_(INVALID_REDEMPTION_TRANSITION|SUPPLIER_COMMITMENT_REQUIRES_ADMIN)')){
    throw 'Ready-versus-cancel race did not produce one coherent winner'
  }
  Invoke-LocalSql @"
DO `$test`$ DECLARE rs text; os text; refunds integer; BEGIN
 SELECT r.status,o.status INTO rs,os FROM public.reward_redemptions r JOIN public.store_orders o ON o.related_redemption_id=r.id WHERE r.id='$readyRid';
 SELECT count(*) INTO refunds FROM public.loyalty_transactions WHERE related_redemption_id='$readyRid' AND type='refund';
 IF NOT ((rs='ready' AND os='ready' AND refunds=0) OR (rs='cancelled' AND os='cancelled' AND refunds=1)) THEN
   RAISE EXCEPTION 'PF08B2L_RACE_READY_CANCEL'; END IF;
END `$test`$;
"@ | Out-Null

  # 4. Concurrent repeated delivery with the same key: one delivery and one replay.
  $deliveryRid=Invoke-LocalSql @"
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','26000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000009002',NULL,NULL)#>>'{data,id}';
"@
  $deliveryA=Start-LocalSql 'delivery-same-a' @"
SET ROLE service_role;
SELECT public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000011','$deliveryRid');
"@
  $deliveryB=Start-LocalSql 'delivery-same-b' @"
SET ROLE service_role;
SELECT public.deliver_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000011','$deliveryRid');
"@
  $deliveryResultA=Wait-LocalSql $deliveryA
  $deliveryResultB=Wait-LocalSql $deliveryB
  if($deliveryResultA.ExitCode -ne 0 -or $deliveryResultB.ExitCode -ne 0){throw "Same-key delivery failure: $($deliveryResultA.Error) $($deliveryResultB.Error)"}
  $deliveryOutput=$deliveryResultA.Output+$deliveryResultB.Output
  if(($deliveryOutput|Select-String -Pattern '"created": true' -AllMatches).Matches.Count -ne 1 -or
     ($deliveryOutput|Select-String -Pattern '"created": false' -AllMatches).Matches.Count -ne 1 -or
     (Invoke-LocalSql "select count(*) from public.reward_redemptions where id='$deliveryRid' and status='delivered' and delivered_at is not null;") -ne '1'){
    throw 'Repeated same-key delivery did not produce one delivery and one replay'
  }

  # 5. Different keys race the same cancel command: one applies, the other resolves terminal state without duplicate effects.
  $differentRid=Invoke-LocalSql @"
SELECT public.redeem_moviback_reward('00000000-0000-4000-8000-000000001001','26000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000009404',NULL,NULL)#>>'{data,id}';
"@
  $differentA=Start-LocalSql 'cancel-different-a' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000013','$differentRid','Same terminal intent');
"@
  $differentB=Start-LocalSql 'cancel-different-b' @"
SET ROLE service_role;
SELECT public.cancel_moviback_redemption('aaaaaaaa-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000014','$differentRid','Same terminal intent');
"@
  $differentResultA=Wait-LocalSql $differentA
  $differentResultB=Wait-LocalSql $differentB
  if($differentResultA.ExitCode -ne 0 -or $differentResultB.ExitCode -ne 0){throw "Different-key cancel failure: $($differentResultA.Error) $($differentResultB.Error)"}
  $differentOutput=$differentResultA.Output+$differentResultB.Output
  if(($differentOutput|Select-String -Pattern '"applied": true' -AllMatches).Matches.Count -ne 1 -or
     ($differentOutput|Select-String -Pattern '"applied": false' -AllMatches).Matches.Count -ne 1){
    throw 'Different-key cancel race did not produce one applied and one already-terminal result'
  }
  Invoke-LocalSql @"
DO `$test`$ BEGIN
 IF (SELECT status FROM public.reward_redemptions WHERE id='$differentRid')<>'cancelled'
    OR (SELECT count(*) FROM public.loyalty_transactions WHERE related_redemption_id='$differentRid' AND type='refund')<>1
    OR (SELECT stock_qty FROM public.rewards_catalog WHERE id='00000000-0000-4000-8000-000000009404')<>2
    OR (SELECT count(*) FROM public.business_operation_idempotency WHERE operation='moviback_redemption_cancel' AND idempotency_key IN ('26000000-0000-4000-8000-000000000013','26000000-0000-4000-8000-000000000014'))<>2 THEN
   RAISE EXCEPTION 'PF08B2L_RACE_DIFFERENT_KEYS'; END IF;
END `$test`$;
"@ | Out-Null

  Write-Output 'PF-08B2L concurrency PASS: cancel replay, cancel-vs-deliver, ready-vs-cancel, delivery replay, different-key terminal race.'
}
finally {
  if(Test-Path -LiteralPath $tempRoot){Remove-Item -LiteralPath $tempRoot -Recurse -Force}
}
