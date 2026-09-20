# Monday League — Stage 3 Scheduling, Results & Standings

## 1. Stage scope

Stage 3 schedules the immutable Phase 1 pairings created in Stage 2, accepts admin-only standard and administrative results, and derives standings dynamically. It does not add public pages, captain workflows, lineups, disputes, notifications or Phase 2 generation.

## 2. Date management

Each generated round has an optional `play_date`. `league_set_round_dates` locks the phase and every submitted round, checks its expected schedule version, validates Monday dates, and saves the batch atomically. Dates may be null and Mondays may be skipped. Stage 1's unique phase/date index prevents two rounds using the same date.

## 3. Weekly date helper

`generateWeeklyMondayDates` is a pure client-side convenience helper. Given the first Monday, it proposes seven-day increments in round order. The admin can edit or remove any proposal before confirmation; the helper performs no writes. The server and database independently validate the submitted batch.

## 4. Scheduling model

`league_schedule_round` receives a round, its expected aggregate version, one Monday date and a complete assignment array. Every match is present exactly once; a null slot deliberately leaves that match unscheduled. The transaction locks the round and matches, validates at most eight matches, persists the date and official venue/time assignments, derives round status, advances the phase to `in_progress`, and writes one audit event.

## 5. Europe/Rome handling

The browser never supplies UTC offsets. PostgreSQL derives `scheduled_at` from `play_date + league_venue_slots.local_time AT TIME ZONE 'Europe/Rome'`. Local acceptance verifies 20:00 on 19 October 2026 becomes 18:00 UTC before the DST transition, while 19:30 on 26 October becomes 18:30 UTC afterward.

## 6. Schedule versioning

Stage 3 adds `league_rounds.schedule_version`; existing match versions remain authoritative for match-level workflow operations. Date and schedule writes require the expected round version and increment it. Every affected match version also increments when its scheduled instant or assignment changes. Stale writers receive `ML_SCHEDULE_VERSION_CONFLICT`.

## 7. Result schema

`league_result_submissions` stores immutable revisions and their aggregate set/game totals. `league_match_sets` stores only real played sets. `league_match_special_outcomes` stores explicit administrative contributions without synthesizing set rows. A match references at most one current standard result or one current special outcome.

## 8. Set validation

`league_validate_match_sets` accepts exactly two or three sets. Legal scores are 6–0 through 6–4, 7–5 and 7–6 in either direction. A two-set match must end 2–0 and a three-set match 2–1. Draws, 6–5, 6–6, 8–6, missing deciding sets and extra third sets are rejected inside the transaction.

## 9. Result revisions

Initial admin entry creates submitted revision 1. A correction requires the current result ID, expected status and a non-empty reason, supersedes the old row, and creates revision N+1. Confirmation changes the current submitted/contested revision to confirmed. Concurrent confirmation/correction or two corrections cannot both apply because the match lock and expected ID/status checks serialize them.

## 10. Standings engine

`league_get_standings` is a stable authoritative SQL RPC. It starts with every Phase 1 membership, then aggregates only the match's current standard result or active special outcome. There is no mutable totals table and no manual standings editing, so a correction is reflected immediately.

## 11. Scoring

A 2–0 winner receives 3 points and the loser 0. A 2–1 winner receives 2 and the loser 1. Played, wins, losses, league points, sets for/against and games for/against are derived from the authoritative result. Differences are calculated in the response.

## 12. Tie-break ordering

Rows sort by points descending, set difference descending, game difference descending and Stage 2's persisted `tie_break_order` ascending. Teams with no result still appear with zero totals and stable order. No random tie-break is generated at read time.

## 13. Walkover and no-show

Walkover/no-show requires a winner and reason and is validated as exactly 3–0 league points, 2–0 sets and 12–0 games. These values live in the special-outcome row. No fake 6–0 set rows are created.

## 14. Suspended, postponed and cancelled

Suspended, postponed and cancelled matches contribute nothing unless a later explicit administrative ruling is created. Postponement clears the schedule so the pairing can be rescheduled. Suspension and cancellation retain evidence but clear any current standings outcome. All transitions require a reason and audit event.

## 15. Admin UX

`/admin/monday-league/calendario` provides weekly date proposals, editable date batches, round selection and bulk official-slot assignment. `/admin/monday-league/risultati` provides missing/provisional/confirmed/special views, standard scores, revisions, confirmation, walkover/no-show, postponement, suspension, cancellation and advanced rulings. `/admin/monday-league/classifica` shows authoritative standings and a provisional badge.

## 16. Idempotency and concurrency

Commands use row locks plus expected versions/identities rather than silent last-write-wins behavior. The official `(venue_id, scheduled_at)` unique index protects cross-round slot races. Local two-session tests cover simultaneous scheduling, duplicate result submission, confirmation versus correction, and standard result versus special outcome; exactly one transition wins.

## 17. Local acceptance

The local target must report `linked_project:null`, API port 55021 and database port 55022. Acceptance covers Monday validation, edited/skipped weeks, atomic date batches, official and duplicate slots, partial schedules, DST-aware instants, legal/illegal results, scoring, revisions, all standings tie levels, provisional flags, walkovers, zero-impact states, RLS/function grants and audit evidence.

## 18. Production dependency

The migration is additive and contains no season, team, schedule or result data. Production rollout is not authorized by this work. It requires an approved deployment window, backup/rollback plan, staging replay and review of timezone and official-slot configuration. `supabase/config.toml` remains local-only.

## 19. Stage 4 prerequisites

Stage 4 may add the public Monday League experience using read-only projections of the current phase, schedule, results and standings, including the provisional badge. It must not expose admin correction metadata or raw audit records and must preserve the authoritative revision, special-outcome and persistent tie-break semantics defined here.
