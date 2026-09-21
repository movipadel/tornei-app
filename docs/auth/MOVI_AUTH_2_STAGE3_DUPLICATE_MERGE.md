# MOVI Auth 2.0 — Stage 3 duplicate review and merge

Date: 2026-09-21. Sources: Stage 0 architecture, Stage 1 identity foundation, and Stage 2 activation/signup. Stage 3 was implemented and tested only on the unlinked local Supabase stack.

## 1. Scope

Stage 3 adds admin-reviewed duplicate discovery, a private review queue, deterministic pairwise previews, explicit canonical selection, transactional execution, soft merge, alias evidence, per-domain policies, journal records, and a reversal foundation. It does not auto-merge, delete profiles, retire legacy login, alter session precedence, migrate hosted users, or implement Stage 4.

## 2. Candidate discovery

`refresh_user_duplicate_candidates` groups active profiles on non-null normalized email or mobile. It also creates `manual_only` work for exact normalized-name matches and valid normalized phones of equal length that differ by one digit. Those weak groups carry a warning and never imply merge confidence. Invalid technical phones return NULL and do not participate in phone matching. Discovery creates review work; it never creates an operation or invokes execution.

## 3. Confidence model

Normalized email is labelled high confidence, exact normalized phone medium, and name/near-phone signals `manual-review`. These labels prioritize review and do not assert one human identity. Shared contacts, technical accounts, incorrect data, and multiple Auth identities remain manual/conflict cases. There is no “safe auto merge” state.

## 4. Canonical selection

The recommendation score prefers an Auth-linked active profile, then valid consent evidence, business history, and the older profile. Admin may override only within the reviewed included members. When exactly one included profile has Auth, approval requires it as canonical. More than one linked Auth profile blocks approval.

## 5. Auth identity rules

A source carrying `auth_user_id` is a blocking conflict: the engine never moves that identifier. Two distinct Auth links are a hard conflict. Merged profiles must have no Auth link, and a trigger makes the source row immutable after merge, including later relinking, profile edits, or identity reactivation. Legacy login rejects a merged phone, and admin captain search excludes merged profiles. Stage 2 activation that races a merge either links first and makes the preview stale, or encounters the merged-user guard.

## 6. Merge preview

`preview_user_merge(source, canonical)` returns safe profile summaries, Auth linkage flags, per-domain source counts, consent and reversal policies, conflicts, captain warnings, canonical-field retention, notification policy, and a fingerprint. It rejects missing or identical IDs. Preview performs no mutation.

## 7. Fingerprint

The fingerprint is derived from both IDs, profile `updated_at`, Auth links, identity states, critical domain counts, and conflict inputs for league teams, tournaments, idempotency divergence, and aliases. Execution compares the submitted value with both the stored preview and a freshly recomputed preview under locks. Any difference returns `STALE_PREVIEW`.

## 8. Execution transaction

`execute_user_merge` is service-role only. It locks the operation, obtains advisory locks for both user IDs in stable order, locks both profile rows, revalidates the preview, and applies every domain step in one PL/pgSQL subtransaction. Any exception rolls all domain/profile mutations back and records a failed operation. Completed operation replay returns idempotent success.

## 9. Alias and soft merge

The source row remains with `identity_status=merged`, `merged_into_user_id`, and `merged_at`; it is never deleted. One active alias records the canonical profile and operation. Alias metadata states that it grants no authorization. Auth and legacy resolution query active profiles directly and never call `resolve_canonical_user_id`, so a legacy source cookie gains no canonical rights.

## 10. Domain policies

Each known ownership domain has an explicit rule. Operational ownership can move after conflicts are excluded. Historical snapshots and actor evidence remain unchanged. The journal identifies policy and reversibility per step.

## 11. MoviBack

One source membership moves to canonical with its membership code, ledger, transactions, redemptions, refunds, promos, and evidence intact because those rows reference membership ID. If both profiles have memberships, preview blocks with `dual_loyalty_membership`; Stage 3 never sums balances or chooses a membership.

## 12. Store

