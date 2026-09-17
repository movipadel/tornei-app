# PF-08B2C3 — Classification harness validation

## Current result

Status: **PARTIAL / EVIDENCE BLOCKED**.

The safe harness structure and strict candidate exist, but the successful classification path has not been executed because required production catalog metadata is not available in the repository. Production was not contacted.

## Local safety and reset

- `npx supabase status`: passed when run with telemetry disabled and Docker access; `linked_project` was null and the DB URL matched `127.0.0.1:54322/postgres`.
- Direct database identity: `postgres` database, `postgres` user, local container endpoint through host port 54322, PostgreSQL 17.6.
- Initial normal `npx supabase db reset`: passed.
- Applied migrations: baseline, PF-08B0, PF-08B1, PF-08B2, and PF-08B2L.
- Existing `supabase/seed.sql`: applied unchanged after migrations.
- Normal post-reset catalog: two active synthetic PF-08 rewards, both intentionally unclassified.
- One harness attempt encountered a transient local container initialization failure; its `finally` reset recovered successfully. The retry completed both its initial and final resets.

No local development keys printed by the status command are reproduced in this documentation.

## Static candidate coverage

| Requirement | Candidate coverage | Runtime result |
|---|---|---|
| Exact 26 UUID mappings | Explicit temp mapping with primary key | Static review complete |
| Expected names | Exact equality guard | Awaiting fixture |
| Active rewards | Fail-fast active guard | Awaiting fixture |
| Duplicate mapping | PK plus explicit 26/distinct count | Static review complete |
| Allowed types | Mapping check and explicit counts | Static review complete |
| Missing reward | `PF08B2C3_REWARD_MISSING` | Awaiting fixture |
| Wrong name | `PF08B2C3_REWARD_NAME_MISMATCH` | Awaiting fixture |
| Conflicting existing type | `PF08B2C3_FULFILLMENT_CONFLICT` | Awaiting fixture |
| Wrong approved product | `PF08B2C3_STORE_PRODUCT_MISMATCH` | Awaiting fixture |
| Service Store contamination | Pre/postcondition abort | Awaiting fixture |
| Store linkage/activity | Pre/postcondition abort | Awaiting fixture |
| Usable variants | Active color/size/stock compatibility guard | Awaiting metadata and fixture |
| Totals 13/13 | Strict active-catalog postcondition | Awaiting fixture |
| Inactive/history untouched | Exact-ID updates plus runner hash comparison | Awaiting fixture |

## Variant findings

The smart RPC ignores `requires_store_variant` and always validates explicit color plus size when active sizes exist for `store_product`. The current customer UI still uses the legacy flag to decide whether to open its picker, so the production values remain necessary cutover evidence even though the candidate must preserve them.

The repository has no approved evidence identifying which of the 13 mappings currently have the flag true/false. It also lacks the exact active variants for Asciugamano Sport and Palline Nucleon. They remain `OWNER/PRODUCTION-EVIDENCE REQUIRED`; no flag or variant was guessed.

The validation SQL is prepared to require and exercise:

- one service redemption with no Store order;
- one Store reward with `requires_store_variant = true`;
- one Store reward with `requires_store_variant = false`;
- Asciugamano Sport against an evidenced usable variant;
- Tubo Palline/Palline Nucleon against an evidenced usable variant.

Each call runs inside a rollback-only savepoint so inventory, points, orders, redemptions, and idempotency rows are restored after the assertion.

## Execution completed in this phase

1. Confirmed the official local/unlinked status.
2. Confirmed the direct local database identity.
3. Ran a clean normal reset successfully.
4. Confirmed fixtures are seeded after migrations and that test/candidate paths are not automatic migrations.
5. Statically reviewed the candidate and runner safety boundaries.
6. Kept the fixture fail-closed because the source-evidence limit prohibits invented Store metadata.
7. Ran the harness retry: local gate passed, initial reset passed, the fixture returned the expected `PF08B2C3_PRODUCTION_METADATA_REQUIRED`, and final normal reset passed.
8. Applied the candidate against the normal synthetic catalog only to validate its first fail-fast boundary; it returned `PF08B2C3_REWARD_MISSING` listing all 26 exact rows and rolled back.
9. Verified the final database still contains only the two active/unclassified synthetic rewards and exactly the five committed migration versions through PF-08B2L.
10. Executed the metadata SELECT against local solely as a syntax check; it returned zero rows, as expected, and made no changes.

The candidate was not applied, and smart-redemption compatibility was not executed against fabricated data.

## Evidence required to finish

The owner should manually execute `PF-08B2C3_PRODUCTION_METADATA_QUERY.sql` in the production SQL editor and provide the reviewed result. It contains catalog configuration only and excludes personal or transactional data.

After incorporating that evidence into the sanitized local-only fixture, rerun the harness. Completion requires:

- all four negative precondition cases produce their exact expected failures;
- the candidate succeeds on the intact fixture;
- all 26 exact mappings and 13/13 totals pass;
- both corrected links pass;
- Store variants are usable and unambiguous;
- inactive/history hashes remain unchanged;
- all representative smart-redemption cases pass;
- final normal reset succeeds without the production-like fixture.
