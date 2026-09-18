# PF-08 final production runbook

## 1. Purpose, authority, and current status

This is the single authoritative operator runbook for the PF-08 reliability-foundation release. It consolidates the PF-08B2C4 through PF-08B2C8 rollout artifacts; it does not redesign them and does not itself authorize production work.

**Package status: READY FOR MANUAL PRODUCTION GO/NO-GO REVIEW.**

This means prepared, not deployed and not approved. Every required box in `PF-08_FINAL_GO_NO_GO.md` must be recorded as PASS by the operators during the approved change window. Any failure, blank, ambiguity, or unexpected result is NO-GO. Keep `MOVIBACK_SMART_REDEMPTION_ENABLED=false` unless this runbook explicitly reaches the controlled activation phase.

### Release boundary

Included: PF-08 idempotency, transactional Store checkout, smart MoviBack redemption, redemption lifecycle, variant/inventory semantics, reward classification, route integration, staff queue, QR readiness, and post-commit staff alerts.

Excluded from this release:

- Padelleria visual identity;
- new MOVI home redesign;
- brand palette rollout;
- rebranding copy rollout;
- unrelated feature work or UX redesign.

No rebranding work may be added to this change window. The rollout scope is PF-08 reliability foundation only.

### Operator record

| Field | Operator entry |
|---|---|
| Change-window date/time and timezone | |
| Primary operator | |
| Second operator | |
| Rollback operator | |
| Monitoring owner | |
| Telegram monitoring owner | |
| Production Supabase project reference/name | |
| Production Vercel project/environment | |
| Release Git commit | `c3d7fb2` unless superseded by an explicitly reviewed docs-only revision |
| Current production deploy identifier | |
| Rollback application deploy identifier | |
| Backup/recovery identifier and timestamp | |
| Smart flag state before work | |
| Final decision and owner approval | |

## 2. Phase 0 — pre-rollout freeze

### Procedure

1. Freeze unrelated application, database, environment, catalog, and deployment changes for the window.
2. Confirm the production application is healthy before PF-08 work begins: login, MoviBack reads, Store, staff/admin access, QR reads, error rate, and database health.
3. Record the current production deploy identifier, current Git commit, and the tested rollback deploy.
4. In the secure operator record—not in Git—record the names and current values of production environment settings relevant to Supabase, sessions, Telegram/push, and `MOVIBACK_SMART_REDEMPTION_ENABLED`.
5. Require the production smart flag to be explicitly recorded. An absent flag defaults to legacy mode in production, but the cutover must use explicit `false` before application deployment.
6. Confirm that no rebranding or unrelated work is present in the release diff.

### Expected result

Production is stable, the exact starting state is recorded, rollback deploy is known, scope is frozen, and the smart flow is OFF.

### STOP

STOP before all database work if production is already unstable, the deploy identity is uncertain, the release commit differs from the reviewed manifest, the rollback deploy cannot be identified, or unrelated changes are present.

### Safe rollback boundary

No PF-08 production change has occurred. Cancel the window without rollback.

## 3. Phase 1 — backup and recovery point

### Procedure

1. In the Supabase dashboard, confirm the exact production project identity against the operator record.
2. Determine the project plan and the backup/PITR capability actually available at execution time. The repository does not establish either.
3. Record the newest provider-managed backup or create/confirm the approved recovery point immediately before database work.
4. Record its timestamp, retention/availability, restore procedure, expected restore duration, and the named rollback operator.
5. Confirm the restore procedure is understood and accessible to the operator; a backup whose restoration cannot be initiated is not a PASS.
6. If provider-managed point-in-time recovery is unavailable, take the safest provider-supported pre-change backup available. At minimum, create an encrypted, access-controlled logical schema-and-data dump in approved storage, record its checksum, and ensure a restore rehearsal/procedure exists. Do not treat a local unverified file as sufficient recovery proof.

Example fallback commands for an authorized operator workstation, with placeholders supplied securely at execution time:

