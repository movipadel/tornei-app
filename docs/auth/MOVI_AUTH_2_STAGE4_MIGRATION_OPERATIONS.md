# MOVI Auth 2.0 — Stage 4 migration operations

Date: 2026-09-21. Stage 4 extends the Stage 3 review and merge engine. It was implemented and tested against the unlinked local Supabase stack only.

## 1. Scope

Stage 4 makes candidate scanning, review, dry-run reporting, reviewed execution, dual-MoviBack reconciliation, progress reporting, and post-merge verification operational. It does not scan production, auto-approve, auto-merge, delete users, retire legacy access, alter Auth precedence, deploy, or implement Stage 5.

## 2. Candidate scan

`run_user_duplicate_scan` is service-only and explicitly invoked by an administrator. It reuses the Stage 3 normalized-email, normalized-phone, exact-name, and one-digit-phone signals. Shared/business mailbox prefixes, weak name/phone signals, and groups containing an invalid technical phone are classified for manual review. Invalid phones never become strong phone matches. The scan takes a global advisory lock shared with reviewed execution and records one `user_duplicate_scan_runs` row.

## 3. Queue lifecycle

Every group has a deterministic fingerprint derived from included users, normalized identity values, profile versions, Auth state, and domain reference counts. Repeated scans update the same group and members. Unchanged groups remain stable. Material changes set `is_stale`, `stale_at`, and a reason. Groups no longer discovered become stale. Rejected groups remain rejected; a changed membership set produces a new deterministic group and leaves the earlier decision auditable.

## 4. Recommendation logic

The Stage 3 ranking still prefers Auth linkage, consent evidence, domain history, and age. Stage 4 stores human-readable reasons such as Auth linkage, MoviBack membership, tournament/Store history, complete mandatory consent evidence, and oldest-profile status. Exactly one Auth-linked profile must be canonical. Multiple distinct Auth identities remain a hard conflict.

## 5. Review workflow

An admin inspects the group, includes or excludes members, selects canonical and source profiles, chooses the winner for name, phone, email, and gender, adds notes, and records approved, rejected, manual-only, conflict, or pending status. Auth-linked canonical email cannot be replaced. Every decision is appended to immutable `user_duplicate_review_decisions`; it is not represented only by the current group row.

## 6. Dry-run report

`duplicate_migration_dry_run` returns one read-only report per active source/canonical pair. It includes group/user IDs, confidence, explained recommendation, blockers, warnings, ownership moves, pair counts, field winners, exact consent outcome, Auth outcome, alias intent, soft-merge result, MoviBack plan, and reversal classification. `/api/admin/users/duplicates/report` exports this safe projection as JSON or CSV. It exposes no password, token, Auth UUID, tax code, document, ledger-row payload, or full business content.

## 7. Dual MoviBack handling

`preview_dual_moviback_reconciliation` derives each balance from `sum(loyalty_transactions.points_delta)`. Reconciliation is safe only for exactly one approved membership per profile, matching tax identity, compatible membership type, and consistent transaction/redemption links. Unsafe cases remain blocked.

For a safe reviewed execution, the canonical membership remains authoritative. Transactions, redemptions, and user promos move by membership ID without changing their IDs or business fields. The source membership summary and expected ledger totals are archived in immutable evidence, then the source membership is removed. The final ledger sum must equal the two pre-merge sums. Redemption IDs, QR/manual codes, statuses, refunds, Store links, and history remain unchanged, preventing point loss, point duplication, or duplicate rewards.

## 8. Monday League checks

Queue detail shows team and captain state. Preview blocks same-team duplicate rosters and Stage 3 also blocks duplicate sporting identity. Captain identity remains the existing roster-player row when ownership moves. Lineup, result, contest, audit, and delivered-notification actors remain historical source evidence. Post-verification checks canonical roster uniqueness and confirms no captain row still points to the merged source.

## 9. Tournament checks

Dry-run reports registration and run-participant totals. Same-tournament and same-run appearances block execution because they represent potentially distinct players. Ownership moves only after those checks. Names, phones, positions, pair data, player keys, circuit-result phones, and ranking identity remain unchanged.

## 10. Store checks

