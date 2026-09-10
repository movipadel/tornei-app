# PF-08 — Staged rollout plan

## Rollout principles

- This plan is future work; PF-08 design creates no migration or source change.
- Never dual-write or “shadow execute” checkout/redemption: either path would mutate real balance/stock.
- Select legacy versus RPC before mutation starts. Never fall back to the legacy sequence after an RPC timeout/unknown result, because the RPC may have committed.
- Keep database objects additive and compatible until rollback and observation windows close.
- Introduce idempotency before exposing automatic client retries.
- Notifications remain PF-07 post-commit work and do not participate in database success.
- Production rollout requires isolated staging evidence and approved data-quality/security checks.

## PF-08A0 — Contract and live-data prerequisites

### Work

Read-only verification against the live project:

- exact check expressions for loyalty source/type, order payment/club/type/status, item quantity and redemption status;
- FK delete/update actions for order items, redemption links and Store fulfillment links;
- table/function grants, function owners, default execute privileges and extension/search-path requirements;
- duplicate memberships per user;
- duplicate product/color rows where `size_id IS NULL`;
- negative Store/reward stock and fractional/invalid legacy values;
- duplicate ledger `related_redemption_id` values and duplicate Store orders per redemption;
- current source values used by Store checkout and redemption;
- product-owner decisions for checkout size rules, missing/null stock, Store fulfillment requirement and idempotent replay notification behavior.

Review non-executable function signatures, canonical request hashes, stable error codes and response mappings.

### Files/objects affected

- Design/review documents only.
- No database object or application source.

### Validation

- Signed decisions for every ambiguous rule.
- Data-quality report proves whether proposed constraints can be created.
- Security review identifies exact grantees/owner/search path.

### Rollback

None; read-only.

### Production risk

LOW. The risk is proceeding without answers, not the checks themselves.

## PF-08A — Add unused database foundation

### Work

Create reviewed migrations for:

- the private/dedicated business-operation idempotency table and unique scoped key;
- `checkout_store_order(...)` design implementation;
- `redeem_moviback_reward(...)` design implementation;
- any private canonicalization/idempotency helper;
- explicit ownership, fixed/minimal search path, revoked default execute and service-role-only execute grants;
- only approved constraints whose data audits pass.

Functions are deployed but unused by production routes. Do not change current handlers yet.

Separate correctness constraints by operational risk:

1. create idempotency objects/functions first;
2. add null-safe stock uniqueness only after duplicate remediation and a rehearsal;
3. add non-negative finite-stock checks after range validation, using a validation strategy appropriate to PostgreSQL/Supabase;
4. add one-membership/one-redemption-debit/one-fulfillment-order constraints only after business and lifecycle approval.

A membership-ledger index is optional performance work and should be included only with an explain-plan rationale; it is not required merely because the RPC exists.

### Files/objects affected

- New versioned migration file(s).
- New idempotency table/index/policies or revoked access posture.
- Two public server-only RPCs and optional private helper(s).
- Approved constraints/indexes only.

### Validation

- Migration applies to an empty ephemeral DB and a production-shaped staging clone.
- Functions compile and are not callable by `PUBLIC`, `anon` or `authenticated`.
- Existing application regression suite/build remains unchanged because functions are unused.
- Read-only catalog inspection confirms owner, grants, search path, RLS and definitions.
- Unit-level SQL tests and isolated integration tests pass.

### Rollback

Because objects are unused, drop/revert functions and the empty idempotency table through a forward rollback migration. Constraint rollback is separately reviewed; do not discard data cleanup records.

### Production risk

LOW to MEDIUM. Objects are unused, but new uniqueness/check validation can lock or reject dirty data if staged poorly.

## PF-08B — Application compatibility layer, production disabled

### Work

- Add client idempotency-key lifecycle to Store checkout and reward redemption UI.
- Add typed server adapters that call each RPC and map stable codes to current HTTP contracts.
- Preserve server cookie validation and derive `user_id` exclusively from it.
- Preserve PF-07 provider content/recipient conditions and schedule only after a successful created result according to the approved replay policy.
- Add a server-only path selector with production defaulting to legacy. Exactly one mutation path may run.
- Add privacy-safe PF-06 spans around the one RPC call and record created/replayed/conflict counters without keys or identity.

Do not implement “try RPC, then legacy on error.” An RPC transport error is ambiguous and must be retried/read through idempotency, never followed by a second mutation path.

### Files/objects affected

- `src/app/store/page.tsx` and `src/app/moviback/premi/page.tsx`.
- The two current API route files.
- Small typed RPC/response/error adapter modules and tests.
- Server-only rollout configuration documentation; no public secret/value.

### Validation

- Typecheck, lint, production build and pure unit tests.
- Contract snapshots for legacy versus RPC response bodies/statuses.
- Verify production selector remains legacy and staging selector uses RPC.
- Verify key retention across timeout/retry and reset after deliberate request changes.
- Verify no user/member identity from JSON reaches the function.

### Rollback

Revert the application adapter/client-key changes while database objects remain unused. Database removal is unnecessary and should not be coupled to application rollback.

### Production risk

LOW while production remains legacy; MEDIUM in staging because transaction behavior becomes active there.

## PF-08C — Isolated staging transaction verification

### Work

Enable RPC mode only in isolated staging and execute the complete PF-08 test plan:

- normal/multi-item/mixed checkout;
- all Store and non-Store redemption branches;
- fault injection after every write stage;
- concurrent last-stock and same-balance races;
- duplicate/conflicting idempotency keys and dropped-response replay;
- service-role grants/direct invocation denial;
- PF-07 notification test doubles;
- compatibility reads through admin/member/staff pages;
- PF-06 route/RPC/lock timing.

Use production-shaped synthetic data and multiple connections. Do not use real notification credentials.

