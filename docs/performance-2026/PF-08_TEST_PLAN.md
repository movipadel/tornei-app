# PF-08 — Transactional test plan

## Purpose and safety boundary

Tests must prove atomicity, concurrency behavior, idempotency, compatibility and authorization before either production route uses a new RPC. This document does not execute tests or SQL.

Database mutation tests require an isolated staging Supabase project or an ephemeral PostgreSQL database with production-equivalent schema/constraints/functions and synthetic fixtures. They must not use production users, balances, inventory, orders, rewards, provider credentials or notification recipients.

External notifications must be replaced with spies/test doubles. PF-07 behavior is verified by observing scheduling decisions after a mocked RPC result, never by sending real email, Telegram or web push.

## Test environment and fixtures

Create deterministic synthetic fixtures:

- users A/B with one approved membership each and known ledger balances;
- an unapproved member and a deliberately missing user;
- euro-only, points-only and mixed-payment products;
- products with and without active sizes;
- finite stock variants at 0, 1, 2 and a larger quantity;
- an unlimited variant with `stock_qty = NULL`;
- active/inactive rewards, finite/unlimited reward stock, Store-linked variant reward and category-based Store fulfillment reward;
- empty order/redemption/idempotency tables for each test transaction;
- no live provider configuration.

Every integration test records before/after rows for orders, items, ledger, redemption, reward stock, Store stock and idempotency. Cleanup must be transaction rollback or fixture namespace deletion in the isolated environment.

## Unit tests

### Request normalization and fingerprints

- canonical checkout hash is stable across JSON property order;
- reordered cart lines produce the same canonical hash;
- repeated identical variants aggregate deterministically;
- quantity, color, size, payment, points, pickup or normalized notes changes produce a different hash;
- reward fingerprint is stable for the same reward/color/nullable size and changes for a different variant;
- server-authoritative price/reward-cost changes do not change a previously committed request fingerprint;
- malformed UUIDs, non-integral/zero/negative/overflow quantities and non-finite point values are rejected;
- maximum cart cardinality, note length and payload size are enforced at both route and function boundary.

### Route compatibility and identity

- cookie-derived user ID is passed to the RPC; body-supplied `user_id`/`membership_id` is ignored or rejected;
- absent/invalid cookie remains `401` without RPC invocation;
- stable RPC machine codes map to current public HTTP statuses/messages;
- unexpected database details are mapped to generic `500` and not exposed;
- created and replayed RPC results serialize to the same existing public success body;
- client-generated idempotency key is forwarded unchanged;
- a retry retains its key; intentional payload edits create a new key;
- Store UI and reward UI prevent ordinary duplicate interaction while still allowing explicit retry with the same key.

### PF-07 notification boundary

- `created=true` schedules the same providers/content conditions as today;
- `replayed=true` does not repeat business mutation and follows the approved replay-notification policy;
- a provider exception cannot change an already returned successful business result;
- Store redemption notifications remain conditional on successful Store fulfillment creation;
- no notification is scheduled for rolled-back/validation failures.

## Checkout integration tests

Each test calls the RPC through the same service-role path the future route will use and also verifies direct unauthorized invocation is denied.

### Success cases

1. Normal single-item euro checkout: one order, one item, correct authoritative price, one finite decrement, no ledger debit.
2. Single-item points checkout: approved membership, correct order totals, exactly one debit, correct stock decrement.
3. Mixed checkout: requested points clamp/residual semantics match current approved rules and use exact database numeric arithmetic.
4. Multi-item checkout: one order, all item snapshots, one optional debit and every finite stock row decremented exactly once.
5. Same variant repeated: aggregate quantity is checked/decremented once and cannot oversell; persisted item representation matches the approved compatibility contract.
6. Unlimited/null stock: order succeeds with no decrement under the approved existing semantics.
7. Missing stock row and product-with-sizes/null-size behavior: assert the product-approved rule explicitly; do not leave this implicit.
8. Authoritative pricing: malicious client totals/names/stock IDs are ignored; DB values determine result.
9. Notes/customer snapshot and current API response fields remain compatible.

