param([string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe')

$ErrorActionPreference = 'Stop'
$env:DO_NOT_TRACK = '1'
$dbUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable'
$expectedStatusUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function Invoke-LocalSql([string]$Sql) {
  $output = & $PsqlPath $dbUrl -X -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output -join [Environment]::NewLine) }
  return ($output -join [Environment]::NewLine).Trim()
}

function Invoke-Supabase([string[]]$Arguments) {
  $output = & npx --no-install supabase @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output -join [Environment]::NewLine) }
  return ($output -join [Environment]::NewLine)
}

try {
  $statusText = Invoke-Supabase @('status','-o','json')
  $jsonStart = $statusText.IndexOf('{')
  $jsonEnd = $statusText.LastIndexOf('}')
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw 'Supabase status did not return JSON' }
  $status = $statusText.Substring($jsonStart, $jsonEnd-$jsonStart+1) | ConvertFrom-Json
  if ($null -ne $status.linked_project -or $status.DB_URL -ne $expectedStatusUrl) {
    throw 'Safety stop: Supabase is not the expected unlinked local target'
  }

  $schemaReady = Invoke-LocalSql @"
SELECT count(*)
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260919220000','20260919230000');
"@
  if ($schemaReady -ne '2') {
    throw 'Local reset did not apply the Phase 2B and Phase 2C schema'
  }

  Invoke-LocalSql @"
SET ROLE service_role;
UPDATE public.rewards_catalog
SET fulfillment_type='store_product'
WHERE id='00000000-0000-4000-8000-000000009001';

INSERT INTO public.reward_redemptions(
  id,membership_id,reward_id,points_cost,status,fulfillment_type,qr_token,manual_code
) VALUES
 ('68000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009001',100,'requested','store_product','CUTOVER-QR-1','CATEV234'),
 ('68000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000009001',100,'processing','store_product','CUTOVER-QR-2','CATEV235');