```powershell
$env:PF08_PRODUCTION_DB_URL = '<secure production connection string>'
pg_dump --dbname="$env:PF08_PRODUCTION_DB_URL" --format=custom --no-owner --no-acl --file='<approved-secure-path>\pf08-pre-cutover.dump'
Get-FileHash -Algorithm SHA256 -LiteralPath '<approved-secure-path>\pf08-pre-cutover.dump'
Remove-Item Env:PF08_PRODUCTION_DB_URL
```

Do not paste the connection string, backup contents, or checksum record into repository documents.

### Expected result

A timestamped, project-specific recovery point and a named restore operator are recorded. The available restore method and its limitation are explicit.

### STOP

STOP if project identity is uncertain, no acceptable recovery point exists, backup age is unacceptable, restoration access/procedure is unknown, or no rollback operator is assigned.

### Safe rollback boundary

No PF-08 database change has occurred. Cancel the window.

## 4. Phase 2 — final production preflight

### Procedure

1. Open the production Supabase SQL Editor only after confirming the project identity visually and against the operator record.
2. Run `docs/performance-2026/PF-08B2C4_PREFLIGHT.sql` exactly as reviewed. It is SELECT-only.
3. Save the complete output beside the recovery-point record.
4. Have the second operator compare the output with the expectations below before any migration or classification SQL.

### Required expected result

- `target_rows = 26` and `missing = 0`.
- All 26 target UUID/name/activity states match; `name_mismatch = 0`, `inactive_targets = 0`, and `unknown_active_rewards = 0`.
- The target set is exactly 13 SERVICE rewards and 13 STORE_PRODUCT rewards after classification.
- Before classification, all 26 target `fulfillment_type` values are NULL, so `non_null_classifications = 0`.
- Current links and flags match the embedded baseline: `current_link_mismatch = 0` and `current_flag_mismatch = 0`.
- The 13 target Store products exist, have the expected names, and are active: `invalid_products = 0`.
- Asciugamano Sport and Tubo Palline reward links are NULL before rollout.
- Asciugamano Sport currently has `requires_store_variant=false`; its target is `true`. Its target product is active, has exactly two active stock identities, colors Grigio and Lime, and size UNICA: `asciugamano_topology_ok = true`.
- Tubo Palline currently has `requires_store_variant=false`; its target remains `false`. Its target product is active, has active color metadata, size UNICA, and zero active stock rows: `tubo_zero_stock_ok = true`.
- `variantless_ambiguities = 0` and `variant_required_without_stock = 0`.
- Save both `PREFLIGHT_FINGERPRINTS`; they must match postflight.

### STOP

STOP on any missing/renamed/inactive reward, unexpected active reward, non-NULL or conflicting classification, changed link/flag, inactive/missing product, topology drift, ambiguity, unexpected stock, fingerprint-generation problem, or row count other than the reviewed 26/13/13 model. Do not “fix while running”; investigate and re-review the artifact.

### Safe rollback boundary

Preflight is read-only. Cancel the window without rollback.

## 5. Phase 3 — database infrastructure rollout

### Package completeness

All five required migrations are committed under `supabase/migrations` and are production-package ready subject to production inventory, preflight, backup, second-operator review, and normal migration execution controls. The classification script is intentionally outside automatic migrations.

Before applying anything, query production migration history or use the approved pre-linked release runner. If the pending set is not exactly the expected missing subset in the order below, STOP. Never run `supabase link` during the window, and never use `db push` without reviewing its dry-run output.

