# PF-08L2 — Local schema baseline design

## Status and safety boundary

PF-08L2 is complete as a design-only task. No database connection, SQL execution, remote Supabase command, local database mutation, migration, seed, application change, environment change, configuration change, or commit was made.

The local Supabase stack exists and is unlinked, but its database does not yet contain the MOVIPadel schema. This document defines how to establish that schema later without treating incomplete repository metadata as authoritative DDL.

## Evidence inventory

The live metadata directory is not present in this branch's working tree. Its committed contents were inspected read-only from `audit/rebranding-2026` with `git show`; no branch switch or file copy occurred.

| Artifact | Exported content | Reliability | Material omissions |
|---|---:|---|---|
| `01_tables.csv` | 79 relations with schema, estimated rows and size | Good inventory snapshot | No table DDL, persistence/partition details, ownership or comments |
| `02_columns.csv` | 905 columns with type, nullability and default text | Good for ordinary columns | No domains/collations, generated/identity detail, sequences or full type dependency inventory |
| `03_indexes.csv` | 240 index definitions | Strong for index DDL at export time | No statistics, validity/readiness, constraint linkage beyond names or usage |
| `04_constraints.csv` | 788 constraint/column rows | Good names/types/FK endpoints | No CHECK expressions, FK `ON DELETE`/`ON UPDATE`, match mode, deferrability or validation state |
| `05_policies.csv` | 6 policies with command/roles/expressions | Strong for exported policies | No grants or role membership; does not establish Storage policies outside the rows exported |
| `06_views.csv` | 6 view definitions | Strong for view query text | No owner/grants/security options/dependency graph |
| `07_rls.csv` | 44 tables with enabled/forced flags | Strong for those flags | No grants and no proof that the export is still current |
| `08_functions.csv` | 2 public function definitions | Strong for those two functions | No ACL/owner metadata; no procedures; absence does not replace a trigger inventory |
| Trigger export | None | Not available | Trigger names, timing/events, enabled state and definitions cannot be reconstructed |

The export reliably supports a table/column inventory, primary and unique keys represented in the CSVs, index definitions, FK endpoints, RLS enablement, the six recorded policies, three public application view definitions, and two public staff functions. It is sufficient to identify the PF-08 dependency boundary and create a comparison specification.

It cannot reliably reproduce exact production DDL. In particular, it cannot prove exact CHECK expressions, FK actions or deferrability, grants, owners, trigger behavior, extensions, sequence/identity behavior, database/server settings, or the production PostgreSQL major version. These gaps must not be silently filled from application behavior.

## Required PF-08 boundary

The two current mutation paths are `src/app/api/store/orders/route.ts` and `src/app/api/moviback/rewards/redeem/route.ts`. Together they directly use:

- `users`
- `loyalty_memberships`
- `loyalty_transactions`
- `rewards_catalog`
- `reward_redemptions`
- `store_products`
- `store_product_colors`
- `store_product_sizes`
- `store_product_stock`
- `store_orders`
- `store_order_items`

Two reference tables are schema dependencies of `store_products`:

- `store_categories` — required because `store_products.category_id` is non-null and a foreign key;
- `store_lines` — required to preserve the nullable `store_products.line_id` foreign key, although PF-08 seed products can technically leave it null.

No repository evidence shows that `reward_categories`, `reward_point_ranges`, Store economics, promos, suppliers, notifications, Storage, tournament tables, or the three tournament views are required to execute the two PF-08 core transactions. They belong in a complete public baseline, but not in a hand-built minimum PF-08 subset.

The future idempotency registry and checkout/redemption RPCs do not exist in the production metadata. They must be separate PF-08 migrations after the baseline, never backfilled into the historical baseline artifact.

## Complete public baseline versus PF-08 subset

| Criterion | Option 1: complete `public` schema | Option 2: PF-08 subset only |
|---|---|---|
| Reliability | Highest when generated from authoritative schema-only evidence | Adequate only for a deliberately bounded test surface; cross-feature dependencies can be missed |
| Initial effort | Higher review and cleanup effort | Lower initial effort |
| Future maintainability | One canonical local foundation for all application work | Requires later expansion or replacement; parallel partial baselines tend to drift |
| Missing-dependency risk | Lower after a dependency-aware extraction | Higher, especially for triggers, shared functions, grants and references not visible in route code |
| Future app development | Useful beyond PF-08 | Useful mainly for checkout/redemption tests |
| Migration drift | Lowest if captured once and all later changes are versioned | Higher because omitted objects and later reconciliation obscure provenance |

