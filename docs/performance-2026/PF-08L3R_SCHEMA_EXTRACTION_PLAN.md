# PF-08L3R — Read-only production schema extraction plan

## Status and safety boundary

PF-08L3R is a plan only. No production or local database connection was opened, no dump or SQL was executed, no Supabase remote command was run, and no configuration, source, migration, seed, environment file, database, or deployment was changed.

The current repository remains unlinked to Supabase. The installed-command check in this task could not resolve either `supabase` or `pg_dump` from the current PowerShell `PATH`; future execution must first locate or install a compatible client and verify its version without connecting to a database.

## Preferred method

Use a **one-shot PostgreSQL `pg_dump` plain-text schema-only extraction of `public`**, with:

- an explicit host, port, database and user copied from the verified production project's Connect dialog;
- no saved Supabase repository link;
- an interactive password prompt rather than a password in a URI, command line, chat, repository or environment file;
- TLS with server certificate verification where supported by the downloaded Supabase CA certificate;
- `PGOPTIONS` setting `default_transaction_read_only=on` as an additional server-enforced guard;
- `--schema-only`, `--schema=public`, `--format=plain`, one connection and a short lock-wait timeout;
- no `--clean`, no data flags, no parallel jobs, and no restore in the extraction step;
- owners and privileges retained in the raw evidence for review, but never applied directly to local Supabase.

