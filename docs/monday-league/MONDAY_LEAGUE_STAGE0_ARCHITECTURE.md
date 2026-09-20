# Monday League — Stage 0 Architecture Audit

Status: design approved for implementation planning; no production code, migration, remote SQL, deployment, or production change is part of this document.

## 1. Executive summary

Monday League should be a dedicated bounded context inside the existing Next.js application. It should not reuse the current `tournaments`, `tournament_runs`, or fixed-pairs match tables: those tables model short tournaments, registrations, turns, groups and brackets, while Monday League has seasons, multi-week phases, rosters, private lineups, disputes and provisional/final results. Reusing them would create ambiguous states and weak authorization.

The recommended integration is hybrid:

- reuse `public.users` and the signed `user_session` cookie for captain identity;
- reuse the staff/admin cookie and `guardAdmin()` for management operations;
- reuse server-only `supabaseAdmin()`, the route-handler convention, `communications` for recipient-scoped in-app notifications, post-commit delivery helpers, admin web push and Supabase Storage;
- introduce a separate `league_*` relational model, server command/RPC layer, public read models, captain routes and admin screens;
- keep all league base tables inaccessible to browser clients. The current application does not authenticate users with Supabase Auth, so `auth.uid()` cannot authorize captains. Next.js routes must derive `user_id` from the verified cookie and call guarded transactional commands. Public responses must be explicitly shaped, especially for lineup secrecy.

At this scale (maximum 16 teams and 120 Phase 1 matches), standings should be calculated from the current authoritative result revisions, not manually maintained. A SQL view/RPC is sufficient; short-lived HTTP caching may be added later.

The round-robin generator should use the deterministic circle method for pairings and a deterministic bounded search for home/away orientation. Balance is a hard target: for even team counts every team has an odd number of matches and must finish with home/away difference 1; for odd team counts every team has an even number of matches and can target difference 0. Triple streaks are optimized before double streaks. Generation stores its input, algorithm version and quality report.

The two former business blockers are resolved for implementation: an awarded walkover/no-show contributes 3–0 league points, 2–0 sets and 12–0 games without fake set rows; a suspended match contributes nothing until completed or administratively ruled.

## 2. Final business rules

- A season has at most 16 active teams. A team has 1–4 active roster players, including exactly one captain.
- The captain is a real `public.users.id`; other players may be unlinked league-player records and may be linked later.
- Only an admin changes team name, captain or roster. Captain edits are limited to logo, slogan and team image.
- A match fields exactly two actual players per team and is best of three sets. A legal played result is 2–0 or 2–1. At 6–6 the set ends 7–6 through a tie-break. The “one advantage, then Killer Point” rule affects point play, not the stored set-game totals.
- A two-set win awards 3/0 league points; a three-set win awards 2/1.
- Standings order is points, set difference, game difference, then a stored phase tie-break order. Tie-break order is assigned once and never regenerated during reads.
- Phase 1 is one single round robin. Phase 2 contains Serie A and Serie B, each a new single round robin with zero carried points. For `n` teams, Serie A receives `ceil(n/2)` and Serie B `floor(n/2)`.
- Pairings are generated separately from scheduling. A round is a matchday; an admin assigns each match to one of eight allowed venue/time slots.
- Scheduled matches must be Mondays, no venue/time slot may be reused, a team may play at most once per round, and no round may contain more than eight matches.
- A captain lineup contains exactly two active roster players. It is editable until the database clock reaches `scheduled_at - 1 hour`; equality is locked. Admin may override at any time.
- Before the deadline, only the submitting captain and admins can read that lineup. At the deadline both sides are revealed together; a missing side reads “Formazione non comunicata”.
- The home captain may submit a result exactly once. The away captain may contest the current submitted result until, but not including, `submitted_at + interval '48 hours'`, with mandatory text. Admin may submit, correct, confirm and resolve.
- Submitted and contested results affect provisional standings immediately. An admin correction replaces the authoritative revision and standings recalculate.
- After 48 hours without an open contest, the result is effectively confirmed. A scheduled finalizer should persist `confirmed_at`; command authorization must use the effective deadline even if that job is late.
- Missing lineup never causes an automatic defeat or penalty.
- An awarded walkover/no-show gives the winner 3 points, one win, two sets and 12 games; the loser receives 0 points, one loss, zero sets and zero games. Store this as an explicit administrative contribution, never as fake 6–0 set rows. Exceptional cases such as both teams absent require an explicit admin ruling.
- A suspended match has zero standings impact until completed or administratively ruled. Any retained partial score is evidence only.

## 3. Domain boundaries

The league owns seasons, phases, phase membership and tie-break order, rosters, rounds, matches, venue scheduling, lineups, result revisions, played sets, actual participants, disputes, administrative outcomes, generation manifests and audit events.

The existing app owns user identity/contact details, staff identity and roles, session cookies, the notification inbox, admin push subscriptions, common UI primitives and storage transport. Existing tournament tables remain unchanged and have no foreign keys to league matches.

Domain invariants must be enforced in transactional database commands when they span rows (roster size, exactly two lineup players, one match per team per round, generation uniqueness). Route handlers perform input/schema checks and identity extraction; they are not the only protection for cross-row rules.

## 4. Integration with the existing app

Areas reviewed:

