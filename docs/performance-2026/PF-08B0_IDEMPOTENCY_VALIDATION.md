# PF-08B0 — Idempotency infrastructure validation

## Result

**PASS — local migration, security, functional behavior, contention, rollback, and reset reproducibility validated.**

All database work targeted only the unlinked local Supabase database at `127.0.0.1:54322/postgres`. Direct identity returned PostgreSQL 17.6, database/user `postgres`, and the expected Docker-internal server address/port `172.18.0.2:5432`.

## Migration application

Migration:

```text
supabase/migrations/20260916170000_pf08_idempotency.sql
```

The production baseline applied first, the PF-08B0 migration applied second, and the existing synthetic seed applied afterward.

The first applied draft revealed that Supabase default privileges had left `service_role` with more than CRUD. The migration was corrected with an explicit `REVOKE ALL ... FROM service_role` followed by a narrow CRUD grant. No baseline or seed change was required.

One reset attempt after that edit encountered a transient local `LegacyDbSetupError` while starting containers, before reporting a migration SQL error. The database and core services recovered healthy; retrying the unchanged migration succeeded. This was classified as local container orchestration, not a schema defect.

## Structural validation

| Check | Result |
|---|---|
| Table owner | `postgres` |
| Primary key | `id` |
| Scoped unique constraint | `(operation, user_id, idempotency_key)` |
| User FK | `user_id → public.users(id)` |
| Operations | `store_checkout`, `moviback_redemption` only |
| Hash format | lowercase SHA-256 hex, exactly 64 characters |
| Statuses | `processing`, `committed` only |
| State/result consistency CHECK | Present and enforced |
| RLS | Enabled |
| RLS policies | 0 |

## Effective privilege validation

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
|---|---|---|---|---|---|---|---|
| `anon` | no | no | no | no | no | no | no |
| `authenticated` | no | no | no | no | no | no | no |
| `service_role` | yes | yes | yes | yes | no | no | no |

The final ACL is `{postgres=arwdDxtm/postgres,service_role=arwd/postgres}`. Existing RLS was not weakened anywhere else.

## Focused functional test

Test script:

```text
supabase/tests/pf08b0_idempotency.sql
```

It runs as `service_role` inside a transaction and rolls back all test rows. Results:

| Scenario | Result |
|---|---|
| First new scoped key accepted | PASS — one row inserted and committed-result state stored |
| Identical retry | PASS — conflict insert returned zero rows; existing matching hash/result remained |
| Same scope/key with different hash | PASS — no second row; persisted hash comparison identifies conflict |
| Same key, different user | PASS — independent row accepted |
| Same key, different operation | PASS — independent row accepted |
| Rolled-back committed test row | PASS — no row remained after savepoint rollback |
| Entire focused test cleanup | PASS — zero rows after outer rollback |

The assertion query returned `all_assertions_passed = 1`.

## Concurrency validation

Two separate local PostgreSQL sessions attempted the same `(store_checkout, User A, key)` scope. The first inserted the processing claim and held its transaction for 30 seconds before storing its result and committing. The second used `INSERT ... ON CONFLICT DO NOTHING`.

Observed second-session result:

- wait time: 11.8 seconds;
- inserted rows: 0;
- visible row after wait: `status='committed'`;
- request hash: identical;
- stored result: the first transaction's result;
- final durable rows for the scope: 1.

This demonstrates that the unique constraint/index serializes concurrent same-key claims. Both attempts cannot create independently committed rows. No advisory lock or separate processing lease is needed when claim and business work share one transaction.

## Rollback behavior

The focused savepoint test proved a rolled-back completed row disappears. The same PostgreSQL rule applies to an uncommitted processing claim: business failure must propagate and roll back the entire RPC transaction, removing claim, result, and business changes together.

A `failed` record is deliberately not persisted. Failure observability belongs in privacy-safe application telemetry, not in a row that could be mistaken for a replayable business outcome.

## Final reset and reproducibility

After functional and concurrency tests, a final local-only reset completed successfully in approximately 94.8 seconds:

- baseline migration applied;
- PF-08B0 migration applied;
- synthetic seed applied;
- idempotency table row count returned **0**;
- fixture counts remained unchanged;
- User A balance remained 2,000;
- User B balance remained 500;
- final RLS and least-privilege ACL remained intact;
- no duplicate rows accumulated.

Earlier successful post-correction application took approximately 89.2 seconds. Reset duration is local migration-operability evidence, not application performance data.

## Scope and regression assessment

No application source, route, checkout logic, redemption logic, environment, configuration, baseline migration, or seed changed. No checkout/redemption RPC, idempotency helper function, provider behavior, or deployment was introduced.

Regression risk is **LOW** for current production behavior because the migration is additive and unused by current routes. Future integration risk remains **HIGH** until each business RPC proves that claim, mutation, and stored result are one transaction and that canonical hashes remain stable across clients/releases.

PF-08B1 was not started.
