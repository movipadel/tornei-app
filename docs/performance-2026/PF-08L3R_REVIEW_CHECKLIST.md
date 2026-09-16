# PF-08L3R — Pre-import review checklist

## Gate

The raw production schema file is untrusted evidence until every applicable check below passes. It must remain outside Git and must not be executed against any database during review.

Any unknown, truncated result, parse error or unexplained statement is a **FAIL**, not a warning to ignore.

## Provenance and completeness

- [ ] Extraction was separately owner-approved.
- [ ] The owner verified the production project reference out of band.
- [ ] Direct connection or Session pooler was used; Transaction pooler was not used.
- [ ] `pg_dump` client path and full version were recorded without secrets.
- [ ] Dump header records a production server version compatible with the client and intended local PostgreSQL 17 target.
- [ ] Command exit code was zero.
- [ ] File has the `.raw.sql` name, not `.partial.sql`.
- [ ] Output directory was unique and outside the repository.
- [ ] File size is non-zero and the dump has a normal completion footer.
- [ ] No password, connection URL or secret was recorded with the evidence.

## Absolute no-row-data checks

- [ ] No top-level `COPY ... FROM stdin` data section exists.
- [ ] No top-level application `INSERT INTO` data statement exists.
- [ ] No sequence-value `setval(...)` data restoration exists unless explicitly explained by the dump format and removed from the normalized baseline.
- [ ] No large-object data section exists.
- [ ] No customer names, phones, emails, tax codes, membership codes, QR tokens, order contents or notification subscriptions are present.
- [ ] Apparent `INSERT`, `COPY` or customer-shaped text inside a function body/comment was manually reviewed rather than accepted by a simple text match.

Any application row data is an immediate **FAIL**. Stop review, do not commit the file, restrict access and follow the owner's secure-removal process.

## Secret and environment scan

- [ ] No PostgreSQL/Supabase connection URI exists.
- [ ] No database password, API/service key, JWT, cookie secret or provider token exists.
- [ ] No Resend, Telegram, VAPID, SMTP, webhook or third-party credential exists.
- [ ] Function bodies and comments were inspected for hard-coded sensitive constants.
- [ ] Production URLs, private hosts, email addresses and role/usernames were inventoried and classified.
- [ ] Foreign server/user mapping, Vault, cron, HTTP and network-extension references were flagged.
- [ ] Anything that resembles a secret was treated as sensitive until the owner confirmed otherwise without revealing its value.

## SQL safety scan

- [ ] No `DROP` statement exists (`--clean` was not used).
- [ ] No `TRUNCATE`, top-level `DELETE`, top-level `UPDATE`, data-changing CTE or DML data section exists.
- [ ] No `CREATE SUBSCRIPTION`, active external connection, `dblink`, foreign-user credential, `COPY ... PROGRAM` or shell meta-command exists.
- [ ] All `ALTER ... OWNER TO`, `GRANT`, `REVOKE`, `SET ROLE`, `SET SESSION AUTHORIZATION` and role references were inventoried.
- [ ] Function/trigger bodies were reviewed as executable code, including dynamic SQL and network side effects.
- [ ] The raw dump will not be executed directly even if this scan passes.

Ownership and grant statements are expected evidence, not automatically errors. They must be normalized for local use only after their production semantics are documented.

## Schema coverage review

- [ ] Dump scope contains `public` and no unintended application row data.
- [ ] All public tables from `01_tables.csv` are accounted for.
- [ ] Column order/type/nullability/defaults compare with `02_columns.csv`.
- [ ] Index definitions compare with `03_indexes.csv`.
- [ ] Constraint names, types, columns and FK endpoints compare with `04_constraints.csv`.
- [ ] Exact CHECK expressions are extracted and recorded.
- [ ] FK `ON UPDATE`, `ON DELETE`, match, validation and deferrability are extracted and recorded.
- [ ] Policies compare with `05_policies.csv`.
- [ ] Views compare with `06_views.csv`.
- [ ] RLS enabled/forced state compares with `07_rls.csv`.
- [ ] Functions compare with `08_functions.csv`, including signature and body.
- [ ] Trigger inventory is complete; the old audit set had no trigger export.
- [ ] Sequences/identity/default ownership are accounted for.
- [ ] Owners and ACLs are accounted for.

## Dependency and compatibility review

- [ ] Production PostgreSQL major/minor version is recorded.
- [ ] `pg_dump` client is not older than production.
- [ ] Local PostgreSQL 17 can accept the normalized output; if production is newer, the gate is stopped.
- [ ] Required extensions, their schemas and versions are recorded through supplemental read-only evidence.
- [ ] Every public object dependency outside `public` is identified.
- [ ] Unsupported local extensions or Supabase-managed dependencies are listed with an explicit resolution.
- [ ] UUID generation, timestamp types, collations, enums/domains and numeric types are compatible.
- [ ] No managed `auth`, `storage`, Realtime, Vault or extension-owned internals are imported merely because they exist in production.

## PF-08 focused review

- [ ] All 13 tables in `PF-08L2_REQUIRED_SCHEMA.md` are present with exact production definitions.
- [ ] Membership status and transaction type/source checks are exact.
- [ ] Stock and reward nullable/unlimited semantics are preserved.
- [ ] Existing nullable-size stock uniqueness is documented before any PF-08 strengthening.
- [ ] Ledger-to-redemption and fulfillment relationships match production.
- [ ] RLS and policies match production.
- [ ] Current mutation functions/RPCs are confirmed absent or accounted for.
- [ ] Future idempotency and transactional RPC objects are not folded into the baseline.

## Sanitized evidence decision

- [ ] A reviewer recorded every removal or normalization from raw evidence.
- [ ] Environment-specific owner/grant statements are preserved in a comparison report even if removed from executable baseline SQL.
- [ ] Sensitive constants/URLs are redacted from tracked evidence without hiding a required dependency.
- [ ] The reviewed evidence contains no credentials or row data.
- [ ] The reviewed artifact is still evidence, not an automatically executable migration.
- [ ] A second reviewer approves the sanitized artifact before Git tracking.

## Local-import gate

Local import remains prohibited until a later task explicitly authorizes it and all boxes below pass:

- [ ] Static review has no open FAIL item.
- [ ] CSV comparison is complete.
- [ ] Supplemental catalog evidence is complete.
- [ ] A normalized baseline migration has been separately reviewed.
- [ ] Local target host/port are explicitly verified as `127.0.0.1` and the repository remains unlinked.
- [ ] The raw dump is not the file being applied.
- [ ] The local reset command contains no `--linked` or remote `--db-url`.
- [ ] Synthetic seed contains no production data.

## Review outcome

Choose exactly one:

- [ ] **PASS FOR BASELINE NORMALIZATION** — evidence is complete and safe to use as input to a separate migration-authoring task.
- [ ] **REQUIRES SUPPLEMENTAL EVIDENCE** — no import or migration authoring yet.
- [ ] **REJECT / QUARANTINE** — row data, secrets, corruption, wrong target, unsafe SQL or incompatible version found.