- Next.js 16 App Router pages and route handlers under `src/app`;
- `user_session` HMAC authentication in `src/lib/userAuth.ts` and `/api/user/*`;
- shared staff/admin JWT cookie, middleware and `guardAdmin()`;
- server-only Supabase service-role clients and the RLS/revoke posture documented in the repository;
- current `users`, `staff_users`, `tournaments`, tournament run/group/match tables and views;
- `communications`, `communication_user_states`, recipient `user` targeting, `event_type`/`event_key` deduplication and home-page notification inbox;
- post-commit notifications, admin web push and Telegram patterns;
- public home/navigation, `/tornei`, admin dashboard and mobile-first custom/Base44 UI conventions;
- public and private Supabase Storage upload patterns;
- existing idempotency ledger and guarded PostgreSQL command functions.

Integration points:

- public routes: `/monday-league`, `/monday-league/squadre/[slug]`;
- admin route group: `/admin/monday-league/*`, linked from the admin dashboard;
- a Monday League card/link on the public home and/or navigation;
- captain controls embedded in the public team page after `/api/user/me` identity resolution;
- a dedicated public `league-team-media` bucket or a `monday-league/` prefix in a dedicated bucket. Store object paths, not provider URLs, so URL strategy can change.

Repository caution: some legacy tournament code performs multi-step inserts from application code. League generation, roster replacement, result correction and Phase 2 generation should instead follow the newer guarded-RPC/idempotency pattern so partial writes cannot survive.

## 5. Recommended module strategy

Choose option C: dedicated league domain with hybrid infrastructure reuse.

Option A, forcing league behavior into tournament infrastructure, is rejected because registrations are not rosters, tournament runs are not season phases, fixed-pair matches do not support lineup privacy or disputes, and current standings rules differ. Option B, a completely separate subsystem, would unnecessarily duplicate identity, admin access, notifications and storage. The module should use a folder such as `src/lib/monday-league/` for pure domain logic and thin routes under `/api/monday-league` and `/api/admin/monday-league`.

## 6. Database schema proposal

All identifiers are UUID unless noted. All instants are `timestamptz`; all mutable tables have `created_at` and `updated_at`. Status fields use checked text values initially (easier migrations than PostgreSQL enums). All base tables have RLS enabled and grants revoked from `PUBLIC`, `anon` and `authenticated`.

### `league_seasons`

Purpose: competition container and stable configuration.

- Columns: `id`, `name`, `slug`, `timezone default 'Europe/Rome'`, `status` (`draft|phase1|phase2|completed|archived`), `max_teams default 16`, `lottery_seed`, `published_at`, timestamps.
- PK: `id`; unique: `slug`; checks: `max_teams between 2 and 16`, supported timezone.
- Index: `(status, published_at)`.

### `league_teams`

Purpose: season-specific team and public profile.

- Columns: `id`, `season_id`, `name`, `slug`, `captain_player_id`, `slogan`, `logo_path`, `image_path`, `is_active`, timestamps.
- PK: `id`; FKs: season cascade, captain player deferred/restricted; unique `(season_id, name)` and `(season_id, slug)`.
- Index: `(season_id, is_active)`.
- `captain_player_id` must point to a player of the same team with non-null `user_id`; enforce in the roster command/deferred constraint trigger.

### `league_team_players`

Purpose: stable league identities for roster and historical references.

- Columns: `id`, `team_id`, `display_name`, nullable `user_id`, `is_active`, `joined_at`, `left_at`, timestamps.
- PK: `id`; FKs: team cascade, user restrict; unique partial `(team_id, user_id)` where linked.
- Checks: nonblank display name; active row has no `left_at`.
- Indexes: `(team_id, is_active)`, `(user_id)`.
- Cross-row command rules: 1–4 active players; captain included; one user cannot captain two active teams in the same season. Historical players are deactivated, not deleted after use.

### `league_phases`

Purpose: Phase 1, Serie A and Serie B lifecycle.

- Columns: `id`, `season_id`, `code` (`phase1|serie_a|serie_b`), `name`, `sequence`, `status` (`draft|generated|in_progress|finalized`), nullable `source_phase_id`, `algorithm_version`, `generation_fingerprint`, `generated_at`, `finalized_at`, `finalized_by_staff_id`, timestamps.
- PK: `id`; FKs: season cascade, source phase restrict, staff restrict; unique `(season_id, code)` and partial unique `(source_phase_id, code)`.
- The Phase 1 final order is immutable after finalization except through an explicit audited admin reopen command.

### `league_phase_teams`

Purpose: phase membership, seed snapshot and persistent tie-break order.

- Columns: `phase_id`, `team_id`, `seed_position`, `tie_break_order`, `source_phase_position`.
- PK `(phase_id, team_id)`; FKs cascade/restrict; unique `(phase_id, seed_position)` and `(phase_id, tie_break_order)`; positive checks.
- Phase 2 copies the season’s persistent lottery order (renumbered within each series) and stores the source Phase 1 position.

### `league_venues` and `league_venue_slots`

Purpose: configurable allowed scheduling locations/times.

- Venue columns: `id`, `code`, `name`, `is_active`; unique `code`/`name`.
- Slot columns: `id`, `venue_id`, `weekday default 1`, `local_time time`, `is_active`; unique `(venue_id, weekday, local_time)`; check weekday Monday.
- Seed configuration: Costigliole 20:00/21:30, Manta 20:00/21:30, Centallo 19:30/20:00/21:00/21:30.

### `league_rounds`

Purpose: generated matchdays.

