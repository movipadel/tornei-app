# PF-08A Staging Requirements

## Current readiness

Overall staging status: **NOT READY** for PF-08 transactional/concurrency testing. PF-08A production-data compatibility is now verified clean and the overall PF-08B gate is **CONDITIONAL GO**; isolated staging readiness remains the condition that prevents implementation from starting.

Repository evidence supports production deployment on Vercel and production use of Supabase. It does not establish a separate Supabase staging project, test database, staging-specific variables, PF-08 fixtures, or a database concurrency harness. A Vercel preview capability may exist outside the repository, but it is not sufficient unless it is proven to use isolated services.

| Area | Status |
|---|---|
| Isolated Supabase project/database | **NOT FOUND** |
| Isolated Vercel preview/staging binding | **PARTIAL** |
| Staging-specific environment variable names | **NOT FOUND** |
| Database fixtures/seeds | **NOT FOUND** |
| Transaction/concurrency harness | **NOT FOUND** |
| Existing non-database Baraonda test script | Present, but not relevant to PF-08 database readiness |

## Required isolated environment

Before PF-08B, establish and document:

- a separate Supabase project or equally isolated disposable database containing no production credentials or customer data;
- a staging/preview application deployment whose Supabase URL, public key, and server-only key are bound only to that isolated project;
- an explicit check preventing preview/staging deployments from starting when production project identifiers are supplied;
- schema parity established through reviewed versioned migrations, not manual drift;
- service-role-only RPC access, with direct invocation denied to browser roles;
- notification providers disabled, sandboxed, or replaced with deterministic test doubles;
- synthetic contact data only, with no messages sent to real users;
- a repeatable fixture lifecycle and a confined cleanup procedure;
- database backup/recovery and a reviewed forward rollback procedure for migration rehearsals;
- observable request IDs, idempotency keys, database outcomes, and provider-test outcomes without recording secrets or PII.

## Minimum synthetic dataset

The values below describe fixture capabilities, not production values and not data-writing instructions.

### Identities and memberships

- User A with exactly one approved active membership and a deterministic positive points balance sufficient for a normal checkout and one reward redemption.
- User B with exactly one approved active membership and enough points to contend for the same scarce stock/reward.
- User C with insufficient points.
- One pending or suspended membership to verify authorization rejection.
- A ledger history containing credits and debits whose sum is known in advance.

### Store catalog and inventory

- One active product/color/sized variant with finite stock greater than one.
- One active finite-stock variant with exactly one unit remaining.
- One active product/color variant with `size_id` absent and a finite quantity, to exercise null-safe stock identity.
- One tracked variant with `stock_qty` absent to exercise the approved unlimited-stock rule.
- One catalog combination with no stock row, only if the approved checkout compatibility contract continues to treat that state as untracked/unlimited.
- One inactive product, inactive color, and inactive size for validation failures.
- A multi-item cart containing at least two distinct variants.
- A cart containing repeated identical variants so canonical aggregation can be checked.
- A cart whose combined requested quantity exceeds remaining stock.

### Rewards and fulfillment

- One active reward with finite stock and a known points cost.
- One active reward with exactly one unit remaining.
- One unlimited-stock reward if `NULL` remains the approved sentinel.
- One inactive reward.
- One Store-linked reward requiring color and size selection.
- One Store-linked reward using a null-size stock identity where applicable.
- One Store-like reward that must produce exactly one fulfillment order and exactly one item under the approved category/variant rule.
- One non-Store reward that must not produce a fulfillment order.

### Retry and failure cases

- A fresh idempotency key for each operation type.
- Reuse of the same key with the exact same canonical request.
- Reuse of the same key with a different cart, reward, or variant fingerprint.
- Two simultaneous checkout requests for the last stock unit.
- Two simultaneous redemption requests for the same member balance.
- Two users contending for the last reward or Store variant.
- A multi-item checkout where one item fails after other rows have been locked but before commit.
- A simulated dropped response after commit followed by same-key retry.
- A notification test double that can fail after database commit.

## Concurrency harness requirements

The harness must:

- open genuinely independent database/request sessions rather than await two operations serially;
- synchronize contenders at a repeatable barrier before releasing them together;
- retain the same idempotency key for retry of an ambiguous outcome;
- assert final database state, not only HTTP responses;
- verify one winner for last-unit races and no negative finite inventory;
- verify that points, order, item, redemption, ledger, stock, and idempotency results commit together or not at all;
- repeat races enough times to expose timing-sensitive failures;
- capture deadlock, lock-timeout, and latency observations without exposing secrets;
- restore only the isolated synthetic fixture state between cases.

## Acceptance criteria before PF-08B

- The isolated Supabase project/database exists and its ownership is documented.
- Staging and preview deployments are proven unable to reach production Supabase.
- The minimum dataset can be reproduced deterministically.
- Provider calls are safely disabled or doubled.
- The full PF-08 test plan can run without production data.
- The forward migration, additive deployment sequence, and forward rollback approach can be rehearsed.
- A named reviewer has approved stock, membership, debit, fulfillment, and idempotency semantics.

Until these criteria are met, PF-08B must not begin despite its **CONDITIONAL GO** production-data assessment.