**Recommendation: Option 1, a complete `public` schema baseline, sourced from an owner-approved schema-only extraction.** It is the more maintainable foundation and avoids certifying a locally invented subset as production-equivalent. PF-08 tests should still use a small, deterministic seed that touches only the 13-table boundary above.

If time pressure requires a subset, it must be labelled an explicitly non-authoritative PF-08 test harness and may be used for early function prototyping only. It must not be the basis for migration compatibility or release approval.

## Baseline source strategy

| Source | Completeness | Production safety | Reproducibility / reviewability | Risk |
|---|---|---|---|---|
| A. Existing metadata CSVs | Partial | Excellent; already committed, no connection | Reproducible and human-reviewable | Missing exact checks, FK actions, grants, owners, triggers, extensions and server version |
| B. Hand-authored DDL from CSVs + code | Partial and inference-heavy | Excellent at authoring time | Reviewable, but difficult to prove faithful | High false-parity risk; application code is not schema authority |
| C. Production database clone | Potentially complete, including data | Unacceptable for this need | Operationally heavy | Customer-data exposure and accidental-write risk; reject |
| D. `supabase db pull` later | Broad schema capture | Safe only after explicit owner approval, target verification and controlled credentials/linking | Supabase-aligned and repeatable | Creates/uses remote linkage; generated output can include platform noise and must be reviewed |
| E. `pg_dump --schema-only` later | Broad, authoritative DDL without row data | Preferred when executed with owner-approved read-only access and verified target | Reproducible text artifact; highly reviewable | Version compatibility and Supabase-managed object filtering require care; privileges/extension handling must be reviewed |

**Preferred strategy:** perform a separate, owner-approved, read-only schema extraction before authoring the baseline. Prefer a schema-only dump of the application `public` schema with an explicitly verified production target, no data sections, no copied credentials, and a compatible client version. Supplement it with read-only catalog evidence for items the chosen dump options omit, especially grants/owners, extensions and production server version. The existing CSVs then act as an independent review oracle.

`supabase db pull` is an acceptable alternative only if the owner explicitly approves temporary remote linking and the link target is independently verified. PF-08L2 does not authorize that operation.

## Future repository artifact layout

The Supabase CLI already expects migrations under `supabase/migrations/` and currently configures `supabase/seed.sql`. A future reviewed implementation should use:

```text
supabase/
  config.toml
  migrations/
    YYYYMMDDHHMMSS_baseline_public_schema.sql
    YYYYMMDDHHMMSS_pf08_transactional_foundation.sql
    YYYYMMDDHHMMSS_pf08_checkout_rpc.sql
    YYYYMMDDHHMMSS_pf08_redemption_rpc.sql
  seed.sql
  seeds/
    pf08_reference_data.sql
    pf08_scenarios.sql
  tests/
    schema/
      baseline_contract.sql
    pf08/
      checkout.sql
      redemption.sql
      idempotency.sql
      concurrency.md
      security.sql
  rollback/
    PF-08_FORWARD_ROLLBACK.md
    pf08_disable_and_verify.sql
```

Design rules:

- use UTC, monotonically increasing 14-digit timestamps in migration names;
- keep the captured baseline immutable after acceptance;
- place every future PF-08 object in later additive migrations;
- use `seed.sql` as the CLI entry point and keep deterministic reference/scenario fixtures separated;
- keep concurrency orchestration outside a single SQL transaction, with SQL assertions under `tests/pf08/`;
- keep rollback SQL out of automatic migration discovery unless it is intentionally issued as a new forward migration;
- do not place production rows or identifiers in any seed or fixture.

This is a proposed structure only. No listed file was created in PF-08L2.

## Production-compatibility requirements

Before local PF-08 results can support a production decision, the baseline must match or deliberately document differences in this order:

