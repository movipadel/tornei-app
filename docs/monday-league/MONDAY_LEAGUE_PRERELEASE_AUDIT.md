# Monday League final pre-release audit — release candidate 97cc13a

Audit date: 2026-09-21. Audited release candidate: `97cc13a16b8a4bdf07f6815c4272ba82fa0b9d07` plus the uncommitted M2 UI remediation recorded in section 27. Final recommendation: **GO for the controlled hidden rollout described below**, subject to the listed production-only dependencies and review/commit of the scoped remediation. H1, H2 and H3 are committed and freshly regression-tested; M2 is remediated and visually accepted. Sections 1–25 preserve the historical stop/remediation record; sections 26–27 contain final certification and UI-remediation evidence. No historical migration was changed.

## 1. Scope

Requested scope: architecture, clean migration replay, database integrity, grants, authorization, full sporting lifecycle, privacy, notifications, generators, concurrency, existing application regressions, frontend acceptance, and a proposed production rollout/backup/rollback plan.

The request explicitly requires stopping on a BLOCKER/HIGH before modifying implementation. A transactional reproduction confirmed H1, so further acceptance execution was stopped. Prior-stage reports are historical evidence only; their passes are not counted as passes in this audit.

Production was not accessed. No project was linked, no remote SQL ran, and no deploy, push, commit or staging occurred. The production ref `unhalrlrnqxgfatbybrc` is documentation only.

## 2. Audited commit range

Local `origin/main`: `a0ad9eeadbeeb942ad5ce881f47d4dcb17904377`.
HEAD: `18dbdcc` (`Add Monday League season completion`), branch `main`.
Range inspected: `origin/main...18dbdcc`, ten Monday League commits, 91 files, 10,234 insertions and two deletions.

| Classification | Files |
| --- | ---: |
| Database/migrations | 8 |
| Server/API/domain | 33 |
| Public UI | 4 |
| Admin UI | 8 |
| Tests | 26 |
| Documentation | 10 |
| Existing-domain integration | 2 |

The changed-file inventory was inspected in full. Implementation review was partial at the stop point. The two existing-domain changes are the home hero and admin navigation card. Circuit/tournament rendering was not removed in the home diff. Neither protected local file is in the commit range. No generated build artifact appears in the range or initial worktree. A complete secret scan was not reached; absence of secrets is not certified.

Initial dirty state: modified `supabase/config.toml` and untracked `supabase/tests/fixtures/home_sections_visual.local.sql`. Both remain untouched.

## 3. Architecture verdict

Provisionally coherent: separate `league_*` domain, existing user/staff sessions, server service-role routes, authoritative result revisions and derived standings. H1 demonstrates a cross-stage invariant gap between Stage 3 special outcomes, Stage 6 contests and Stage 8/9 readiness.

Documentation divergence confirmed: Stage 8/9 promise unresolved contests block progression; the implemented special-ruling path allows an unresolved contest to survive completion. Historical Stage 0/4 rules were intentionally superseded by Stage 5 for draft captain roster editing and independent visibility, including public archived seasons. Those older descriptions should be read as stage history, not current contracts.

## 4. Migration verdict

PASS for chronological replay: `npx supabase db reset --local --no-seed --yes` completed successfully, applying **18/18 migrations** from zero: ten existing-app migrations and eight Monday League migrations. The migration ledger independently reports 18.

Verified first using `npx supabase status -o json`:

- No local project-ref link marker (`linked_project:null`).
- API `http://127.0.0.1:55021`.
- DB `postgresql://postgres:postgres@127.0.0.1:55022/postgres`.
- Studio `http://127.0.0.1:55023` and Mailpit `http://127.0.0.1:55024`.

A recoverable local pre-reset custom dump was saved at:
`C:\Users\MASSIM~1\AppData\Local\Temp\monday-league-audit-20260921-102457\local-before-replay.dump`.
SHA256: `C85C4C2D68962CA26F9B41A36DFDB25333AC4226E3C541CF48F5B311C90FBA3C`.

The local database is left at the clean migrated state; the previous dirty local database was not restored. H1 fixtures were rolled back. Final checks returned `seasons=0`, `audit_fixture_users=0`, `outbox=0`. No seed or protected visual fixture was executed. A separate shadow-schema diff and complete object inventory remain pending.

## 5. Security/RLS verdict

Catalog queries confirmed all **20 league base tables** have RLS enabled and neither `anon` nor `authenticated` has SELECT/INSERT/UPDATE/DELETE privileges.

Tables: `league_seasons`, `league_teams`, `league_team_players`, `league_phases`, `league_phase_teams`, `league_venues`, `league_venue_slots`, `league_rounds`, `league_matches`, `league_match_team_slots`, `league_generation_runs`, `league_audit_events`, `league_result_submissions`, `league_match_sets`, `league_match_special_outcomes`, `league_season_deletion_log`, `league_lineups`, `league_lineup_players`, `league_result_contests`, `league_notification_events`.

L1: four trigger functions retain executable grants for anonymous/authenticated roles: `league_preserve_revealed_lineups_on_reschedule`, `league_block_result_reschedule`, `league_enqueue_audit_notification`, `league_enqueue_reschedule_notification`. Catalog results showed explicit `search_path=pg_catalog,public`; the last two are SECURITY DEFINER. These return `trigger` and cannot be invoked as ordinary RPCs, so no direct exploit was demonstrated. Nevertheless, this contradicts the requested blanket EXECUTE-grant posture. Proposed later additive hardening: revoke PUBLIC/anon/authenticated EXECUTE on these trigger functions and verify trigger behavior remains intact.

Cookie readers and sampled routes derive users/admins from signed sessions; database commands assert active admin/current captain. Full negative HTTP authorization tests, stale captain tests and complete function/index/constraint/storage-policy inventory were not reached.

## 6. Lifecycle verdict

FAIL: H1 permits `phase2 -> completed` with an unresolved contest. Full draft-to-hard-delete acceptance was stopped and is not claimed.

H1 reproduction used the existing Stage 9 fixture setup inside BEGIN/ROLLBACK, adjusted its current Serie A result to represent a fresh captain submission, then used service-role production commands:

1. Away captain calls `league_away_captain_contest_result` successfully.
2. Admin calls `league_set_match_special_outcome` with the contested current result ID and a valid walkover.
3. Open-contest count remains **1**.
4. `league_phase2_completion_readiness(...)->>'ready'` returns **true**.
5. `league_complete_season` returns `created:true`, `status:completed`, `notifications:4`.
6. Query shows **completed / unresolved_contests=1**.
7. Deferred constraints pass; ROLLBACK removes all test changes and queued local notification rows. Nothing was delivered.

The supported admin contest resolver requires the original result to remain the current contested revision, so the special replacement also prevents normal resolution of that historical open case. The completed-season lock further forbids sporting mutations after closure.

## 7. Privacy verdict

Not certified. Public read-model and authorization boundaries were inspected in part, but raw JSON privacy tests before/at the deadline, simultaneous reveal, rescheduling/reopening and alternative read paths were not executed in this audit. Historical Stage 5 test results are not a substitute for the requested fresh pass.

## 8. Standings verdict

