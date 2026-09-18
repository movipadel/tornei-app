# PF-08 production command sheet

Copy/paste aid for an approved manual cutover. Commands are examples for the authorized operator workstation. Replace angle-bracket placeholders securely; never commit secrets or captured production output. Do not run `supabase link` during the window.

## 1. Repository verification

```powershell
Set-Location 'D:\PROGETTI-APP\tornei-app'
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -10 --oneline
```

Expected branch: `performance/foundation-2026`. Expected reviewed head for this package: `c3d7fb2` plus only an explicitly reviewed PF-08B2C9 documentation revision. Working tree must be clean.

```powershell
git diff --check
git diff --exit-code
```

STOP on an unexpected branch, commit, dirty tree, or unrelated release diff.

## 2. Artifact integrity and migration inventory

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\20260916170000_pf08_idempotency.sql'
Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\20260916180000_pf08_transactional_store_checkout.sql'
Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\20260916190000_pf08_smart_redemption.sql'
Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\20260916200000_pf08_redemption_lifecycle.sql'
Get-FileHash -Algorithm SHA256 -LiteralPath 'supabase\migrations\20260918120000_pf08_store_variant_inventory_semantics.sql'
```

On the already-approved, already-linked release runner only:

```powershell
npx --no-install supabase migration list
npx --no-install supabase db push --dry-run
```

Expected missing/pending subset, in this order only:

```text
20260916170000_pf08_idempotency.sql
20260916180000_pf08_transactional_store_checkout.sql
20260916190000_pf08_smart_redemption.sql
20260916200000_pf08_redemption_lifecycle.sql
20260918120000_pf08_store_variant_inventory_semantics.sql
```

STOP if the target project is uncertain, an unrelated migration is pending, an expected version is unexpectedly present/absent, or dry-run differs from review. Do not use `db push` until backup, preflight, second-operator review, and GO are recorded.

Production migration-history SQL, run in the confirmed Supabase SQL Editor:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20260916170000',
  '20260916180000',
  '20260916190000',
  '20260916200000',
  '20260918120000'
)
order by version;
```

## 3. Backup/recovery record

Preferred: confirm provider-managed backup/PITR in the exact production project and record its identifier/timestamp.

Fallback only when provider recovery is unavailable and the approved operations policy accepts a logical backup:

```powershell
$env:PF08_PRODUCTION_DB_URL = '<secure production connection string>'
pg_dump --dbname="$env:PF08_PRODUCTION_DB_URL" --format=custom --no-owner --no-acl --file='<approved-secure-path>\pf08-pre-cutover.dump'
Get-FileHash -Algorithm SHA256 -LiteralPath '<approved-secure-path>\pf08-pre-cutover.dump'
Remove-Item Env:PF08_PRODUCTION_DB_URL
```

STOP unless recovery and restore ownership are confirmed.

## 4. Preflight SQL

Authoritative file:

```text
docs/performance-2026/PF-08B2C4_PREFLIGHT.sql
```

Copy to the clipboard for manual review/execution in the confirmed production Supabase SQL Editor:

```powershell
Get-Content -Raw -LiteralPath 'docs\performance-2026\PF-08B2C4_PREFLIGHT.sql' | Set-Clipboard
```

Required summary: 26 targets, 0 missing/name/inactive/current-state/product errors, 0 non-null classifications, 0 unknown active rewards, valid Asciugamano/Tubo topology. Save fingerprints. Any mismatch is STOP.

## 5. Database infrastructure rollout

Only after the dry-run pending set is exact and GO is recorded, use the approved pre-linked release runner:

```powershell
npx --no-install supabase db push
```

Capture complete output. Do not use `--include-all` to force an unexpected history. STOP on any error or uncertain completion.

Read-only post-apply inventory:

```sql
select version, name
from supabase_migrations.schema_migrations
where version between '20260916170000' and '20260918120000'
order by version;

select
  to_regclass('public.business_operation_idempotency') as idempotency_table,
  to_regprocedure('public.checkout_store_order(uuid,uuid,text,text,integer,text,jsonb)') as checkout_rpc,
  to_regprocedure('public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)') as redemption_rpc,
  to_regprocedure('public.process_moviback_redemption(uuid,uuid,uuid)') as process_rpc,
  to_regprocedure('public.ready_moviback_redemption(uuid,uuid,uuid)') as ready_rpc,
  to_regprocedure('public.deliver_moviback_redemption(uuid,uuid,uuid)') as deliver_rpc,
  to_regprocedure('public.cancel_moviback_redemption(uuid,uuid,uuid,text)') as cancel_rpc,
  to_regprocedure('public.reject_moviback_redemption(uuid,uuid,uuid,text)') as reject_rpc;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'store_orders_reward_redemption_unique',
    'loyalty_transactions_redemption_refund_unique'
  )
order by indexname;
```

