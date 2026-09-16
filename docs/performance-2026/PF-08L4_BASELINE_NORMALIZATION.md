# PF-08L4 — Production public-schema baseline normalization

## Status and safety boundary

PF-08L4 prepared a local-only Supabase migration from the reviewed production schema evidence. The migration was not executed. No production or local database connection was opened, no Supabase remote/local migration command was run, and no application source, environment, or configuration file was changed.

## Source evidence

| Property | Verified value |
|---|---|
| Raw artifact | `C:\Users\Massimiliano Rinaudo\AppData\Local\Temp\movipadel-schema-extraction\public.raw.sql` |
| Raw size | 98,235 bytes |
| Raw SHA-256 | `E98D8B8AE744DD50E8FA3A2CE4B3ADE3E16675F3D6B68D2C778DF8D300F7C092` |
| Production PostgreSQL | 17.6 |
| Dump client | 17.11 |
| Raw classification | `SAFE AS EVIDENCE`; not for direct import |

The artifact identity was reverified before it was read. The raw file remains outside Git and was not copied into the repository.

## Generated migration

```text
supabase/migrations/20260916143214_production_public_baseline.sql
```

Generated migration identity:

- size: 59,973 bytes;
- SHA-256: `2CBFF3F986ADE0305D75376F12BE2940DC0EDF1707ADDFB815B55B6500D0D48C`.

The migration represents the current production `public` schema only. It does not include an idempotency registry, checkout/redemption RPCs, new indexes, strengthened stock uniqueness, new constraints, or any other future PF-08 behavior.

## Boilerplate removed

The following raw-dump material was removed because it is dump/client/session boilerplate rather than application schema:

- PostgreSQL dump header, TOC and footer comments;
- generated `\restrict` and `\unrestrict` directives;
- `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` and `transaction_timeout` settings;
- client encoding and standard string settings;
- empty search-path `set_config` call;
- `check_function_bodies`, XML, client-message and row-security session settings;
- default tablespace and default table-access-method session settings;
- `CREATE SCHEMA public` and the standard schema comment.

`public` is intentionally treated as a Supabase-managed pre-existing schema. The migration does not alter its owner or ACL.

## Structural DDL preserved

The normalization preserves:

- all 44 tables and their column order;
- types, precision, nullability and defaults;
- all UUID and timestamp defaults;
- 59 named CHECK constraints;
- 44 primary keys and 25 UNIQUE constraints;
- 52 foreign keys, including production `ON DELETE` semantics;
- 56 standalone indexes, including partial unique indexes;
- 3 views in the production dependency order;
- 44 RLS-enable statements and 6 policies;
- 2 public staff functions with their production bodies and security properties.

The source and normalized migration have identical name sets for tables, views, standalone indexes, CHECK constraints, foreign keys and policies.

## Extension handling

The migration does not recreate or alter Supabase-managed extensions or schemas. It relies on the verified local prerequisites:

- PostgreSQL 17.6;
- `pgcrypto` 1.3 in `extensions`;
- `extensions.crypt(text,text)`;
- `extensions.gen_salt(text)`;
- `gen_random_uuid()`;
- standard Supabase `auth.uid()`;
- standard Supabase roles.

`uuid-ossp`, `pg_stat_statements` and `supabase_vault` were verified locally but are not explicitly required by this public baseline DDL. No production extension ownership is introduced.

## Function normalization and security

The two functions were moved after table/FK creation so their table dependencies exist without retaining `SET check_function_bodies = false`.

For both functions, the migration explicitly preserves:

- owner `postgres`;
- original SQL or PL/pgSQL language;
- `SECURITY DEFINER`;
- `VOLATILE`;
- `PARALLEL UNSAFE`;
- fixed `search_path` to `public, extensions`;
- original function body.

The migration explicitly removes EXECUTE from `PUBLIC`, `anon` and `authenticated`, and grants EXECUTE only to `postgres` and `service_role`, matching the supplied production security metadata. It does not broaden access.

## Table/default privilege handling

No blanket table/schema/default-privilege statements were added. This is deliberate:

- production and local `public` schema ACLs were verified as matching;
- production and local default privileges for `postgres` and `supabase_admin` were verified as matching;
- PF-08 tables are owned by `postgres` in production;
- Supabase local roles already exist;
- RLS and policies are preserved exactly as the authoritative row-access layer.

This equivalence depends on applying the migration through the normal local Supabase migration role/flow. PF-08L5 must verify post-application ownership and effective ACLs rather than assuming the runner behaved as expected.

## Deliberate omissions

- no production rows or sequence state;
- no production connection details, project identifiers or credentials;
- no `auth`, `storage`, Vault, Realtime or extension-owned schema DDL;
- no raw-dump session configuration;
- no mass owner/ACL replay where verified local defaults are equivalent;
- no future PF-08 transactional objects or business-rule changes.

## PF-08L5 handoff

The migration is ready for a separate, explicitly local-only PF-08L5 test against a fresh Supabase database. PF-08L5 must target `127.0.0.1:54322`, confirm the repository is unlinked, reset/apply only locally, validate the full object inventory and security metadata, and capture any execution error without modifying this accepted baseline in place.