The design derives separate phase standings from authoritative result pointers. H1 shows a final special outcome can be counted despite an open historical contest. Scoring, tie-breaks, corrected revisions, zero-contribution states and 16/15/13-team generator acceptance remain pending in this audit.

## 9. Notification verdict

M1 (MEDIUM): Stage 7 notifications and the Stage 8 Phase 2 hook generate `/monday-league/team/<slug>`, whereas the actual page is `/monday-league/squadre/[slug]`. No matching rewrite/redirect exists in `next.config.ts`. Affected copy includes reminders, result submission, contests, rescheduling, reopening and Phase 2. Stage 9 completion uses the correct path. Users following affected calls to action cannot reach the intended team page.

Proposed later patch: replace affected function bodies in a new migration, use the canonical team route, and test that every emitted CTA resolves. If any prior events exist at rollout, separately review a narrowly scoped correction for league-owned pending events/communications. No such data update was executed.

Source review found SKIP LOCKED claims, deterministic event keys, bounded claims/retries, five-minute leases and atomic in-app insertion/delivery. Fresh race/retry/current-captain/scan tests were not reached. No external notifications or outbox delivery calls were made.

Cron source exports POST only, uses a timing-safe bearer comparison, scans 100 and claims 50, and accepts no recipient input. Runtime 401/405/no-mutation tests are pending.

## 10. Concurrency verdict

Not certified; no concurrency suite was executed in this audit before the HIGH stop. The standard path `C:\Program Files\Docker\Docker\resources\bin\docker.exe` was checked and was absent; PostgreSQL 17 psql exists. Alternative Docker locations were not exhaustively investigated. Do not claim Docker is unavailable everywhere or waive legacy races on that basis.

Follow-up review must include Phase 2 generation versus concurrent authoritative result mutation: the current generation function locks the season, but the inspected source does not lock source matches before computing readiness. This is an unverified concern, not an additional confirmed HIGH finding.

## 11. Existing app regression verdict

Pending. No full Node/SQL/application regression suite was run in this audit after the clean replay. The PF-08 classification fixture cause was not re-investigated and must not be assumed solely from earlier reports. No unrelated production logic was altered.

## 12. Performance verdict

Partial source review: public snapshot reads are batched around one selected phase and standings RPC; no large audit/outbox joins were observed there. Team division fallback may load a second phase snapshot. No measured query plan/latency or complete index audit was performed; no speculative optimization is proposed.

## 13. Visual acceptance

Not run in this audit. No Next server was started and no browser session was opened. Desktop, 768px, 390px and all requested admin/captain/public flows remain gates after H1 is fixed. Prior Stage 9 screenshots are not treated as a fresh acceptance pass.

## 14. Known limitations

Execution stopped on H1 as instructed. Pending checks include complete source/secret review, catalog inventory and shadow diff, negative auth, raw lineup DTOs, exact contest boundaries, full lifecycle, all generators/concurrency suites, PF-08/app regressions, TypeScript/build/lint and browser acceptance. `git diff --check` passed before document creation and is repeated at handoff. No build ran, so no build artifacts require restoration.

## 15. Blockers and proposed remediation

No separate BLOCKER-severity defect was confirmed. **H1 is HIGH and blocks release.**

Exact sources:

- Stage 3 migration `20260920170000_monday_league_stage3_scheduling_results.sql:407`: special outcome supersedes current result; lines 410–412 replace authority without resolving/rejecting open contests.
- Stage 9 migration `20260923100000_monday_league_stage9_completion.sql:32`: terminal predicate accepts the active special outcome. Line 36 checks contests only by current result ID, and only for the reason label. Lines 82–85 base readiness on terminal counts.
- Stage 8 migration `20260922100000_monday_league_stage8_phase2_generation.sql` repeats the same current-result-only readiness pattern; this related exposure is source-confirmed, not separately reproduced.
- Stage 6 migration `20260921090000_monday_league_stage6_results_contests.sql:176`: normal resolution rejects a result no longer current.

Proposed patch, **not applied**:

1. Add a new migration, leaving all historical migrations unchanged.
2. Make both readiness computations reject any open contest associated with the relevant matches, independently of the current result pointer, and include contest state in the fingerprint.
3. Reject special/workflow replacement of a match with an open contest unless the same supported transaction explicitly resolves it with actor, reason and audit evidence. The conservative repair is requiring resolution first.
4. Align locks for readiness/generation/completion and result/contest mutations; prove deterministic ordering with real races.
5. Add the reproduced contested-result-to-special-outcome scenario for Phase 1 and Phase 2. Assert closure/generation cannot succeed, then verify legitimate resolution permits progression without losing revision history.
6. Review any existing non-production orphaned open cases before retesting. Do not silently mark historical contests resolved.

M1 is the broken notification CTA described above. L1 is trigger EXECUTE-grant hardening. Additional findings cannot be ruled out while the audit is incomplete.

## 16. Production dependencies

All steps below are a proposal only and must not be executed under this audit authorization.

- H1 fixed, reviewed and fully retested; M1 corrected or explicitly dispositioned before release.
- Fresh full audit at the actual release SHA, including replay and restored-backup verification.
- Verify actual production migration ledger separately under explicit release authorization; this audit never queried it.
- Existing server-only `SUPABASE_SERVICE_ROLE_KEY`; matching `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`; browser anon key; `USER_COOKIE_SECRET`; `STAFF_COOKIE_SECRET` or existing `ADMIN_COOKIE_SECRET`. Preserve existing cookie-name configuration. Never expose service-role or cookie secrets in public variables.
- Strong `CRON_SECRET`; authenticated POST-capable scheduler. Do not assume a default GET-only cron integration can call this endpoint correctly.
- Dedicated `monday-league-media` bucket, ownership-scoped writes and reviewed cleanup policies.
- Access to deployment rollback, backup storage, restore environment and monitoring. No new external notification transport is required.

## 17. Proposed ordered rollout plan

A. Preflight: approve a release SHA after remediation, confirm worktree excludes local config/fixtures/build artifacts, complete this audit, inspect production migration ledger and database version under separate authorization, identify previous application deployment, assign release operator and rollback owner. Keep all real seasons hidden and cron disabled.

B. Take and verify the fresh backup in section 18; preserve prior backups and record the exact ledger/approved release SHA without secrets.

C. Apply only migrations missing from the verified production ledger. The eight Monday League migrations are ordered exactly:

1. `20260920090000_monday_league_stage1_foundation.sql`
2. `20260920130000_monday_league_stage2_teams_generator.sql`
3. `20260920170000_monday_league_stage3_scheduling_results.sql`
4. `20260920210000_monday_league_stage5_captain_lineups.sql`
5. `20260921090000_monday_league_stage6_results_contests.sql`
6. `20260921130000_monday_league_stage7_notifications.sql`
7. `20260922100000_monday_league_stage8_phase2_generation.sql`
8. `20260923100000_monday_league_stage9_completion.sql`

Then apply the reviewed future corrective migration(s), whose names do not yet exist. Existing baseline/PF-08/fulfillment migrations are prerequisites, not instructions to replay baseline DDL over an existing production schema. If ledger prerequisites differ, stop and reconcile; do not invent migration repair entries. An executable production migration command requires that ledger review and separate approval; none was run here.

