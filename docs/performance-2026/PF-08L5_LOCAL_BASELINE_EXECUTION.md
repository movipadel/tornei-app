# PF-08L5 — Local baseline execution

## Status

**PASS — the production-equivalent public baseline applied twice to the disposable local Supabase database without correction.**

This execution was restricted to the unlinked local target at `127.0.0.1:54322`, database `postgres`. No production endpoint, credential, project link, deployment, seed, application source, environment file, or configuration was used or changed.

## Preflight safety verification

| Check | Observed result | Status |
|---|---|---|
| Git branch | `performance/foundation-2026` | PASS |
| Working tree before execution | No unknown source/config/environment changes | PASS |
| Supabase link state | `linked_project: null` (`Not linked`) | PASS |
| CLI database target | `127.0.0.1:54322/postgres` | PASS |
| Local API / Studio | Loopback addresses only | PASS |
| PostgreSQL version | 17.6 | PASS |
| Current database / user | `postgres` / `postgres` | PASS |
| Server address / port as seen inside Docker | `172.18.0.2:5432` | EXPECTED |
| Local container | `supabase_db_tornei-app`, healthy | PASS |

The external connection boundary was verified as `127.0.0.1:54322`. The `172.18.0.2:5432` result is the expected address of the PostgreSQL server inside the local Docker network, not a remote target.

`npx supabase status` emitted local-development credentials as normal CLI output. Those values are intentionally omitted from this record.

## Baseline file safety check

The pre-execution scan of `supabase/migrations/20260916143214_production_public_baseline.sql` reconfirmed:

- no executable `COPY`, `INSERT INTO`, or `MERGE`;
- no production host, Supabase project reference, connection string, or secret;
- no `DROP DATABASE` or `DROP ROLE`;
- no PF-08 idempotency registry, checkout RPC, redemption RPC, new stock rule, or other future transactional object.

The `UPDATE` text inside `set_staff_password` is part of the stored-function body and is not executed by migration application.

## Commands executed

The destructive commands below were run only after the local/unlinked checks passed:

```powershell
npx.cmd supabase status
npx.cmd supabase db reset
npx.cmd supabase status
npx.cmd supabase db reset
```

Read-only validation used `psql` inside `supabase_db_tornei-app`, routed to the verified local endpoint. Connection credentials are omitted here; the effective target was always the local database defined above. The SQL was limited to catalog metadata, `SELECT count(*)` queries, dependency resolution, and `EXPLAIN` of the three views. Neither staff function was invoked.

Repository checks used:

```powershell
git status --short --branch
git status
git diff --stat
git diff --check
```

## First reset and migration application

| Property | Result |
|---|---|
| Command | `npx supabase db reset` |
| Target | Local, unlinked Supabase only |
| Migration | `20260916143214_production_public_baseline.sql` |
| Migration applied | YES |
| SQL error | None |
| Failed statement/object | None |
| Baseline correction | None |
| Local database usable afterward | YES |
| Approximate duration | 106 seconds |

The workflow recreated the local database, initialized managed schemas, applied `roles.sql`, applied the baseline migration, and restarted local containers. The warning that no `supabase/seed.sql` matched is expected: PF-08L5 neither requires nor authorizes seed data.

## Second reset and reproducibility

Immediately before the second reset, link state and target were checked again: the project remained unlinked and the database URL remained on `127.0.0.1:54322/postgres`.

| Property | Result |
|---|---|
| Command | `npx supabase db reset` |
| Migration applied | YES |
| SQL error | None |
| Baseline correction between runs | None |
| Approximate duration | 41.3 seconds |
| Structural inventory identical | YES |
| All 44 application tables empty again | YES |

The second clean reset proves that application of this baseline does not depend on state left by the first run.

## Corrections and repository impact

No migration correction was necessary. No application source, environment/configuration file, dependency, production setting, seed, or PF-08 transactional migration was created or modified. The only PF-08L5 artifacts are this execution record and its companion validation record.

## Local recovery boundary

Recovery is local and disposable:

- the local database can be discarded and reconstructed with `npx supabase db reset` after re-verifying the unlinked loopback target;
- the baseline migration is version-controlled repository input;
- reconstruction requires no production database state or connection;
- production rollback has deliberately not been designed or exercised in PF-08L5.

The reset timings are migration-operability observations only; they are not application-performance benchmarks.