- Columns: `id`, `phase_id`, `round_number`, nullable `play_date date`, `status` (`generated|scheduling|scheduled|completed`), timestamps.
- PK `id`; FK phase cascade; unique `(phase_id, round_number)` and partial unique `(phase_id, play_date)` where date exists.
- Checks: positive number; assigned date is Monday (also command validated).

### `league_matches`

Purpose: pairing, schedule and current workflow pointers.

- Columns: `id`, `phase_id`, `round_id`, `home_team_id`, `away_team_id`, nullable `venue_id`, nullable `scheduled_at`, `schedule_version`, `match_status` (`unscheduled|scheduled|submitted|contested|confirmed|postponed|cancelled|suspended`), nullable `current_result_id`, nullable `lineups_reopened_at`, timestamps.
- PK `id`; FKs restrict except phase/round cascade before publication; checks home differs from away and scheduled timestamp/venue are both null or both present.
- Unique unordered pairing per phase via canonical generated columns or expression index on `(phase_id, least(home_team_id,away_team_id), greatest(...))`.
- Unique `(round_id, home_team_id)`/equivalent is insufficient for away participation; enforce no team twice with the generation/scheduling command plus a deferred constraint trigger or a normalized participation table.
- Unique partial `(venue_id, scheduled_at)` for active scheduled matches; indexes `(round_id)`, `(scheduled_at)`, both team IDs, `(match_status)`.

### `league_match_team_slots`

Recommended small normalization for hard round constraints: one row `(match_id, round_id, team_id, side)` per match side. PK `(match_id, team_id)`, unique `(round_id, team_id)`, unique `(match_id, side)`. A command creates it with the match. This makes “one team per matchday” enforceable without triggers and supports team schedules efficiently.

### `league_lineups` and `league_lineup_players`

Purpose: versioned submitted/overridden lineups.

- Lineup columns: `id`, `match_id`, `team_id`, `revision`, `status` (`current|superseded`), `submitted_by_user_id`, `overridden_by_staff_id`, `submitted_at`, nullable `superseded_at`, nullable `override_reason`.
- Unique `(match_id, team_id, revision)` and partial unique `(match_id, team_id)` where current; index `(match_id, team_id, status)`.
- Player columns: `lineup_id`, `player_id`, `slot` (1/2); PK `(lineup_id, player_id)`, unique `(lineup_id, slot)`.
- Transactional command validates exactly two distinct active players on that team. Do not copy `deadline_at`; derive it from the match.

### `league_result_submissions`, `league_match_sets`, `league_result_players`

Purpose: immutable result history and current authoritative revision.

- Result columns: `id`, `match_id`, `revision`, `result_type` (`played|walkover|no_show|administrative`), `status` (`submitted|contested|confirmed|superseded`), `submitted_by_user_id`, `submitted_by_staff_id`, `submitted_at`, `confirmed_at`, `superseded_at`, nullable `correction_reason`.
- Unique `(match_id, revision)`; at most one non-superseded current revision via partial unique index. Match `current_result_id` points to it.
- Set columns: `result_submission_id`, `set_number` 1–3, `home_games`, `away_games`; PK `(result_submission_id,set_number)`. Only `played` results have sets.
- Actual-player columns: `result_submission_id`, `team_id`, `player_id`, `slot`; PK `(result_submission_id,team_id,player_id)`, unique `(result_submission_id,team_id,slot)`. Exactly two per side for played results.
- Legal set/result structure is enforced by the submit/correct RPC after locking the match; row checks enforce nonnegative values and set number range.

### `league_match_special_outcomes`

Purpose: standings rulings without fake set scores.

- Columns: `result_submission_id`, `kind` (`walkover|no_show|administrative`), nullable `winner_team_id`, `counts_as_played`, nullable `home_points`, `away_points`, `home_win`, `away_win`, nullable awarded set/game differential fields, mandatory `decision_reason`.
- PK/FK `result_submission_id`; checks prevent impossible dual wins and require explicit standings fields when `counts_as_played`.
- Postponed/cancelled/suspended are match workflow states and do not create fake sets. If a final administrative ruling is later issued, it creates a special result revision.

### `league_disputes`

Purpose: one contest case against a specific result revision.

- Columns: `id`, `match_id`, `result_submission_id`, `opened_by_user_id`, `reason`, `status` (`open|resolved_upheld|resolved_corrected|dismissed`), `opened_at`, `resolved_at`, `resolved_by_staff_id`, `decision_reason`.
- Unique partial `(match_id)` where status is open; indexes `(status, opened_at)` and result ID.
- Checks require nonblank reason and resolution fields only/always in resolved states.

### `league_audit_events`

Purpose: append-only, lightweight evidence for sensitive commands.

- Columns: `id bigserial`, `season_id`, `entity_type`, `entity_id`, `event_type`, `actor_type` (`user|staff|system`), nullable actor IDs, `occurred_at`, `request_id`, `before_data jsonb`, `after_data jsonb`, `reason`, `metadata jsonb`.
- Indexes `(entity_type,entity_id,occurred_at desc)`, `(season_id,occurred_at desc)`, `request_id`.
- Revoke update/delete from application roles; retain only operational retention tooling.

### `league_generation_runs` and `league_notification_jobs`

`league_generation_runs` stores phase, kind, input team order, algorithm version, fingerprint, quality metrics, actor and completion. Unique `(phase_id,kind)` prevents duplicate generation. `league_notification_jobs` stores recipient, event type/key, due time, status/attempts and related match/team; unique `event_key` makes timed notifications idempotent.