### Files/objects affected

- Test fixtures/harness and staging-only configuration.
- No production data.
- Function migration may be corrected through a new migration; never edit an applied migration in place.

### Validation

- Exit criteria in `PF-08_TEST_PLAN.md` all pass.
- Zero partial state across every injected failure.
- At most one constrained success in every race.
- One server-to-database RPC request per attempt.
- Lock waits/deadlocks are understood and within approved operational bounds.

### Rollback

Disable staging RPC mode, revert the staging deployment, and apply reviewed forward database corrections if needed. Synthetic fixture cleanup is confined to staging.

### Production risk

LOW because production remains legacy. Staging risk is controlled and intentional.

## PF-08D — Production cutover with observability

### Preconditions

- PF-08C passes and rollback has been rehearsed.
- Database backups/recovery posture and migration window are approved.
- Live data-quality checks are rerun immediately before constraints.
- Dashboards/alerts exist for RPC success, controlled errors, conflicts, replays, unexpected errors, lock wait, deadlock, route latency and provider callback failures.

### Work

Prefer a short, explicit server-side rollout over user-visible dual semantics:

1. deploy application code capable of both paths but default legacy;
2. verify health and database objects;
3. enable RPC for an internal/test allowlist using synthetic or explicitly authorized accounts;
4. enable a small deterministic cohort if business operations can be safely observed;
5. expand to all traffic after a defined evidence window;
6. keep legacy code available but never execute both paths for one key.

The cohort selector must be stable per authenticated user/request and chosen before mutation. Do not use random per-retry selection.

### Files/objects affected

- Server rollout setting/allowlist mechanism.
- Existing routes/adapters and telemetry dashboards.
- No further schema change unless a separately reviewed corrective migration is required.

### Validation

- Compare success/error/replay/conflict rates and latency distributions to baseline.
- Reconcile order ↔ items ↔ ledger ↔ stock and redemption ↔ debit ↔ inventory ↔ fulfillment invariants with read-only queries.
- Confirm no negative finite stock, duplicate scoped key, duplicate redemption debit or duplicate fulfillment order.
- Confirm notifications remain post-commit and provider failure never rolls back business data.

### Rollback

Do not drop database objects or constraints. Disable new RPC starts through the selector.

Because some RPC operations may already be committed, the prepared rollback build must retain an idempotency-result preflight: a retry carrying an existing RPC key returns the stored result and never enters legacy mutation. Only a genuinely unseen key may use the legacy path. A request with an unknown RPC outcome must be resolved by same-key replay, not legacy fallback.

If the defect is in result formatting/notification scheduling rather than database mutation, keep the RPC and roll back only the adapter/UI layer where possible.

### Production risk

HIGH. This stage changes money-equivalent points, scarce inventory and fulfillment creation. Idempotency and rollback discipline reduce but do not eliminate operational risk.

## PF-08E — Stabilize and retire legacy mutation orchestration

### Work

After a defined observation window:

- remove the legacy multi-statement write paths and compatibility source fallback;
- remove rollout branching but retain typed RPC adapters and idempotency replay;
- retain PF-06/PF-07 instrumentation with bounded operational logging;
- finalize runbooks for contention, replay, reconciliation and provider failure;
- decide idempotency retention/archival based on maximum retry horizon and audit needs;
- validate and then remove any temporary rollout-only permissions/settings.

### Files/objects affected

- The two route handlers and obsolete local mutation helpers.
- Rollout configuration.
- Operational documentation/tests.
- Database objects remain; no destructive cleanup until backup/retention review.

### Validation

- Full regression/concurrency/idempotency/security suite.
- Production reconciliation over the entire observation window.
- No traffic/telemetry uses the legacy path.
- Recovery drill successfully replays an ambiguous committed response.

### Rollback

Rollback to the last RPC-capable compatibility deployment, not directly to the original non-idempotent route. Keep idempotency/database objects so already committed results remain replayable.

### Production risk

MEDIUM. Mutation semantics are already proven, but code removal narrows emergency options; retain tagged deployment artifacts and runbooks.

## Constraint/data rollout ordering

| Change | Required precheck | Safe activation note | Rollback concern |
|---|---|---|---|
| Idempotency unique key | No duplicate seed rows | Add while table empty/unused | Preserve committed keys once traffic starts |
| Membership `user_id` uniqueness | Group/count duplicates and resolve ownership | Create only after product approval | Removing uniqueness reopens ambiguity but does not delete data |
| Null-safe stock uniqueness | Find all duplicate null-size variants and choose canonical rows | Remediate before index creation | Old duplicate-producing admin paths must also be compatible |
| Non-negative finite stock checks | Find negative values and confirm null=unlimited | Validate with minimal locking strategy | Dropping check weakens invariant but preserves data |
| Redemption debit uniqueness/FK | Audit duplicates, orphan links and deletion lifecycle | Coordinate with reward cancellation/admin paths | FK/unique can block legacy cleanup behavior |
| Fulfillment order uniqueness | Audit multiple orders per redemption and confirm invariant | Partial uniqueness only for relevant order type | Admin repair/replacement workflow must be defined |

## Operational stop conditions

Pause expansion or roll back new starts if any of the following occurs:

- partial-state invariant violation;
- finite stock below zero or more committed units than available;
- duplicate protected debit/order/redemption for one idempotency key;
- unexplained increase in insufficient-balance/stock errors;
- sustained deadlocks, lock timeouts or materially degraded p95;
- authorization/grant failure or evidence of direct unauthorized RPC access;
- response incompatibility breaking current clients/admin views;
- inability to replay an ambiguous committed result.

Notification-provider degradation alone is not a transaction rollback trigger because PF-07 notifications are explicitly post-commit. It should trigger its own operational alert and future outbox evaluation.