1. production PostgreSQL major version and required installed extensions;
2. exact column types, numeric behavior, timestamp types, nullability and defaults;
3. UUID/identity generation and sequence ownership;
4. exact CHECK expressions, including enum-like accepted values;
5. unique/index semantics, especially nullable `store_product_stock.size_id`;
6. FK endpoints, `ON DELETE`/`ON UPDATE`, match mode, validation and deferrability;
7. RLS enabled/forced state and exact policy roles/expressions;
8. grants, function ownership, `SECURITY DEFINER` posture and `search_path`;
9. functions, procedures, triggers and relevant dependent views;
10. extension-provided functions used by defaults or functions.

The local config currently specifies PostgreSQL 17, but repository evidence does not prove production also runs 17. The config itself warns that the major version must match remote. That check is a hard gate, not an assumption.

## Auth and application users

The inspected customer paths do not use Supabase Auth sessions. `src/lib/userAuth.ts` verifies a custom HMAC cookie containing a `public.users.id`; the routes then use a server-side Supabase client initialized with the service-role key. No FK from the PF-08 tables to `auth.users` appears in the metadata.

For PF-08 core local tests:

- real `auth.users` rows: **not required**;
- synthetic `public.users` rows: **required**;
- synthetic signed cookie/session layer: **required for route-level tests**, but not for direct database function tests;
- service-role server calls: **required to reproduce the current route boundary**;
- anon/authenticated direct execution: **must be denied for future mutation RPCs and tested as a security case**.

Existing owner-read RLS policies reference `auth.uid()`, but service-role calls bypass them. Broader end-user RLS testing may use Supabase Auth later; it is not necessary to validate PF-08 transaction atomicity and must not broaden this baseline task.

## Synthetic seed design

Use stable, obviously synthetic UUIDs and non-real identity fields. A recommended namespace is `00000000-0000-4000-8000-...`, with the final digits assigned by fixture type. Seed insertion order must follow FKs: reference tables → users → memberships → ledger → products → colors/sizes/stock → rewards → redemptions → fulfillment rows where explicitly required.

Minimum fixture capabilities:

- User A and User B, each with exactly one approved membership;
- deterministic ledger histories whose summed balances are known, with enough shared pressure to test a last-balance race;
- one category and optional line reference;
- Store products covering euro, points and mixed eligibility;
- color variants, a sized variant, and a null-size variant;
- finite stock rows at 10 and 1, plus one nullable/unlimited stock row if that business rule remains approved;
- a multi-item cart and repeated-identical-variant scenario;
- one Store-linked reward requiring a variant and one non-Store reward;
- one finite reward with one unit and one nullable/unlimited reward;
- one pending redemption and one completed/delivered redemption with canonical `type = 'redeem'` ledger relationships;
- fresh, replay, conflicting-payload and concurrent duplicate idempotency scenarios after the registry exists.

Fixtures must not rely on production emails, phones, membership codes, QR tokens, customer names, addresses, provider credentials or push subscriptions.

## Remote extraction decision

**Can a sufficiently accurate PF-08 local schema baseline be created using only current repository metadata and code? NO.**

A behaviorally useful prototype subset could be hand-authored, but it would not be production-equivalent and could give false confidence precisely where PF-08 depends on constraint, lock, grant and rollback behavior.

The additional read-only evidence required is:

- production `server_version` / `server_version_num`;
- a schema-only definition of the complete `public` schema;
- exact CHECK definitions;
- complete FK definitions including actions, match, validation and deferrability;
- table, sequence and function owners plus grants/ACLs;
- all public functions/procedures with signatures, definitions, volatility, security mode and configured `search_path`;
- all triggers with enabled state and definitions;
- installed extensions and schemas/versions relevant to public objects/defaults;
- identity/sequence definitions and ownership;
- exact RLS flags and policy definitions/roles;
- views/materialized views and dependencies relevant to `public`.

No table data is required. No production customer data should be extracted.

## Smallest safe next task

Proceed with **PF-08L3R: owner-approved READ-ONLY production schema extraction and evidence review**.

PF-08L3R should define and execute only a reviewed, target-verified, schema-only extraction procedure; store no credentials; collect no row data; compare its inventory to the current CSVs; and stop for review before generating a baseline migration. PF-08L3A should follow only after that evidence is accepted.
