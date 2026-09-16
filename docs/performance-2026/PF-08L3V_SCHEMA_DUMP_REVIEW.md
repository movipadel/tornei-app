# PF-08L3V — Static review of production public-schema dump

## Status and safety boundary

This review was static-file only. No SQL was executed, no database connection was opened, no dump was imported, no local Supabase object was changed, and no production, source, environment, configuration, migration, seed, deployment, or commit action occurred.

Raw artifact reviewed outside the repository:

```text
C:\Users\Massimiliano Rinaudo\AppData\Local\Temp\movipadel-schema-extraction\public.raw.sql
```

## A. File identity

| Check | Expected | Verified | Result |
|---|---:|---:|---|
| Exists | Yes | Yes | PASS |
| Byte size | 98,235 | 98,235 | PASS |
| SHA-256 | `E98D8B8AE744DD50E8FA3A2CE4B3ADE3E16675F3D6B68D2C778DF8D300F7C092` | Same value | PASS |
| Dump header | PostgreSQL schema dump | Database PostgreSQL 17.6; `pg_dump` 17.11 | PASS |
| Completion marker | Present | Present | PASS |

The raw file was not copied into the repository.

## B. Schema-only / row-data review

**Classification: NO ROW DATA.**

The full file was inspected for top-level executable `COPY`, `INSERT INTO`, `MERGE INTO`, `UPDATE`, `DELETE FROM`, and sequence-value restore (`pg_catalog.setval`) statements.

- no top-level `COPY`, `INSERT`, `MERGE`, `DELETE`, or sequence-value restore was found;
- one `UPDATE public.staff_users` appears only inside the `set_staff_password` PL/pgSQL function body; it is stored function logic, not a dumped data mutation;
- no customer/data-shaped `COPY` section, `INSERT` payload, large-object data, or sequence state was found.

The static review does not authorize executing the function body. It establishes only that the dump itself contains definitions rather than production rows.

## C. Secret and environment review

**Classification: no hard-coded production credential or connection target found.**

The file was searched for PostgreSQL/Supabase URLs, pooler hosts, connection strings, API/service-role/anon keys, JWT/cookie secrets, Resend/Telegram/VAPID/SMTP credentials, and literal password/API-key assignments. No candidate literal was found.

The following are harmless identifiers/function parameters, not credentials:

- `p_password`;
- `password_hash`;
- `set_staff_password`;
- `verify_staff_login`.

The PostgreSQL 17 dump wrapper includes paired `\restrict` / `\unrestrict` directives with a generated token. It is a local `psql` dump-safety mechanism, not a Supabase/database credential; nevertheless it is environment-specific raw-dump boilerplate and should not be retained unreviewed in a baseline migration.

## D. Destructive-statement review

No top-level executable `DROP`, `TRUNCATE`, `DELETE`, `ALTER ... DROP`, or `REVOKE` statement was found.

The raw dump contains ordinary session setup, `CREATE SCHEMA public`, table/view/function/index/constraint/policy creation, and RLS-enable statements. It was not generated with `--clean`, so it does not contain pre-restore object drops.

## E. Ownership and grant review

No `ALTER ... OWNER TO`, `ALTER OWNER`, `GRANT`, `REVOKE`, or `SET SESSION AUTHORIZATION` statement is present. This confirms the supplied `--no-owner --no-privileges` extraction flags were effective.

This is safe for raw-file handling but is an important **parity gap**:

- production ownership and ACLs cannot be reconstructed from this file;
- direct execution of the dump in a fresh local database would use local/default ownership and privileges;
- PostgreSQL functions normally receive default `EXECUTE` rights unless explicitly revoked; with two `SECURITY DEFINER` functions, that must never be assumed safe;
- the future transactional RPC execute-grant model cannot be derived from this dump.

Before an executable baseline is approved, obtain owner-approved, read-only catalog evidence for public schema/table/sequence/function owners and ACLs. Do not infer them from defaults.

## F. Extensions and non-public dependencies

No `CREATE EXTENSION` statement appears because the dump is restricted to `public`. The following dependencies are referenced by public objects:

| Dependency | Evidence | Local prerequisite | Status |
|---|---|---|---|
| UUID generation | `gen_random_uuid()` is the default for all 44 public table IDs | A PostgreSQL 17/Supabase environment where `gen_random_uuid()` resolves | VERIFY before baseline execution |
| Password functions | `extensions.crypt()` and `extensions.gen_salt('bf')` in both public staff functions | `pgcrypto` functionality exposed through the `extensions` schema | REQUIRED |
| Auth helper | `auth.uid()` in three owner-read RLS policies | Standard local Supabase `auth` schema/function | REQUIRED |
| PostgreSQL built-ins | `pg_catalog.set_config`, `now`, text/array operators | Native PostgreSQL 17 | SAFE |

No references to `storage`, `vault`, `graphql_public`, `cron`, `net`, `http`, `dblink`, `postgres_fdw`, foreign servers, subscriptions, or external provider endpoints were found.

`pgcrypto` extension version/schema and the production extension inventory are not represented in the raw file. Their absence is not proof they are unnecessary; they must be captured in supplemental read-only catalog evidence. Local Supabase commonly provides an `extensions` schema, but availability and placement must be verified locally before any baseline application.

## G. Function review

| Function | Language | Security / search path | Dependency | Environment values | Local reproduction assessment |
|---|---|---|---|---|---|
| `public.set_staff_password(uuid, text)` | PL/pgSQL | `SECURITY DEFINER`; fixed `search_path` to `public, extensions` | `public.staff_users`, `extensions.crypt`, `extensions.gen_salt` | None found | **REQUIRES NORMALIZATION/ACL REVIEW**. Dependency must exist; owner and execute rights are absent from the dump. |
| `public.verify_staff_login(text, text)` | SQL | `SECURITY DEFINER`; fixed `search_path` to `public, extensions` | `public.staff_users`, `extensions.crypt` | None found | **REQUIRES NORMALIZATION/ACL REVIEW** for the same reason. |

Both functions use a fixed, schema-qualified search path, which is preferable to inheriting the caller path. Both are safe to preserve as structural evidence. They are not safe to expose locally by direct import until their ownership and execute ACLs are explicitly designed/reviewed.

The dump sets `check_function_bodies = false` during restoration. A later normalized baseline must not treat successful creation as runtime validation; after dependencies are established, the functions need a structural/behavioral validation in an isolated local environment.

## H. Object inventory and comparison

| Object type | Raw dump count | Audit metadata comparison | Result |
|---|---:|---|---|
| Public tables | 44 | 44 public tables in `01_tables.csv` | PASS |
| Public views | 3 | 3 public views in `06_views.csv` | PASS |
| Public functions | 2 | 2 public functions in `08_functions.csv` | PASS |
| Standalone indexes | 56 | 56 standalone indexes; 125 total public indexes when 44 PK and 25 UNIQUE backing indexes are included | PASS |
| Primary keys | 44 | 44 | PASS |
| UNIQUE constraints | 25 | 25 | PASS |
| CHECK constraints | 59 | 58 named non-null CHECKs exported | REVIEW DIFFERENCE |
| Foreign keys | 52 | 52 | PASS |
| Policies | 6 | 6 | PASS |
| RLS-enabled tables | 44 | 44; none forced in raw dump | PASS |
| Triggers | 0 | Prior audit had no trigger inventory | Newly confirmed none in the dumped `public` schema |
| Sequences / identity objects | 0 / 0 | UUID defaults, not sequences/identities | PASS |

The one CHECK discrepancy is `chk_group_pairs_not_null` on `public.tournament_run_matches_fp`, present in the raw dump but absent from the prior constraint CSV. It is outside the PF-08 Store/MoviBack boundary. Treat the current, hash-verified production dump as newer evidence, but record/reconcile this difference during full-baseline normalization rather than silently discarding it.

