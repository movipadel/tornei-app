# MOVI Auth 2.0 — Stage 1 identity foundation

Date: 2026-09-21. Source of truth: `docs/auth/MOVI_AUTH_2_STAGE0_ARCHITECTURE.md`.

## 1. Scope

Stage 1 adds the database foundation for a future Supabase Auth migration. It does not change public login, create or migrate real Auth users, link existing profiles, merge users, resolve legacy cookies, send email, or expose new identity fields in application DTOs.

The migration is additive and leaves every existing `public.users` row valid. Existing profile, consent, league, MoviBack, Store, tournament and communication data is not rewritten.

## 2. Schema additions

Migration: `supabase/migrations/20260926100000_movi_auth2_stage1_identity_foundation.sql`.

It adds:

- nullable `public.users.auth_user_id`;
- a partial unique index for nonnull Auth links;
- a foreign key to `auth.users`;
- authoritative email and phone normalization helpers plus nonunique matching indexes;
- `user_identity_aliases` for administrative identity mappings;
- `user_merge_operations` for future merge request/lifecycle state;
- append-only `user_merge_journal` for immutable evidence and domain events;
- bounded `resolve_canonical_user_id(uuid)` for service/admin tooling.

No identity-status column or automatic canonical mutation is added in Stage 1. Source users remain ordinary application profiles until a later, separately reviewed stage defines soft-merge state and writer behavior.

## 3. `auth_user_id` relationship

`auth_user_id` is nullable, so all legacy profiles remain valid. The partial unique index permits many NULL values while preventing one Auth identity from linking to more than one MOVI profile.

The FK uses `ON DELETE SET NULL`. Deleting an authentication credential therefore cannot cascade-delete a MOVI profile or its business history. The profile becomes unlinked and must fail closed under future Auth-aware routing. Stage 1's legacy login still ignores this field, which is part of the known temporary risk rather than a finished account-recovery model.

No application query selects `auth_user_id`; Stage 1 does not expose it in `/api/user/me`, login responses or browser DTOs.

## 4. Email normalization

`normalize_user_email(text)` returns `lower(trim(email))`, or NULL for NULL/blank input. It provides one server-side matching contract for future activation tooling. It does not verify ownership, remove plus tags, fold provider-specific dots, or assert that shared emails represent one person.

`users_normalized_email_idx` is nonunique. A global normalized-email unique constraint remains intentionally absent because legacy duplicates and possible shared contact addresses have not been adjudicated.

## 5. Phone normalization

`normalize_user_mobile_e164(text)` returns a conservative E.164 candidate or NULL. It removes common display whitespace/punctuation, converts a leading `00` to `+`, and maps a ten-digit Italian mobile beginning with `3` to `+39`.

These values converge to `+393471286908`:

- `3471286908`
- `+393471286908`
- `00393471286908`
- `347 128 6908`
- `+39 347 128 6908`

Short technical values such as `40` and `41` return NULL. The helper does not repair one-digit mistakes, verify possession, or establish that an explicit foreign E.164 number is mobile or assigned. `users_normalized_mobile_idx` is a nonunique discovery index; Stage 1 does not rewrite `users.phone` or add a normalized-phone uniqueness constraint.

## 6. Alias model

`user_identity_aliases` stores one mapping per source profile. Its core fields are source/canonical IDs, pending/active/revoked status, reason, timestamps, optional staff actor, optional future merge operation and JSON metadata.

The source and canonical IDs must differ. Both remain FK-protected `public.users` rows. A source can appear only once, including after revocation; changing a mapping requires an explicit audited update rather than silently inserting a competing destination.

An alias is administrative identity metadata. It does not authenticate a request, rewrite an HMAC cookie, expose canonical profile data or grant Monday League captain rights. Current login and authorization code do not call the resolver.

## 7. Merge operation and journal

`user_merge_operations` is the future command/lifecycle record. It stores unique request ID, source/canonical users, planned/running/completed/failed/rolled-back state, reason, staff actor, timestamps and structured metadata/error data. It performs no merge.

`user_merge_journal` is an append-only evidence stream. It records the operation, identities, event type, domain step, status, actor, timestamp, details and error metadata. A trigger rejects UPDATE and DELETE. Future tooling may update the lifecycle record but must append evidence events rather than rewrite history.

Stage 1 does not contain `merge_user`, child-table reassignment, financial reconciliation or consent mutation.

## 8. Canonical resolution

`resolve_canonical_user_id(uuid)` is a stable, security-definer service helper. It:

- returns the same UUID for an existing user with no active alias;
- follows only active aliases;
- returns NULL for a missing input user;
- produces one deterministic result because source is unique;
- detects repeated nodes;
- aborts after 32 links.

The alias write trigger checks every proposed mapping, including pending/revoked mappings, and rejects self, short and longer cycles before storage. The resolver also checks for cycles and depth violations as defense in depth.

The helper is not an authentication resolver. Stage 2 or later must define assurance, activation state, Auth precedence and legacy-cookie cutoff before any authorization path may use canonical identity.

## 9. Security, RLS and grants