D. Validate environment variable presence and target URLs through approved deployment tooling without printing values. Configure CRON_SECRET securely, leaving the scheduler disabled.

E. Deploy the approved application release through Vercel only after schema checks pass. Confirm the previous deployment remains available.

F. Configure a bounded authenticated POST schedule (proposed every five minutes, subject to platform/runtime limits), initially disabled. Confirm unauthorized requests do not mutate outbox; then enable after smoke acceptance. Monitor pending age, stuck leases, failures and delivery deduplication.

G. Smoke tests: existing home/circuits/tournaments and account/Store/MoviBack paths; anonymous league table denial; unauthenticated admin/captain denial; hidden hero/league unavailability; authorized admin overview; read model privacy; completion rejection on open contests; canonical notification CTAs. Do not create disposable production sporting data without explicit authorization.

H. Publication stays hidden. Verify migrations create no real league season and creation defaults hidden.

I. Create the first real draft season only with approved real captain/team records. Review roster, seeds, schedule previews and lifecycle operations before generating or publishing. Publish through the explicit visibility command after organizer approval.

J. Rollback triggers: privacy/auth failure, broken existing app domain, migration/data integrity fault, duplicate/misrouted notifications or nonterminal completion. Minor presentation issues may be forward-fixed only after risk assessment.

K. Follow section 19; record operator, timestamps, release IDs and affected seasons. Do not perform casual destructive down-migrations.

## 18. Proposed production backup plan — DO NOT EXECUTE HERE

Run only in a separately approved release session. Use installed PostgreSQL tools compatible with the production server. The example uses a preconfigured PostgreSQL service called `movi-production`, an approved password file/secret mechanism, and `--no-password` to fail if secure credentials are not configured. Do not put a password in command text, URLs, output or this report. The service target must be independently verified as the intended project; it is not configured by this audit.

```powershell
$backupRoot = 'D:\BACKUPS\MOVI\pre-monday-league'
$backupDir = Join-Path $backupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path -LiteralPath $backupDir) { throw 'Backup destination already exists' }
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
$dumpPath = Join-Path $backupDir 'database.dump'
& 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe' `
  --dbname 'service=movi-production' --no-password --format custom --file $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; stop rollout' }
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --list $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'Archive validation failed; stop rollout' }
Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath |
  Export-Csv -NoTypeInformation -LiteralPath (Join-Path $backupDir 'sha256.csv')
```

Secure the dump and manifest as sensitive production data. Verify size, SHA256 and archive inventory; then restore into an isolated authorized non-production environment and check schema, representative counts and application invariants. Archive listing alone is not a restore test. Preserve previous backups in their original folders; never overwrite them. Record approved deployment/migration versions alongside the backup. A database dump does not back up Supabase Storage object bytes; verify provider recovery/PITR capabilities and retain a separate approved storage backup if recovery scope requires it. Resolve managed-schema dump permissions before the release window; do not silently omit required data on errors.

## 19. Proposed rollback plan

Level 1 — Hide Monday League through guarded visibility management. This suppresses public pages/hero, preserves data, and is safe after real data exists. It does **not** stop captain writes or active sporting reminders; visibility is intentionally independent.

Level 2 — Disable scheduler invocations and, if needed, revoke/rotate the cron credential through approved tooling. Preserve outbox and communication history. This stops normal scheduled processing, not already-running transactions; verify in-flight work and worker state.

Level 3 — Roll back the application to the known previous deployment while leaving additive schema in place. Hide affected seasons first and disable cron. Assess old application compatibility and ensure users cannot continue affected writes during the transition. Retain all sporting records for an approved forward fix.

Level 4 — Restore the database only for catastrophic corruption under incident authorization. Stop all writes and notifications, preserve a forensic backup, restore into an isolated target first, validate data and managed services, then coordinate cutover. A pre-release restore loses subsequent app-wide writes, not only league data; account for Store/MoviBack/tournament updates and storage consistency. Never use destructive down-migrations as routine rollback once real data exists.

## 20. Final release recommendation

**NO-GO.** Clean replay and table-access isolation passed, but the reproduced open-contest completion defect invalidates the sporting lifecycle release gate. Fix H1 through a reviewed additive patch under separate authorization, address M1/L1 as recorded, then resume the incomplete audit. No production rollout should be scheduled on the basis of prior green tests alone.

Audit-created repository file: this document only. Implementation, tests, historical migrations and the protected local files are unchanged. No commit, stage, push or deployment was made.

## 21. Remediation 1 evidence — 2026-09-21

This section supersedes the earlier “proposed patch, not applied” wording for H1/M1/L1 only. It does not resume or complete the broader pre-release audit, and the release recommendation remains **NO-GO**.

- Added `20260924100000_monday_league_prerelease_remediation.sql`; all Stage 1–9 migrations remain unchanged.
- H1 now rejects admin correction, special outcome (walkover, no-show and administrative) and workflow supersession whenever any open contest exists for the match. The domain error is `OPEN_CONTEST_REQUIRES_RESOLUTION`; contests are never auto-closed by these commands.
- Phase 2 and completion readiness now treat any open contest for a relevant match as nonterminal, including contests attached to a historical result revision. Open-contest identities are included in readiness fingerprints. Resolved contests do not block.
- Contest opening locks the season row before the match and requires the phase to remain the season's active phase. This serializes contest opening with Phase 2 generation and season completion while preserving the Stage 9 completed-season lock.
- M1 rewrites every installed Monday League notification producer containing `/monday-league/team/` to `/monday-league/squadre/`, and aborts migration if any legacy producer remains.
- L1 revoked direct `PUBLIC`, `anon` and `authenticated` EXECUTE from the four audited trigger-only functions. Trigger execution remained green in Stage 5/7 tests.
- Clean local replay passed through all 19 migrations. All nine Stage SQL suites, seven concurrency harnesses, 119 Node tests, TypeScript, targeted ESLint and the production build passed. The build emitted only pre-existing metadata/browser-data warnings.
- H1 coverage includes 17 explicit SQL assertions and races A–E. Post-race assertions proved no Phase 2 generation or season completion can coexist with an unresolved relevant contest.
- No production access, remote SQL, deploy, push, commit or notification send occurred. Protected `supabase/config.toml` and the local visual fixture were not edited by this remediation.

Remaining state: H1, M1 and L1 are remediated locally, but the full audit was intentionally not resumed. The release gate therefore stays **NO-GO** pending a fresh audit continuation at the eventual release SHA.

## 22. Audit continuation at a01ce56 — HIGH H2, stop required

### Candidate and target

Release-candidate HEAD: `a01ce56d1f57909e5cac67a013b530ae0fae4ab5` (`Fix Monday League contest lifecycle guards`). Its corrective commit contains the additive remediation migration, error mapping and regression coverage. Initial worktree: modified `supabase/config.toml`, untracked audit document and protected visual fixture; no staged changes. Only this document was edited during the continuation.

Fresh `npx supabase status -o json` reports `linked_project:null`, API `http://127.0.0.1:55021`, DB host/port `127.0.0.1:55022`, Studio `http://127.0.0.1:55023`, Mailpit `http://127.0.0.1:55024`. All database/HTTP checks in this continuation used that local target. No Next process was launched and no existing Next process was used.

