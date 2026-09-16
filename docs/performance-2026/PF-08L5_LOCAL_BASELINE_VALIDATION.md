# PF-08L5 — Local baseline validation

## Result

**LOCAL BASELINE VALIDATED.**

The normalized production `public` baseline executes successfully and reproducibly on the disposable local Supabase stack. The first reset passed the complete structural/security/data validation; the second reset produced the same inventory and empty-data state. This result authorizes no production use and does not start PF-08L6 or PF-08B.

## Structural inventory

The first and second resets returned identical results:

| Object type | Expected | First reset | Second reset | Result |
|---|---:|---:|---:|---|
| Tables | 44 | 44 | 44 | PASS |
| Views | 3 | 3 | 3 | PASS |
| Functions | 2 | 2 | 2 | PASS |
| Standalone indexes | 56 | 56 | 56 | PASS |
| Primary keys | 44 | 44 | 44 | PASS |
| UNIQUE constraints | 25 | 25 | 25 | PASS |
| CHECK constraints | 59 | 59 | 59 | PASS |
| Foreign keys | 52 | 52 | 52 | PASS |
| Policies | 6 | 6 | 6 | PASS |
| RLS-enabled tables | 44 | 44 | 44 | PASS |
| Non-internal triggers | 0 | 0 | 0 | PASS |

## PF-08 required tables

All 13 required tables exist, are owned by `postgres`, and have RLS enabled:

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

No future PF-08 idempotency or transactional object is present.

## Function security

| Function | Owner | SECURITY DEFINER | Volatility / parallel | Fixed search path | Effective EXECUTE |
|---|---|---|---|---|---|
| `set_staff_password(uuid,text)` | `postgres` | YES | `VOLATILE` / `UNSAFE` | `public, extensions` | `postgres`, `service_role` only |
| `verify_staff_login(text,text)` | `postgres` | YES | `VOLATILE` / `UNSAFE` | `public, extensions` | `postgres`, `service_role` only |

The stored ACL for each function is `{postgres=X/postgres,service_role=X/postgres}`. Effective EXECUTE is not available to `PUBLIC`, `anon`, or `authenticated`. The mutation function was not invoked.

## ACL and ownership validation

- `public` schema owner is `pg_database_owner`.
- The `public` schema ACL matches the verified production evidence: owner create/usage, `PUBLIC` usage, and usage for `postgres`, `anon`, `authenticated`, and `service_role`.
- Default privileges for objects created by `postgres` and `supabase_admin` in `public` match the approved production metadata for tables, sequences, and functions.
- Representative effective table ACLs for `users`, `loyalty_memberships`, and `store_orders` match the local/production-equivalent defaults.
- Every PF-08 required table is owned by `postgres`.

## RLS and policies

RLS is enabled on all 44 public tables. Exactly six policies exist:

| Table | Policy | Roles | Command | Effective condition |
|---|---|---|---|---|
| `loyalty_memberships` | `user_can_view_own_membership` | `PUBLIC` | SELECT | `auth.uid() = user_id` |
| `loyalty_transactions` | `user_can_view_own_transactions` | `PUBLIC` | SELECT | Membership belongs to `auth.uid()` |
| `medical_certificates` | `user_can_view_own_certificate` | `PUBLIC` | SELECT | `auth.uid() = user_id` |
| `reward_redemptions` | `user_can_view_own_redemptions` | `PUBLIC` | SELECT | Membership belongs to `auth.uid()` |
| `rewards_catalog` | `public_can_view_rewards` | `PUBLIC` | SELECT | `true` |
| `tournament_registrations` | `Public read tournament registrations` | `anon`, `authenticated` | SELECT | `true` |

All are permissive SELECT policies and have no `WITH CHECK` expression, matching the supplied production metadata.

## Views and dependency resolution

All three views exist and accept `EXPLAIN` without a dependency/planning error:

- `tournament_run_group_standings`
- `tournament_run_matches_fp_view`
- `tournament_run_standings`

Both public functions resolve successfully. The required references also resolve locally:

- `auth.uid()`
- `extensions.crypt(text,text)`
- `extensions.gen_salt(text)`
- `gen_random_uuid()`

## Empty-data validation

`SELECT count(*)` was executed against every application table after the first reset and again after the second reset. All 44 counts were zero. Therefore:

- no production application row data is present;
- no application seed was applied;
- no reset-time application row was introduced;
- platform-owned rows outside `public` were not treated as application data.

## Reproducibility and recovery

The second reset reapplied the same migration with no intervening correction and reconstructed the exact first-run inventory. The local database remains usable and can be discarded/rebuilt from the migration without production access.

## Remaining discrepancies and limitations

- Local optional `imgproxy` and pooler services were reported stopped; they are not dependencies of the public-schema reset or catalog validation.
- A local vector service restart state was observed during preflight; it did not affect PostgreSQL, migration application, or validation.
- The absent `supabase/seed.sql` warning is expected and consistent with the no-seed scope.
- This test proves local schema operability and metadata parity for the reviewed public objects. It does not prove production deployability, live-data constraint compatibility, concurrency behavior, or production rollback.
- Reset durations varied materially (approximately 106 seconds and 41.3 seconds) due to local container/runtime conditions; no application performance conclusion should be drawn.

No schema discrepancy or baseline defect remains from PF-08L5.

## Readiness decision

**READY for a separately authorized next local phase.** The baseline is reproducible, structurally complete, security metadata matches the verified evidence, and it contains no application data. PF-08L6 and PF-08B were not started.
