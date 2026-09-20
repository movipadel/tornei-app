# Monday League — Stage 2 Admin Teams & Phase 1 Generator

## 1. Stage scope

Stage 2 adds draft-season administration, team and roster commands, registered-captain lookup, deterministic Phase 1 preview/generation, quality reporting, and read-only inspection of the generated calendar. It builds on the Stage 1 tables and security model. It does not assign dates, venues or times, accept results, calculate standings, expose captain editing, or publish a public league page; those remain outside this stage.

## 2. Recovery and additive delivery

This implementation was recovered after an interrupted local session. Existing Stage 2 generator, migration, routes and UI were inspected and preserved, then completed with persisted-calendar inspection, database/route/concurrency tests and this document. Stage 1's migration was not modified. The Stage 2 database change is the additive migration `20260920130000_monday_league_stage2_teams_generator.sql`.

## 3. Local-only validation target

Database work was performed only after `npx supabase status` reported `linked_project:null`, API `http://127.0.0.1:55021`, database `127.0.0.1:55022`, Studio `55023` and Mailpit `55024`. The intentional local port overrides in `supabase/config.toml` are not part of Stage 2. No production project was contacted, deployed or changed.

## 4. Admin command architecture

Browser pages call guarded Next.js admin routes. Every Stage 2 route invokes `guardAdmin()` and uses the server-only service client. Mutations then call PostgreSQL functions, so each season, roster or generation command is one database transaction rather than a sequence of browser writes. Function execution is revoked from `PUBLIC`, `anon` and `authenticated` and granted only to `service_role`.

## 5. Season creation

`league_create_season` verifies an active admin, creates a draft season and its draft Phase 1 row, generates the future lottery seed, and records a `season_created` audit event. The overview screen can create the first working season and reports active-team and generation counts.

## 6. Team and roster commands

`league_save_team` creates or replaces a team roster while holding the draft season lock. A roster contains one to four active players. Omitted historical players are deactivated rather than deleted; existing linked identities cannot be silently replaced. `league_set_team_active` performs guarded draft-only activation/deactivation. Both commands write before/after audit evidence.

The season permits at most 16 active teams. Creation and reactivation enforce the season limit while holding a lock. Once Phase 1 is generated, its season/phase states prevent further Stage 2 roster mutation.

## 7. Captain identity rules

The captain is selected from `public.users` and must appear exactly once as an active member of the submitted roster. Additional players may have a nullable `user_id`. Duplicate linked users inside a roster are rejected. Stage 1's deferred constraints ensure that the captain player belongs to the team and is active, and that the same registered user cannot captain two active teams in one season.

The user-search endpoint returns only `id`, `full_name`, `phone` and `email`, caps results at 12, and remains behind admin authentication. Search data is for selection, never authorization.

## 8. Seed and tie-break ordering

Admins explicitly arrange the active teams before preview. This ordered list is persisted as `seed_position` during generation. Tie-break order is deliberately separate: SHA-256 keys derived from `tie-break|phaseId|teamId` produce a deterministic total order, persisted as `tie_break_order`. Runtime standings therefore never need random ordering.

## 9. Round-robin algorithm

`generateMondayLeaguePhase1` is a pure TypeScript implementation identified by `circle-ha-v1`. It accepts 2–16 distinct team IDs and uses the circle method to create every unordered pair exactly once. Even counts produce `N-1` rounds with `N/2` matches per round. Odd counts add an internal null rotation position and produce `N` rounds with `(N-1)/2` matches per round.

The SHA-256 fingerprint covers a canonical JSON string containing the phase ID, algorithm version, ordered team IDs, tie-break order and complete oriented rounds. Identical inputs produce identical rounds, quality report, tie-break order, payload and fingerprint.

## 10. BYE behavior

For an odd team count, every team receives exactly one BYE. A BYE is exposed in preview as `byeTeamId` but is never represented as a fake match or persisted row. It is neutral when calculating home/away streaks, so the quality report measures only played fixtures.