`store_orders.user_id` moves to canonical. Customer name, phone, email, amounts, status, cancellation, fulfillment, payment, supplier, items, and redemption linkage are untouched. No checkout or notification command runs.

## 13. Tournaments

Registration and run-participant `user_id` values move only if both identities do not occur in the same tournament/run. Names, phones, positions, reserve state, participant rows, player keys, circuit result phones, and ranking identity are unchanged. Account merge is not ranking merge.

## 14. Monday League

Roster ownership moves when source and canonical are not on the same team. Because captain identity is the roster player row, that row and captain assignment remain intact. Same-team membership blocks. Lineup/result/contest/audit actor IDs and delivered-notification recipients remain source evidence; undelivered notification ownership moves to canonical.

## 15. Communications

Personal communication ownership moves without resending. Duplicate `(user_id, communication_id)` state rows combine conservatively: read and dismissal are true when either row contains evidence, preserving the earliest timestamp. The redundant state row is then removed inside the transaction.

## 16. Business idempotency

Rows move to canonical. A collision with identical operation, idempotency key, request hash, status, and result preserves the canonical copy and removes the identical source duplicate. A divergent collision blocks preview. No business operation is replayed.

## 17. Medical certificates

`medical_certificates.user_id` moves while file path, state, validity, review actor, timestamps, and notes remain unchanged.

## 18. Consent

Privacy, terms, and age keep the earliest existing evidence. Marketing is conservative: both profiles must be opted in for the canonical result to remain opted in; otherwise false wins and marketing timestamp clears. Before-state and decision policy are journaled. Blank source profile fields never overwrite canonical name, phone, email, or gender.

## 19. Journal and reversal

Stage 1 operations and append-only journal are reused. Records include actor, fingerprint, preview, domain steps, conflicts, before summaries, completion/failure, and reversal classification. Ownership/profile steps are conditionally reversible; historical actors and snapshots are intentionally preserved. Reversal must be separately reviewed because later business activity may make automatic undo unsafe.

## 20. Concurrency

Stable advisory and row locks serialize competing operations. Operation replay converges idempotently. A canonical/source chain cannot leave an alias pointing to an already merged canonical. Merge versus activation cannot produce an Auth-linked merged source. Candidate refresh preserves reviewed decisions while newly detected multiple-Auth state takes precedence as a conflict.

## 21. Admin UX

`/admin/users/duplicates` provides candidate refresh, state/confidence badges, normalized signal, member inclusion/exclusion, Auth state, consent summary, safe reference counts, recommendation, canonical/source selectors, notes, approve/reject/manual-only actions, preview counts, conflicts, fingerprint, reversal warning, and a required typed `MERGE` confirmation. Layout collapses to one column on narrow screens.

## 22. Security

Queue tables and functions are private, RLS-enabled, and service-role only. Every API route uses `guardAdmin`; staff, captain, public, and authenticated browser roles cannot search, preview, approve, or execute. DTOs expose linkage booleans and operational counts, not Auth UUIDs, tokens, passwords, ledger rows, medical documents, or business content.

## 23. Tests and production prerequisites

Rollback-only SQL covers strong and weak discovery, manual-only name handling, technical-phone exclusion, linked-Auth recommendation, dual Auth, accurate preview counts, dual-membership blocking, captain preservation, roster collision, historical league actors, simple merge, replay, alias, immutable soft state, communication reconciliation, Store/tournament snapshots, medical evidence, one membership, conservative consent, stale preview, forced transactional rollback, and browser-role denial. Concurrent tests cover replay, canonical-chain exclusion, and activation race. Before production, inspect live constraints/candidates, define staffed handling for conflicts and dual memberships, approve retention/reversal procedures, rehearse deployment/rollback, and configure monitoring. No hosted operation occurred.

## 24. Stage 4 prerequisites

Stage 4 may address reviewed multi-membership reconciliation, multi-source batch operations, formal reversal commands, richer weak-signal tooling, and legacy cutoff only after legal/financial/domain policies are approved. Stage 3 authorizes no automatic merge or production migration.
