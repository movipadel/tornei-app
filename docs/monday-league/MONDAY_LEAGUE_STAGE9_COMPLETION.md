# Monday League — Stage 9 Completion

## 1. Scope
Stage 9 closes a completed Serie A/Serie B championship. It adds no phase, playoff, final, promotion, or relegation model.

## 2. Readiness definition
The season must be in `phase2`, both divisions must exist, each must contain generated matches, and every match must be terminal under the Stage 8 authoritative semantics.

## 3. Blockers
Missing or provisional results, open contests, postponed or suspended matches, cancelled matches without a final ruling, and incomplete administrative outcomes block completion.

## 4. Completion command
`league_complete_season` is service-role-only, verifies the admin actor, locks the season/phases/matches, recomputes readiness, validates the preview fingerprint, finalizes both phases, and transitions the season to `completed`.

## 5. Idempotency
The first valid request writes `completed_at`; a later completed-season request returns a replay without changing the timestamp or adding another completion audit event.

## 6. Concurrency
An advisory transaction lock plus season, phase, and match row locks serialize completion. Late result/contest writes either finish before readiness is recomputed or are rejected by the completed-season sporting lock.

## 7. Final standings
Serie A and Serie B remain independent dynamic standings derived from their authoritative results. Completion stores only deterministic fingerprints, not mutable aggregate totals. Phase 1 remains historical.

## 8. Completed public behavior
A public completed season remains accessible with its completed banner, Phase 1, Serie A, Serie B, standings, results, and team pages. A hidden completed season remains unavailable.

## 9. Captain lock
Completed and archived seasons reject lineup, result, contest, scheduling, and other sporting mutations. Profile media and slogan editing remain governed by the Stage 5 profile rule; the roster remains captain-locked.

## 10. Admin correction after completion
Stage 9 uses the safer policy: all result and administrative sporting corrections are blocked after completion. The admin results page shows a strong read-only warning. Reopening requires a separately approved future workflow.

## 11. Notification suppression
Completion immediately marks undelivered lineup, match, and missing-result reminders as skipped. The existing scanner only generates reminders for `phase1` or `phase2`, and delivery rechecks that eligibility.

## 12. Completion notification decision
One in-app `season_completed` event is enqueued for each current captain. Existing outbox and communication event keys make it idempotent. No push, email, Telegram, or external transport is added.

## 13. Hero final state
A completed public season uses “Monday League — Classifica finale” and links to `/monday-league`; hidden seasons produce no hero.

## 14. Archive
Completion does not archive automatically. The existing guarded archive command becomes available, preserves the entire league graph, and keeps visibility independent.

## 15. Hard delete
The existing completed/archived hard-delete confirmation remains authoritative. Completed-write triggers exclude deletes, so the existing isolated cascade and storage cleanup workflow continues to operate.

## 16. Security
Preview and completion are admin-only. The database independently verifies actor, lifecycle, readiness, locks, and fingerprint. Public DTOs expose no actor, audit, blocker internals, or completion fingerprints.

## 17. Local acceptance
Acceptance uses only the unlinked local stack on API 55021, DB 55022, Studio 55023, Mailpit 55024, and an explicitly overridden local Next process. Fixtures are disposable and removed afterward.

## 18. Production rollout dependency
No production action is part of Stage 9. A later authorized rollout must apply migrations in order, run the full pre-release suite in a non-production environment, and verify cron/outbox behavior before deployment.

## 19. Final pre-release checklist
Confirm the local target, apply migrations, run Stage 1–9 SQL/contracts/concurrency, verify completed and hidden public states, run TypeScript/build/lint/diff checks, restore generated artifacts, review migration/security, and deploy only under explicit authorization.