RLS is enabled on all three new tables. PUBLIC, `anon` and `authenticated` receive no direct table access. `service_role` receives only the operations needed for future server tooling:

- operation and alias tables: SELECT, INSERT, UPDATE;
- journal: SELECT and INSERT only;
- journal identity sequence: USAGE and SELECT.

Normalization and canonical-resolution functions revoke PUBLIC/anon/authenticated execution and grant service-role execution. Trigger functions are not directly granted. Security-definer functions pin `search_path` to `pg_catalog` and explicitly qualified application objects.

These restrictions protect the Data API surface; server routes using the service role must still authenticate and authorize staff before invoking future identity tooling.

## 10. Current-login compatibility

The following remain unchanged:

- `POST /api/user/login` normalizes only whitespace in phone and upserts on `phone`;
- successful login signs `public.users.id` into the custom HMAC cookie;
- `GET /api/user/me` reads the cookie UUID and loads that exact profile;
- the custom token remains fixed at 30 days;
- Monday League captain checks still receive the raw legacy user UUID;
- MoviBack, Store, tournaments and communications keep their existing identity behavior.

No source file under `src/` changes in Stage 1. This preserves behavior but also preserves the limitation below.

## 11. Known legacy security limitation

The current public login proves no possession of phone or email. Knowledge of a stored phone can select that user, overwrite profile/contact/consent fields and receive a signed cookie for that UUID. It is temporary and deprecated.

The additive schema does not fix this exposure. An alias also cannot safely bridge it: a legacy cookie must never inherit canonical data or captain privileges merely because an alias exists. Stage 2 must first add verified Auth activation and assurance-aware server resolution, while protecting linked profiles from the old upsert path.

## 12. Dependency inventory and non-mutation contract

Known direct or semantic user-reference domains are:

- `business_operation_idempotency.user_id`
- `communication_user_states.user_id`
- `communications.recipient_user_id`
- `league_audit_events.actor_user_id`
- `league_lineups.submitted_by_user_id`
- `league_notification_events.recipient_user_id`
- `league_result_contests.opened_by_user_id`
- `league_result_submissions.submitted_by_user_id`
- `league_team_players.user_id`
- `loyalty_memberships.user_id`
- `medical_certificates.user_id`
- `store_orders.user_id`
- `tournament_registrations.user_id`
- `tournament_run_participants.user_id` (no FK in the inspected baseline)

Historical copied identity remains separate and untouched: Store order customer phone/email, tournament registration player-phone snapshots, run-participant phone and `circuit_results.player_phone`/player keys. Stage 1 updates none of these domains.

Consent fields are also untouched. Future reconciliation must preserve privacy, terms and age evidence. Marketing conflicts resolve conservatively to opt-out unless an explicit newer opt-in is legally valid and attributable to the verified person.

## 13. Tests

`supabase/tests/movi_auth2_stage1_identity_foundation.sql` is a rollback-only local SQL contract covering:

1. legacy NULL Auth link;
2. nonnull Auth-link uniqueness and duplicate rejection;
3. Auth deletion with profile preservation and link nulling;
4. email trim/lower and blank handling;
5. all required Italian phone variants and technical-value rejection;
6. source/canonical distinction and unique source;
7. short and longer cycle rejection;
8. deterministic bounded canonical resolution;
9. append-only journal enforcement;
10. RLS/grants and direct browser-role read denial;
11. presence of all known business domains and copied fields.

`supabase/tests/movi_auth2_stage1_contract.test.mjs` checks migration boundaries, security clauses and exact preservation of the login/me/HMAC source contracts.

Clean migration replay must use only the verified unlinked loopback target. The validation target for this stage is API `127.0.0.1:55021`, DB `127.0.0.1:55022`, `linked_project:null`.

## 14. Rollback

Before Stage 2 data exists, rollback is additive-object removal in reverse dependency order: resolver and triggers/functions, journal/alias/operation tables and indexes, normalization indexes/functions, Auth-link FK/index and column. Do not edit historical migrations or remove these objects manually from a deployed environment without a reviewed forward migration.

After any Auth links, aliases or journal evidence exist, dropping the foundation is destructive and is no longer an acceptable rollback. Disable future enrollment/tooling, preserve identity history and issue a forward repair migration instead. Deleting an Auth user already sets its profile link to NULL and never deletes business data.

## 15. Stage 2 prerequisites

Stage 2 is not implemented. Before it starts:

- design verified-email activation and password/session lifecycle with Supabase SSR;
- define assurance states, pending activation records and Auth-versus-HMAC precedence;
- protect an Auth-linked profile from legacy phone upsert/account takeover;
- define a generic-response, rate-limited email verification flow and hosted SMTP/redirect configuration;
- add server authorization around service-role identity helpers;
- decide soft-merged profile status and make every writer reject or redirect inactive sources;
- complete table-specific merge policies, especially idempotency, multiple MoviBack memberships, captain collisions and pending notifications;
- define legacy-cookie issuance cutoff without using aliases as privilege bridges;
- test PWA/browser refresh, logout, recovery and cache behavior;
- review live schema/candidate data separately before any production access or migration.

