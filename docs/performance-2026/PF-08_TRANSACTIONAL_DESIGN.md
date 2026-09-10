# PF-08 — Transactional design

## Scope and evidence

PF-08 is design-only. No application source, SQL, schema, live data, dependency, configuration, notification behavior, or authorization was changed, and no SQL was executed.

The design is based on the current checkout and redemption handlers, their two client callers, PF-04/PF-06/PF-07 documentation, and the read-only live metadata committed on `audit/rebranding-2026` at `docs/audit-2026/live-db/`. That export is not present in the current branch's working tree, so it was read directly from the audit branch with `git show`; the branch was not switched and the CSV files were not copied or modified.

Live metadata limitations matter: it does not include grants, foreign-key delete actions, exact check expressions, storage policies, transaction telemetry, or data-quality query results. Those facts are marked for verification rather than inferred.

## Current Store checkout

Endpoint: `POST /api/store/orders`. Client: `src/app/store/page.tsx`.

The UI disables the checkout button while its request is pending, but there is no durable idempotency key. That guard reduces an ordinary double-click in one mounted component; it does not protect browser retries, mobile reconnects, multiple tabs, client timeouts, or repeated HTTP requests.

### Exact sequence

| Order | Current operation | Class | Failure before/after writes |
|---:|---|---|---|
| 1 | Verify the HMAC user cookie and obtain its `uid` | DERIVED CHECK / AUTH | Before writes; `401` when absent/invalid |
| 2 | Parse request; normalize pickup club, payment mode, notes, point request and cart items | DERIVED CHECK | Before writes |
| 3 | Validate club, payment mode, non-empty cart, item IDs and positive finite quantities | DERIVED CHECK | Before writes |
| 4 | Read `users(id, full_name, phone, email)` by cookie-derived `uid` | READ | Before writes; `404` if missing |
| 5 | For points/mixed, read membership by `user_id` and require `approved` | READ / DERIVED CHECK | Before writes; assumes at most one membership |
| 6 | For points/mixed, read every membership ledger delta and sum balance in JavaScript | READ / DERIVED CHECK | Before writes; no lock |
| 7 | For each cart line, sequentially read product and authoritative prices/payment flags | READ / DERIVED CHECK | Before writes |
| 8 | For each line, read the color constrained to the product; optionally read size constrained to product | READ / DERIVED CHECK | Before writes |
| 9 | For each line, read active stock by product/color/nullable size and compare old quantity to requested quantity | READ / DERIVED CHECK | Before writes; missing/null stock is treated as untracked/unlimited in checkout |
| 10 | Derive item snapshots, euro/point totals, mixed-payment point clamp and residual euro total | DERIVED CHECK | Before writes |
| 11 | Compare requested debit to the previously read balance | DERIVED CHECK | Before writes; no serialization |
| 12 | Insert `store_orders` and return the row | WRITE | First durable write |
| 13 | Bulk insert `store_order_items` | WRITE | Can fail after order insert; route attempts to delete only the order |
| 14 | For a point debit, try up to four `loyalty_transactions.source` values until one insert succeeds | WRITE | Can fail after order/items; route attempts to delete only the order |
| 15 | For each tracked stock row, sequentially overwrite `stock_qty` with `old_stock - line_quantity` | WRITE | Errors/results are not checked; later lines can fail after earlier decrements |
| 16 | Prepare notification content | DERIVED CHECK | After business writes |
| 17 | PF-07 returns the response and runs Resend, Telegram and push through tracked `after()` work | EXTERNAL SIDE EFFECT | Provider failure does not alter DB or HTTP success |

For `M` cart lines and `K` tracked stock rows, the main business path is approximately `3 + (3–4)M + K` database operations for euro checkout. Points/mixed adds membership, ledger read, and one to four ledger insert attempts. This is static structure, not runtime measurement.

### Confirmed and conditional partial-state scenarios

