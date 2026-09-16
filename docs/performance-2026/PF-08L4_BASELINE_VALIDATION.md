# PF-08L4 — Baseline static validation

## Result

**READY FOR LOCAL TEST.**

This means the migration passed static normalization and inventory checks and may proceed to PF-08L5 against a disposable local Supabase instance. It does not mean the migration has executed successfully, and it is not approved for production.

## Identity checks

| Check | Result |
|---|---|
| Raw file exists | PASS |
| Raw byte size is 98,235 | PASS |
| Raw SHA-256 matches expected value | PASS |
| Normalized migration created once under `supabase/migrations/` | PASS |
| Raw dump absent from repository | PASS |

## Static object inventory

| Object type | Expected | Migration | Result |
|---|---:|---:|---|
| Public tables | 44 | 44 | PASS |
| Public views | 3 | 3 | PASS |
| Public functions | 2 | 2 | PASS |
| Standalone indexes | 56 | 56 | PASS |
| Total indexes including PK/UNIQUE backing indexes | 125 | 125 derived | PASS |
| Primary keys | 44 | 44 | PASS |
| UNIQUE constraints | 25 | 25 | PASS |
| CHECK constraints | 59 | 59 | PASS |
| Foreign keys | 52 | 52 | PASS |
| Policies | 6 | 6 | PASS |
| RLS-enabled tables | 44 | 44 | PASS |
| Triggers | 0 | 0 | PASS |

Table, view, standalone-index, CHECK, FK and policy name sets match the hash-verified raw source.

## PF-08 required objects

All required tables are present:

- `users`
- `loyalty_memberships`
- `loyalty_transactions`
- `rewards_catalog`
- `reward_redemptions`
- `store_categories`
- `store_lines`
- `store_products`
- `store_product_colors`
- `store_product_sizes`
- `store_product_stock`
- `store_orders`
- `store_order_items`

No PF-08 future idempotency table, checkout RPC, redemption RPC, stock uniqueness change, constraint strengthening or additional index is present.

## Row-data and secret safety

Static scans found:

- no executable `COPY`;
- no executable `INSERT INTO`;
- no executable `MERGE`;
- no production hostname, pooler hostname or connection string;
- no Supabase project reference;
- no database password, API key, JWT/cookie secret, Telegram token, Resend key, VAPID secret or SMTP credential.

The only data-changing statement text is the intentional `UPDATE public.staff_users` inside the stored `set_staff_password` function body. It is a function definition, not migration-time row data or an executed update.

## Destructive-statement safety

The migration contains no:

- `DROP TABLE`;
- `DROP SCHEMA`;
- `DROP DATABASE`;
- `DROP ROLE`;
- `TRUNCATE`;
- executable `DELETE`.

Targeted `REVOKE` statements exist only for the two known `SECURITY DEFINER` functions and remove EXECUTE from `PUBLIC`, `anon` and `authenticated`. Their matching grants are restricted to `postgres` and `service_role`.

## Dependency and ordering review

| Concern | Static conclusion | PF-08L5 verification |
|---|---|---|
| `public` schema pre-existence | `CREATE SCHEMA public` removed; standard local Supabase provides it | Confirm owner/ACL remain the verified local defaults |
| `pgcrypto` / `extensions` | Not recreated; verified available locally | Confirm functions resolve and compile/execute only through approved roles |
| `gen_random_uuid()` | Verified locally before PF-08L4 | Insert synthetic rows later only after baseline application/seed authorization |
| `auth.uid()` | Verified locally; required by three owner policies | Confirm policies create and catalog definitions match |
| Function dependencies | Functions moved after tables/FKs | Confirm creation and metadata exactly |
| Function owner | Explicitly assigned to `postgres` | Confirm migration role is allowed to set/retain this owner |
| Supabase roles | `postgres`, `anon`, `authenticated`, `service_role` verified locally | Confirm REVOKE/GRANT results |
| View ordering | Production dump dependency order preserved | Confirm all three views create successfully |
| FK ordering | Production post-table constraint order preserved | Confirm all 52 FKs validate on empty local tables |
| Policy ordering | Production policy/RLS statements preserved | Confirm six policies and 44 RLS flags |
| Table/default ACL reliance | Uses verified local Supabase defaults | Compare post-application effective ACLs with approved metadata |

## Known portability conditions

**Remaining portability concern classification: LOW.**

No blocking static incompatibility was found. The remaining concerns are limited to execution-time confirmation that the fresh local Supabase migration runner retains function ownership as `postgres`, applies the verified default ACL model, and resolves the already verified managed dependencies. PF-08L5 is specifically responsible for proving those conditions locally.

1. Apply only to a fresh/disposable local Supabase database. The migration intentionally lacks `IF NOT EXISTS`; a non-empty schema should fail instead of silently drifting.
2. Use the normal local Supabase migration flow and an expected privileged local role. A different runner may not be able to assign function ownership to `postgres`.
3. Do not apply with an arbitrary SQL client lacking the standard local Supabase roles or managed schemas.
4. Do not use this migration against production, a linked project, or any non-local host.
5. Runtime function behavior and ACL enforcement remain PF-08L5 tests; static review cannot prove execution.

## PF-08L5 acceptance checklist

- [ ] Repository reports `Not linked` before execution.
- [ ] Target is explicitly `127.0.0.1:54322`.
- [ ] Local database is disposable and contains no needed data.
- [ ] Baseline applies from a fresh reset with zero errors.
- [ ] Inventory equals the expected counts above.
- [ ] All 13 PF-08 tables exist.
- [ ] `public` owner/ACL and relevant table/default ACLs match the approved metadata.
- [ ] Both functions are owned by `postgres`, remain `SECURITY DEFINER`, and have fixed search paths.
- [ ] EXECUTE is unavailable to `PUBLIC`, `anon`, and `authenticated` and available to `postgres`/`service_role`.
- [ ] Views, FKs, RLS and policies match the baseline.
- [ ] No production endpoint or credential is present in the execution environment.

Until PF-08L5 passes, the baseline remains **ready for local test**, not validated by execution.