The raw file captures exact CHECK expressions and FK delete actions that the prior CSV export lacked. Examples relevant to PF-08 include `ON DELETE CASCADE` on membership-to-user and Store variant relations, `ON DELETE SET NULL` for Store reward/order references, and no explicit delete action on the current ledger-to-membership and redemption parent FKs. This materially improves baseline evidence.

## I. PF-08 required-object completeness

All required PF-08 tables are present:

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

Their direct Store/MoviBack reference dependencies are also present. The raw dump confirms the production `numeric(10,2)` Store euro fields, UUID defaults, nullable stock columns, current ordinary `(product_id, color_id, size_id)` stock uniqueness, and the exact current Store/MoviBack CHECK and FK forms.

No current idempotency registry or transactional checkout/redemption RPC is present. That is expected: those are future PF-08 additions, not baseline objects.

## J. Portability to local Supabase

| Item | Classification | Reason / required handling |
|---|---|---|
| Table, view, index, constraint and RLS definitions | SAFE AS EVIDENCE | Complete public schema structure is present and PostgreSQL major is 17. Do not execute raw dump directly. |
| `CREATE SCHEMA public` and schema comment | REQUIRES NORMALIZATION | Fresh Supabase already has `public`; raw replay can conflict. Omit/replace only after local baseline design review. |
| Dump session `SET` statements and `\restrict` directives | REQUIRES NORMALIZATION | Dump/`psql` boilerplate is not application migration content. The directives require a compatible client and the generated token should not be retained in reviewed baseline SQL. |
| `SET row_security = off` | REQUIRES NORMALIZATION | Intended for dump restoration, not a baseline migration security posture. Preserve RLS enables/policies, not this session setting. |
| `extensions.crypt` / `extensions.gen_salt` | BLOCKING FOR DIRECT IMPORT | Establish verified local `extensions`/`pgcrypto` compatibility before creating or exercising staff functions. |
| `gen_random_uuid()` | REQUIRES VERIFICATION | Confirm local PostgreSQL 17 resolves it before baseline application. |
| `auth.uid()` policies | REQUIRES VERIFICATION | Local Supabase Auth must provide the managed `auth` helper before policy creation/testing. No production auth rows are required. |
| Omitted owners and ACLs | BLOCKING FOR SECURITY-PARITY CLAIM | Supplemental read-only owner/ACL evidence is required; do not accept local defaults for `SECURITY DEFINER` functions or future RPCs. |
| Publication/subscription/foreign-server objects | SAFE | None found. |
| Production-specific URLs, credentials or provider configuration | SAFE | None found. |

## K. Raw-file handling recommendation

Keep `public.raw.sql` **outside Git and outside `supabase/migrations/`**. It is clean enough to retain temporarily as restricted raw evidence, identified by its SHA-256, while normalization and catalog-gap review occur.

Do not commit the raw dump. After a reviewed normalized baseline, comparison report, and supplemental metadata are accepted, discard the raw file under the owner's approved retention process unless a restricted non-Git evidence archive is required. Track only a sanitized comparison report and reviewed migration artifact in a later authorized task.

## L. Baseline creation decision

**Classification: SAFE AS EVIDENCE.**

The hash-verified file is schema-only, free of detected credentials and destructive statements, complete for the current public object inventory, and significantly stronger than the prior CSV export. It is **not ready for direct import** and should not yet be called a production-security-equivalent executable baseline because:

1. the dump intentionally omits owners and privileges;
2. extension version/schema evidence is absent;
3. local availability of `pgcrypto`/`extensions`, `gen_random_uuid()` and `auth.uid()` has not been verified;
4. raw dump boilerplate and pre-existing `public` schema creation require normalization;
5. one non-PF-08 CHECK differs from the previous audit metadata and must be recorded.

### Recommended next task

Proceed with **PF-08L3V2 — supplemental read-only metadata review plan** for owners/ACLs, extension inventory/schema/version, and local dependency verification criteria. It should remain planning/static review unless the owner separately authorizes the predetermined read-only catalog extraction.

Only after PF-08L3V2 closes those gaps should **PF-08L4** normalize the reviewed dump into a local baseline migration. PF-08L4 must not import the raw file directly.