INSERT INTO public.store_orders(
  id,user_id,status,pickup_club,payment_mode,total_euro,total_points,
  customer_name,order_type,related_redemption_id
) VALUES
 ('68000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'CUTOVER STORE PENDING','catalog',NULL),
 ('68000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000001001','confirmed','CENTALLO','euro',25,0,'CUTOVER STORE CONFIRMED','catalog',NULL),
 ('68000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000001001','ready','CENTALLO','euro',25,0,'CUTOVER STORE READY','catalog',NULL),
 ('68000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000001001','delivered','CENTALLO','euro',25,0,'CUTOVER STORE DELIVERED','catalog',NULL),
 ('68000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000001001','cancelled','CENTALLO','euro',25,0,'CUTOVER STORE CANCELLED','catalog',NULL),
 ('68000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000001001','pending','CENTALLO','points',0,100,'CUTOVER MOVIBACK PENDING','reward_redemption','68000000-0000-4000-8000-000000000001'),
 ('68000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000001001','confirmed','CENTALLO','points',0,100,'CUTOVER MOVIBACK CONFIRMED','reward_redemption','68000000-0000-4000-8000-000000000002');

INSERT INTO public.store_order_items(
  id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,
  quantity,unit_price_euro,total_euro,total_points
)
SELECT
  ('68000000-0000-4000-8000-' || lpad(row_number() OVER (ORDER BY id)::text,12,'0'))::uuid,
  id,'00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001',
  '00000000-0000-4000-8000-000000007001','CUTOVER PHYSICAL','PF08 BLUE','PF08-M',1,25,25,
  CASE WHEN order_type='reward_redemption' THEN 100 ELSE 0 END
FROM public.store_orders
WHERE id BETWEEN '68000000-0000-4000-8000-000000000011' AND '68000000-0000-4000-8000-000000000017';
"@ | Out-Null

  $before = Invoke-LocalSql @"
SELECT
  (SELECT string_agg(id::text || ':' || status,',' ORDER BY id) FROM public.store_orders WHERE id BETWEEN '68000000-0000-4000-8000-000000000011' AND '68000000-0000-4000-8000-000000000017') || '|' ||
  (SELECT string_agg(id::text || ':' || status || ':' || qr_token || ':' || manual_code,',' ORDER BY id) FROM public.reward_redemptions WHERE id IN ('68000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000002')) || '|' ||
  (SELECT coalesce(sum(stock_qty),0) FROM public.store_product_stock) || '|' ||
  (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions) || '|' ||
  (SELECT count(*) FROM public.communications) || '|' ||
  (SELECT count(*) FROM public.store_order_items);
"@

  $migrationPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'migrations\20260919220000_phase2b_supplier_export_batches.sql'
  $migrationSql = Get-Content -LiteralPath $migrationPath -Raw
  $legacyMatch = [regex]::Match($migrationSql, '(?s)DO \$legacy\$.*?\$legacy\$;')
  if (-not $legacyMatch.Success) { throw 'Legacy cutover block not found in Phase 2B migration' }
  Invoke-LocalSql $legacyMatch.Value | Out-Null

  $after = Invoke-LocalSql @"
SELECT
  (SELECT string_agg(id::text || ':' || status,',' ORDER BY id) FROM public.store_orders WHERE id BETWEEN '68000000-0000-4000-8000-000000000011' AND '68000000-0000-4000-8000-000000000017') || '|' ||
  (SELECT string_agg(id::text || ':' || status || ':' || qr_token || ':' || manual_code,',' ORDER BY id) FROM public.reward_redemptions WHERE id IN ('68000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000002')) || '|' ||
  (SELECT coalesce(sum(stock_qty),0) FROM public.store_product_stock) || '|' ||
  (SELECT coalesce(sum(points_delta),0) FROM public.loyalty_transactions) || '|' ||
  (SELECT count(*) FROM public.communications) || '|' ||
  (SELECT count(*) FROM public.store_order_items);
"@
  if ($before -ne $after) { throw "Cutover changed business state. Before=$before After=$after" }

  $legacy = Invoke-LocalSql @"
SELECT count(*) || '|' || count(DISTINCT i.supplier_export_batch_id) || '|' ||
       min(b.filename) || '|' || bool_and(b.is_legacy)::text
FROM public.store_order_items i
JOIN public.supplier_export_batches b ON b.id=i.supplier_export_batch_id
WHERE i.order_id BETWEEN '68000000-0000-4000-8000-000000000011' AND '68000000-0000-4000-8000-000000000017';
"@
  if ($legacy -ne '7|1|LEGACY PRE-CUTOVER 2026-09-19|true') {
    throw "Legacy membership mismatch: $legacy"
  }
  if ([int](Invoke-LocalSql 'SELECT public.supplier_export_eligible_unit_count();') -ne 0) {
    throw 'Pre-cutover physical demand remained supplier eligible'
  }

  Invoke-LocalSql @"
SET ROLE service_role;
INSERT INTO public.store_orders(id,user_id,status,pickup_club,payment_mode,total_euro,total_points,customer_name,order_type)
VALUES
 ('68000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',25,0,'POST CUTOVER READY FIRST','catalog'),
 ('68000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000001001','pending','CENTALLO','euro',50,0,'POST CUTOVER EXPORT','catalog');
INSERT INTO public.store_order_items(id,order_id,product_id,color_id,size_id,product_name,color_name,size_label,quantity,unit_price_euro,total_euro)
VALUES
 ('68000000-0000-4000-8000-000000000031','68000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','POST CUTOVER','PF08 BLUE','PF08-M',1,25,25),
 ('68000000-0000-4000-8000-000000000032','68000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000007001','POST CUTOVER','PF08 BLUE','PF08-M',2,25,50);
"@ | Out-Null

  if ([int](Invoke-LocalSql 'SELECT public.supplier_export_eligible_unit_count();') -ne 3) {
    throw 'New post-cutover demand was not eligible'
  }
  Invoke-LocalSql "SET ROLE service_role; SELECT public.mark_physical_store_order_ready('aaaaaaaa-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000041','68000000-0000-4000-8000-000000000021');" | Out-Null
  if ([int](Invoke-LocalSql 'SELECT public.supplier_export_eligible_unit_count();') -ne 2) {
    throw 'Ready-before-export demand remained eligible'
  }
  $claim = Invoke-LocalSql "SET ROLE service_role; SELECT public.claim_supplier_export_batch('68000000-0000-4000-8000-000000000042','phase2b-cutover-test');"
  if ($claim -notmatch '"created": true' -or $claim -notmatch '"unit_count": 2') {
    throw "New supplier batch claim failed: $claim"
  }
  $newBatch = Invoke-LocalSql @"
SELECT b.is_legacy::text || '|' || count(*)
FROM public.store_order_items i
JOIN public.supplier_export_batches b ON b.id=i.supplier_export_batch_id
WHERE i.id='68000000-0000-4000-8000-000000000032'
GROUP BY b.is_legacy;
"@
  if ($newBatch -ne 'false|1') { throw "Post-cutover item entered wrong batch: $newBatch" }

  Write-Output 'PHASE2B_CUTOVER_PASS: seven historical states frozen unchanged; only post-cutover preparing demand exported.'
}
finally {
  # The caller restores the disposable local stack after the harness.
}