### H2 — HIGH: admin results and standings cannot load generated phases

Affected sources at this HEAD:

- `src/app/api/admin/monday-league/results/route.ts:11`: `.order("sequence_number")`.
- `src/app/api/admin/monday-league/standings/route.ts:11`: the same invalid ordering.
- Actual installed `public.league_phases` column: `sequence`; `sequence_number` does not exist. The catalog contains `id, season_id, code, name, sequence, status, source_phase_id, algorithm_version, generation_fingerprint, generated_at, finalized_at, finalized_by_staff_id, created_at, updated_at`.

Exact local query reproduction (read-only; authenticated using the local service role without recording its key):

```http
GET http://127.0.0.1:55021/rest/v1/league_phases?select=id,code,name,status&order=sequence_number.asc
```

Observed HTTP **400** and raw body:

```json
{"code":"42703","details":null,"hint":null,"message":"column league_phases.sequence_number does not exist"}
```

This error occurs even on an empty table; no fixture is necessary to establish the schema/query mismatch. With an existing non-archived season, both application routes reach this invalid query. They destructure only `data`, discard its error, select no phase and return HTTP 200 `{ "data": null }`. This application response follows directly from the reviewed control flow; it was not separately exercised through Next or a browser before the mandatory stop.

User impact: results UI (`src/app/admin/monday-league/risultati/page.tsx:42`) displays “Genera prima la Fase 1.” despite generated phases, preventing match selection and all result/contest administration from that page. Standings UI (`src/app/admin/monday-league/classifica/page.tsx:11`) keeps an empty phase selector and table. The SQL mutation RPCs are not themselves disabled, but the normal admin workflow required to resolve contests and operate the league is unavailable. Classified HIGH because it consistently blocks core admin functionality across generated Phase 1 and Phase 2.

Proposed correction, **not applied**:

1. Use the actual `sequence` column in both queries; a schema migration is not needed for this mismatch.
2. Handle season/phase query errors explicitly, returning an error rather than misleading empty-state success.
3. Add runtime integration coverage of both GET endpoints with a real generated phase, plus an error-path test. Assert populated phase/match/standings data and verify the admin pages through the browser.
4. Continue the remaining audit after the separately authorized correction; earlier green SQL and source contracts do not cover this failed API query.

### Evidence retained and certification limits

The user's supplied fresh remediation evidence is accepted: 19/19 clean migration replay; H1 prevention and 17 assertions; five H1 races; Stage 1–9 SQL; seven concurrency harnesses; 119 Node tests; TypeScript/build/targeted lint. These are remediation results, not new executions or full acceptance certification during this continuation. The committed corrective change was inspected; H1/M1/L1 are not reopened by H2.

Fresh work completed before the stop: local-target verification, HEAD/worktree verification, partial public/captain read-model and lineup authorization source review, admin results/standings control-flow review, local schema inspection and the failing PostgREST query above. No new privacy failure was established; privacy is still uncertified.

Remaining gates are explicitly **not certified**, rather than passed or silently waived: complete DB constraints/index/function inventory; complete RLS/security/storage review; negative HTTP auth and stale-captain checks; full disposable lifecycle; fresh team/roster and 16/15/13 generators; scheduling/CET/CEST; raw JSON lineup privacy and alternative read paths; exact contest-boundary rerun; standings and DTO leakage; visibility/home hero; notification and cron runtime acceptance; storage cleanup isolation; Phase 2/completion/archive/delete end-to-end acceptance; expanded concurrency review; full existing-app and fixture-dependent PF regressions; maximum-scale query plans; desktop/768px/390px browser acceptance; final TypeScript/build/lint at the next corrected candidate. Running these after H2 would violate the explicit immediate-stop rule.

The rollout/backup plans in sections 16–19 remain proposals only. They are not approved for execution. Any future ledger comparison must include corrective migration `20260924100000_monday_league_prerelease_remediation.sql` after Stage 9 and apply only missing, reviewed migrations. The earlier wording that no corrective filename exists is historical. No production connection was made. Prefer rollback levels: (1) hide league, (2) disable scheduler, (3) revert application deployment, (4) reviewed forward database fix; database restore is reserved for catastrophic corruption. Complete procedure validation remains gated on audit completion.

No new BLOCKER was confirmed. New HIGH: H2. No additional MEDIUM/LOW was confirmed before stopping. Final verdict: **NO-GO; audit incomplete under the mandatory HIGH stop**.

### Cleanup and handoff

The only HTTP query was read-only local PostgREST. No fixtures, user rows, notifications, storage objects or database functions were created/modified by this continuation. Local season count was zero. No external messages were sent. No generated artifacts were produced. Protected files remain untouched; the audit document remains uncommitted. `git diff --check` passed before this update and is repeated at handoff. No commit, staging, push, deployment, Supabase link or remote SQL occurred.

## 23. Remediation 2 evidence — H2 admin results/standings ordering and failures

This section supersedes section 22's “proposed correction, not applied” wording for H2 only. The fix is uncommitted and the audited HEAD remains `a01ce56d1f57909e5cac67a013b530ae0fae4ab5`. The broader audit was not resumed; release status remains **NO-GO**.

- Confirmed the local target before execution: `linked_project:null`, API `http://127.0.0.1:55021`, database `127.0.0.1:55022`, Studio `http://127.0.0.1:55023`, and Mailpit `http://127.0.0.1:55024`.
- Replaced the two invalid `.order("sequence_number")` calls in the admin results and standings routes with `.order("sequence")`, matching the installed `league_phases` schema. Repository-wide search found no remaining `sequence_number` reference in Monday League application code.
- Both routes now distinguish an absent active season or phase (HTTP 200 with `data:null`) from a failed database read. Season, phase and route-specific downstream query/RPC failures return HTTP 500 with stable code `ML_ADMIN_DATA_UNAVAILABLE`; raw PostgREST messages/details are logged only as bounded server metadata and are not returned to the client.
- The results route checks team, player, round, match, submission, special-outcome, contest, result-state, set and contest-user reads. The standings route checks its standings RPC. This closes the silent-error paths in the two H2 endpoints.
- A disposable local-only runtime harness started the built application on port 3197 with explicit local Supabase environment values, created a local admin, season and three deliberately out-of-order phases, authenticated through the real staff login, and called both actual endpoints. Both returned HTTP 200 with populated data ordered `phase1, serie_a, serie_b`. After fixture removal, both returned the intended HTTP 200 `data:null` no-season state. Cleanup ran in `finally`; no fixture remains.
- Contract coverage asserts the installed column name, error/no-data branching and all targeted error checks. A simulated `42703` query failure verifies the generic HTTP 500 response and proves that private SQL details are not exposed.
- Focused Stage 3/6/8/9 plus remediation contracts passed (39/39); all Monday League Node contracts passed (78/78); the full repository Node suite passed (123/123). Stage 3, 6, 8 and 9 SQL suites passed against local PostgreSQL and rolled back their fixtures. TypeScript, targeted ESLint and the production build passed; the build emitted only the pre-existing metadata and browser-data warnings, and its generated artifacts were restored/removed.
- A targeted review noted other routes with unchecked reads (including schedule, generator, teams and team-media paths), but no second invalid-schema reference or reproduced core-workflow failure. They are lower-severity reliability cleanup outside H2's two endpoints and remain for the unfinished audit rather than expanding this remediation.
- No database migration was required or added. No production access, remote SQL, notification send, deploy, push, commit or staging occurred. Protected `supabase/config.toml` and `supabase/tests/fixtures/home_sections_visual.local.sql` remain untouched.

