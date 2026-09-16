# PF-08L2 — Schema validation plan

## Purpose

This plan defines how a future local MOVIPadel baseline will be compared with production evidence before PF-08 migrations or concurrency tests are trusted. It does not execute SQL and does not authorize production access.

The existing CSVs are the initial expected reference. An owner-approved schema-only extraction is required to fill their known gaps and become the authoritative DDL reference.

## Validation inputs

1. Existing committed metadata from `audit/rebranding-2026:docs/audit-2026/live-db/`.
2. Owner-approved, target-verified, read-only production schema evidence with no row data.
3. The reviewed baseline migration applied to a freshly reset local Supabase database.
4. A local metadata export produced with the same query/versioned extraction method as the expected reference.
5. An allowlist of intentional environment/platform differences, with owner and rationale.

Never compare by copying production data. Never treat a permission error, timeout, absent row, parser failure or truncated export as a match.

## Normalization rules

Before diffing:

- compare schema-qualified names;
- normalize insignificant whitespace in definitions without rewriting string literals;
- compare ordered column positions;
- preserve type modifiers, array dimensions, collations and timestamp timezone semantics;
- compare defaults as parsed expressions where possible, not loose substrings;
- separate constraint-backed indexes from standalone indexes;
- ignore only explicitly approved physical differences such as object OIDs and statistics;
- do not ignore owner, grant, security, RLS, trigger or extension differences by default.

## PASS/FAIL matrix

| Area | Comparison | PASS | FAIL |
|---|---|---|---|
| PostgreSQL | Major version and required settings | Local major equals production; relevant settings compatible | Version unknown/mismatch or relevant behavior differs |
| Extensions | Name, schema and relevant version | All dependencies exist in expected schemas | Missing/wrong-schema extension or unreviewed version incompatibility |
| Tables | Complete `public` object set | Exact match or every exclusion is approved | Missing/unexpected application table |
| Columns | Order, name, full type, nullability, default, identity/generated properties | Exact match | Any unexplained difference |
| PK/UNIQUE/CHECK | Names where contract-relevant and exact definitions | Exact semantic match | Missing/different expression, columns, predicate or NULL semantics |
| FKs | Columns, referenced keys, update/delete, match, deferrability, validation | Exact match | Any unknown or mismatch |
| Indexes | Unique flag, method, columns/expressions, order, predicate, included columns | Exact semantic match | Missing, extra or definition mismatch |
| RLS | Enabled and forced per table | Exact match | Any mismatch or unverified table |
| Policies | Table, name, permissiveness, roles, command, `USING`, `WITH CHECK` | Exact semantic match | Missing/broadened/different policy |
| Functions/procedures | Schema, signature, returns, language, body, volatility, security, config | Exact match | Body/signature/security/config mismatch |
| Triggers | Table, timing, events, condition, function, enabled state | Exact match | Missing, extra or unknown trigger |
| Views | Definition, columns and security options | Exact match for baseline scope | Definition/option mismatch |
| Ownership/grants | Owners and ACLs for schemas/tables/sequences/functions | Exact or explicitly safer reviewed local restriction | Broader access or unknown execute privilege |
| Sequences/UUID | Sequence ownership/defaults and UUID provider | Equivalent generation behavior | Missing dependency or different behavior |
| PF-08 data invariants | Re-run approved SELECT-only checks before constraints | Required checks clean | Violations, errors or stale evidence |

Overall baseline status is **FAIL** if any required area is unknown. “Close enough” is not a passing state for transaction, authorization or rollback tests.

## Existing-CSV comparison

Use the eight exported CSVs as follows:

- `01_tables.csv`: table/view inventory and a coarse missing-object check; ignore estimated row counts and sizes for schema parity.
- `02_columns.csv`: column order/type/nullability/default comparison.
- `03_indexes.csv`: index definition comparison.
- `04_constraints.csv`: constraint names/types/columns and FK endpoint comparison; supplement from authoritative DDL for expressions/actions.
- `05_policies.csv`: exact six-policy comparison at the original snapshot, supplemented by a fresh policy export.
- `06_views.csv`: definition comparison.
- `07_rls.csv`: RLS enabled/forced comparison.
- `08_functions.csv`: public function signature/body comparison, supplemented by owner/ACL/security metadata.