| Scenario | Evidence-based conclusion |
|---|---|
| Order created but item insert fails | Confirmed window. The route attempts order deletion. Whether existing child rows cascade on later compensation cannot be established because FK delete actions are absent from the export. The bulk item insert itself is one statement and should not leave a partially inserted batch on a normal PostgreSQL statement failure. |
| Order/items persist but point debit fails | Confirmed window. Compensation deletes only the order and ignores deletion failure. If the item FK is restrictive, the order delete can fail; if cascading, both may disappear. Live FK action and compensation outcome must be verified. |
| Point debit commits but the route sees an ambiguous transport failure | Possible distributed-system failure. The compatibility loop can attempt another source because there is no ledger idempotency key, creating a duplicate debit. Runtime fault injection is required to demonstrate it. |
| Order/items/point debit persist but stock is not decremented | Confirmed. Stock update errors and affected-row results are ignored and the handler still returns success. |
| Some stock rows decrement and a later stock update fails | Confirmed for multi-item tracked carts. The earlier updates remain committed and the later error is ignored. |
| Two buyers purchase the last unit | Confirmed race in structure: both can read the same old quantity, both pass, and both later overwrite from that stale value. No transaction or conditional decrement serializes them. |
| Same variant appears twice in one request | Server accepts it even though the current UI merges lines. Both lines validate against the same old stock and each writes `old_stock - its_quantity`; total ordered quantity can exceed stock and the second overwrite can lose the first decrement. |
| Two point spends use the same balance | Confirmed race in structure. Checkout and redemption can both sum the same ledger state and both append debits. |
| Duplicate HTTP submission/retry | Confirmed lack of protection: each accepted request creates a new order and, when applicable, another debit/stock change. |
| Timeout after one or more writes | Partial state depends on the exact statement reached because every statement commits independently. |
| Timeout after all writes but before client success | Client cannot distinguish failure from committed success; retry can duplicate the order/debit. PF-07 reduces provider latency after the mutation but does not solve this ambiguity. |
| Points deducted but order-item insert fails | Not a normal ordered path: items are inserted before the point debit. It is not claimed as a current sequence failure. |
| Stock decremented but points were never deducted | Not a normal points/mixed ordered path: stock updates follow the debit. Euro checkout has no expected debit. Ambiguous transport/compensation behavior is a separate risk. |

Additional contract ambiguities to resolve before implementation:

- checkout does not require a size when a product has active sizes; redemption does;
- a missing checkout stock row and a null `stock_qty` are currently accepted as untracked/unlimited inventory;
- quantities are checked as finite and positive but not explicitly integral before reaching integer columns;
- mixed `points_to_use` is converted and clamped but not explicitly checked for finiteness/integrality.

The future transaction must preserve an explicitly approved interpretation of these rules rather than silently tightening them.

## Current MoviBack redemption

Endpoint: `POST /api/moviback/rewards/redeem`. Client: `src/app/moviback/premi/page.tsx`.

The UI disables the selected reward while its request is pending. As with checkout, that is not durable idempotency.

### Exact sequence

| Order | Current operation | Class | Failure before/after writes |
|---:|---|---|---|
| 1 | Verify HMAC user cookie; parse reward/color/size IDs | DERIVED CHECK / AUTH | Before writes |
| 2 | Read membership by cookie-derived `user_id`; require `approved` | READ / DERIVED CHECK | Before writes; no row lock |
| 3 | Read reward; validate active flag and nullable reward stock | READ / DERIVED CHECK | Before writes; no row lock |
| 4 | If a Store variant is required, validate Store product, color, active sizes, required size and exact active stock row | READ / DERIVED CHECK | Before writes; null stock quantity is unlimited, but a stock row is required |
| 5 | Read all ledger deltas, sum them in JavaScript and validate reward cost | READ / DERIVED CHECK | Before writes; no serialization |
| 6 | Generate a random QR token in the route | DERIVED CHECK | Before writes; DB partial unique index enforces non-null token uniqueness |
| 7 | Insert `reward_redemptions` | WRITE | First durable write |
| 8 | Insert negative `loyalty_transactions` linked by `related_redemption_id` | WRITE | On failure, route attempts redemption deletion and ignores compensation failure |
| 9 | If catalog reward stock is tracked, overwrite it with `old_stock - 1` | WRITE | Error/result ignored |
| 10 | If Store variant stock is tracked, overwrite it with `old_stock - 1` | WRITE | Error/result ignored |
| 11 | Derive whether category/variant requires a Store fulfillment order | DERIVED CHECK | After core redemption writes |
| 12 | For Store fulfillment, read user and insert a special `store_orders` row | READ / WRITE | Failure is warning-only; redemption/debit remain and HTTP succeeds |
| 13 | If order exists, insert one `store_order_items` row | WRITE | Failure is warning-only; order header remains without its item |
| 14 | PF-07 returns success and schedules Telegram/push only when the Store order exists | EXTERNAL SIDE EFFECT | Provider failure does not alter DB/HTTP success |

