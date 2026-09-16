# PF-08A Pre-Migration Verification

## Status and decision

PF-08A production verification is complete. **PF-08B is CONDITIONAL GO.** The manual SELECT-only production checks have established that current data compatibility is not the main blocker. PF-08B must still wait for the isolated staging readiness requirements identified by PF-08S.

## Evidence boundary

The assessment used only:

- the committed PF-08 design, failure matrix, test plan, and rollout plan;
- the current Store checkout and MoviBack redemption behavior already traced by the performance audit;
- the existing live-database metadata export from the audit history;
- repository configuration and environment variable **names only**.

The initial PF-08A analysis did not execute live SQL. After that analysis, the owner manually executed the supplied SELECT-only checks against production and provided the verified results recorded below. No migration SQL, schema change, production write, or environment-value inspection was performed by this task.

## Verified clean current data

The following manual production results are verified:

| Checks | Verified result | Conclusion |
|---|---|---|
| Q01-Q02 | 0 rows | No duplicate stock identities, including no duplicate nullable-size identities. |
| Q03 | 0 rows | No negative finite Store or reward stock. |
| Q04-Q05 | 0 rows | No duplicate approved or historical membership rows per user detected. This does not itself justify a new strict `UNIQUE(user_id)` rule. |
| Q06 | 0 rows | No redemption has multiple linked ledger rows. |
| Q7R-Q8R | 0 rows | Redemption ledger links, membership, source, type, and point amount are consistent. |
| Q09-Q10 | 0 rows | No unlinked redemption-source transaction and no duplicate fulfillment order linkage detected. |
| Q12-Q15 | 0 rows | No detected inconsistent fulfillment order, orphan relationship, cross-product variant mismatch, or candidate range violation. |
| Q16-Q18 | Reviewed | Current constraints, indexes, and foreign keys were confirmed. |

The original Q07/Q08 `type = 'debit'` assumption was invalid. The installed transaction-type CHECK permits `earn`, `redeem`, `adjustment`, `refund`, and `cancel`; the canonical redemption ledger type is `redeem`. Corrected checks Q7R and Q8R were run and are clean.

## Legitimate business states

Q11 returned two Store-linked physical reward redemptions without fulfillment orders. The owner verified both as legitimate pending requests:

- `status = requested`;
- `requires_store_variant = true`;
- `linked_order_count = 0`.

These rows are awaiting processing under the current business workflow. They are not anomalies, orphan rows, historical inconsistencies, or a reason to classify current data as incompatible.

## Future structural risks

## Current structural findings

- `store_product_stock` has an ordinary unique index on `(product_id, color_id, size_id)`. PostgreSQL ordinary uniqueness permits multiple rows when `size_id IS NULL`; the current handlers assume at most one exact row.
- Neither `store_product_stock.stock_qty` nor `rewards_catalog.stock_qty` has an exported constraint proving finite quantities are non-negative. `NULL` is intentionally used as unlimited stock.
- `loyalty_memberships.user_id` is neither unique nor indexed in the export. Current data has no duplicates, but membership request/resubmission lifecycle semantics must be approved before considering a strict `UNIQUE(user_id)` constraint.
- `loyalty_transactions.related_redemption_id` has no exported foreign key or unique protection.
- `store_orders.related_redemption_id` is indexed but not unique.
- Existing single-column variant foreign keys do not prove that a color or size belongs to the same product as the stock or order-item row.
- Existing named CHECK constraints cover several enum/range fields; Q16-Q18 confirmed the current constraints, indexes, and foreign keys.
- There is no current idempotency registry and no transactional checkout/redemption RPC.

## Invariants and manual checks

All query references point to `PF-08A_SQL_CHECKS.sql`. A clean result means zero rows unless stated otherwise.

| Invariant | Repository evidence | Manual check | Current conclusion |
|---|---|---|---|
| One stock row per product/color/nullable-size identity | Unique for non-null size; nullable-size duplicates remain structurally possible | Q01-Q02, Q17 | Verified clean current data; future null-safe protection remains needed |
| Finite Store and reward stock is non-negative | No exported proof before Q16 review | Q03, Q16 | Verified clean current data |
| One approved membership per user | DB does not enforce it | Q04-Q05 | Verified clean current data; do not infer strict lifecycle uniqueness |
| Exactly one correct reward ledger row per redemption | No exported unique/FK protection | Q06, Q7R-Q09 | Verified clean current data using canonical `type = 'redeem'` |
| Existing fulfillment relationships are consistent | Current workflow permits requested Store-linked redemptions without an order | Q10-Q12 | Verified clean; two Q11 pending rows are legitimate business states |
| No orphan redemption, ledger, order, item, or stock relationships | Most references have exported FKs; ledger-to-redemption does not | Q13, Q18 | Verified clean current data |
| Variant rows belong to the referenced product | Current FKs validate existence, not same-product ownership | Q14 | Verified clean current data |
| Candidate positive quantity/cost ranges hold | Named checks and data were reviewed | Q15-Q16 | Verified clean current data |

## Constraint compatibility

The labels below deliberately separate structural evidence from live-data proof.