## 7. Entity relationships

```text
users 1---0..n league_team_players n---1 league_teams n---1 league_seasons
                                      |                    |
                                      |                    +---n league_phases
                                      |                          |
                                      +---n league_phase_teams ---+
league_phases 1---n league_rounds 1---n league_matches
league_matches 1---n league_lineups 1---2 league_lineup_players
league_matches 1---n league_result_submissions 1---n league_match_sets
                                          |       +---4 league_result_players
                                          +---0..1 league_match_special_outcomes
                                          +---0..n league_disputes
league_matches n---0..1 league_venues 1---n league_venue_slots
all sensitive aggregates ---n league_audit_events
```

## 8. Permission matrix

| Capability | Public | Captain of own team | Admin |
|---|---:|---:|---:|
| Published league, standings, schedule, results | Read | Read | Read/write |
| Public team profile/roster | Read | Read | Read/write |
| Logo, slogan, image | Read | Write own | Write all |
| Name, captain, roster | Read | No | Write |
| Own lineup before deadline | No public exposure | Read/write | Read/write |
| Opponent lineup before deadline | No | No | Read |
| Both lineup statuses/content at deadline | Read | Read | Read |
| Submit result | No | Home captain once | Yes |
| Edit submitted result | No | No | Correct by new revision |
| Open dispute | No | Away captain within 48h | May record/manage |
| Resolve dispute/special outcome | No | No | Yes |
| Generate/finalize phases or schedule | No | No | Yes |
| Audit data | No | No | Read |

Every captain authorization compares cookie-derived `user_id` to the linked active captain player. Display name, phone and request-body user IDs are never authorization inputs.

## 9. Phase lifecycle

Season: `draft -> phase1 -> phase2 -> completed -> archived`.

Phase: `draft -> generated -> in_progress -> finalized`. Generation requires at least two eligible teams and creates phase membership, rounds, matches, team-slot rows and a generation manifest in one transaction. First scheduled/played activity moves it to in progress. Finalization requires every match to be effectively confirmed or explicitly neutralized by an admin outcome; an override requires a reason and audit event.

Finalization stores the fully ordered Phase 1 snapshot indirectly through immutable phase membership plus current results and `finalized_at`. For stronger historical proof, `league_generation_runs` for Phase 2 stores the ordered source team IDs and standings metrics used.

## 10. Round-robin algorithm

1. Sort input by explicit `seed_position`, then stable UUID as the final deterministic tie-break.
2. If odd, append a BYE sentinel.
3. Use the circle method: keep one position fixed and rotate the remaining positions for `N-1` rounds, pairing opposite positions.
4. Omit pairs containing BYE. This produces `n(n-1)/2` matches, `n-1` rounds for even `n`, `n` rounds for odd `n`, no repeated pair and at most one match/team/round.
5. Orient home/away separately using the optimizer below.
6. Validate invariants independently before insert; calculate a canonical SHA-256 fingerprint from phase ID, ordered team IDs, algorithm version and output.
7. Insert through one idempotent transaction. A repeat with the same fingerprint returns the existing generation; a different request conflicts.

## 11. Home/away balancing strategy

For each round with `m <= 8` matches, enumerate its `2^m` possible orientations. A deterministic beam/branch-and-bound search carries forward home counts and each team’s last side/streak. It prunes states that cannot reach a valid final home target.

Hard final targets:

- even `n`: every team plays odd `n-1`, so each target is either floor or ceiling half and final difference is exactly 1;
- odd `n`: every team plays even `n-1`, so every target is `(n-1)/2` and final difference is 0.

Lexicographic objective: satisfy target counts; minimize occurrences of three-or-more same-side games; minimize maximum streak; minimize double streaks; minimize aggregate alternation breaks; choose the lexicographically smallest orientation signature. BYE is neutral: quality reporting should show both adjacent-round sequence and played-match sequence, with the played-match sequence governing streak warnings.

The generator must return and persist: home/away count and difference per team, maximum streak, double/triple counts, alternation percentage, validation errors and algorithm version. It never uses random assignment. If the bounded search cannot find a hard-target state, it widens its beam; generation must fail visibly rather than silently accept difference greater than 1 when a feasible balanced orientation exists.

Expected acceptance result for all supported sizes: every pairing once; no double booking; even counts difference 1; odd counts difference 0; no three-streak where the search finds an avoidable alternative. Perfect H-A alternation is not claimed.

## 12. Matchday scheduling model

Generation creates unscheduled matches grouped into rounds. Admin scheduling assigns a round date and each match’s venue plus allowed local slot. A bulk grid shows eight slot rows and draggable/selectable matches, with auto-fill as a convenience and explicit validation before save.

The transactional scheduling command locks the round/matches, validates Monday, phase membership, at most eight matches, one team per round, allowed venue slot, and unique `(venue, scheduled_at)`, then writes all changes or none. Unscheduled matches remain first-class and visible. A database unique index protects simultaneous admin saves.

## 13. Lineup model

Lineups are immutable revisions. Captain submission before deadline supersedes the previous revision; admin override creates another revision with reason. Exactly two distinct active roster players are required at the effective match time. Roster changes after submission do not rewrite history; if a selected player becomes inactive, the admin UI flags the lineup and requires an explicit override.

Actual players in a completed match belong to the result revision, not merely the announced lineup. Result entry defaults them from the current lineups but admin/home captain confirms them, allowing legitimate last-minute administrative substitutions to be represented and audited.