Non-Store rewards do not currently schedule those admin notifications. The transactional design preserves that trigger condition.

### Partial-state and concurrency scenarios

- redemption exists without its ledger debit if the debit fails and compensation deletion fails;
- redemption and debit exist while reward stock remains unchanged because its update error is ignored;
- reward stock decrements while Store variant stock does not, or vice versa;
- Store-like redemption and debit succeed while the operational fulfillment order is absent;
- Store order exists without its item after item failure;
- concurrent redemptions can both accept the same balance, reward stock, or Store variant stock;
- concurrent last-unit redemptions can both succeed and overwrite the same stale stock value;
- repeated requests create distinct redemptions, QR tokens and debits;
- a timeout at any statement boundary can leave the preceding subset committed;
- a timeout after commit but before the response makes a client retry unsafe.

For Store-like rewards, PF-08 assumes the fulfillment order and item are required parts of a successful redemption because current code creates them for operational fulfillment. Product ownership must confirm this before implementation; if they are truly optional, the transaction contract must say so explicitly rather than silently ignoring failures.

## Live database contract

### Protections already present

- All relevant tables have UUID primary keys and RLS enabled; none has forced RLS.
- Foreign keys connect memberships to users, ledger rows to memberships, redemptions to memberships/rewards, rewards to Store products, order items to orders/products/colors/sizes, orders to users/redemptions, and stock to product/color/size.
- `users(phone)`, `loyalty_memberships(membership_code)`, and `(store_product_sizes.product_id, size_label)` are unique.
- `(store_product_stock.product_id, color_id, size_id)` is unique for non-null size values.
- A partial unique index protects non-null redemption QR tokens.
- Named checks exist for Store order status/payment/club/order type, order-item quantity, membership status/type, loyalty type/source, redemption status and reward type. Exact expressions were not exported and must be verified before relying on them.
- Useful Store lookup indexes exist, including product/color/size relations, stock product, order item order, and order user/status/date.

### Confirmed insufficiencies or verification gaps

- There is no checkout/redemption RPC and the exported public trigger inventory is empty.
- The only exported public functions are unrelated staff-password functions.
- The nullable-size stock unique index does not use `NULLS NOT DISTINCT`; PostgreSQL permits multiple rows where `size_id IS NULL`, while both handlers assume at most one exact row.
- No exported constraint proves non-negative nullable stock on `store_product_stock` or `rewards_catalog`.
- `loyalty_memberships.user_id` is neither indexed nor unique although both handlers call `maybeSingle()`.
- `loyalty_transactions` has only its primary-key index: no membership index, no unique redemption-debit protection, and the export shows no FK for `related_redemption_id`.
- `store_orders.related_redemption_id` is indexed but not unique, so the database does not enforce one fulfillment order per redemption.
- No idempotency key or request fingerprint exists on either root operation.
- Grants and FK delete actions were not exported. Function execute privileges and compensation cascade/restrict behavior require live read-only verification.

Service-role Supabase clients bypass the current RLS policies. The relevant exported policies are SELECT-only owner policies for membership/ledger/redemption plus a public reward-catalog SELECT policy; there are no exported direct-write policies for these flows.

## Preferred transactional architecture

Use two narrowly scoped PostgreSQL RPCs, each executing its entire business mutation in one database transaction invoked by one Supabase RPC request:

- `checkout_store_order(...)` for Store checkout;
- `redeem_moviback_reward(...)` for reward redemption.

The names follow the live project's snake_case public-function convention but remain design names until migration review. PostgreSQL functions execute atomically within their calling statement: any uncaught validation/write error rolls back all writes, including the idempotency claim.

Route-level validation may remain for fast user feedback, but it is not authoritative. Prices, reward costs, availability, totals, membership state, balance and stock must be re-read and validated inside the transaction.

## Conceptual Store checkout RPC

### Inputs

- server-validated `p_user_id uuid`, never accepted from the browser body;
- `p_idempotency_key uuid` generated by the client and forwarded unchanged by the route;
- pickup club, payment mode, requested mixed-payment points and notes;
- a JSON/typed array of product ID, color ID, nullable size ID and quantity only.

Do not accept client-provided names, prices, totals, balance, membership ID, stock ID, customer identity, or order status.

### Outputs

A stable result sufficient to preserve the current API response and PF-07 message construction:

- `created` versus `replayed`;
- order ID and status;
- authoritative euro/point totals;
- canonical item snapshots and required customer/order fields for post-commit notifications;
- a stable machine result code, not raw internal SQL text.

### Validation and derived values

1. Claim or replay the idempotency key before mutable business validation.
2. Require a valid server-bound user and valid club/payment values.
3. Normalize cart lines, require positive integer quantities, aggregate repeated identical variants, and sort canonical variants.
4. Load authoritative product, color and nullable-size relationships; validate active/payment flags.
5. Preserve the approved checkout size and untracked-stock semantics.
6. Derive prices, item snapshots, total points, total euros, requested debit and mixed residual in the database using numeric/integer types.
7. For points/mixed, require exactly one approved membership and calculate balance from the ledger after acquiring the membership lock.
8. Reject insufficient tracked stock or balance before any business row survives.

### Locking

- Serialize idempotency claims through the unique `(operation, user_id, key)` row.
- Lock the membership row `FOR UPDATE` before summing balance for point-consuming checkout.
- Lock product/color/size rows at least `FOR SHARE` while deriving the committed snapshot, so price/availability cannot change mid-transaction.
- Lock every tracked stock row `FOR UPDATE` in deterministic stock-ID order.
- All checkout/redemption functions must use the same global order: idempotency claim → membership → catalog/reward rows → stock rows → writes.
- Aggregate duplicate variants before locking and decrementing.

Two users contending for the last unit will serialize on the stock row. The second transaction must re-evaluate the now-current quantity and return insufficient stock without business writes. Multi-item transactions lock sorted stock IDs to reduce deadlock risk; a detected deadlock rolls the entire function back and may be retried with the same idempotency key.

### Writes

1. Insert the order with server-derived identity/totals.
2. Insert all order items set-wise from canonical lines.
3. Insert exactly one loyalty debit when required, using the schema-supported Store source chosen before rollout; remove the runtime source fallback from the future path only after live source semantics are confirmed.
4. Decrement each finite stock row once by the aggregated quantity with a non-negative predicate; leave null/unlimited stock unchanged.
5. Store the stable result on the idempotency record.

Any failed insert, zero-row finite-stock decrement, constraint violation, or unexpected row count raises a controlled error and rolls back order, items, ledger, stock and idempotency claim together.

### Conceptual pseudocode

```text
begin implicit RPC transaction
  claim_idempotency(user, "store_checkout", key, canonical_request_hash)
  if committed replay: return stored result
  if same key/different hash: conflict

  validate user and normalized intent
  lock approved membership if points are involved
  load/lock authoritative products and variants
  aggregate duplicate variants
  lock tracked stock rows in deterministic order
  calculate authoritative totals and current ledger balance
  reject invalid variant/payment, insufficient balance or stock

  insert order
  insert all item snapshots
  insert optional loyalty debit
  decrement finite stock atomically
  persist idempotent result
  return created result
commit automatically on successful return
```

## Conceptual MoviBack redemption RPC

### Inputs

- cookie-derived server-validated user ID;
- client idempotency UUID;
- reward ID;
- nullable Store color/size IDs.

Membership ID, points cost, reward stock, Store product, price, customer details, redemption status and QR result are database-derived. A QR token may be generated in the function with a cryptographically secure primitive and retried on the existing unique constraint; alternatively it may be generated by the trusted route and treated as an internal input. It must never come from the browser.

### Validation and lock order

1. Claim/replay idempotency and compare canonical reward/variant fingerprint.
2. Resolve exactly one approved membership for the trusted user and lock it `FOR UPDATE`.
3. Lock the reward `FOR UPDATE`; validate active state, current cost, type and nullable stock.
4. Preserve the existing `shouldCreateStoreOrder` category/variant rule until a separately approved business-rule change.
5. When required, validate and lock Store product/color/size; require the exact active stock row as today and preserve null/unlimited stock semantics.
6. Sum the ledger after the membership lock and reject insufficient points.
7. Recheck finite reward and variant stock after locks.

Checkout and redemption share the membership-first/stock-sorted lock protocol so a concurrent checkout and redemption by the same member cannot both spend the same pre-debit balance.

Other ledger writers currently do not participate in this protocol. Earns can safely increase the balance but may cause a conservative temporary rejection; unrestricted membership fees/manual adjustments can still change the final balance according to their existing rules. Any future balance-protected debit path must adopt the same membership lock if a global non-negative-spend invariant is required.