Because no trigger CSV exists, trigger parity cannot pass until authoritative trigger evidence is obtained.

## PF-08 focused validation

After full-baseline parity passes, run a stricter focused comparison for:

- the 13 required tables in `PF-08L2_REQUIRED_SCHEMA.md`;
- exact membership status and transaction type/source checks;
- reward/redemption/order status and type checks;
- order quantity and stock constraints;
- ordinary current stock uniqueness and its nullable-size behavior;
- membership, ledger, redemption, order, item and stock FKs including delete behavior;
- all indexes used by user, membership, ledger, product/variant, stock and fulfillment lookups;
- RLS/policies and service-role-only mutation boundary;
- `gen_random_uuid()` availability and all `timestamptz`/numeric/integer types.

Do not include future idempotency/RPC/constraint objects in baseline parity. Validate those separately as the delta introduced by later PF-08 migrations.

## Synthetic seed validation

After baseline parity, applying the synthetic seed must satisfy all of these checks:

- only reserved deterministic synthetic IDs and identity values exist;
- Users A/B each resolve to exactly one approved membership;
- each expected balance equals the sum of its ledger rows;
- category/line/product/variant FKs are valid;
- the sized and null-size stock identities each resolve to exactly one active row;
- finite stock fixtures equal 10 and 1 as designed; unlimited stock is `NULL` only where approved;
- Store-linked and non-Store rewards resolve to the intended branches;
- pending and completed redemption fixtures have internally consistent ledger/order relationships;
- no provider credentials, subscriptions or real recipient/customer data are present;
- reset and reseed produce the same logical state.

## Future PF-08 migration validation

Validate later migrations as a delta from the accepted baseline:

1. apply the baseline to a clean local database and record a schema fingerprint;
2. apply the PF-08 foundation/RPC migrations in order;
3. verify only reviewed objects changed;
4. verify idempotency uniqueness, null-safe stock identity and approved CHECKs;
5. verify RPC signatures, owner, `SECURITY DEFINER`/invoker choice, fixed `search_path`, volatility and grants;
6. run integration, rollback, concurrency and idempotency tests from `PF-08_TEST_PLAN.md`;
7. rehearse the forward rollback/disable procedure;
8. reset from zero and reproduce the same result without manual Studio edits.

## Required read-only production evidence

PF-08L3R should collect only schema/catalog evidence, never business rows:

- `server_version` and `server_version_num`;
- complete `public` schema-only DDL;
- exact constraint definitions including FK actions/deferrability/validation;
- standalone and constraint-backed index definitions;
- RLS flags and complete policies;
- functions/procedures, signatures, bodies and attributes;
- trigger definitions and enabled state;
- view/materialized-view definitions and relevant dependencies;
- installed extensions used by public objects;
- sequence/identity definitions and ownership;
- schema/table/sequence/function owners and ACLs.

The owner must approve the procedure, verify the production target out of band, use read-only access where feasible, and ensure output contains no row data or credentials. The extraction should be reviewed before any migration file is generated.

## Release gates

### Baseline accepted

- [ ] Production PostgreSQL major version is known and matches local.
- [ ] Authoritative schema-only evidence is reviewed.
- [ ] Full public schema comparison passes or exclusions are explicitly approved.
- [ ] Exact checks, FK actions, grants, triggers and extensions are no longer unknown.
- [ ] Fresh local reset reproduces the baseline without manual steps.
- [ ] No production data or secrets are present.

### PF-08 implementation-ready

- [ ] Baseline gate passes.
- [ ] Synthetic fixtures validate deterministically.
- [ ] Business decisions for null/missing stock, size requirements, membership lifecycle, redemption debit and fulfillment uniqueness are recorded.
- [ ] Idempotency persistence contract is approved.
- [ ] Notification providers are disabled/test-doubled.
- [ ] Forward rollback path is reviewed and locally rehearsable.
- [ ] No PF-08 test process can target production.

Until every required baseline item passes, PF-08 local results may inform development but must not be used to approve a production migration.