| Order | Migration | Purpose | Lock/risk profile | Immediate validation | Rollback consideration |
|---:|---|---|---|---|---|
| 1 | `20260916170000_pf08_idempotency.sql` | Creates server-only `business_operation_idempotency`, state checks, unique operation/user/key scope, FK, RLS, and service-role grants. | Low–medium. New table/constraints and catalog locks; no existing-row scan. | Table, PK, scope unique constraint, FK, checks, RLS, and grants exist; migration ledger records `20260916170000`. | No down script. Before use it can be removed only through an approved recovery/forward plan; after operations exist, do not drop it. |
| 2 | `20260916180000_pf08_transactional_store_checkout.sql` | Adds atomic, idempotent `checkout_store_order` RPC with balance/stock locking. | Low schema lock; brief function-object/catalog locks. Runtime contention is row-level `FOR UPDATE`. | Function signature resolves; execute privilege is restricted to postgres/service_role; migration ledger records `20260916180000`. | Prefer stop/forward correction. Do not drop or replace after calls may have committed. |
| 3 | `20260916190000_pf08_smart_redemption.sql` | Adds fulfillment/reservation columns and constraints, unique reward-order protection, and atomic redemption RPC. | **Medium–high.** `ALTER TABLE`, constraint validation, and non-concurrent partial unique-index build can scan/lock populated tables and can fail on incompatible data. | New columns/checks/FK exist; `store_orders_reward_redemption_unique` exists; RPC/grants resolve; ledger records `20260916190000`. | If it fails, STOP before classification/app deploy. No blind down migration; use recovery point or reviewed forward correction. |
| 4 | `20260916200000_pf08_redemption_lifecycle.sql` | Extends idempotency operations, adds terminal reason, unique refund protection, and lifecycle RPCs. | **Medium–high.** Constraint replacement, table alteration, and non-concurrent unique-index build can scan/lock and detect duplicate refunds. | Operation check and `terminal_reason` exist; refund unique index and all five lifecycle RPCs/grants resolve; ledger records `20260916200000`. | If it fails, STOP. Once lifecycle traffic exists, schema removal is unsafe; use feature flag/app rollback and forward repair. |
| 5 | `20260918120000_pf08_store_variant_inventory_semantics.sql` | Replaces smart-redemption RPC with variantless/zero-identity, one-identity, and finite-stock semantics. | Low schema risk: `CREATE OR REPLACE FUNCTION` takes a brief function-object lock. Runtime behavior changes for new calls after commit. | Replacement RPC signature/grants resolve; B2R3 migration version is recorded; release regression evidence remains associated with the exact commit. | Replacing the function backward requires an explicitly reviewed version and semantic review; never reverse after dependent traffic casually. |

### Execution controls

1. Use the approved migration mechanism against the already-confirmed production project.
2. Dry-run and capture the exact pending set. It must contain no unrelated migration.
3. Apply in the exact order above. Do not reorder or skip a missing dependency.
4. Capture migration logs. After each migration transaction, run the matching read-only validation from the command sheet or release pipeline.
5. Monitor locks, blocked sessions, transaction duration, connection saturation, and application errors throughout.

### STOP

STOP on any unexpected pending migration, lock/statement timeout, constraint or uniqueness conflict, partial/uncertain completion, unexpected lock pressure, missing function/grant/column/index, migration-history mismatch, or application instability. Do not continue to classification.

### Safe rollback boundary

Before classification and before the PF-08 application is deployed, the application still uses its old schema contract. Recovery may use the recorded database recovery point or an explicitly reviewed forward correction. There are no general-purpose down migrations in this package. Do not improvise destructive DDL.

## 6. Phase 4 — reward classification

### Prerequisites

- Phase 1 recovery evidence is PASS.
- Phase 2 preflight remains current and unchanged.
- All five infrastructure migrations are applied and validated.
- The deployed application smart route is still OFF/not active.
- The second operator has reviewed the exact rollout SQL and its 26-row map.

### Procedure

1. Reconfirm no concurrent catalog administration is occurring.
2. Run `docs/performance-2026/PF-08B2C4_REWARD_CLASSIFICATION_ROLLOUT.sql` exactly once in the confirmed production SQL Editor.
3. Preserve the full output/error record.
4. Immediately proceed to Phase 5; do not deploy or activate routes concurrently.

