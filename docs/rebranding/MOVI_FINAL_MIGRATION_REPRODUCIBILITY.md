# MOVI final migration reproducibility certification

Certification date: 2026-10-03 (Europe/Rome)

Repository HEAD inspected: `cca6937cb4c520dc8727d41eb15b091a4dc8dff3`

Scope: local-only migration-chain audit; no production or remote Supabase access.

## Final gate

```text
MIGRATION_CHAIN_REPRODUCIBLE = YES
SCHEMA_EQUIVALENCE = YES
READY_FOR_FINAL_RECERTIFICATION = YES
```

The final 46 repository migrations applied in lexical/version order on the first attempt to a database with no application migration ledger. The rebuilt ledger contains exactly the 46 repository versions, with no missing, extra, or duplicate version. The latest migration is `20261019100000_player_side_preferences.sql`.

## Original mismatch

The repository contains 46 migration files. The existing development database at `127.0.0.1:55422` has 29 registered versions, from `20260916143214` through `20261004100000`. It has no extra ledger version, but it is missing these 17 repository versions:

```text
20261005100000
20261006100000
20261007100000
20261008100000
20261009100000
20261009110000
20261009120000
20261009130000
20261010100000
20261012100000
20261013100000
20261014100000
20261015100000
20261016100000
20261017100000
20261018100000
20261019100000
```

The current ledger was read only. No direct or supported repair command was run, and no row was inserted into `supabase_migrations.schema_migrations`.

The per-file result, SHA-256, current ledger registration, and current structural-effect status are recorded in `.artifacts/migration-certification/migration-inventory.csv`.

## Isolation and clean start

The certification used a separate Supabase project root at `.artifacts/migration-certification/isolated-project`, with:

- project ID `tornei-app-migration-cert`;
- API `127.0.0.1:56421`;
- PostgreSQL `127.0.0.1:56422`;
- Studio `127.0.0.1:56423`;
- Mailpit `127.0.0.1:56424`;
- a distinct Docker volume named `supabase_db_tornei-app-migration-cert`;
- an intentionally empty seed during the migration phase.

Before the migrations were copied into the isolated root, `to_regclass('supabase_migrations.schema_migrations')` returned `NULL` (`ABSENT`). The migration files were then copied with a SHA-256 comparison result of zero mismatches. `supabase migration up --local` applied all 46 files in order without manual SQL, skipped versions, or ledger repair.

The regular development project remained on project ID `tornei-app`, API port `55421`, database port `55422`, and volume `supabase_db_tornei-app` throughout the audit.

## Ledger result

| Check | Result |
| --- | --- |
| Repository migration count | 46 |
| Rebuilt ledger count | 46 |
| Missing rebuilt versions | 0 |
| Extra rebuilt versions | 0 |
| Duplicate rebuilt versions | 0 |
| Current development ledger after certification | unchanged at 29 |

The rebuilt ledger was checked again after fixtures and acceptance tests and remained unchanged at 46 versions.

## Schema comparison

Both databases were inventoried deterministically for schemas, relations, columns, types, defaults, nullability, PK/FK/unique/check constraints, indexes, views, function definitions, triggers, RLS state, policies, storage buckets, and grants.

The raw comparison initially showed formatting-only differences in `player_profile_identity_after_update()` because the current database had received a compact direct-SQL form. After removing whitespace and case differences from function-definition hashes, the definitions matched.

The only remaining row difference was:

```text
storage.buckets: medical-certificates
```

This bucket exists only in the current development snapshot before isolated fixture loading. It is created by `supabase/tests/fixtures/customer_hub.local.mjs`, not by a migration. It is therefore classified as **B. expected local/fixture difference** and is not a schema-chain defect.

All meaningful structural objects matched. This includes:

- `padelleria_contents`, media, `delete_on_expiry`, archive/list functions, RLS, and policies;
- `circuits.home_image_url`;
- Partner tables, functions, and policies;
- player identity, account-resolution, and profile objects;
- Gioca/Allenati request array columns and constraints;
- operator permissions, access audit, domain enforcement, admin-editor functions, constraints, RLS, grants, and policies.

Difference classification:

| Class | Count | Result |
| --- | ---: | --- |
| A. Equivalent | final structural schema | PASS |
| B. Expected fixture/extension difference | 1 | `medical-certificates` bucket row |
| C. Migration-chain defect | 0 | none |
| D. Current-local drift | 0 meaningful differences | none |
| E. Unknown | 0 | none |

No migration was found to require manually created predecessor objects, later migration objects, fixture data, environment-specific schema state, or current-development drift.

## Fixture separation and acceptance

Migration certification completed before any fixture was loaded. Acceptance then used the repository seed and named local-only fixture sources listed in `.artifacts/migration-certification/fixture-sources.txt`.