Remaining state: H2 is corrected in the working tree and its two endpoint paths have local runtime coverage. The earlier uncompleted release gates listed in section 22 remain uncertified, so the release recommendation stays **NO-GO** pending completion of the pre-release audit at the eventual release SHA.

## 24. Audit continuation at 9fa3e87 — HIGH H3, mandatory stop

### Candidate, target and accepted evidence

HEAD is `9fa3e873545e869aec6f90ea5f243c1155f30592` (`Fix Monday League admin phase queries`). H2 is now committed, superseding section 23's working-tree-only status. Initial status contained only the modified protected local config and the two untracked audit/visual-fixture files. Fresh Supabase status: `linked_project:null`, API `http://127.0.0.1:55021`, PostgreSQL `127.0.0.1:55022`, Studio `http://127.0.0.1:55023`, Mailpit `http://127.0.0.1:55024`.

The user-supplied H1/H2 evidence is accepted as fresh: 19-migration clean replay; H1 17 assertions and five races; Stage 1–9 SQL and seven concurrency harnesses; H2 actual authenticated endpoint checks; full Node suite 123/123; TypeScript/build/targeted lint. These checks were not rerun in this continuation before the stop. H2 commit contents were inspected. No production connection or external notification occurred.

### H3 — HIGH: captain lineup controls do not advance past an effectively final result

Source: `supabase/migrations/20260920210000_monday_league_stage5_captain_lineups.sql:391–430`, function `league_get_captain_context`. Its match selection at lines 399–401 excludes only persisted `match_status IN ('confirmed','cancelled')`, then selects the earliest scheduled match across the season. Stage 6 captain submission persists `match_status='submitted'`. The 48-hour rule derives effective confirmation without necessarily updating that persisted status. The context therefore keeps selecting the old match and reports its expired lineup deadline.

The public team read model calls this RPC and forwards its captain context (`src/lib/monday-league/public-read-model.ts`). `src/components/monday-league/PublicLeagueViews.tsx:85` uses that single `captain.match_id` and `captain.can_submit_lineup` to render and target the lineup controls. There is no alternative match selector in that control. Thus a routine previous captain result can prevent both teams from submitting the next lineup through the normal UI; an admin or direct authorized API write may still work. This blocks a core recurring captain workflow and violates operation without a finalization cron.

### Exact local reproduction and observed output

Executed using PostgreSQL 17 psql against `127.0.0.1:55022`, with `ON_ERROR_STOP=1`. Reused only the setup prefix of `supabase/tests/monday_league_stage6_results_contests.sql` before its `DO $test$` block; the prefix opens a transaction, creates disposable users/staff/season/teams/rounds/matches, and sets local role `service_role`. Then executed:

```sql
SELECT public.league_captain_submit_result(
 '61000000-0000-4000-8000-000000000001',
 '68000000-0000-4000-8000-000000000001',
 '[{"homeGames":6,"awayGames":2},{"homeGames":6,"awayGames":3}]');
-- Simulate elapsed contest time, using the same technique as Stage 6 tests.
UPDATE public.league_result_submissions
SET submitted_at=now()-interval '49 hours'
WHERE match_id='68000000-0000-4000-8000-000000000001';
SELECT m.id,m.match_status,
 public.league_effective_result_status(m.current_result_id) AS effective_result
FROM public.league_matches m
WHERE id='68000000-0000-4000-8000-000000000001';
SELECT public.league_get_captain_context(
 '61000000-0000-4000-8000-000000000001',
 '64000000-0000-4000-8000-000000000001');
SELECT id,now()<scheduled_at-interval '1 hour' AS lineup_window_open
FROM public.league_matches
WHERE id='68000000-0000-4000-8000-000000000003';
ROLLBACK;
```

Observed: submission succeeded; old match persisted status `submitted`, effective result `confirmed`; captain context returned old match `...0001`, `lineup_locked:true`, `can_submit_lineup:false`; future match `...0003` returned `lineup_window_open:true`. PostgreSQL exited successfully and printed `ROLLBACK`. Timestamp backdating is a transaction-local simulation of passage of time, not a claim that 49 hours elapsed during the audit. No browser/HTTP reproduction was attempted after confirming HIGH; the UI impact follows from its inspected direct use of this RPC output.

### Proposed remediation — not applied

Add a reviewed corrective migration for captain lineup-context match selection. Select the relevant actionable lineup match using season/phase eligibility, schedule/deadline and authoritative result/special-outcome semantics; ensure an old submitted/contested/terminal match cannot obscure an upcoming match. Preserve historical lineup visibility separately and preserve all existing ownership/privacy/deadline checks. Do not require a cron to persist confirmation as a workaround. Cover two sequential rounds, effective 48-hour finality without cron, provisional/contested previous matches, Phase 1-to-Phase 2 progression, and completed-season behavior. Include actual team response and captain UI tests before resuming certification.

### Stop scope, outstanding gates and plans

No new BLOCKER was established. H3 is the newly confirmed HIGH. No implementation patch was made. The remaining requested areas, including full DB object/security inventory, negative HTTP authorization, end-to-end lifecycle, privacy boundary acceptance, storage cleanup, fresh concurrency, performance and browser/mobile acceptance, remain uncertified. Prior stage evidence cannot substitute for this unfinished full audit. TypeScript/build/lint and regression suites were not freshly rerun after the mandatory stop.

Sections 16–19 remain planning-only historical rollout/backup/rollback material, not newly validated execution approval. The future rollout must use the eventual corrected release SHA and remain gated on audit completion: preflight; timestamped custom database backup; SHA256 and archive/isolated-restore verification; migration-ledger comparison and missing migrations in order; grants/object validation; required environment; application deploy; hidden-league smoke; authenticated CRON_SECRET scheduler; first hidden season and admin smoke; explicit publication approval. Preferred rollback layers are hide league, disable scheduler, roll back application, then reviewed forward DB fix. Restore is reserved for catastrophic corruption. No production step was executed.

Only this audit document was edited. The transactional reproduction created no committed fixtures, storage objects or communications. No Next server was launched or existing server used, no build artifacts were generated, and protected local files were untouched. Final release verdict: **NO-GO; audit stopped on HIGH H3 and incomplete**.

## 25. Remediation 3 evidence — H3 captain actionable-match selection

This section supersedes section 24's “proposed remediation — not applied” wording for H3 only. The audited HEAD remains `9fa3e873545e869aec6f90ea5f243c1155f30592`; the H3 migration and tests are uncommitted. The full prerelease audit has not resumed, so the release recommendation remains **NO-GO**.

### Root cause and correction

