# Monday League — Stage 6 Captain Results & Contestations

## 1. Scope

Stage 6 adds home-captain result submission, away-captain contestation, effective finalization, admin resolution/correction, public status integration and concurrency protection. Notifications and Phase 2 generation remain out of scope.

## 2. Home captain submission rule

Only the current linked captain of the home team may submit. `league_captain_submit_result` derives ownership from the cookie-derived user ID, locks the match and requires an active Phase 1/2 season, a generated/in-progress phase, `scheduled` state, no authoritative result/special outcome and PostgreSQL `now() >= scheduled_at`. Lineups are deliberately irrelevant.

## 3. Score validation

The command reuses Stage 3 `league_validate_match_sets`: two or three sets, legal 6–0…6–4, 7–5 or 7–6 scores, and only 2–0 or 2–1 matches. Validation is repeated in the database even though the captain UI provides live preview.

## 4. Immutability

The captain creates revision 1 once. The match lock and existing authoritative pointers reject retries or edits. No captain delete/update command exists. Admin changes always supersede the old row and create a higher immutable revision.

## 5. Provisional standings behavior

Submitted and contested current revisions remain included by `league_get_standings`. They set `has_provisional_results`; score totals and ordering update immediately after submission. A status transition to final does not alter points.

## 6. Contest eligibility

Only the current away captain can contest the exact current submitted revision. Home captains, unrelated captains, ordinary users, superseded/final results and unauthenticated requests are rejected. The reason is trimmed, mandatory, immutable and limited to 1000 characters.

## 7. Exact 48-hour rule

The deadline is always `submitted_at + interval '48 hours'`. PostgreSQL accepts only while `now() < deadline`; equality is closed. Browser time is never authoritative. Tests cover 47:59:59, equality and +1 second.

## 8. Contest storage

`league_result_contests` links match, exact result revision, opener, immutable reason and resolution metadata. Partial unique indexes allow at most one open contest per result and per match.

## 9. Derived/automatic finalization

`league_effective_result_status` derives an uncontested submitted result as confirmed once the database deadline is reached. Public DTOs, admin filters and provisional standings use this value, so correctness needs no scheduler. `league_finalize_expired_result` is an idempotent optional lazy persistence command with system audit evidence.

## 10. Admin rejection

Rejecting an open contest preserves the current score/revision, marks it confirmed, resolves the contest as rejected and records the mandatory resolution note and audit event.

## 11. Admin correction

Accept-and-correct validates a new legal score, supersedes the contested revision, creates a higher confirmed revision, resolves the contest and records the reason. Direct correction of provisional or final standard results follows the same final revision semantics.

## 12. Revision history

Old `league_result_submissions` and set rows remain unchanged except for lifecycle status. Contests remain linked to the original revision. The match pointer is the sole authoritative revision used by standings and public reads; admin results expose full history.

## 13. Special outcomes interaction

Captain submission is possible only from a clean scheduled match and is therefore blocked by active special outcomes and postponed/cancelled/suspended states. Existing explicit admin special-outcome commands remain the only supported normal-to-special override and preserve reason/audit evidence.

## 14. Reschedule interaction

Pre-result rescheduling remains unchanged. A database trigger rejects venue or scheduled-time changes while a standard result or special outcome is authoritative. Stage 6 does not add a silent override; an explicit future business workflow would need to preserve and audit evidence.

## 15. Captain UX

The existing team page receives server-computed result capabilities. Eligible home captains get a validated set editor, preview and irreversible confirmation. Submitted results show timestamp, deadline and provisional/contested/final status. Eligible away captains get a mandatory-reason contest action; sent and expired states are explicit.

## 16. Admin UX

`/admin/monday-league/risultati` now separates Da inserire, Provvisori, Contestati, Definitivi and Speciali. It shows contest reason, safe opener name, timestamps/deadline, immutable history, reject and accept/correct actions, plus the existing standard and special workflows.

## 17. Public DTO and security

Public reads request database-derived effective states and expose only status, timestamps and score. Contest reasons, resolution notes, correction reasons, actor IDs and audit data never enter the public read model. Captain capabilities are calculated server/database-side.

## 18. Concurrency

Commands lock the match and expected current revision. Unique open-contest indexes and expected IDs/statuses prevent double submit, double contest, stale correction and split authority. The local two-session harness covers submit/special, contest/finalize, contest/correction, resolve/correction and double correction races.

## 19. Local acceptance

Acceptance targets only the unlinked local Supabase API `55021` and DB `55022`. The SQL suite is transactional and rolls back all fixture data. Contract, prior-stage, concurrency, TypeScript, lint, production build and whitespace checks form the release gate.

## 20. Stage 7 prerequisites

Stage 7 may schedule notifications using stored `submitted_at`, derived `contest_deadline`, contest resolution and audit events. Notifications must be idempotent and cannot become the source of truth for finalization. Phase 2 remains a separate future stage.