Dry-run includes total Store orders, open-order warnings, and redemption-linked counts. Execution only changes `store_orders.user_id`. Customer snapshots, prices, items, inventory, fulfillment, supplier, payment, cancellation, and redemption references remain unchanged. Post-verification compares the canonical order count with the preflight pair total.

## 11. Consent handling

Preflight displays the exact privacy, terms, age, marketing, and marketing-timestamp result. Privacy, terms, and age preserve the earliest evidence. Marketing remains enabled only when both profiles were opted in; otherwise it becomes false and its timestamp clears. Field selection cannot force a marketing opt-in.

## 12. Execution

Execution requires an approved, non-stale group; a refreshed dry-run; the exact fingerprint; and typed `MERGE`. `create_reviewed_user_merge_operation` records the reviewed plan. `execute_reviewed_user_merge` serializes against scans and other user operations, rechecks the fingerprint and blockers, applies field winners, optionally reconciles MoviBack, delegates the remaining domain move to Stage 3, and returns per-domain journal results. Any failure rolls the domain work back and records `needs_review`.

## 13. Verification

The post-merge verifier checks source soft-merge state, active alias, active canonical profile, ownership movement, roster/captain integrity, MoviBack ledger balance, Store/tournament totals, unchanged communication count, conservative marketing result, and completed journal evidence. A failed check rolls the attempted merge back and surfaces the operation as `needs_review`.

Operator checklist after a successful result:

1. Confirm every verification check is `ok`.
2. Inspect the per-domain results and MoviBack evidence when applicable.
3. Confirm source login no longer resolves and canonical access still works.
4. Confirm Store snapshots and tournament sporting identity remain unchanged.
5. Confirm no notification or external transport was invoked.

## 14. Migration progress

`user_migration_summary` reports total, unlinked, Auth-linked, and merged users plus pending, manual-only, approved, rejected, merged, conflict, and stale groups. Completion is the percentage of merged profiles plus active Auth-linked profiles that do not belong to an unresolved or stale group. Auth linkage alone never resolves an outstanding duplicate conflict.

## 15. Reversal runbook

Automatic undo is intentionally absent. A reversal may be reviewed only when no post-merge order, transaction, redemption, tournament, roster, consent, or notification activity depends on the canonical result. Inspect the operation preview, domain journal, alias, immutable MoviBack evidence, Store/tournament snapshots, and subsequent timestamps. Ownership moves may be conditionally reversible; historical actors and snapshots require no reversal. If later business activity exists, create a domain-specific manual correction plan and retain the alias until authorization and data-integrity review are complete.

## 16. Security

Scan, review, preview, report, execution, verification, scan-run, decision, and reconciliation-evidence capabilities are service-role only. New tables use RLS and deny browser roles. APIs require `guardAdmin`. Audit/evidence tables reject update and delete. Exports intentionally omit passwords, tokens, Auth IDs, tax codes, medical documents, and raw business payloads.

## 17. Test evidence

Rollback SQL covers deterministic/idempotent scans, rejected-state preservation, stale detection, manual classifications, technical-phone exclusion, recommendations, Auth rules, safe and unsafe dual memberships, points/redemptions, Monday League and tournament conflicts, Store snapshots, conservative consent, typed/stale execution contracts, post-verification, summary accuracy, safe export, browser denial, and notification counts. A two-session harness verifies scan-versus-merge serialization. Stage 1–3 SQL and the full application suite remain regression gates.

## 18. Production precheck

The future production sequence is read-only first:

1. Confirm the target and linked project under an approved change window.
2. Apply reviewed migrations without invoking the scan or merge commands.
3. Run the dry-run export with a service/admin session.
4. Review group volume, stale/manual/conflict counts, Auth blockers, domain counts, and every dual membership.
5. Obtain domain, privacy, and operational approval for retention and reconciliation rules.
6. Rehearse selected synthetic cases and rollback on a production-like non-production copy.
7. Enable reviewed merges one group at a time with monitoring and post-verification.

Stage 4 does not authorize any of these production actions.

## 19. Stage 5 prerequisites

Stage 5 requires approved production inventory, acceptable manual/conflict volume, domain-owner sign-off for MoviBack evidence retention, an incident and reversal procedure, monitoring for `needs_review`, verified exports, and an explicit decision about legacy retirement. No bulk migration or legacy cutoff should begin before those gates pass.
