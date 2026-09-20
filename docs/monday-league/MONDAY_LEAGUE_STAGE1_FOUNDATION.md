# Monday League — Stage 1 Domain Foundation & Security

## 1. Stage scope

Stage 1 installs the secure domain foundation inside the existing MOVI `tornei-app`. It adds only league schema, shared constants, tests and a guarded admin placeholder. It does not implement generation, scheduling UI, standings, results, lineups, disputes, notifications, captain editing, public pages, the public hero or Phase 2 generation.

## 2. Schema installed

The additive migration `20260920090000_monday_league_stage1_foundation.sql` creates:

- `league_seasons`
- `league_teams`
- `league_team_players`
- `league_phases`
- `league_phase_teams`
- `league_venues`
- `league_venue_slots`
- `league_rounds`
- `league_matches`
- `league_match_team_slots`
- `league_audit_events`
- `league_generation_runs`

All identifiers are UUID except the append-only audit identity. Instants use `timestamptz`; statuses are checked text values. Existing tournament, MoviBack, Store and notification tables are unchanged.

## 3. Integration boundaries

Monday League remains a first-class module in the current Next.js and Supabase project. It reuses `public.users`, `staff_users`, `user_session`, staff/admin cookies, `guardAdmin()`, `supabaseAdmin()`, the existing admin layout and future shared communication/storage infrastructure. League tables are isolated from existing tournament-run tables because their lifecycles differ.

The admin dashboard links to `/admin/monday-league`. The page is protected by the existing middleware and states clearly that only the foundation is installed. No public route is present.

## 4. Security model

RLS is enabled on every league base table. `PUBLIC`, `anon` and `authenticated` have no table privileges. There are no permissive RLS policies. `service_role` receives required server-side operations; `league_audit_events` grants only select/insert and explicitly denies update/delete/truncate.

Future browser access must use Next.js server routes. No league table should be queried directly with the browser Supabase client.

## 5. Captain identity model

The captain is the team’s `captain_player_id`. A deferred composite foreign key guarantees the referenced player belongs to that team. A deferred constraint trigger guarantees the player is active and has a valid `public.users.id`, enforces 1–4 active players, and prevents the same user captaining two active teams in one season.

Future captain authorization must derive `user_id` from the verified HMAC `user_session` cookie and compare it with the captain player’s `user_id`. Names, phone numbers and client-supplied IDs are never authorization inputs.

## 6. Admin identity model

No new authentication exists. Admin routes continue to use `guardAdmin()`, the staff cookie and server-only `supabaseAdmin()`. Generation/audit rows reference `staff_users.id` so later commands can record the verified actor.

## 7. Venue configuration

The migration idempotently installs three stable venues and exactly eight active Monday slots:

- Costigliole: 20:00, 21:30
- Manta: 20:00, 21:30
- Centallo: 19:30, 20:00, 21:00, 21:30

Codes and UUIDs are stable. Venue configuration is data, not repeated scheduling logic. No season/team/match data is seeded.

## 8. Season and phase statuses

Season statuses are `draft`, `phase1`, `phase2`, `completed`, `archived`. The model alone can later select the approved home hero state.

Phase codes are `phase1`, `serie_a`, `serie_b`; lifecycle values are `draft`, `generated`, `in_progress`, `finalized`. Phase 2 rows require a same-season Phase 1 source, checked by a deferred constraint. One phase code is allowed per season.

## 9. Tie-break persistence foundation

`league_phase_teams.tie_break_order` is mandatory, positive and unique per phase. `seed_position` is independently unique. The schema therefore cannot use read-time randomness to order a tie. Stage 2 will assign and persist these values during generation.

## 10. Match participation constraints

Matches reference a round in the same phase and teams belonging to that phase. A canonical expression index rejects reversed duplicate pairings. Schedule/venue nullability is consistent, and `(venue_id, scheduled_at)` is unique.

`league_match_team_slots` has one home and one away row per match and a unique `(round_id, team_id)` key. Deferred validation requires exactly two rows matching the match’s home/away teams. Consequently match creation must remain one transaction that inserts the match and both slot rows; Stage 2’s generator command will own that operation.

## 11. Generation-run foundation

`league_generation_runs` stores phase, generation kind, ordered input JSON, algorithm version, SHA-256-shaped fingerprint, quality metrics, staff actor and completion time. Unique `(phase_id, generation_kind)` provides the database foundation for idempotent one-time generation. No algorithm exists in Stage 1.

## 12. Future public hero state derivation

`mondayLeagueHeroForStatus()` maps season status to the approved content and `/monday-league` route:

- `draft`: “Monday League — Scopri le squadre”
- `phase1`: “Monday League — Classifica e prossima giornata”
- `phase2`: “Monday League — Serie A & Serie B”
- `completed`: “Monday League — Classifica finale”

Archived seasons are intentionally not a hero state. The hero itself remains unimplemented.

## 13. Future storage strategy

Use a dedicated public-media bucket such as `league-team-media`, with object paths `<season_id>/<team_id>/logo/<uuid>.<ext>` and `<season_id>/<team_id>/hero/<uuid>.<ext>`. Store object paths in `logo_path`/`image_path`, not provider URLs. Writes must pass through server routes that verify captain/admin ownership, MIME type and size; do not reuse the generic arbitrary-bucket upload contract. No bucket or upload route is created in Stage 1.

## 14. Local validation

Before database work, `npx supabase status` reported `linked_project:null`, API `http://127.0.0.1:55021`, DB `127.0.0.1:55022`, Studio `55023` and Mailpit `55024`. Validation must use only that unlinked local target.

The SQL suite validates constraints, official slot data, grants/RLS, append-only audit privileges and service-role operations. The Node contract suite validates shared constants, future hero derivation, migration posture and guarded admin integration.

## 15. Production rollout dependency

Stage 1 production rollout requires a separately approved deployment window, migration review, backup/rollback plan and staging replay. The migration is additive and creates no league competition data. This task neither deploys nor contacts production.

## 16. Stage 2 prerequisites

Stage 2 may implement admin team/roster commands and the deterministic Phase 1 generator only after:

- Stage 1 migration is approved and applied in the target environment;
- server command transactions insert matches and both team slots atomically;
- generator algorithm/version and fingerprint format are frozen;
- seed ordering and persistent tie-break assignment are specified in tests;
- admin acceptance confirms team/captain creation workflow;
- the module remains unpublished until later public acceptance.

Resolved future result rules: an awarded walkover/no-show contributes 3–0 points, 2–0 sets and 12–0 games without fake set rows; a suspended match has zero standings impact until completion or an administrative ruling.