## 14. Lineup privacy and deadline

The deadline expression is always `scheduled_at - interval '1 hour'`, evaluated with database `now()`. At `now() >= deadline`, captain writes are rejected. There is no stored deadline that can drift after rescheduling.

Use separate response projections:

- public matchday API: before deadline returns only neutral submission statuses (preferably no per-side status to avoid signalling), and no lineup/player IDs; at/after deadline returns each lineup or missing label;
- captain team API: before deadline returns own lineup and opponent as hidden; at/after deadline returns public projection;
- admin API: full data.

Never fetch all lineups to a client and hide them in React. The public/captain SQL query or server mapper must conditionally omit protected columns based on DB time, and tests must inspect raw JSON for absence.

## 15. Result model

Played results store each set’s games and the four actual players. Validation requires:

- two or three sets only; winner has exactly two set wins;
- no third set for 2–0 and exactly one for 2–1;
- a legal set is 6–0…6–4, 7–5 or 7–6; no draw, 6–5, 6–6 or 8–6;
- the same eligible player cannot occupy two slots for one team;
- result teams and players match the match/rosters, subject to audited admin override policy.

Home captain submission locks the match row, verifies authority and no prior submission, inserts the result/sets/actual players, updates the current pointer, creates notification jobs and audit event atomically. Captain cannot PATCH it. Admin correction creates revision `n+1`, marks prior revision superseded, records a reason and changes the pointer atomically.

## 16. Contest workflow

`none -> submitted -> contested -> confirmed` is the public workflow; correction creates a new submitted or confirmed revision according to the admin decision.

The away captain’s command locks match/current result and accepts only if `db_now < submitted_at + interval '48 hours'`, the result is still current, no open dispute exists and the requester captains the away team. Equality is expired. It inserts mandatory reason, marks result/match contested, sends idempotent alerts and audits in one transaction.

Admin resolution options:

- uphold: confirm current result and resolve dispute with decision reason;
- correct: create a corrected revision, supersede challenged result, resolve as corrected and normally confirm the new revision;
- dismiss invalid contest: confirm and record why.

A scheduled finalizer marks eligible submitted results confirmed. Reads and contest authorization calculate effective confirmation from timestamps, so a delayed scheduler cannot extend the window.

## 17. Standings engine

Recommendation: dynamic authoritative SQL view/RPC, optionally cached at the HTTP layer for 15–30 seconds and invalidated after result commands. No manually editable standings table.

The query starts with every `league_phase_teams` row, left joins the current result for that phase and includes submitted, contested and confirmed played results. Superseded results and non-counting special states are excluded. It emits played, wins, losses, points, sets won/lost/difference, games won/lost/difference, then orders by points DESC, set difference DESC, game difference DESC, `tie_break_order` ASC.

For played results, points derive from number of sets: 2–0 => 3/0; 2–1 => 2/1. Sets and games derive only from set rows. For a counting special outcome, the explicit ruling fields contribute according to the business policy; no invented set rows are used. The public response labels standings provisional while any included result is submitted/contested.

## 18. Phase 2 split and generation

Admin first opens a read-only preview containing the frozen Phase 1 ranking, the A/B cut line and any blockers. `Generate Phase 2` then runs one transaction:

1. lock season and Phase 1;
2. require finalized Phase 1, or a separately authorized override with reason;
3. re-evaluate and store ordered source standings/fingerprint;
4. reject if either Phase 2 phase/generation already exists;
5. create Serie A with `ceil(n/2)` top teams and Serie B with the remainder;
6. create phase membership with zero implicit results and stored tie-break order;
7. generate both round robins and quality reports;
8. move season to Phase 2 and emit audit/notification events.

No points, sets or games are copied. Duplicate protection is a unique constraint plus locked idempotent command, not a UI flag.

## 19. Special admin outcomes

- Postponement: clear or replace schedule, preserve pairing, no standings effect.
- Cancellation: terminal match state, no result/standings effect unless admin later records an explicit ruling.
- Suspension: nonterminal state; resume or resolve administratively.
- Walkover/no-show with an awarded winner: explicit special result contributing 3–0 league points, 2–0 sets and 12–0 games, with one win/loss and mandatory decision reason; no fake set rows. Both-absent and other exceptional cases require an explicit admin ruling.
- Manual correction: new immutable result revision; never overwrite the submitted evidence.

The admin form should present human terms and a standings-impact preview, not raw statuses. A suspended match contributes zero until completed or ruled; partial scores, if retained later, are evidence only.

## 20. Notifications

Reuse `communications` with `target='user'`, `recipient_user_id`, `event_type` and unique `event_key`. Create in-app notification records inside the same transaction as the business command where possible. Use `schedulePostCommitNotifications()` only for external best-effort delivery. Continue using admin web push for operational alerts; do not add marketing consent coupling to transactional service messages.

Planned events:

- lineup reminder, e.g. 3 hours before the deadline (configurable implementation default);
- lineup locked confirmation/missing warning at deadline;
- match reminder, e.g. 24 hours before scheduled time;
- home captain result reminder after match time;
- away captain result-submitted notice including the exact contest expiry instant;
- contest opened (admin alert and captain acknowledgements);
- contest resolved/corrected;
- Phase 2 generated.

Each recipient/event instance has a deterministic key such as `league:result_submitted:<result_id>:<user_id>`. Timed jobs are recalculated/cancelled on reschedule, and the worker rechecks current match state before emitting. Missing or late workers must be retryable without duplicates.