The script is transactional, uses a 5-second lock timeout and 60-second statement timeout, validates the current state, and commits only the reviewed 26-row classification. It must remain a manually reviewed rollout artifact outside `supabase/migrations`.

Even with smart redemption OFF, classification changes Asciugamano’s legacy picker/link behavior. Keep the interval to application deployment short and controlled. Tubo remains subject to legacy limitations until smart route activation.

### Expected result

The transaction commits without a `PF08B2C3_*` exception or timeout.

### STOP

STOP on any guard exception, timeout, concurrent-state mismatch, unexpected row count, uncertain commit state, or application error spike. Determine transaction outcome before any retry.

### Safe rollback boundary

`PF-08B2C4_ROLLBACK.sql` remains potentially usable only before dependent route adoption and before new-model business traffic creates rows relying on the classification. It is not a general rollback after activation.

## 7. Phase 5 — postflight database validation

### Procedure

1. Run `docs/performance-2026/PF-08B2C4_POSTFLIGHT.sql` immediately after classification.
2. Compare the result and both fingerprints with the saved Phase 2 preflight output.
3. Have the second operator sign the comparison.

### Required expected result

- `targets = 26`, `service = 13`, `store_product = 13`.
- `null_types = 0`, `mismatches = 0`, `variantless_ambiguities = 0`.
- All 13 Store links and all variant flags match the reviewed map.
- `asciugamano_ok = true`: exact Store link, required variant true, Grigio/Lime identities, UNICA.
- `tubo_ok = true`: exact Store link, required variant false, UNICA metadata, zero stock rows.
- `MISMATCH_ROWS` is empty.
- Redemption fingerprint and unrelated-reward fingerprint exactly equal preflight: no historical redemption or unrelated catalog mutation.

### STOP

STOP on any mismatch, nonzero NULL, wrong total, false special topology, nonempty mismatch rows, or fingerprint drift. Freeze application rollout and make an explicit rollback-versus-forward-fix decision while the semantic rollback boundary is still open.

### Safe rollback boundary

If no dependent route has been adopted and no business data relies on the classified model, the reviewed classification rollback may be considered. Otherwise it is unsafe; use coordinated forward correction/recovery.

## 8. Phase 6 — application deploy with smart flow OFF

### Procedure

1. Set the Vercel Production environment variable `MOVIBACK_SMART_REDEMPTION_ENABLED` explicitly to `false`.
2. Deploy the exact reviewed release commit. Record the new deploy identifier and deployment logs.
3. Confirm the deployed environment reports the expected commit/version through the operator’s normal mechanism.
4. With the flag still OFF, smoke-test:
   - application home and login;
   - current MoviBack dashboard, catalog, history, and rewards reads;
   - Store browse/checkout read path and approved low-risk smoke;
   - `/staff/rewards` and `/admin/moviback/redemptions` access with proper roles;
   - anonymous/customer denial for staff endpoints;
   - QR history/read behavior;
   - no widespread 5xx, authentication regression, or QR regression.

### Expected result

The new code is healthy in legacy redemption mode. Smart redemption is not active.

### STOP / rollback

On any regression, roll back to the recorded prior application deployment before flag activation. Keep the smart flag false. Database schema/classification may remain if postflight passed and backward compatibility is confirmed; do not automatically run classification rollback.

## 9. Phase 7 — controlled smart-flow activation

### Feature-flag semantics

The route reads `process.env.MOVIBACK_SMART_REDEMPTION_ENABLED` inside each server-side redemption request. `true` selects the smart RPC; `false` selects the retained legacy path; absent/invalid values default to false in `NODE_ENV=production`.

On Vercel, Production environment values belong to deployments. Changing the variable does not alter an already-running deployment; the operator must create/redeploy/promote a deployment with the new value. Reverting to false likewise requires an environment update and redeploy/promotion. Pre-stage and rehearse the fastest approved false redeploy path before enabling true.