## 11. Home/away optimization and quality

Even-sized tournaments use deterministic Berger-style parity orientation, yielding exactly one game of home/away difference for every team. Odd-sized tournaments begin with a regular cyclic tournament, which gives exact final balance, then reverse deterministic directed three- and four-cycles. Cycle reversal preserves every team's home/away totals while optimizing in this order: zero triple-plus streaks, minimum maximum streak, minimum doubles, maximum alternation. Enumeration order is the deterministic final tie-break.

The report includes each team's home and away totals, signed difference, maximum same-side streak, double and triple-plus counts and alternation percentage. Global totals, maximum streak, alternation percentage and hard-invariant violations are also returned. Generation is disabled when violations exist.

## 12. Golden generator results

Measured with stable IDs and the production generator:

| Teams | Rounds | Matches | Home/away per team | BYEs | Max streak | Doubles | Triple+ | Alternation |
|---:|---:|---:|---|---|---:|---:|---:|---:|
| 16 | 15 | 120 | 8/7 or 7/8 | none | 2 | 14 | 0 | 93.8% |
| 15 | 15 | 105 | 7/7 | one each | 2 | 30 | 0 | 84.6% |
| 13 | 13 | 78 | 6/6 | one each | 2 | 24 | 0 | 83.2% |

Property tests exercise normal and reversed stable orders for every team count from 2 through 16, including pair uniqueness, round participation, expected counts, BYEs, home/away balance, deterministic output and deterministic fingerprint.

## 13. Preview flow

`POST /api/admin/monday-league/generator/preview` validates that the submitted IDs exactly match the season's active teams and invokes only the pure generator. It does not call a mutation RPC or write to the database. The page shows the ordered seed list, complete round preview, BYEs, fingerprint and per-team/global quality metrics before requesting confirmation.

## 14. Atomic generation transaction

`league_generate_phase1` locks the Phase 1 and season rows and validates the draft state, active-team set, tie-break set, counts, clean draft, algorithm, quality, fingerprint shape and server-recomputed SHA-256 payload. In one transaction it creates:

- phase memberships with seed and tie-break positions;
- generated round rows;
- unscheduled match rows with null venue and scheduled time;
- matching home/away participation rows;
- one completed generation run;
- one generation audit event;
- the generated phase state and `phase1` season state.

Deferred Stage 1 constraints verify each match has exactly two matching slots and that a team appears at most once per round. Any error rolls back the complete command.

## 15. Idempotency and concurrency

The locked phase row serializes concurrent generation attempts. When the phase is already generated, the same fingerprint returns a successful `created:false, replayed:true` response without inserting rows; any changed fingerprint raises `ML_GENERATION_CONFLICT`. A two-session local concurrency test confirmed one creator, one replay, and exactly one 3-round/6-match structure. The database's unique generation-run key is an additional backstop.

## 16. Admin user experience

The Stage 2 admin surface consists of:

- `/admin/monday-league`: season overview and creation;
- `/admin/monday-league/squadre`: team creation/editing, registered-user captain search, up to three additional players and activation controls;
- `/admin/monday-league/calendario/genera`: seed ordering, preview, quality report, confirmed one-time generation, and read-only inspection of persisted rounds and matches.

Generated matches are explicitly shown as unscheduled. Stage 2 offers no date, venue or time controls.

## 17. Validation, rollout and Stage 3 boundary

Focused validation comprises the Stage 1 SQL and Node suites, Stage 2 generator property/golden tests, Stage 2 SQL command integration, route/security contracts, and a real two-session concurrency harness. The wider repository regression suites, TypeScript, production build, targeted lint and whitespace checks must remain green before handoff.

Production rollout is not authorized by this work. A future deployment requires an approved window, backup/rollback plan and environment-specific migration review. Stage 3 can consume the generated rounds and unscheduled matches to assign Monday dates and official venue slots, but must preserve the Stage 2 fingerprint, memberships, pairings, audit trail and one-team-per-round constraints.