PostgreSQL documents `--schema-only` as dumping object definitions rather than table data. `pg_dump` takes consistent snapshots and uses read/catalog access plus shared locks; it does not write application rows or schema. The read-only session option adds defense in depth. It is still a production connection and can briefly participate in lock scheduling, so it must be run only after explicit owner approval, at low activity, with a short lock timeout. See the official [`pg_dump` documentation](https://www.postgresql.org/docs/17/app-pgdump.html).

Because a schema-filtered dump does not automatically include objects on which `public` depends, the primary dump must be accompanied by a separately reviewed **read-only catalog evidence report** for server version, extensions, owners/ACLs, triggers and dependency details. That supplement consists only of predetermined catalog `SELECT` statements in a later authorized task. It is not executed in PF-08L3R.

## Method comparison

| Method | Read-only certainty | Completeness | Credentials | Write risk | Reproducibility | PostgreSQL 17 compatibility | Assessment |
|---|---|---|---|---|---|---|---|
| `pg_dump --schema-only` | **High**; native dump utility reads catalogs/objects. Add `default_transaction_read_only=on`. Shared locks can affect concurrent DDL but do not mutate it. | Strong for selected schema: tables, columns, defaults, checks, keys/FKs/actions, indexes, RLS/policies, functions, triggers, views, sequences, owners and grants. Extension/dependency inventory outside `public` needs a supplement. | PostgreSQL connection fields and password | Low when the command is fixed and read-only; credentials may still be powerful | High; plain text and explicit flags | Use a client at least as new as production. A v17 client can dump production ≤17 and target local 17; it refuses a newer server. Output from a newer client/server may not load into local 17. | **Preferred** |
| `supabase db dump --db-url` | High for the documented dump command, but it is a versioned wrapper around containerized `pg_dump` | Strong for normal Supabase application schema and automatically excludes managed schemas; default is schema/no data/no roles. Its filtering can omit evidence needed for extensions/ACL parity. | Full DB URL or password; URL handling can expose the password in history/process lists | Low for `db dump`, but the CLI also exposes write commands and wrapper behavior is less transparent | High if CLI version is pinned | Uses the CLI/container client version; must be checked against production/local | Acceptable fallback, not preferred. Official CLI docs show `--db-url` and therefore no repository link is required for that form. |
| Direct catalog extraction | High only when every statement is reviewed `SELECT` and the session is read-only | Excellent for structured metadata, including fields a dump may obscure; poor as a standalone restorable baseline and easy to omit object classes | PostgreSQL connection fields and password | Low with read-only enforcement | Medium; requires a maintained query pack and result normalization | Catalog queries can be version-sensitive | Required supplement, not the primary baseline source |
| Dashboard/manual inspection | High when limited to viewing/copying metadata | Low to medium; useful for connection fields and spot checks, not a complete DDL baseline | Dashboard login; DB password only if later connecting | Low, but SQL Editor makes accidental writes possible and is not needed for the primary dump | Low; manual and omission-prone | Not a reliable compatibility test | Use only for target verification and obtaining connection fields |

Supabase documents that `db dump --db-url` can target an explicit connection and that the default dump excludes data/custom roles and managed schemas. It therefore need not use `supabase link`, but it is not selected because the native command is more transparent and better preserves raw ownership/privilege evidence. See the official [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump).

## Object coverage

| Object | Primary `pg_dump -s -n public` | Supplemental evidence needed |
|---|---:|---|
| Tables, columns, types, nullability, defaults | Yes | Compare with CSVs |
| CHECK, PK, FK, UNIQUE and FK actions | Yes | Structured catalog comparison recommended |
| Indexes and predicates | Yes | Compare with CSVs |
| RLS and policies | Yes | Catalog comparison of roles/expressions |
| Public functions/procedures | Yes | Catalog attributes/ACL comparison |
| Public triggers | Yes | Enabled-state catalog comparison |
| Public views/materialized views | Yes | Dependency/security-option comparison |
| Public sequences/identity | Yes | Ownership/dependency comparison |
| Extension declarations/versions | Not reliably complete under a `public` filter | Yes |
| Grants and object ownership | Kept in raw plain dump by default | Structured ACL/owner report recommended |
| Cluster roles and role membership | No; intentionally out of scope | Only relevant role/ACL names, never passwords, if needed |

## Connection and credential design

### Required production fields

The owner obtains these field names only from the verified production project:

- `project reference`
- `connection type` (`Direct connection` preferred; `Session pooler` if direct networking is unavailable)
- `host`
- `port`
- `database`
- `user`
- `database password`
- `SSL mode`
- `server root certificate` path, if using certificate verification

Supabase normally exposes the connection string and mode under **Dashboard → production project → Connect**. Database connection settings and the downloadable root certificate are normally under **Project Settings / Database** or the database connection panel. Copy the exact host and username rather than constructing pooler values. Official guidance is in [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).

Use Direct connection when the workstation can reach it. Otherwise use **Session pooler**, normally port 5432 as shown by the dashboard. Do not use transaction pooler for a dump. The dashboard-provided mode, host, port and username are authoritative.

### Least-persistent password handling

Preferred handling is the native interactive `pg_dump --password` prompt:

- type the database password only into the terminal prompt;
- never put it in the command, connection URI, clipboard-backed documentation, chat, tracked file, `.env`, PowerShell history or `PGPASSWORD`;
- do not save it in `.pgpass` for this one-shot operation;
- set only non-secret one-session variables such as `PGSSLMODE`, `PGSSLROOTCERT` and `PGOPTIONS`, then remove them immediately;
- close the terminal after the extraction and review its history to confirm no secret was entered as a command.

A one-session PowerShell variable containing the password is less safe because it persists in process memory and may be accidentally echoed. An ignored credentials file is more persistent and is not justified here.

## Extraction scope

The minimum primary extraction is the **complete application `public` schema only**. It should include every public table, view, sequence, function and trigger—not only the 13 PF-08 tables—because PF-08L2 selected a full public baseline.

Do not dump application row data, large objects, cluster roles, `auth`, `storage`, Realtime, Vault, GraphQL or other Supabase-managed schemas. PF-08 uses custom cookies and service-role server calls; real `auth.users` rows and Storage objects are not required.

Do not automatically include the `extensions` schema. Instead collect an extension inventory in the supplemental catalog evidence, then explicitly reproduce only extensions required by public objects. PostgreSQL warns that a schema-filtered dump does not automatically include dependencies outside the selected schema, which is why that review is mandatory.

## Output-file safety

The raw dump should initially be **untracked outside the repository**, in a new timestamped directory under the user's temporary directory, for example:

```text
<TEMP_DIRECTORY>/movipadel-schema-extraction/<UTC_TIMESTAMP>/
  production-public-schema.partial.sql
  production-public-schema.raw.sql
```

The command writes `.partial.sql`. Only a zero exit code permits a local rename to `.raw.sql`. A preflight check must refuse to run if either file already exists.

Raw DDL can contain function bodies with embedded constants, private URLs, role/owner names, comments, foreign-server definitions, grants or other environment-specific information. It must not initially be tracked or placed under `supabase/migrations/`.

After static review and redaction/normalization, a separate approved task may copy reviewed evidence into:

```text
docs/audit-2026/schema-extraction/
  README.md
  production-public-schema.reviewed.sql
  production-catalog-summary.reviewed.md
  comparison-report.md
```

The raw file remains untracked and access-restricted until the reviewed artifact is accepted, then is securely removed according to the owner's retention decision. The reviewed SQL must still not be applied directly; it is evidence used to author a normalized baseline migration.

## Failure safety

| Failure | Expected result | Required response |
|---|---|---|
| Dump command fails | Non-zero exit and possibly a partial local file; production is unchanged | Stop, retain/label the partial file for diagnostics or remove it safely; do not rename or review it as complete |
| Credentials are wrong | Authentication failure before extraction; production is unchanged | Re-verify project/mode/field names in Dashboard; do not weaken TLS/read-only guards |
| Network disconnects | Non-zero exit and incomplete local file; production is unchanged | Stop and retry later into a new unique path; never append to/reuse the partial file |
| Output already exists | Preflight aborts locally | Choose a new timestamped directory; never overwrite evidence |
| Lock cannot be obtained promptly | `--lock-wait-timeout` causes failure rather than waiting indefinitely | Stop and retry during a quieter window; never increase impact casually |
| Unsupported extension is found | Dump remains evidence but local import is blocked | Do not apply it; inventory the dependency and decide whether to install a compatible local extension, omit an irrelevant object with justification, or align environments |
| Production is newer than the dump client | `pg_dump` refuses | Stop; install a compatible/newer client and reassess local PostgreSQL 17 restore compatibility |

A failed extraction cannot change production because the selected command contains no restore or mutation action and the session is forced read-only. It can only leave local partial output and transient read/shared-lock activity.

## Later safe sequence

```text
owner-approved production schema-only extraction
  → confirm zero exit code and promote local .partial to .raw
  → static secret/data/destructive review
  → compare with committed audit CSVs
  → obtain/review supplemental catalog evidence
  → normalize a baseline migration in a separate task
  → verify target is LOCAL and repository remains unlinked
  → reset LOCAL Supabase only
  → apply baseline locally
  → validate structural parity
  → apply deterministic synthetic seed
```

The raw production dump is never executed against production and is never fed directly to local Supabase. Production receives no SQL at any stage.

## Decision

**SAFE TO PREPARE**, not yet authorized to execute.

A schema-only extraction has effectively read-only risk when the target is verified, the exact reviewed `pg_dump` command is used, the password is prompted interactively, TLS identity is verified, `default_transaction_read_only=on` is enforced, and output is isolated outside Git. Actual execution requires a separate explicit owner approval and a compatible `pg_dump` executable.