### Atomic writes and output

1. Insert redemption with requested status, authoritative cost and unique QR token.
2. Insert exactly one linked negative ledger transaction.
3. Decrement finite reward stock and, when applicable, finite Store variant stock.
4. For Store-like rewards, insert the fulfillment order and its one item as required transaction members.
5. Persist and return the idempotent result: created/replayed, redemption ID, QR token and optional Store order notification context.

Any required step failure rolls everything back. In particular, the future design must not return a successful Store-like redemption without its required fulfillment order/item.

## Idempotency design

### Recommended durable object

Prefer one small dedicated table rather than unrelated columns on two roots:

```text
business_operation_idempotency
  operation          constrained text discriminator
  user_id            FK to users
  idempotency_key    UUID
  request_hash       canonical server/DB-derived fingerprint
  resource_type/id   minimal root reference
  result             minimal stable response payload
  created_at
  unique(operation, user_id, idempotency_key)
```

This single object handles both flows and distinguishes:

- **NEW REQUEST:** unique claim succeeds; transaction continues;
- **ALREADY COMMITTED:** same scoped key and hash returns the stored result without writes;
- **CONFLICTING REUSE:** same scoped key with a different hash returns `409` without writes.

The claim, business writes and stored result must be in the same transaction. An interrupted transaction leaves no committed claim; a committed transaction always leaves its replay result. Concurrent inserts on the same unique key block/serialize naturally.

The browser generates one UUID when the user confirms an operation and retains it through network retry until a definitive result or intentional request change. The server never silently replaces it during a retry. Checkout hashing uses normalized club/payment/points/notes plus aggregated, sorted product/color/nullable-size/quantity intent. Redemption hashing uses reward/color/nullable-size intent. Server-authoritative prices and mutable status are excluded from the request fingerprint so a retry after a successful commit returns the original outcome rather than conflicting because catalog data changed.

A new key represents a new business request even if its payload is identical. Attempting to deduplicate all semantically identical purchases across different keys would block legitimate repeat purchases and is not recommended.

On replay, the route should return the stored success result and must not repeat the business mutation. PF-07 notifications should normally be scheduled only for `created=true` to avoid duplicates. A crash after DB commit but before the original notification was scheduled remains a delivery gap; resolving both missed and duplicate delivery requires a transactional outbox and is deliberately outside PF-08 business atomicity.

## Candidate database constraints

Every candidate requires read-only duplicate/range checks and a reviewed migration; none is implemented here.

| Candidate | Concrete invariant | Recommendation |
|---|---|---|
| Unique `(operation, user_id, idempotency_key)` | One durable result per scoped retry token | Required with the recommended idempotency table |
| Unique `loyalty_memberships(user_id)` | Application/RPC assumes exactly one membership per user | Likely required after duplicate audit and product confirmation |
| Null-safe unique stock variant | One stock row per product/color/nullable size | Required for deterministic nullable-size locking; use PostgreSQL null-safe uniqueness only after duplicate cleanup |
| `stock_qty IS NULL OR stock_qty >= 0` on Store and reward stock | Null means unlimited; finite inventory cannot be negative | Recommended defense-in-depth after range audit |
| Partial unique ledger link for redemption | One reward-redemption debit per redemption | Recommended after source/link audit |
| FK from ledger `related_redemption_id` to redemption | Linked reward debit cannot reference a missing redemption | Potentially required; first confirm deletion/cancellation lifecycle |
| Partial unique Store order `related_redemption_id` | At most one fulfillment order per reward redemption | Recommended if product confirms the one-order invariant |

A membership-ledger index can improve the in-RPC balance sum as history grows, but it is a performance index rather than an atomicity prerequisite and needs plan validation. Exact existing check expressions and FK delete actions must be inspected before proposing overlapping constraints.

## Error contract

The functions should expose stable machine codes that the route maps to the current public contract, while unexpected errors remain `500`. Authentication remains in the route (`401`). Examples include user/reward not found (`404`), membership not approved (`403`), invalid request/payment/variant, insufficient points/stock (`400` to preserve current behavior), and idempotency conflict (`409`, new but explicit). Internal constraint names, SQL, service-role details and provider content must not be returned.

Validation errors and controlled concurrency losses leave no business rows. Deadlock/serialization errors may be retried by the route with the same idempotency key under a bounded policy decided during implementation; arbitrary provider or validation errors must not be retried as database mutations.

