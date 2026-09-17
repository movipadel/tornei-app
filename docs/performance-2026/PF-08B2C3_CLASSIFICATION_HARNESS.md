# PF-08B2C3 — Reward classification local validation harness

## Purpose

PF-08B2C3 separates normal local reset data, production-like classification fixtures, and the future strict production data migration. Nothing in this harness is under `supabase/migrations`, and nothing connects to production.

## Artifact boundaries

| Layer | Artifact | Automatic during `db reset` | Production eligible |
|---|---|---:|---:|
| Normal local seed | Existing `supabase/seed.sql` | Yes | No; unchanged synthetic PF-08 data |
| Classification fixture | `supabase/tests/fixtures/pf08_reward_classification_fixture.sql` | No | Never |
| Candidate data migration | `supabase/tests/candidates/pf08_reward_classification_candidate.sql` | No | Only after complete review and later promotion |
| Runner | `supabase/tests/pf08b2c3_classification_harness.ps1` | No | Never |
| Smart validation | `supabase/tests/pf08b2c3_classification_validation.sql` | No | Never |

The normal seed was not modified or populated with a production catalog snapshot.

## Evidence gate

The fixture currently raises `PF08B2C3_PRODUCTION_METADATA_REQUIRED` before writing anything. This is intentional. The repository knows the 26 owner-approved reward UUID/name/type mappings and two corrected Store links, but it does not contain:

- linked product UUID/name for the other 11 Store rewards;
- `requires_store_variant` values for the 13 Store rewards;
- active color/size/stock identities for the linked products;
- active-product and variant evidence for Asciugamano Sport and Palline Nucleon.

Inventing those rows would make a passing harness misleading. The owner must manually run `PF-08B2C3_PRODUCTION_METADATA_QUERY.sql` and review the non-personal catalog result before the fixture is completed.

## Candidate behavior

The candidate is outside automatic migration execution and is transactional. It:

1. declares all 26 exact UUID/name/type mappings;
2. verifies 26 unique mappings and 13/13 target counts;
3. requires every reward to exist, match its exact name, and be active;
4. allows only `NULL` or an already-correct `fulfillment_type`; a conflicting value aborts;
5. requires service rewards to have no Store link or legacy variant flag;
6. requires the two corrected Store products to exist with exact UUID/name and be active;
7. preserves the existing Store link for the other 11 rewards and requires it to resolve to an active product;
8. changes only the two approved Store links and the exact 26 classifications;
9. asserts exactly 26 active rewards, split 13 service and 13 Store product;
10. requires every Store reward to have at least one active, available, smart-RPC-compatible stock identity and rejects duplicate active identities.

Existing matching classifications are accepted for idempotent reruns. Conflicting classifications fail; they are never overwritten silently. `requires_store_variant` is never modified.

## Local execution flow

Run only against the unlinked local project:

```powershell
powershell -ExecutionPolicy Bypass -File supabase/tests/pf08b2c3_classification_harness.ps1
```

The runner:

1. reads `npx supabase status` without printing local keys;
2. requires `linked_project = null` and the exact local DB URL;
3. verifies the PostgreSQL identity directly;
4. performs a normal local reset;
5. applies the test fixture manually;
6. runs four expected-abort tests;
7. applies the candidate manually;
8. verifies inactive rows and redemption history are byte-stable at JSON-row level;
9. runs postconditions and representative smart-redemption calls in rollback-only savepoints;
10. always performs a final normal reset in `finally`.

Until the fixture evidence gate is replaced with reviewed sanitized inserts, steps 6–9 are correctly blocked and the final reset still restores the normal environment.

## Fixture completion rules

After owner evidence is available, the fixture may contain only:

- the 26 exact reward UUIDs/names with synthetic, non-sensitive descriptions/points/stock sufficient for tests;
- the 13 evidenced Store product UUIDs/names and active state;
- structural test category/line rows required by FKs;
- evidenced color, size, stock identity UUIDs and active/null-size semantics;
- no users beyond the existing synthetic seed users and no production customers, memberships, redemptions, orders, or transactions.

The fixture must deactivate the two existing synthetic active rewards only for the harness session so the strict 26-row production total can be tested. The runner’s final reset restores them.

## Promotion gate

Do not move the candidate into `supabase/migrations` until the completed fixture makes every expected-abort, happy-path, postcondition, smart-redemption, and final-reset check pass. Promotion also requires a fresh owner review of exact production IDs/names/linkages and a separately approved production rollout plan.