`league_get_captain_context` selected the earliest season match whose persisted `match_status` was not `confirmed` or `cancelled`. A captain-submitted result can remain persisted as `submitted` after the exact 48-hour contest deadline, although `league_effective_result_status` already treats it as confirmed. The stale persisted status therefore pinned the lineup context to the old match and hid the next fixture.

Added the single additive migration `20260925100000_monday_league_prerelease_h3_captain_context.sql`. It replaces only `league_get_captain_context`; historical migrations and application UX are unchanged. Selection now:

- uses `league_effective_result_status(current_result_id)` rather than duplicating Stage 6 time/finality logic;
- excludes effective `confirmed`/`superseded` results, active authoritative special outcomes, and persisted confirmed/cancelled matches;
- limits draft/Phase 1 seasons to `phase1` and Phase 2 seasons to `serie_a`/`serie_b`, preventing an already generated future division from appearing early;
- retains provisional and contested results, missing home results, postponed/suspended workflow states, and deterministic schedule ordering;
- runs no sporting match selection for completed/archived seasons while leaving `can_edit_profile` true.

The installed function remains `STABLE`, uses database `now()` through the authoritative Stage 6 helper, and retains `search_path=pg_catalog,public`. `CREATE OR REPLACE` preserves the existing service-only execution grant. Repository search found one captain-context RPC consumer in the public team read model and no second duplicated captain lineup selector. The separate `league_get_captain_result_context` remains the role-aware source for home result submission and away contest actions; the team response combines both contexts.

### Boundary, lifecycle and raw-context evidence

The new transactional SQL suite exercises raw RPC output and rolls back all fixtures. At `47h59m59s`, the old away match remains selected and `can_contest_result=true`. At exactly `48h00m00s` and at `48h00m01s`, the lineup context selects the later Phase 1 fixture with `can_submit_lineup=true` and `lineup_locked=false`. An open contest keeps the old match relevant; after resolution, context advances. A missing home result remains selected with `can_submit_result=true`. Persisted confirmation and active walkover, no-show, and administrative outcomes all allow advancement.

The same suite proves Phase 1 successive-round advancement, final Phase 1 history not pinning Phase 2, successive Serie A and Serie B selection, visibility being orthogonal to sporting actionability, and completed seasons returning no lineup/result/contest actions while profile editing remains allowed.

An authenticated local endpoint harness started the production build on port 3198 with explicit local Supabase environment values. The actual team API returned Match B as `captain.match_id`, `can_submit_lineup=true`, `lineup_locked=false`; its nested result context retained Match A as effectively confirmed with both result/contest actions false. Match A remained present with its result in team history. The harness used a signed user session created by the real local login endpoint, then stopped the server and deleted every disposable row in `finally`.

### Concurrency and regression evidence

The H3 concurrency harness covers: context read versus contest opening; context read versus contest resolution; the exact 48-hour boundary versus persistence finalization; and context read versus next-match rescheduling. Reads may observe either transactionally consistent snapshot, while post-commit context and the existing guarded write commands converge on the authoritative state. All four races passed.

Validation completed against local PostgreSQL/Supabase only:

- all ten Monday League SQL suites passed, including the new H3 suite;
- all 81 Monday League Node tests passed;
- all eight Monday League concurrency harnesses passed;
- the existing authenticated H2 results/standings endpoint harness passed again;
- the full repository Node suite passed 126/126;
- TypeScript, targeted ESLint and the production build passed;
- build output contained only the existing browser-data and metadata warnings, and all generated PWA/TypeScript artifacts were restored or removed;
- the migration was applied and recorded locally through `supabase migration up --local` after target verification.

No production access, remote SQL, link, database push, external notification, deploy, push, commit or staging occurred. Protected `supabase/config.toml` and `supabase/tests/fixtures/home_sections_visual.local.sql` remain untouched. H3 is remediated locally, but the release stays **NO-GO** until the full prerelease audit is resumed and completed at the eventual release SHA.

## 26. Final audit continuation at 97cc13a

### Checkpoint, target and change set

The final candidate is `97cc13a16b8a4bdf07f6815c4272ba82fa0b9d07` on `main`; H3 is therefore committed and section 25's working-tree wording is historical. Initial and final repository state contain only the modified protected local `supabase/config.toml`, this untracked audit document and the untracked protected home visual fixture. Nothing is staged. `git diff --check` passes.

Fresh Supabase status reported `linked_project:null`, API `http://127.0.0.1:55021`, database `127.0.0.1:55022`, Studio `127.0.0.1:55023` and Mailpit `127.0.0.1:55024`. Every database and HTTP action used those local endpoints. The browser server was started with process-only local URL and local publishable/secret keys; an older listener whose inherited environment could not be proven was rejected and replaced. No production connection, Supabase link, remote SQL, database push, external delivery, deployment, push, commit or staging occurred.

### Migration, catalog, integrity and security

A clean reset replayed all **20/20** migrations in chronological order and applied seed successfully. The installed Monday League catalog contains **20 base tables, zero views, 61 functions/RPCs, 76 indexes**, the audited trigger inventory, constraints and the dedicated `monday-league-media` bucket. All 20 tables have RLS enabled. There are no league policies granting browser access, no table privileges for `PUBLIC`, `anon` or `authenticated`, no league RPC EXECUTE grants for those roles, no unsafe SECURITY DEFINER `search_path`, and the trigger-only functions remain non-callable by browser roles. Direct `anon` and `authenticated` table mutation and direct captain-result RPC calls failed closed. HTTP checks returned 401 for unauthenticated captain lineup/result/contest/profile operations and 403 for an unauthenticated admin read. A real captain cookie could update its own team even when the body supplied a false user/team identity, while an attempt against another team was rejected; authorization is derived from the signed cookie, route target and database ownership, not body identity.

Foreign keys were reviewed across season, phase, round, team, match, revision, lineup, contest, notification and audit ownership. Season-owned history uses deliberate cascades or guarded deletion; user/staff identities and history use preserving/restrictive references. Composite phase/team and match/round constraints, unique round/pair/slot/revision/open-contest/idempotency keys, revision pointers and deferred integrity checks prevent cross-owner and orphan states. The hard-delete suites prove league-owned rows are removed while users, staff and unrelated product data remain.

### Functional lifecycle certification

All **ten** Monday League transactional SQL suites passed and rolled back, and all **eight** PostgreSQL-client concurrency harnesses passed. Together they exercise the complete state machine: draft season, team/roster/profile administration, deterministic Phase 1 generation, Monday scheduling, lineup submission/reveal, captain results, provisional standings, contests and admin resolution, final Phase 1, readiness and immutable Phase 2 split, Serie A/B scheduling/results, completion, archive and guarded hard delete. Each stage uses disposable identifiers and cleanup; no fixture survives. This is composed end-to-end evidence across the stage suites rather than one persisted fixture lineage, which is recorded as a limitation below.

Team rules passed: at most four active players, captain required and linked, captain identity immutable through captain roster edits, captain roster edits draft-only, writes blocked after Phase 1 starts, admin correction remains available, removed players become inactive history, deletion before history is safe, withdrawal preserves references after history, and Stage 5 public-profile editing remains allowed independently of sporting status.