### Validation cases

- empty cart;
- invalid club/payment mode;
- inactive/missing product;
- product disallows selected payment mode;
- color belongs to another product;
- inactive/missing size;
- invalid quantity/cardinality;
- insufficient points;
- insufficient stock for one line and for aggregate duplicate lines;
- missing/unapproved/ambiguous membership;
- ambiguous null-size stock data before the new uniqueness constraint is enabled.

For every rejection, assert zero new orders, items, ledger rows, stock changes and committed idempotency claims.

## Redemption integration tests

### Success cases

1. Normal non-Store reward: one redemption, one linked debit, correct QR/result and reward stock decrement when finite.
2. Unlimited reward stock: redemption/debit succeeds without decrement.
3. Store-linked reward without size requirement: exact color/stock validation and complete fulfillment order/item.
4. Store-linked reward with size requirement: exact product/color/size stock, complete redemption/debit/inventory/order/item state.
5. Category-based Store fulfillment reward: current category rule creates exactly one complete order/item if product owner confirms it as required.
6. Reward and Store inventory both tracked: both decrement exactly once in the same commit.
7. QR uniqueness: collision handling retries safely or rolls back without partial state according to the approved design.

### Validation cases

- missing/inactive reward;
- missing/unapproved/ambiguous membership;
- insufficient points;
- zero finite reward stock;
- missing/wrong/inactive Store product, color or size;
- required size omitted;
- missing, ambiguous or empty Store stock variant;
- hostile client-supplied cost, identity or status fields.

Each rejection must leave redemption, ledger, reward stock, Store stock, order, item and idempotency state unchanged.

## Atomic failure-injection tests

Use a test-only RPC build or database fault-injection harness in isolated staging. Do not add production branches that can intentionally fail. Inject a raised exception after each conceptual checkpoint and verify complete rollback:

### Checkout checkpoints

- after idempotency claim;
- after order insert;
- after a subset/all order items;
- after loyalty debit;
- after first stock decrement in a multi-stock cart;
- immediately before idempotency result persistence;
- immediately before function return.

### Redemption checkpoints

- after idempotency claim;
- after redemption insert;
- after ledger debit;
- after reward stock decrement;
- after Store stock decrement;
- after fulfillment order insert;
- after fulfillment item insert;
- before result persistence/return.

For every injected failure, assert the complete before-state is restored and retrying the same key can execute as a new request.

Also inject constraint violations, connection cancellation and statement timeout where the staging platform permits it. Distinguish a transaction cancelled before commit from a deliberately dropped HTTP response after commit.

## Concurrency tests

Use separate database connections and a barrier so transactions reach the intended contention point together. Run each scenario repeatedly, not only once.

| Scenario | Expected invariant |
|---|---|
| Two euro checkouts buy one remaining unit | One complete order commits; the other has no business rows and receives insufficient stock |
| Checkout with duplicate lines totaling more than stock | No order; stock unchanged |
| Two points checkouts spend a balance sufficient for only one | One complete order/debit commits; one rolls back for insufficient points |
| Checkout and redemption spend the same last points | Membership lock serializes them; at most one constrained spend commits |
| Two redemptions take the final reward unit | Exactly one complete redemption/debit commits |
| Two Store-linked redemptions take final variant unit | Exactly one complete redemption/debit/inventory/order/item set commits |
| Multi-item carts lock the same stock rows in opposite request order | Canonical sorted lock order prevents avoidable deadlock; no partial state under any deadlock |
| Catalog admin update races with checkout | Checkout commits one coherent price/availability snapshot or rejects; never mixed values |
| Same idempotency key invoked concurrently | One execution commits; all identical callers receive the same stored resource/result |
| Same key with conflicting payload races | At most one payload owns the key; conflicting caller gets `409` and no writes |

Collect lock waits and deadlocks in staging. Contention latency is expected; partial commits or overselling are not.

## Idempotency tests