## Security model

- Continue to validate the signed, expiring HTTP-only user cookie in Next.js.
- Derive user ID from that cookie; never accept user/member identity from request JSON.
- Invoke the RPC with the server-only service-role client. The custom cookie does not populate `auth.uid()`, so a database function cannot infer the MOVIPadel user from Supabase Auth.
- Prefer `SECURITY INVOKER` with service-role-only execute permission. Revoke function execution from `PUBLIC`, `anon` and `authenticated`; grant only the intended server role. Grants require live verification because they were not exported.
- If `SECURITY DEFINER` is operationally required, use a non-login owner, schema-qualify every object, fix a minimal `search_path` (including `pg_catalog`/required extension schema only), revoke default execute, and validate caller role explicitly. The existing staff functions demonstrate fixed `search_path` but their grants are unknown.
- Treat every non-identity input as hostile: enforce type, bounds, allowed enumerations, array cardinality, duplicate normalization and relationship ownership inside the function.
- Do not expose service-role credentials, raw errors, request hashes, internal idempotency result JSON, customer PII or lock information to clients/logs.
- RLS remains enabled. Service-role execution bypasses current RLS, so function privileges and route authorization are the effective write boundary; this must not be broadened to browser RPC access.

## Notifications and future outbox

Email, Telegram and push remain post-commit side effects under PF-07. They are not inputs to either transaction and provider failure never rolls business data back.

A later durable-delivery phase could insert an outbox intent in the same transaction, then deliver with idempotent provider/event keys, attempts, backoff and dead-letter/replay tooling. It is not required for Store/redemption database atomicity and is outside PF-08 implementation scope. Until then, `after()` is runtime-tracked but timeout/crash-bound.

## Conceptual performance effect

Current checkout performs one browser request followed by database round trips that grow linearly with cart lines; redemption exposes up to 16 Supabase call sites across branches. The future routes perform one server-to-PostgreSQL RPC round trip, with all internal reads, locks, validation and writes executed near the data.

Expected effects without inventing milliseconds:

- materially fewer server/database network waits;
- no application-level item validation or stock-update waterfall;
- smaller race windows because reads and writes share one transaction and locks;
- complete rollback instead of compensation;
- safe replay of an ambiguous committed response;
- some added lock wait under real contention, which is the correct cost of serializing scarce balance/stock;
- possible deadlocks if lock order is not deterministic, hence the common ordering requirement.

## Required final assessment

1. **Current checkout atomicity risk:** VERY HIGH.
2. **Current redemption atomicity risk:** VERY HIGH.
3. **Recommended architecture:** two server-only PostgreSQL transactional RPCs plus one transaction-scoped durable idempotency registry; PF-07 notifications remain post-commit.
4. **RPCs/functions proposed:** design names `checkout_store_order(...)` and `redeem_moviback_reward(...)`, plus a private idempotency claim/replay helper if review finds that clearer than duplicated internal logic.
5. **Database constraints potentially required:** idempotency uniqueness; null-safe stock uniqueness; one membership per user; non-negative finite stock; one debit and one fulfillment order per redemption, subject to stated data/lifecycle verification.
6. **Idempotency strategy:** client-generated UUID retained across retries, scoped by operation and server-authenticated user, canonical request hash, transactionally stored result, replay on same hash and `409` on conflicting reuse.
7. **Locking strategy:** common deterministic order; membership `FOR UPDATE` for balance-protected spends, catalog rows protected while pricing/validating, finite stock rows `FOR UPDATE` in sorted order, atomic guarded decrements.
8. **Security model:** HMAC cookie remains authoritative in Next.js; server passes derived user ID through a service-role-only, preferably security-invoker RPC; no browser execute grant or client-supplied identity.
9. **Expected performance benefit:** HIGH architectural benefit from collapsing many PostgREST round trips into one RPC; exact milliseconds require staging measurement.
10. **Expected reliability benefit:** VERY HIGH because required writes become all-or-nothing and committed responses become safely replayable.
11. **Implementation complexity:** HIGH due compatibility contracts, lock ordering, idempotency, data cleanup/constraints, fault injection and staged rollout.
12. **Recommended next implementation step:** PF-08A should perform read-only data/grant/FK-action checks, approve ambiguous stock/size/fulfillment rules, and review non-executable function signatures and error contracts before authoring any migration.