The current flag is global, not account-scoped. A designated test account does not technically prevent other production customers from reaching the smart branch. Therefore activate only in an approved quiet window and, where available, use platform traffic restriction/maintenance controls so designated operators can complete the test before normal traffic is admitted.

### Procedure

1. Reconfirm monitoring owners are watching and the false redeploy/rollback is immediately available.
2. Confirm designated customer, staff/admin, and low-risk reward test data.
3. Change only `MOVIBACK_SMART_REDEMPTION_ENABLED` to `true` in the Production scope.
4. Redeploy/promote the same reviewed release commit and record the deployment identifier.
5. Keep normal customer traffic restricted where operationally possible.
6. Proceed immediately to Phase 8. Do not call activation complete yet.

### STOP

If the platform scope, commit, variable value, deploy identity, restriction window, or false rollback path is uncertain, do not enable. If activation deploy is unhealthy, revert to false immediately.

## 10. Phase 8 — mandatory controlled visual smoke

This phase closes the single deferred PF-08B2C8 visual gate. It is mandatory before smart redemption may remain enabled for normal customer traffic.

Using the designated test accounts, verify immediately:

1. **Asciugamano Sport:** selector is visible; Grigio and Lime are clear; UNICA behavior is understandable; missing/invalid selection cannot proceed.
2. **Tubo Palline:** no unnecessary selector appears and no misleading stock warning appears.
3. **Richieste premio:** `/staff/rewards` and/or `/admin/moviback/redemptions` render correctly; the test request is visible; customer/reward/variant snapshot/status and lifecycle controls are correct.
4. **QR states:** requested and processing are hidden/unusable; ready is visible/usable; delivered is unusable; SERVICE is ready immediately.
5. Check desktop and narrow viewport for unusable overflow or inaccessible controls on these pages.

### Failure action

If any item fails, set `MOVIBACK_SMART_REDEMPTION_ENABLED=false` and redeploy/promote immediately. Do not leave smart mode enabled for normal traffic. Preserve evidence and investigate.

If postflight passed, the additive schema and classification may remain in place because the false branch is retained; do not run database rollback merely for a visual defect. Reassess compatibility if the defect indicates a data-contract issue.

### PASS condition

All four functional visual areas pass and the reviewer records evidence. Only then proceed to tightly controlled functional smoke; normal bulk traffic is still not authorized.

## 11. Phase 9 — functional smart smoke

### Procedure

1. Redeem one low-risk SERVICE reward with a fresh idempotency key.
2. Verify exactly one redemption and exactly one debit, initial ready state, no Store order, correct queue entry, QR ready, and exactly one post-commit staff alert attempt. Telegram text must say no Store handling is required.
3. Replay the same intent/key. Verify the same result, no second debit/redemption, and no duplicate Telegram scheduling.
4. Redeem one controlled physical Store reward, preferably Asciugamano with a selected test variant and known stock.
5. Verify exactly one redemption, one debit, one order and item where applicable, correct variant snapshot/stock change, one alert attempt, requested queue state, and QR hidden.
6. Exercise staff lifecycle processing → ready, confirm QR becomes ready, then deliver through the approved QR path. Verify order/redemption consistency and repeat-safe delivery.
7. Do not admit bulk customer traffic until every assertion is PASS.

### STOP

Set the smart flag false immediately on any duplicate, partial state, incorrect points/stock, missing/duplicate order, premature QR, lifecycle error, authorization issue, idempotency mismatch, or missing/duplicate notification scheduling. A Telegram transport failure cannot reverse a committed redemption, but failure during controlled smoke blocks normal activation until operational handling is accepted.

## 12. Phase 10 — monitoring window

Use `PF-08B2C4_MONITORING.md` as the detailed monitoring source. Record baselines before activation and compare the smart-flow window with them.

### First 15 minutes

- Continuous observation by application and database operators.
- Review every smart redemption and replay individually.
- Watch API 5xx, `PF08_*` codes, RPC latency/errors, database locks, point debits/refunds, stock, orders/items, queue states, QR, and staff alert attempts.
- Keep normal traffic restricted until visual and functional smoke pass.