Some SQL suites intentionally require fixture or candidate data. The observed progression was:

- clean migrated schema: 27 SQL suites passed; 13 reported their documented fixture prerequisites;
- after `supabase/seed.sql`: 36 passed; four still required their named Padelleria, player identity/profile, or PF08 classification prerequisites;
- after the documented local fixture layer: 40/40 SQL suites passed.

The PF08 classification suite explicitly says it requires both its fixture and successful candidate; `supabase/tests/candidates/pf08_reward_classification_candidate.sql` was therefore applied only in the post-migration acceptance phase. It is not part of the certified 46-file migration chain.

Fourteen distinct HTTP acceptance suites passed against a separate Next server on `localhost:3200` and the isolated Supabase API on `56421`:

- unified public auth/onboarding;
- profile;
- requests, including Gioca/Allenati multi-select;
- activities, including tournament/circuit/Monday League sources;
- tournament and circuit catalogue endpoints;
- Circuit Detail Phase 2;
- Padelleria CRUD/media and lifecycle cleanup;
- Partner;
- Customer Hub, MoviBack, membership card, and QR data;
- operator permissions Phase 1;
- operator domain enforcement Phase 2;
- staff dashboard Phase 3;
- operator admin editor and last-admin protection Phase 4.

The full service start initially encountered local health-check timeouts for Studio/Postgres Meta/Storage. A minimal local stack containing DB, Auth, REST, Storage, gateway, and Mailpit was started instead. Storage functionality passed the Customer Hub acceptance. This is classified as a local auxiliary-service warning, not a migration or functional schema defect.

## Lint gate and warnings

This task changed no JavaScript or TypeScript production/test source. The prior changed/rebranding-file lint gate remains PASS, with no new lint debt.

Recorded baselines from `.artifacts/final-certification/`:

- repository-wide artifact: 615 files, 619 errors, 1,069 warnings;
- relevant-source legacy baseline: 576 files, 578 errors, 58 warnings across 84 files.

Legacy lint debt remains deferred. The known `metadata.themeColor`, stale `caniuse-lite`, and `MODULE_TYPELESS_PACKAGE_JSON` warnings remain non-blocking and were not changed.

## Current-local reconciliation recommendation

**Recommendation A: reset/rebuild the current local database**, after explicit user authorization and after confirming the documented local fixtures can be recreated. This is preferable because the current database is a fixture/review environment and its 29-row ledger does not truthfully describe the already-present schema.

Do not directly insert the 17 versions into `schema_migrations`. Although structural equivalence is proven, rebuilding through the normal chain gives the cleanest and most auditable local history. Until authorization is given, keep the current development database unchanged and use this certification only as evidence.

## Production rollout rule

Production was not accessed. During a future authorized rollout, determine the production ledger and schema independently, then apply repository migrations through the normal ordered Supabase migration process. Never infer production state from either local ledger. Do not issue a production repair command unless production state has been verified during that rollout window.

## Cleanup and evidence

The isolated Next process was stopped. The isolated containers and all isolated Docker volumes were deleted with the project-scoped Supabase stop command. Temporary test copies under `supabase/tests` were removed. Final residue counts are zero; the original local Supabase project remains running.

Primary evidence is stored under `.artifacts/migration-certification/`, including:

- `migration-inventory.csv` and `migration-files.txt`;
- `current-ledger.txt`, `isolated-ledger.txt`, and ledger verification files;
- current and rebuilt canonical/pg_dump snapshots;
- raw and normalized schema diffs;
- migration execution logs;
- per-suite SQL and HTTP acceptance logs;
- fixture, lint, cleanup, and final summary files.

## Delta recertification: migration 46

The player-side delta adds `20261019100000_player_side_preferences.sql` as the
46th and final repository migration. All previously certified migration files
remain byte-identical to the recorded SHA-256 inventory.

A fresh isolated local Supabase project (`tornei-app-delta-46-cert`) used
separate 5642x ports and a separate Docker volume. Its migration ledger was
absent before the run; the normal `supabase migration up --local` mechanism
then applied 46/46 migrations in lexical order. The resulting ledger contained
46 unique versions with no missing or extra entry.

The deterministic schema snapshot matched the current intended local schema.
The only extra current-local row was the known fixture-only
`medical-certificates` storage bucket. In both snapshots,
`player_profiles.preferred_side` and `movi_requests.playing_side` are nullable
`text` columns with the approved `right`, `left`, and `any` checks. No default,
index, or `NOT NULL` conversion was introduced.

The isolated containers and volume were removed after certification. Evidence
for this delta is stored under
`.artifacts/migration-delta-certification/`.