## 21. Timezone and deadline strategy

Persist instants in UTC `timestamptz`; store the season zone `Europe/Rome`; render with Italian locale. Admin submits local date, local time, venue and expected schedule version. The server/database converts the wall time using the named IANA zone, not a fixed offset. It should reject invalid/ambiguous wall times through a round-trip validation (Monday slots do not normally coincide with European DST transitions, but the rule remains general).

Deadline and contest windows use instant arithmetic in PostgreSQL. UI countdowns are informative only; the database clock decides boundary acceptance. Dates used for “Monday” validation are derived in the season timezone, not UTC.

## 22. Rescheduling policy

- Before the old deadline and before publication: reschedule updates the derived deadline automatically; existing submitted lineup remains editable until the new deadline.
- Once either lineup has become locked/public: rescheduling never silently hides, unlocks or deletes it. Admin chooses `preserve locked lineups` (default) or `reopen both lineups`, with mandatory reason.
- Reopening is symmetric, creates an audit event, sets `lineups_reopened_at`, and makes both captains editable until the new deadline. Previously public revisions remain admin/audit evidence but public reads show only current revisions.
- If the new scheduled time is already within/past its deadline, captain entry remains locked; only admin override is possible.
- Reschedule cancels obsolete reminder jobs and creates new idempotent jobs in the same command.

Use optimistic `schedule_version` plus row lock to reject stale admin forms.

## 23. Audit trail

Audit schedule/reschedule, lineup submit/supersede/admin override/reopen, result submit/correct/confirm, contest open/resolve, roster/captain changes, phase generation/finalization/reopen and special rulings. Store identifiers and a compact before/after snapshot; avoid sensitive session data and unnecessary personal contact details. Domain rows remain the source of truth; audit JSON is evidence, not operational state.

## 24. RLS and security

The current app’s public users are not Supabase Auth principals. Browser Supabase calls cannot safely express “captain of this team” using `auth.uid()`. Therefore:

- deny browser access to all league base tables and storage writes;
- use Next.js server routes with `supabaseAdmin()` only after cookie verification;
- derive actor IDs from verified cookies, never the JSON body;
- use `guardAdmin()` for all admin commands and store `staff_session.sid` as actor;
- expose public data through allow-listed server DTOs or carefully designed read-only functions/views;
- keep profile upload routes MIME/size constrained and authorize ownership before issuing upload;
- validate object path ownership on update; never accept arbitrary bucket names (the existing generic admin upload pattern should not be copied for captain uploads);
- rate-limit captain mutation endpoints and apply same-site/Origin checks for cookie-authenticated writes; cookies remain HttpOnly, Secure in production and SameSite Lax.

Lineup secrecy defense-in-depth: public functions do not return protected player columns before deadline; captain routes query own side separately; cache keys must not mix public/admin/captain projections; public responses containing deadline transitions should use no-store or a cache TTL that expires at the deadline.

## 25. Idempotency and concurrency

| Race | Protection |
|---|---|
| Two admins generate a phase | season/phase row lock, unique generation row, request fingerprint |
| Duplicate Phase 2 | unique season phase codes plus locked atomic RPC |
| Lineup at deadline | database `now()` comparison under match lock; equality rejects |
| Two lineup submits | row lock, monotonically increasing revision, partial unique current row |
| Result submitted twice | match lock, current-result uniqueness, idempotency key/request hash |
| Contest at 48h | DB time under result/match lock; equality rejects |
| Resolve versus contest | same locked rows; one valid transition wins, other receives 409 |
| Admin correction versus read | atomic pointer swap; standings sees old or new complete revision |
| Two schedule saves | unique venue/instant, schedule version and transaction |
| Notification retry | unique event/job key and state-aware worker |

Extend the existing idempotency approach or create a league-specific ledger keyed by `(operation, actor scope, idempotency_key)` with request hash and committed response. Return `409 Conflict` for stale state or reused keys with different payloads.

## 26. Public UX

Mobile-first textual wireframes:

```text
[Monday League] [Phase badge: Fase 1 / Serie A / Serie B]
[Next Monday summary]
[Tabs: Classifica | Calendario/Risultati | Squadre]

CLASSIFICA
Pos Team                 Pt  G  V  P  DS  DG
 1  Team name >           9  3  3  0  +5 +18
[Provisional badge when applicable]

CALENDAR (accordion by matchday)
Lun 12 Oct • Giornata 4
19:30 Centallo   Home — Away
  [lineups hidden until 18:30 / two names / missing label]
  [completed: 2–1  Expand v]

EXPANDED RESULT
Home: Player 1 / Player 2
Away: Player 3 / Player 4
Set 1 6–4 | Set 2 3–6 | Set 3 7–6
[Provisional / Contested / Final]

TEAMS
[logo] Team name >   #3 • 6 pt
```

Current phase defaults to the active phase; Phase 2 offers Serie A/B segmented control. Historical Phase 1 remains accessible. Unscheduled future matches clearly show “Orario da definire”. Inline result expansion avoids a separate match page.

## 27. Team page UX

```text
[Team hero image]
[Logo] TEAM NAME
“Slogan”
#3 • 6 points • DS +3 • DG +11

ROSTER
[Captain badge] Captain Name
Player 2 / Player 3 / Player 4

NEXT MATCH
Monday • time • club • vs Team
[public lineup state according to deadline]

SCHEDULE & RESULTS
[future and past rows; completed rows expand inline]
```

