# PF-08B2C3 — Reward classification local harness

## Purpose and boundaries

The harness proves the future production classification against a sanitized production-shaped catalog without putting production data in the automatic migration chain. Its authoritative source is `PF-08B2C3_PRODUCTION_METADATA_EVIDENCE.txt`.

| Artifact | Automatic during `db reset` | Purpose |
|---|---:|---|
| Normal `supabase/seed.sql` | Yes | Existing synthetic development baseline; unchanged |
| `supabase/tests/fixtures/pf08_reward_classification_fixture.sql` | No | Local-only catalog/configuration fixture |
| `supabase/tests/candidates/pf08_reward_classification_candidate.sql` | No | Strict candidate for later production review |
| B2C3 harness and validation | No | Negative guards, postconditions, and smart-RPC tests |

The fixture contains the exact 26 reward UUID/name pairs, 13 evidenced product links and flags, exact evidence-backed representative metadata, both Asciugamano identities, and Tubo metadata with zero stock rows. It contains no personal or transactional production data. For products with many valid identities, only an exact evidence-backed representative subset is needed; no identity is invented.

## Candidate behavior

The candidate:

1. maps 13 exact rewards to `service` and 13 to `store_product`;
2. verifies UUIDs, names, active status, current links, current variant flags, product UUID/name/activity, and non-conflicting existing classifications;
3. assigns the missing Asciugamano and Tubo links;
4. changes only Asciugamano from the evidenced current false flag to the owner-approved true flag;
5. preserves every other production-backed flag;
6. permits zero stock identities only as PF-08B2R3 untracked inventory;
7. permits exactly one identity for false-flag auto-resolution and rejects false-flag ambiguity;
8. requires at least one coherent identity for true-flag products;
9. asserts global active totals of 26, split exactly 13/13 with no other/null type.

No category or product-name keyword controls classification.

## Strict tests

The PowerShell runner verifies the local/unlinked target, resets normally, manually loads the fixture, and runs eight expected-abort cases: missing reward, wrong reward name, wrong product UUID, wrong product name, conflicting type, unexpected service link, variant-policy mismatch, and final active-count mismatch. A before/after catalog digest proves each failure fully rolls back.

It then applies the candidate, checks inactive rewards and redemption history remain byte-stable, runs the rollback-only smart validation, and always performs a final normal reset.

## Isolation and execution

Run only against the verified unlinked local project:

```powershell
powershell -ExecutionPolicy Bypass -File supabase/tests/pf08b2c3_classification_harness.ps1
```

The fixture and candidate remain outside `supabase/migrations`; a normal reset neither loads nor applies them.

## Promotion gate

Status: **READY FOR PRODUCTION REVIEW**, not deployment. Before packaging or executing a production migration: rerun the final production SELECT, prepare backup/rollback, review the packaged SQL in isolation, keep route integration disabled, implement admin validation, define monitoring, and obtain explicit approval.
