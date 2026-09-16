# PF-08L3V2 — Local dependency checks plan

## Status

This document is a plan only. No local SQL was executed in PF-08L3V2.

Any later verification must explicitly target local PostgreSQL at `127.0.0.1:54322`. If the resolved host or port differs, stop before authentication and do not use a connection URL that could hide the target.

## Preconditions for a later local-only task

- local Supabase is running;
- the command explicitly supplies `-h 127.0.0.1 -p 54322`;
- the database name and local database user are confirmed from local Supabase status, never copied from production;
- no production connection string, password, project reference, API key, or environment file is used;
- the task is separately authorized to perform local read-only checks.

`supabase/config.toml` currently specifies database major version 17, API extra search path `public, extensions`, and enabled Auth. These are configuration signals only; the checks below establish actual local availability.

## Future local-only SELECT checks

### L01 — Confirm target and version

```sql
SELECT
  inet_server_addr() AS server_address,
  inet_server_port() AS server_port,
  current_setting('server_version') AS server_version,
  current_setting('server_version_num') AS server_version_num;
```

Pass only when the intended local connection was made and the major version is compatible with production PostgreSQL 17.6.

### L02 — Confirm extension inventory and placement

```sql
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS extension_schema
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
WHERE e.extname = 'pgcrypto';
```

Pass only when the extension evidence supports the schema/function placement required by the baseline.

### L03 — Confirm required password and UUID routines

```sql
SELECT
  to_regprocedure('extensions.crypt(text,text)') AS crypt_function,
  to_regprocedure('extensions.gen_salt(text)') AS gen_salt_function,
  to_regprocedure('gen_random_uuid()') AS uuid_function;
```

Pass only when all three values resolve. Do not invoke `crypt`, `gen_salt`, or UUID generation as part of this check.

### L04 — Confirm the managed Auth helper

```sql
SELECT to_regprocedure('auth.uid()') AS auth_uid_function;
```

Pass only when it resolves. This validates policy creation capability; it does not require any real `auth.users` row.

### L05 — Inspect local public-schema access baseline

```sql
SELECT
  n.nspname AS schema_name,
  has_schema_privilege(current_user, n.oid, 'USAGE') AS current_user_has_usage,
  has_schema_privilege(current_user, n.oid, 'CREATE') AS current_user_has_create
FROM pg_catalog.pg_namespace AS n
WHERE n.nspname = 'public';
```

Pass only when the local migration role can create the reviewed baseline objects. This result does not replace the production owner/ACL evidence planned in `PF-08L3V2_SQL_CHECKS.sql`.

## Expected outcomes and handling

| Result | Classification | Later action |
|---|---|---|
| All L01–L05 pass | READY FOR PF-08L4 dependency prerequisites | Proceed only after production Q01–Q07 evidence is reviewed |
| `pgcrypto` or `extensions` missing/mismatched | BLOCKING | Design an explicit, reviewed local prerequisite; do not edit local DB in the verification task |
| `gen_random_uuid()` missing | BLOCKING | Determine the compatible PostgreSQL/Supabase extension/core requirement before normalization |
| `auth.uid()` missing | BLOCKING FOR POLICY PARITY | Diagnose local Supabase/Auth provisioning; do not hand-create an `auth` substitute |
| Target/version differs | BLOCKING | Stop; correct the local-only invocation before any further activity |
| Access baseline insufficient | CONDITIONAL | Review local migration role/CLI execution model; do not broaden privileges blindly |

## What these checks do not do

They do not import the raw dump, create extensions, create schemas, create migrations, test the staff functions, create Auth users, seed data, or contact production. They are prerequisites for a future authorized local-only validation task, not PF-08L4 itself.