| Proposed future constraint | Classification | Why / release condition |
|---|---|---|
| Unique `(operation, user_id, idempotency_key)` on a new idempotency registry | **SAFE TO ADD BASED ON CURRENT DATA** | A new empty object cannot conflict with existing business rows. The persistence contract, canonical hash, result shape, ownership, grants, retention, and replay behavior still require implementation review. |
| Null-safe stock uniqueness | **LIKELY SAFE BUT REQUIRES QUERY VERIFICATION** | Q01-Q02 are clean. It remains necessary for deterministic future nullable-size identity because ordinary PostgreSQL uniqueness permits multiple `NULL` values. |
| `stock_qty IS NULL OR stock_qty >= 0` for Store stock | **SAFE TO ADD BASED ON CURRENT DATA** | Q03 is clean; `NULL = unlimited` must remain approved. |
| `stock_qty IS NULL OR stock_qty >= 0` for reward stock | **SAFE TO ADD BASED ON CURRENT DATA** | Q03 is clean; `NULL = unlimited` must remain approved. |
| Unique membership per `user_id` | **NOT JUSTIFIED YET** | Q04-Q05 are clean, but current data alone does not establish that membership request/resubmission lifecycle permits strict all-state uniqueness. |
| Partial unique reward ledger link per `related_redemption_id` | **LIKELY SAFE BUT REQUIRES QUERY VERIFICATION** | Q06/Q7R-Q09 are clean; predicate must use the canonical `type = 'redeem'` semantics and cancellation/reversal behavior must be defined first. |
| One fulfillment order per redemption | **NOT JUSTIFIED YET** | Q10-Q12 show current data, but admin repair/replacement behavior and the exact partial predicate must be approved before enforcing uniqueness. |
| FK from loyalty ledger to redemption | **NOT JUSTIFIED YET** | Q09/Q13 can establish compatibility, but cancellation, deletion, retention, and delete-action semantics must be settled first. |
| Exactly one fulfillment item per Store-like redemption | **NOT JUSTIFIED YET** | It is a future transaction invariant, but a simple row constraint cannot express it across order/item tables; repair and replacement flows are unresolved. |
| Composite same-product variant references | **NOT JUSTIFIED YET** | Q14 detects mismatches, but an enforcement design would affect keys and admin paths and was not approved by PF-08 design. |

No proposed constraint is currently classified **BLOCKED BY EXISTING DATA**. Any future non-empty compatibility result relevant to a proposed constraint requires explicit remediation and an audit trail before enforcement.

## Safe manual execution procedure

1. Use the correct production Supabase project and, if available, a role restricted to reads.
2. Confirm project identity in the Supabase UI before opening the SQL file.
3. Execute Q01-Q18 one statement at a time. Do not append repair statements.
4. Record execution timestamp, project reference, query ID, row count, and reviewer. Retain UUIDs only in a restricted remediation record; do not copy customer PII into audit documentation.
5. Treat any timeout or permission error as **not verified**, never as a clean result.
6. Have a second reviewer verify Q16-Q18 against the intended constraint/grant lifecycle before migration design.

## Staging readiness

| Capability | Classification | Evidence |
|---|---|---|
| Separate Supabase staging project | **NOT FOUND** | No staging project reference, staging-specific Supabase variable name, Supabase config, or linked test project is present. |
| Separate Vercel preview/staging environment | **PARTIAL** | Vercel production deployment is documented, but the repository does not prove a separately configured preview deployment or that previews cannot reach production Supabase. |
| Staging-specific environment variables | **NOT FOUND** | Only generic environment names were found. Values were not read or reported. |
| Test database | **NOT FOUND** | No test database configuration or database lifecycle tooling is present. |
| Seeded test environment | **NOT FOUND** | No PF-08 fixtures/seeds exist. `scripts/test-baraonda.ts` is an in-memory scheduling test and does not exercise Supabase. |

**There is no repository evidence of an isolated staging database.** The detailed minimum requirements are in `PF-08A_STAGING_REQUIREMENTS.md`.

## Remaining implementation blockers

1. Isolated Supabase staging environment.
2. Staging application guaranteed to point only to staging database.
3. Notification isolation.
4. Synthetic PF-08 test dataset.
5. Finalized idempotency persistence design.
6. Null-size stock uniqueness strategy.
7. Rollback rehearsal capability.
8. Safe concurrency test harness.

## PF-08B implementation gate

PF-08B is **CONDITIONAL GO** from the production-data perspective. Implementation may proceed only when all of the following are recorded:

- the verified production results above remain current and are rechecked immediately before constraint activation where appropriate;
- stock identity and `NULL`/missing-stock semantics are approved;
- membership, redemption debit, cancellation, and fulfillment invariants are approved;
- the idempotency persistence contract and database security posture are approved;
- an isolated staging database and synthetic concurrency dataset are available;
- the additive forward migration and forward rollback path from the PF-08 rollout plan are reviewed and rehearsable.

PF-08S currently classifies staging readiness as **NOT READY**. Therefore PF-08B implementation must wait for the listed staging, safety, idempotency, null-size, rollback, and concurrency conditions. This task does not begin PF-08B or authorize migration SQL.