Every returned object must be non-NULL/present and all five migration versions must be recorded.

## 6. Reward classification rollout

Authoritative file:

```text
docs/performance-2026/PF-08B2C4_REWARD_CLASSIFICATION_ROLLOUT.sql
```

```powershell
Get-Content -Raw -LiteralPath 'docs\performance-2026\PF-08B2C4_REWARD_CLASSIFICATION_ROLLOUT.sql' | Set-Clipboard
```

Run exactly once in the confirmed production SQL Editor only after all infrastructure validation passes and smart mode remains OFF. Expected: one successful transaction, 26 guarded targets, no `PF08B2C3_*` exception.

## 7. Postflight SQL

Authoritative file:

```text
docs/performance-2026/PF-08B2C4_POSTFLIGHT.sql
```

```powershell
Get-Content -Raw -LiteralPath 'docs\performance-2026\PF-08B2C4_POSTFLIGHT.sql' | Set-Clipboard
```

Required: 13 SERVICE, 13 STORE_PRODUCT, zero NULL/mismatch/ambiguity, Asciugamano true, Tubo true, empty mismatch rows, fingerprints equal preflight.

## 8. Classification rollback SQL

Authoritative file:

```text
docs/performance-2026/PF-08B2C4_ROLLBACK.sql
```

```powershell
Get-Content -Raw -LiteralPath 'docs\performance-2026\PF-08B2C4_ROLLBACK.sql' | Set-Clipboard
```

Do not execute merely because smart mode is disabled. It is safe only before route adoption and before new-model business traffic creates dependent data, with backup and explicit second-operator/owner approval.

## 9. Vercel and feature flag

Record before each deployment:

```text
[ ] Production Vercel project confirmed
[ ] Git commit confirmed
[ ] Rollback deploy ID recorded
[ ] MOVIBACK_SMART_REDEMPTION_ENABLED=false
[ ] Deploy/redeploy completed
[ ] Deploy ID and time recorded
[ ] Legacy/read smoke PASS
```

Controlled activation:

```text
[ ] Quiet/restricted traffic window active
[ ] False redeploy path ready
[ ] Monitoring owners present
[ ] MOVIBACK_SMART_REDEMPTION_ENABLED=true
[ ] Same reviewed commit redeployed/promoted
[ ] Activation deploy ID recorded
[ ] Immediate visual smoke started
```

Vercel environment changes require a new deployment/redeploy to affect the running Production deployment. To revert, set the variable to `false` and redeploy/promote immediately. The flag is global; it is not a test-account allowlist.

## 10. Smoke pages and endpoints

Set the base URL locally for operator convenience; do not commit it:

```powershell
$pf08BaseUrl = 'https://<production-host>'
```

Pages:

```text
<base>/
<base>/moviback
<base>/moviback/premi
<base>/store
<base>/staff/login
<base>/staff/rewards
<base>/admin/login
<base>/admin/moviback/redemptions
<base>/riscatto-premio/<controlled-test-token>
```

Critical endpoints observed through browser/network tooling with authenticated test accounts:

```text
GET  /api/moviback/rewards
POST /api/moviback/rewards/redeem
GET  /api/moviback/me
GET  /api/moviback/redemptions
GET  /api/admin/moviback/redemptions
POST /api/admin/moviback/redemptions/<id>/transition
GET  /api/reward-redemptions/<token>
POST /api/reward-redemptions/<token>/validate
```

Do not use production credentials in shell history or documentation.

## 11. Monitoring placeholders

```text
Application logs/dashboard: <operator fills>
Vercel deployment/functions: <operator fills>
Supabase database health/locks: <operator fills>
PF08_* error search: <operator fills>
5xx/latency dashboard: <operator fills>
Richieste premio queue: <base>/staff/rewards
Admin queue: <base>/admin/moviback/redemptions
Telegram delivery/error view: <operator fills>
Incident channel/ticket: <operator fills>
```

Immediate SMART OFF: any duplicate/partial state, points or stock inconsistency, orphan fulfillment, premature QR, auth bypass, unexpected fallback, two consecutive valid failures, three smart 5xx in five minutes or at least 5% smart 5xx, or unsafe queue/QR behavior.

## 12. Finish

```powershell
Remove-Variable pf08BaseUrl -ErrorAction SilentlyContinue
git status --short --branch
```

Record the final GO/NO-GO decision, deployment IDs, evidence links, monitoring owner, and smart flag state. Any incomplete required item means `NO-GO / SMART OFF`.