The page API returns current standing, next match, all phase matches, result actual players and public profile in one stable read model. Team slug is season-scoped.

## 28. Captain UX

When the current user is captain, the same team page adds a private action strip:

```text
[Edit team profile]
  Logo upload | Slogan | Team image upload | Save

[Submit lineup] (eligible next match only)
  Deadline: Monday 19:00 • countdown
  [ ] Player A  [ ] Player B  [ ] Player C  [ ] Player D
  Exactly 2 selected                         [Confirm]

[Enter result] (home, played, no prior submission)
  Actual home players [2] | away players [2]
  Set 1 [ ]-[ ]  Set 2 [ ]-[ ]  [+ third set]
  Summary and league points preview
  [Confirm final submission] (cannot be edited)

[Contest result] (away, within window)
  Deadline timestamp • mandatory reason textarea • [Open contest]
```

Confirmation dialogs explicitly state lock behavior. Expired controls remain visible but disabled with reason. There is no separate captain dashboard in the first release.

## 29. Admin UX

```text
DASHBOARD
[Season/phase] [Teams 16/16] [Next day]
[Unscheduled N] [Missing results N] [Open disputes N]

TEAMS
[Create team] name + user search for captain
Roster editor (1–4), linked-user indicator, captain selector
Profile/media override and history

GENERATOR
Ordered seed list -> preview rounds -> balance report per team
[Generate once] with validation/errors

MATCHDAY SCHEDULING
Unscheduled matches | 8 venue/time rows
bulk auto-fill/select -> conflict panel -> atomic Save

RESULTS
filters Missing / Submitted / Contested / Confirmed / Special
open result -> confirm, correct by revision, special ruling

DISPUTE
submitted evidence + reason + revision history
Upheld / Corrected / Dismissed + mandatory decision

PHASE 2
frozen Phase 1 table and cut line
Serie A preview | Serie B preview | balance estimates
[Generate Phase 2] irreversible confirmation
```

UI labels present business actions, not database states. Destructive/reopen operations require reasons and show their consequence.

## 30. API and RPC proposal

Public reads:

- `GET /api/monday-league` — season/current phases, standings summary;
- `GET /api/monday-league/phases/[phaseId]/standings`;
- `GET /api/monday-league/phases/[phaseId]/matchdays` — deadline-safe DTO;
- `GET /api/monday-league/teams`;
- `GET /api/monday-league/teams/[slug]` — public data plus own captain capabilities, never protected opponent data.

Captain commands:

- `PATCH /api/monday-league/teams/[teamId]/profile`;
- `POST /api/monday-league/matches/[matchId]/lineups`;
- `POST /api/monday-league/matches/[matchId]/results`;
- `POST /api/monday-league/matches/[matchId]/disputes`.

Admin commands:

- season/team/roster CRUD under `/api/admin/monday-league/*`;
- `POST phases/[id]/generate`, `POST phases/[id]/finalize`;
- `PUT rounds/[id]/schedule` and `POST matches/[id]/reschedule`;
- `POST results/[id]/confirm|correct`;
- `POST disputes/[id]/resolve`;
- `GET/POST phase-2/preview|generate`.

Transactional PostgreSQL commands should include `league_generate_phase`, `league_replace_roster`, `league_schedule_round`, `league_submit_lineup`, `league_submit_result`, `league_open_dispute`, `league_correct_result`, `league_resolve_dispute`, `league_finalize_due_results` and `league_generate_phase2`. RPCs accept actor IDs only from server routes, lock authoritative rows, validate transitions, write audit/notifications and return stable JSON. Route contracts map domain conflicts to 409, validation to 400/422, unauthenticated to 401 and unauthorized to 403.

## 31. Implementation roadmap

### Stage 1 — Domain foundation and security

- DB: core season/team/player/phase/venue/round/match/audit/generation tables, constraints, deny-all RLS/grants, local seed slots.
- API: read-only health/config contracts; shared auth/capability helpers.
- UI: none beyond guarded admin shell link.
- Tests: schema constraints, cookie-derived authorization, no direct anon access.
- Deployment dependency: reviewed additive migration and backup/rollback plan.

### Stage 2 — Admin teams and Phase 1 generator

- DB: roster and generation RPCs, phase team memberships and match team slots.
- API: admin team/roster and preview/generate routes.
- UI: team CRUD, user search, seed ordering, generation preview/quality report.
- Tests: roster limits/captain link; 2–16 even/odd schedules; reproducibility/balance.
- Dependency: Stage 1 only; no public publication.

### Stage 3 — Scheduling and standings/result core

- DB: venue scheduling command, result revision/set/actual-player tables, dynamic standings view/RPC.
- API: bulk scheduling, admin result/special outcome endpoints, public standings/calendar DTO.
- UI: matchday scheduling and admin result queue.
- Tests: conflicts, timezone, legal scores, points/tie-breaks, correction recalculation.
- Dependency: venue configuration and agreed special-outcome scoring.

### Stage 4 — Public league and team pages

- DB: public read functions if selected; no wider table grants.
- API: main/team/matchday read models.
- UI: main page, tabs, inline results, team pages, home/nav entry.
- Tests: mobile/accessibility, no unpublished data, caching boundary behavior.
- Dependency: Stage 3 stable read contracts.

### Stage 5 — Captain profile and lineup privacy