### First 60 minutes

- Review at least every 10 minutes.
- Reconcile all new redemptions to debit/order/stock/notification outcomes.
- Watch queue aging and operator lifecycle transitions.

### First business day

- Review at opening, mid-day, and close, plus alerts.
- Reconcile daily redemption, debit/refund, order/item, stock, QR, queue, and Telegram failure counts.

### Events requiring smart flag OFF

Turn the flag OFF immediately for any single duplicate redemption/order/debit/refund, negative or unexplained stock, points inconsistency, orphan fulfillment row, idempotency conflict for a valid retry, premature QR exposure, unauthorized queue/lifecycle access, partial-state suspicion, unexpected legacy fallback, or uncertain database state.

Also turn it OFF when any of the following occurs during the initial window:

- two consecutive valid smart redemptions fail;
- three smart-flow 5xx responses within five minutes or a smart-flow 5xx rate at/above 5%, whichever occurs first;
- a material application-wide 5xx increase above the recorded baseline;
- sustained/blocked database locks or connection saturation attributable to PF-08;
- two consecutive staff-alert delivery failures, or the controlled committed redemption produces no alert attempt;
- staff queue or QR cannot support safe fulfillment.

Expected business rejections such as insufficient points/stock are not failures if they return the stable expected `PF08_*` code and leave no partial state. Telegram transport failure alone does not roll back an already committed redemption; it is an operational stop signal for further activation.

## 13. Phase 11 — rollback levels

### Level 1 — feature-flag rollback

Set `MOVIBACK_SMART_REDEMPTION_ENABLED=false` in Vercel Production and redeploy/promote the same reviewed application version. This is the preferred first response to smart-flow, UX, notification, queue, or controlled-smoke problems. It stops new smart requests; it does not reverse already committed redemptions. Existing smart rows must continue through lifecycle RPCs or explicit repair.

### Level 2 — application rollback

Return to the recorded prior application deployment with the smart flag false. Use when the regression affects broader application/auth/read behavior. Validate compatibility with the already-applied additive schema/classification. Do not retry failed smart requests through legacy writes automatically.

### Level 3 — database/classification rollback

Use `PF-08B2C4_ROLLBACK.sql` only inside its reviewed safe boundary: postflight classification was applied, dependent route adoption has not begun, and no new-model business row relies on the classification. Confirm exact current state, take a new recovery point, obtain second-operator/owner approval, then execute and validate.

**Database rollback becomes unsafe after new-model business traffic creates dependent rows.** After that boundary, do not null classifications or remove PF-08 infrastructure. Use feature-flag/application rollback plus a coordinated forward data/schema correction or full recovery procedure.

Infrastructure migrations have no packaged general down migration. Destructive schema rollback is not an improvised incident response.

## 14. Second-operator review record

| Review item | PASS/FAIL | Reviewer entry |
|---|---|---|
| Reviewer name | | |
| Review timestamp/timezone | | |
| Production project identity confirmed | | |
| Backup/recovery evidence reviewed | | |
| Preflight complete output reviewed | | |
| Migration inventory and B0 → B1 → B2R2 → B2L → B2R3 order reviewed | | |
| Classification and postflight reviewed | | |
| Rollback SQL and semantic safe boundary reviewed | | |
| Feature-flag false rollback/redeploy understood and rehearsed | | |
| Controlled visual/functional smoke ownership confirmed | | |
| Monitoring dashboards, thresholds, and owners confirmed | | |

## 15. Final decision rule

The package is **READY FOR MANUAL PRODUCTION GO/NO-GO REVIEW**. It is not deployed, production-approved, or ready for unattended activation.

Proceed to normal monitored smart traffic only when the final card is fully PASS, the deferred visual gate has passed, the tightly controlled functional smoke has passed, monitoring is active, the rollback operator is present, and the owner has explicitly approved activation. Otherwise the decision is **NO-GO / SMART OFF**.