Phase 1 generator contracts passed for **16/15/13** teams: respectively 120/105/78 matches, 15 rounds, correct BYEs without fake matches, each pair once, balanced home/away allocation, forbidden three-match streak prevention, deterministic fingerprint/replay and controlled source-conflict behavior. Scheduling suites passed for the eight official Costigliole/Manta/Centallo slots, Monday-only dates, eight-match capacity, duplicate/unofficial-slot rejection, atomic and partial behavior, optimistic `schedule_version`, skipped/consecutive Monday helpers, Europe/Rome CET and CEST conversion, safe rescheduling, lineup-lock preservation/reopen symmetry, result guards, and Phase 1/Phase 2 operation.

Raw lineup privacy is certified at the database/read-model boundary. Before deadline, public lineup fields are null and therefore contain no IDs, names, timestamps or hidden metadata; a captain context exposes only its own lineup and keeps the opponent lineup null; admin reads can retrieve both. At PostgreSQL's exact deadline, captain writes lock and both sides reveal simultaneously. Missing lineups render `Formazione non comunicata` without an auto-defeat. Reschedule preserves locked evidence unless an admin uses the bilateral reopen command. Public API projections call the guarded public-lineup function and do not expose raw lineup rows through an alternate route.

Result/contest suites passed legal 2–0 and 2–1 scores, 6-x/7-5/7-6 validation, home-captain-only submission, away-only contest, immutable captain revisions, immediate provisional standings, duplicate prevention, authoritative current/superseded revision behavior and H1 replacement guards. PostgreSQL boundary assertions pass at **47h59m59s allowed**, **48h00m00s rejected/effectively final**, and **48h00m01s rejected**; finality does not require cron. H3 raw-context assertions prove exact-48-hour progression to the next fixture, retention during an open contest, advancement after resolution, successive Phase 1/Serie A/Serie B rounds and no sporting action after completion. Contest and correction reasons remain absent from public DTOs.

Standings passed exact 3–0 and 2–1/1 point scoring, points/set differential/game differential/persisted tie-break ordering, current authoritative revision selection, inclusion of submitted/contested provisional and final results, zero effect for postponed/suspended/cancelled non-rulings, and 3–0/2–0/12–0 walkover accounting without fake set rows.

Phase 2 passed 16→8/8, 15→8/7 and 13→7/6 splits from final Phase 1 standings, top/rest membership, reset sporting totals, preserved tie-break order, immutable split snapshot, stale-preview rejection, exact/concurrent replay, preserved Phase 1 history and no re-split after later correction. H1 historical open contests block readiness. Completion requires both divisions and every match terminal; unresolved contests, provisional/missing results and postponed/suspended states block. Completion sets its timestamp once, blocks sporting writes/scheduling/new contests, suppresses future sporting reminders, preserves derived final/Phase 1 standings and drives the final hero. Archive is completed-only and preserves data/media/standings with independent visibility. Strong-confirmation hard delete is completed/archived-only and isolates league-owned database/storage prefixes from users, staff, tournaments, Store, MoviBack, communications and unrelated objects.

### Public, notifications, cron and storage

Every Monday League public route and read model was inspected. Public queries use explicit projections; repository search found no public league `select("*")` or broad row spread. DTOs omit phone, email, staff IDs, audit/generation payloads and fingerprints, correction/contest/decision reasons, internal conflicts, protected lineups, storage internals and secrets. Hidden seasons return unavailable. The only captain contexts are added for an authenticated viewer. H2 routes use `league_phases.sequence`, distinguish legitimate no-data from `ML_ADMIN_DATA_UNAVAILABLE`, and order Phase 1/Serie A/Serie B correctly.

Visibility remains independent from sporting state. Hero contracts passed hidden/no-hero, preseason “Scopri le squadre”, Phase 1 “Classifica e prossima giornata”, Phase 2 “Serie A & Serie B” and completed “Classifica finale”. Browser inspection confirms the hero remains after personal/action blocks and before Circuiti MOVI. The protected local visual fixture showed both Circuiti MOVI and Tornei in arrivo unchanged, proving the earlier local absence was data-only rather than a Stage 5 regression.

Notification suites passed all ten event families, deterministic keys, recipient/event uniqueness, `FOR UPDATE SKIP LOCKED`, five-minute lease recovery, bounded attempts, idempotent communication insertion, current-captain targeting, stale-captain/schedule suppression, active hidden-season operations, completed-season suppression and canonical `/monday-league/squadre/<slug>` CTAs. No external transport was configured or called. Runtime cron checks returned GET 405, unauthenticated POST 401, wrong-secret POST 401 and left the zero-row outbox unchanged. A correct local bearer returned 200 with scan/claimed/delivered/skipped/failed all zero. Source uses `timingSafeEqual`, scans at most 100, claims at most 50, accepts no recipient input and logs no credential.

Storage uses the dedicated public bucket, a 5 MB bucket cap and png/jpeg/webp allowlist; the upload route applies 2 MB logo and 5 MB hero caps. Paths are generated as `monday-league/<season>/<team>/<logo|hero>/<uuid>.<ext>`, ownership is checked for captains and admins, and the database rejects paths outside the team's prefix. Failed profile persistence removes the newly uploaded object. Hard-delete cleanup is prefix-limited and independently logged so a storage failure cannot broaden database deletion. The public URL builder emits only validated internal paths created through this route; legacy root-relative/HTTPS handling is retained but cannot be written through the guarded league profile command.

### Performance and existing-app regression

The public main read model batches independent reads with `Promise.all`, builds maps in memory and calls standings once per selected phase; the team page reuses the phase snapshot and adds bounded team/captain reads. There is no per-row database loop or repeated standings call. Readiness and completion operate on the bounded 16-team/120-match league domain. The notification scanner/claim is bounded and indexed by status/due time; match, team, round, result revision, open contest, slot and idempotency access paths have supporting indexes. Safe `EXPLAIN (ANALYZE, BUFFERS)` probes completed in sub-millisecond execution on the disposable dataset; PostgreSQL correctly chose sequential scans for its tiny cardinality. No HIGH performance issue or unbounded audit/outbox payload was found, and no speculative optimization was made.

The complete repository Node suite passed **126/126**, covering tournaments, circuits, MoviBack, Store, inventory, fulfillment, supplier export, unified cancellation, auth, communications, notifications, home and PWA contracts. No fixture-dependent failure was skipped in the reported suite. Existing Circuiti/Tornei browser rendering remained intact.

### Browser, type/build/lint and findings

A production build was served at `http://127.0.0.1:3100` with explicit process-only local Supabase URL and local publishable/secret keys. Desktop and 768 px acceptance passed for home, public league, team page and admin overview/teams/generator/calendar/standings/results/Phase 2 surfaces. Public calendar/result expansion, missing-lineup labels, team roster/captain/next match/history and Phase 1/Serie A/Serie B selectors rendered against the disposable fixture. At 390 px, home, public league, team and Phase 2 admin views remained horizontally contained.

**M2 (MEDIUM, REMEDIATED in section 27):** the admin Monday League calendar had a reproducible approximately 530 px document width at a 390 px viewport. Its title, navigation, date fields and controls were clipped and required horizontal scrolling. Desktop and 768 px were unaffected. This historical finding was corrected and visually accepted by the scoped follow-up recorded below.

