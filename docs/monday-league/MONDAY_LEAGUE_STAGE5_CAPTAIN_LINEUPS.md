# Monday League — Stage 5 Captain & Lineups

## 1. Scope

Stage 5 adds captain self-service on the existing public team page, versioned lineups, independent season publication/lifecycle controls, and a safe media/deletion foundation. Captain results, disputes, notifications, and Phase 2 generation remain out of scope.

## 2. Captain capabilities

The server resolves the signed `user_session` cookie to `users.id`, then verifies that the linked active `league_team_players` row is the team's `captain_player_id`. The team response contains explicit `can_edit_profile`, `can_edit_roster`, `can_submit_lineup`, and `lineup_locked` capabilities.

## 3. Team profile editing

Captains may change only slogan, logo path, and hero-image path for their own team. Admins may do the same for every team. Team name, captain, season, sporting state, schedule, and results are not accepted by captain commands. Every update is audited.

## 4. Roster pre-season policy

While both the season and Phase 1 remain `draft`, a captain may replace the active roster with one to four players. The existing linked captain must occur exactly once and cannot be changed. New captain-created players are unlinked display-name records.

## 5. Roster lock policy

As soon as the season leaves `draft` or Phase 1 leaves `draft`, the database rejects captain roster writes. The page displays “Rosa ufficiale — per modifiche contatta l'organizzazione”. Admins use a distinct override command at any lifecycle stage; historic player rows are deactivated rather than rewritten.

## 6. Lineup schema

`league_lineups` stores match, team, monotonically increasing revision, current/superseded state, user/staff actor, timestamps, and override reason. `league_lineup_players` stores two ordered, distinct team players. A partial unique index permits one current lineup per match/team; old revisions remain evidence.

## 7. Deadline

The deadline is always derived as `scheduled_at - interval '1 hour'`. Captain writes compare `now()` in PostgreSQL and reject when `now() >= deadline`; equality is locked. There is no independently drifting deadline column.

## 8. Privacy

Before the deadline, the public-lineup database function returns SQL/JSON null for both teams. The captain context returns only the caller's current lineup; the opponent field is null. Public roster DTOs omit player IDs. React never receives hidden opponent names or IDs.

## 9. Missing lineup

At reveal time, an absent current lineup is represented as `{ state: "missing", label: "Formazione non comunicata" }`. This has no automatic defeat, standings, or result effect.

## 10. Admin override

Admins can read both current lineups and submit or replace either side at any time. Post-deadline overrides require a non-empty reason. Replacement supersedes rather than deletes the previous revision and emits an audit event.

## 11. Rescheduling interaction

Before the old deadline, changing `scheduled_at` naturally derives a new deadline and existing lineups stay editable. When the old deadline has passed or the match is already locked, a trigger persists `lineups_locked_at` during rescheduling. An admin may reopen both sides only, with a mandatory reason and only while the new deadline is future.

## 12. Season visibility

`public_visibility` (`hidden`/`public`) is independent of sporting status. Public reads, team pages, and the home hero require `public` plus a non-future `published_at`. Publishing initializes `published_at` when absent; hiding never deletes data.

## 13. Archive

Only a `completed` season can transition to `archived`. Archive preserves teams, rosters, schedule, lineups, results, audits, and media. Archived seasons can independently remain public or hidden.

## 14. Hard delete

Normal permanent deletion accepts only `completed` or `archived`, an admin actor, an exact season-name confirmation, and a request UUID. Active seasons are rejected. The transactional command deletes only the season-owned league graph; user and staff accounts remain.

## 15. Storage cleanup

Before database deletion, the command records allow-listed logo/hero object paths and a durable deletion-log row. The API then removes exactly those objects from `monday-league-media` and records complete/partial/failed cleanup. Storage failure never resurrects deleted database state.

## 16. Dynamic home hero

`/api/monday-league/hero` returns no hero for hidden/unpublished seasons. A visible season renders a responsive, real-text card after the personal/action blocks and before “Circuiti MOVI”, linked to `/monday-league`. Text follows draft, Phase 1, Phase 2, and final states.

## 17. Auth and security

Captain routes derive identity only from the HMAC cookie; request bodies cannot nominate a user. Admin routes reuse the verified staff session. Database functions are revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role`; browser clients receive no direct table write privileges.

## 18. Local acceptance

Acceptance targets the unlinked local stack at API `55021`, DB `55022`, and app `http://127.0.0.1:3100`. The disposable SQL fixture covers ownership, profile paths, roster boundaries, lineup revision/privacy/deadline, overrides, rescheduling, visibility, deletion isolation, and idempotency. Browser checks cover captain/public pages and responsive home hero placement.

## 19. Production dependency

No production change is part of Stage 5. Deployment later requires applying all migrations in order, configuring the existing server-only service key and cookie secrets, verifying the storage bucket policy, and executing the production acceptance plan under an explicit release authorization.

## 20. Stage 6 prerequisites

Stage 6 may build captain result submission and contestation on the preserved lineup revisions and existing Stage 3 result model. It must retain the same actor derivation, audit/version semantics, database-time boundaries, and public-data minimization. Notification automation and Phase 2 generation remain separate work.