- DB: lineup revision tables/RPC; storage policies/path model.
- API: profile upload/update and lineup command/capabilities.
- UI: embedded captain controls and lineup selection.
- Tests: exact deadline, secrecy at raw JSON level, reschedule/reopen, roster invalidation.
- Dependency: user cookie security review and storage bucket.

### Stage 6 — Captain results and contests

- DB: result submit/correct, disputes, finalizer commands.
- API: captain result, contest and admin resolution routes.
- UI: result entry, contest window, dispute management.
- Tests: home/away permission, submit-once, 48h equality, concurrent resolve/contest.
- Dependency: special outcome policy and scheduled finalizer choice.

### Stage 7 — Transactional notifications

- DB: notification jobs and unique event keys.
- API: protected scheduler/worker route and retry observability.
- UI: notification copy/links and admin unresolved alerts.
- Tests: deduplication, reschedule cancellation, retries, stale-state suppression.
- Dependency: Vercel Cron or equivalent authenticated scheduler.

### Stage 8 — Phase 2 and season closure

- DB/API: finalization, preview and atomic Phase 2 generation.
- UI: split preview, generation report, phase/series navigation.
- Tests: even/odd splits, zero carry, duplicate prevention, frozen ordering.
- Dependency: Phase 1 finalized production data and operational runbook.

Each stage ships first to local/staging, applies additive migrations before compatible code, and has a feature flag/publication gate. No Stage 0 artifact is executable.

## 32. Test strategy

Pure generator property tests cover every team count 2–16 and multiple stable seed orders: expected round/match count, every unordered pair once, one appearance per round, BYE exactly once for odd counts, deterministic output/fingerprint, final balance targets, and quality metrics. Golden cases include 16 teams and odd 15/13 teams.

Database integration tests use fixed DB time where possible and cover:

- Phase 1/Serie A/Serie B membership and 16→8/8, 15→8/7, 14→7/7, 13→7/6;
- 3/0 and 2/1 scoring, sets/games, multi-level tie-break and persistent lottery order;
- legal/illegal 2–0 and 2–1 set structures;
- lineup at one millisecond before, exactly at and after deadline;
- opponent/public raw response contains no player IDs/names before deadline;
- one or both missing lineups after deadline;
- only home captain submits and only away captain contests;
- contest at 48h minus epsilon and exactly 48h;
- submit-once, correction revision history and immediate standings recalculation;
- reschedule before lock, preserve after lock, explicit symmetric reopen;
- no-show/walkover/postpone/cancel/suspend without fake set rows;
- notification event/job idempotency and stale reminder cancellation;
- simultaneous schedule/generation/result/contest commands;
- Phase 2 duplicate calls and changed-payload idempotency conflict.

Route contract tests verify status codes and DTO field allow-lists. UI tests verify mobile layouts, disabled reasons, inline expansion, keyboard/focus behavior and captain/public capability differences. Security tests call base tables with anon credentials and require denial.

## 33. Migration and deployment strategy

Likely migrations, split for reviewability:

1. core league season/team/player/phase/venue/round/match schema, indexes and revokes;
2. transactional roster/generation/scheduling commands and audit support;
3. lineup/result/set/actual-player/dispute/special-outcome schema and commands;
4. standings and public read functions;
5. notification jobs plus extension of the shared idempotency operation check if the common ledger is reused;
6. storage bucket/policies and optional scheduler metadata.

Migrations are additive; existing tournament tables are untouched. Apply schema before code that references it, keep the module unpublished until smoke tests pass, seed only venue configuration, and never seed production teams/results. Rollback before public use can drop the isolated league objects; after data exists, rollback should disable routes/feature flag and use forward fixes rather than destructive drops.

Deployment gates: local migration replay from baseline, generated TypeScript types if adopted, lint/build, SQL/integration suite, staging timezone/privacy/concurrency tests, admin acceptance, feature flag, then public navigation enablement. Scheduler credentials and monitoring must exist before reminders/finalizer are enabled.

## 34. Risks

- Custom user sessions mean Supabase RLS cannot identify captains; any direct browser query would be a security regression.
- Lineup leakage can occur through broad selects, shared caches, logs or error payloads even if React hides fields.
- Existing user login is phone-keyed and updates a user record from supplied profile data; captain-sensitive actions deserve rate limiting and a future stronger authentication/verification review.
- Multi-step application writes would allow partial phase/result state; transactional commands are required.
- A late scheduler must not change deadline/contest authorization; DB-time effective states are required.
- Exceptional administrative rulings beyond the defined awarded walkover/no-show must show their explicit standings contribution before confirmation.
- Public media needs content validation, size limits, safe paths and lifecycle cleanup.
- Home/away search must have deterministic caps and surface quality, not time out or silently degrade.
- Corrected contested results require immutable revisions or audit evidence becomes unreliable.
- Phase finalization/reopen can invalidate Phase 2; once Phase 2 exists, Phase 1 reopening should be forbidden or require an explicit destructive recovery runbook.

## 35. Blocking open questions

None for the staged implementation currently defined. Walkover/no-show and suspension semantics are resolved above. Whether suspended partial-score evidence is stored can be decided during the result-model stage because it never affects standings.

Nonblocking implementation defaults recommended by this audit: one active season initially; transactional in-app reminders; Phase 2 preserves the season lottery order; logo/image use a dedicated public-media bucket with server-authorized writes; result auto-confirmation uses an authenticated scheduled worker with DB-time fallback semantics.