- first use of a key returns created and persists one result;
- sequential identical reuse returns replayed with identical order/redemption ID, totals and QR token;
- concurrent identical reuse produces one root, one ledger debit and one set of stock changes;
- same key/different payload returns `409` without changing the original result;
- same payload/different key creates a distinct operation when balance/stock allow;
- validation failure rolls back the claim, allowing same-key retry after stock/balance/membership correction;
- unexpected failure rolls back the claim;
- simulated HTTP response loss after commit followed by same-key retry returns the committed result without another mutation;
- replay after catalog price/reward-cost change still returns the original committed result;
- old idempotency records remain usable throughout the documented retention window;
- cleanup/retention cannot delete keys while clients may legitimately retry.

## Security tests

- `PUBLIC`, `anon` and `authenticated` cannot execute either mutation RPC or internal idempotency helper;
- only the intended service role can execute; grants are asserted from catalog metadata;
- direct browser/anon RPC attempt cannot bypass the Next.js cookie boundary;
- spoofed body user/member IDs do not affect the actor;
- user A cannot spend membership B or create an order for user B;
- invalid arrays/oversized payloads cannot exhaust the function or bypass validation;
- unqualified-object shadowing cannot redirect a function lookup; `search_path`/schema qualification is verified;
- function owner is reviewed, non-login when definer is used, and has only required privileges;
- errors/logs/results do not expose service keys, SQL, internal hashes, lock data, customer PII or another user's resource;
- RLS remains enabled and no broad write policy is introduced.

## Performance and observability tests

Use PF-06-compatible timing plus database telemetry in staging:

- verify exactly one Supabase RPC request per successful/failed business attempt from the route;
- compare current and RPC paths for one-, three- and five-line euro/points/mixed carts;
- compare non-Store and Store-linked redemption branches;
- record route/RPC p50/p95, database statement duration, lock wait, rows touched and payload size;
- verify notification time remains in the separate PF-07 `#notifications` record;
- confirm no raw inputs, identities, cart/reward contents or idempotency hash appear in performance logs;
- run low-contention and deliberate-contention profiles separately.

No target millisecond improvement is asserted in advance. Acceptance requires fewer server/database round trips and no material regression in uncontended database duration.

## Compatibility/regression tests

- snapshot current success/error response bodies and statuses before route cutover;
- compare euro/points/mixed totals and item snapshot fields;
- compare reward QR/redemption response;
- verify admin order, economics, user balance, redemption and fulfillment pages can read RPC-created rows;
- verify staff/member history views display the new ledger entries exactly as current entries;
- verify Store order cancellation/delivery and reward validation continue to follow existing FK/lifecycle behavior;
- verify PF-07 content/recipient conditions using mocks;
- verify the legacy path and RPC path are never both executed for one request.

## Which tests require database execution

| Test group | Local pure unit | Isolated DB/staging | Production |
|---|---:|---:|---:|
| Canonicalization/hash/status mapping/client key lifecycle | Yes | Optional | No |
| SQL validation, locks, constraints, atomic writes | No | Required | No |
| Failure injection and rollback | No | Required | No |
| Concurrency/last-stock/same-balance | No | Required with multiple connections | No |
| Grants/RLS/function owner/search path | Partial static | Required | Read-only verification only after approval |
| Notification scheduling/content | Yes with mocks | Optional with test doubles | No real providers |
| Route/RPC performance | No | Required | Optional later canary telemetry, never synthetic destructive load |

## Exit criteria before production enablement

- all required unit, integration, failure, concurrency, idempotency and security cases pass;
- no injected failure leaves partial state;
- last-unit and last-points races produce at most one constrained success;
- identical same-key retries produce exactly one mutation and one stable result;
- route response contracts are approved and compatible;
- ambiguous size/unlimited-stock/fulfillment rules are decided and encoded in tests;
- data-quality checks permit proposed unique/check constraints;
- execute grants, ownership and search-path review pass;
- staging observes one RPC round trip and acceptable lock/performance behavior;
- rollback has been rehearsed while the legacy path remains available;
- no real notification provider is contacted by the test suite.
