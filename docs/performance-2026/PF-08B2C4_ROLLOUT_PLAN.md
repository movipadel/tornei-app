# PF-08B2C4 — Reward classification rollout plan

## Packaging decision

The strict data migration must remain a reviewed rollout artifact at `docs/performance-2026/PF-08B2C4_REWARD_CLASSIFICATION_ROLLOUT.sql` until the approved production window. It must **not** enter `supabase/migrations` now: migrations execute before `seed.sql`, while normal local reset has no production reward UUIDs, so correct fail-fast guards would intentionally break reset. Correctness must not be weakened to accommodate the synthetic baseline.

## Dependency order

1. `20260916170000_pf08_idempotency.sql` (PF-08B0)
2. `20260916180000_pf08_transactional_store_checkout.sql` (PF-08B1)
3. `20260916190000_pf08_smart_redemption.sql` (PF-08B2R2)
4. `20260916200000_pf08_redemption_lifecycle.sql` (PF-08B2L)
5. `20260918120000_pf08_store_variant_inventory_semantics.sql` (PF-08B2R3)
6. PF-08B2C4 classification rollout artifact

Classification must not run before all five supporting migrations are present and verified.

## Phased execution

### Phase 0 — Backup / recovery point

- Prerequisite: approved window, operator, restore procedure, database backup/PITR confirmation.
- Expected: timestamped recovery point and captured pre-flight output/fingerprints.
- Stop: backup or restore proof missing.
- Rollback boundary: no database change yet.

### Phase 1 — Pre-flight SELECT review

- Run `PF-08B2C4_PREFLIGHT.sql` manually and compare every row with the evidence file.
- Expected: 26 exact active rewards, 13 active products, two null special links, expected flags/topologies, no unknown active rewards.
- Stop: any mismatch, new active reward, inactive product, changed name/link/flag, or topology drift.
- Rollback boundary: none required; SELECT-only.

### Phase 2 — Database infrastructure migrations

- Apply B0 → B1 → B2R2 → B2L → B2R3 only if not already present.
- Expected: schema/RPC versions verified and their regressions green.
- Stop: constraint conflict, lock timeout, migration error, or regression failure.
- Rollback boundary: use each infrastructure migration’s reviewed rollback/recovery procedure; do not continue to classification.

### Phase 3 — Reward classification

- Set conservative `lock_timeout` and `statement_timeout`; execute the reviewed rollout artifact once.
- Expected: atomic commit of the exact 26 rows; no unrelated or historical mutation.
- Stop: any guard exception, timeout, unexpected row count, or concurrent catalog change.
- Rollback boundary: `PF-08B2C4_ROLLBACK.sql` is permissible only before dependent live route adoption and before new business data relies on classification.

### Phase 4 — Post-flight validation

- Run `PF-08B2C4_POSTFLIGHT.sql`; compare historical/unrelated fingerprints with Phase 1.
- Expected: exact 13/13 classifications, links, flags, active products, unchanged fingerprints.
- Stop: any failing check or fingerprint drift; freeze route rollout and decide rollback.

### Phase 5 — Application route integration

- **Not part of PF-08B2C4.** Review and deploy the smart RPC route independently.
- Stop: do not assume classification activates smart redemption.
- Rollback boundary: application release rollback plus semantic review of redemptions created after adoption.

### Phase 6 — Admin workflow validation

- Confirm server-side create/edit/activate validation prevents active unclassified or incoherent rewards.
- Stop: admin path can create drift.

### Phase 7 — Monitoring

- Activate the checklist in `PF-08B2C4_MONITORING.md` before traffic observation.
- Stop: any immediate signal listed there.

### Phase 8 — Rollback decision window

- Close the simple data rollback window once route adoption or new redemptions depend on the classified model.
- After that boundary, use forward correction or coordinated application/data rollback; never blindly null classifications.

## Current decision

Preparation status is complete. Eventual production execution remains **NO-GO** until every item in `PF-08B2C4_GO_NO_GO.md` is explicitly passed and owner approval is recorded.

## Local preparation evidence — 2026-09-18

- Safety gate: unlinked local Supabase at `127.0.0.1:54322/postgres`; direct database identity verified.
- The staged rollout artifact executed atomically against the production-shaped local fixture.
- Pre-flight and post-flight queries executed successfully; post-flight reported 13 SERVICE, 13 STORE_PRODUCT, zero NULL/mismatch rows, valid Asciugamano/Tubo topology, and unchanged redemption/unrelated-reward fingerprints.
- The exact-state rollback executed successfully and restored all 26 evidenced pre-migration values.
- The existing PF-08B2C3 harness passed all strict abort cases, happy path, smart-redemption checks, and its final normal reset.
- The standalone PF-08B2R3 functional test passed.
- Final local state contains the normal seed only: two active unclassified synthetic rewards, none of the production target UUIDs, and six applied repository migrations.