**L2 (LOW):** targeted ESLint completes with zero errors and one `react-hooks/exhaustive-deps` warning in `src/app/admin/monday-league/risultati/page.tsx` for the `load` dependency. No stale behavior was reproduced in acceptance, but the hook should be stabilized in routine cleanup. The build's existing metadata `themeColor` and stale browserslist notices are non-blocking cross-app warnings.

TypeScript passes. Targeted ESLint has zero errors/one warning. The production build passes all compilation, type, page generation and trace steps. Generated PWA/TypeScript artifacts are absent from final status.

No new BLOCKER or HIGH was found. H1, H2 and H3 are closed by committed additive/runtime corrections and fresh regression evidence. M2 is the sole new MEDIUM. L2 and existing build notices are LOW.

### Test limitations and final recommendation

The stage suites provide a composed full lifecycle but do not retain one database identity from draft through hard delete in a single test file. Browser fixtures demonstrated Phase 1 plus generated Phase 2, rather than mutating a single browser fixture through completed/archive/delete; those terminal states are covered transactionally and by UI contracts. Performance plans used a small disposable database plus maximum-scale algorithm/index review, not production-like audit/outbox volumes. External email/push delivery, managed scheduler, production environment values, production backup/restore and provider storage recovery cannot be exercised without violating the no-production rule.

Final recommendation as superseded by section 27: **GO for a controlled hidden production rollout**, not unconditional publication. Production-only dependencies must be satisfied: reviewed secrets and URL, service/publishable keys, strong cookie secrets, `CRON_SECRET`, authenticated scheduler, storage bucket/config verification, approved backup/PITR/storage recovery, migration-ledger verification, and monitoring/ownership for outbox failures. Public visibility remains hidden until the hidden smoke subset is explicitly approved.

### Ordered production plan — planning only, not executed

1. Freeze the candidate at `97cc13a16b8a4bdf07f6815c4272ba82fa0b9d07` plus the reviewed M2 remediation commit; verify clean CI/artifacts.
2. Independently verify the intended production project/ref and access boundary; do not infer it from local config.
3. Create a new timestamped custom-format database backup using an approved password-file/service mechanism; record size and SHA256, run `pg_restore --list`, preserve prior backups, and perform an isolated authorized restore check where feasible. Verify provider PITR and storage-object recovery separately.
4. Compare the production migration ledger read-only, review drift, and apply only missing migrations in chronological order. Stop on any unexpected ledger/object state.
5. Verify all league tables/functions/triggers/indexes/constraints, RLS, grants, safe search paths and storage bucket settings after migration.
6. Configure the reviewed production Supabase URL/keys, cookie secrets and `CRON_SECRET`; keep notification scheduler disabled initially.
7. Deploy the exact application artifact for the candidate.
8. Smoke test health/auth/existing products and Monday League admin/public-unavailable behavior while no league is public.
9. Configure the authenticated POST scheduler with the bounded cron endpoint; verify unauthorized probes and a zero/pending controlled claim without real duplicate delivery.
10. Create the first season hidden and run the approved admin smoke subset: teams/roster, generator preview, schedule, standings/results, Phase 2 readiness and media path.
11. Review logs, outbox, storage and existing-app health; obtain explicit owner approval.
12. Publish only through the explicit visibility command after approval. Do not treat deployment as publication.

Rollback remains layered: (1) hide Monday League immediately; (2) disable scheduler/rotate cron credential and preserve outbox; (3) roll the application back to the last compatible deployment while leaving additive schema/data intact; (4) use a reviewed forward database fix for domain defects. Database restore is catastrophic-corruption-only: stop all writes/delivery, preserve forensic evidence, validate an isolated restore and account for all intervening tournament/Store/MoviBack/storage writes. Do not use destructive down-migrations after league data exists.

### Cleanup

The disposable H3/browser season, six users, admin, all league child rows, local visual circuit/tournament, outbox rows and Monday League storage objects were removed using exact local IDs/prefixes. Verification returned zero for the fixture season/users, visual rows, league outbox and league storage objects. The temporary cleanup script and browser tab/server were removed/stopped. The protected fixture file itself was not modified or deleted.

## 27. Final UI remediation — M2 mobile admin calendar overflow

M2 is **REMEDIATED** in the current uncommitted working tree. The change is presentation-only and does not alter scheduling APIs, database commands, sporting rules or stored data.

Root cause: `calendario/page.tsx` used a match-assignment grid with two hard minimum tracks, `minmax(220px,1fr) minmax(220px,320px)`. Its 452 px intrinsic grid width, plus card padding and content-box form padding/borders, forced the page to approximately 530 px at a 390 px viewport. The date grid could also become tight because controls did not explicitly opt into `min-width:0` and `border-box` sizing.

Changed files:

- `src/app/admin/monday-league/calendario/page.tsx`: attaches focused responsive classes while preserving labels, native inputs/selects, button text and all event handlers.
- `src/app/admin/monday-league/calendario/calendar.module.css`: keeps the existing two-column desktop grids, adds containment and border-box sizing, and changes only sub-640 px date/match rows to one flexible column. Narrow action controls become full-width; no page-level `overflow-x` workaround is used.
- `supabase/tests/monday_league_stage3_contract.test.mjs`: adds a focused contract for the responsive module, narrow `minmax(0,1fr)` reflow, border-box containment and absence of a 530 px fixed minimum.

Visual acceptance used the production build at `http://127.0.0.1:3100/admin/monday-league/calendario`, started with explicit process-only local Supabase URL and local publishable/secret keys. A disposable local admin/league fixture exposed three phases, three rounds and all eight official venue/time slots; no production system was accessed.

Measured evidence:

| Viewport | `innerWidth` | document/body `scrollWidth` | Page overflow | Controls |
| --- | ---: | ---: | --- | --- |
| 390 px | 390 | 375 / 375 | none | all 11 within viewport |
| 430 px | 430 | 415 / 415 | none | all 11 within viewport |
| 768 px | 768 | 753 / 753 | none | all 11 within viewport |
| 1280 px | 1280 | 1265 / 1265 | none | all 11 within viewport |

At 390/430 px, all three action buttons are fully visible and centered; phase and round selectors remain readable; each date and match/slot assignment stacks within its card. At 768/1280 px, the original two-column widths and compact button sizing remain equivalent. DOM inspection confirmed three phase choices, three round choices and nine slot choices including “Non programmata”; the scheduling handlers and payload construction are unchanged. Native labels, focusable inputs/selects/buttons and keyboard behavior are preserved, with no control hidden or made reachable only through horizontal scrolling.

Validation: the four Stage 3 contract tests pass; TypeScript passes; targeted calendar ESLint passes with zero findings; the production build passes with only the already-recorded global metadata/Browserslist notices; `git diff --check` passes after generated artifacts are restored. Remaining MEDIUM findings: **none**. Remaining LOW finding: the pre-existing admin-results hook dependency warning recorded in section 26. Release readiness is **GO for controlled hidden rollout**, subject to normal review/commit and the production-only dependencies already listed.
