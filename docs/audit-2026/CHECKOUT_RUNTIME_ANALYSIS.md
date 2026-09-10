# MOVIPadel Checkout and Redemption Runtime Analysis — Phase 2C

## Safety and measurement status

No checkout, redemption, accreditation, or other mutation was executed. There was no authorized staging/test fixture visible that could guarantee isolation from production. Database, application, and provider latency for this flow are therefore **NOT YET MEASURED**.

The exact control flow, query count formula, awaited providers, and race/atomicity mechanisms are **STATICALLY CONFIRMED**. Public catalog performance was safely measured.

## Public Store prerequisite

`GET /api/store/products` was **MEASURED** at 211,150 bytes and 282.5 ms median on the optimized local server. It returns 5 categories, 2 lines, 31 products, 90 colors, 139 sizes and 418 stock rows. This large payload precedes checkout and can materially affect perceived Store readiness independently of checkout submission.

## Precise checkout sequence

| Order | Step | Type | Sequential dependency |
|---:|---|---|---|
| 1 | Verify user HMAC cookie and parse body | Application/auth | Required first |
| 2 | Read user by ID | Database read | Authenticated ID |
| 3 | For points/mixed: read membership by user | Database read | User/auth |
| 4 | For points/mixed: read all ledger deltas and sum balance | DB read + application aggregation | Membership |
| 5 | For each item: read product/pricing/payment flags | Database read | Item ID |
| 6 | For each item: read color constrained to product | Database read | Product |
| 7 | For each item: optionally read size constrained to product | Database read | Product |
| 8 | For each item: read active stock by product/color/size | Database read | Valid product/variant |
| 9 | Calculate authoritative totals and validate payment mode | Application computation | All items validated |
| 10 | Insert order and return inserted row | Database write/read result | Totals |
| 11 | Bulk insert order items | Database write | Order ID |
| 12 | For points/mixed: insert loyalty debit, with compatibility retries | Database write(s) | Order + balance validation |
| 13 | For each item: write `old stock - quantity` by stock-row ID | Database writes | Previously read stock; order/items already created |
| 14 | Send order email through Resend | External provider | After core writes |
| 15 | Send Telegram message | External provider | After email stage |
| 16 | Read active push subscriptions | Database read | Push stage |
| 17 | Send web pushes concurrently and process failures | External provider + possible DB updates | Subscription read |
| 18 | Return HTTP response | HTTP | Waits for provider stages to settle/catch |

The outer item loop is sequential. Product -> color/size -> stock dependencies are real, but different cart items could theoretically be validated in a batch. Stock writes are also sequential per item.

## Round-trip estimate

For `M` items:

- euro checkout: approximately `4 + (4–5)M` database operations, including user/order/items/notification subscription work;
- points/mixed: add membership, full-ledger balance and loyalty debit; compatibility fallback can add failed insert attempts;
- external stages: Resend, Telegram and web push are awaited sequential stages, although individual push sends use `Promise.all`.

The formula is **ESTIMATED from confirmed code branches**, not measured traffic.

## Reward redemption differences

Store-linked reward redemption follows membership -> reward -> product/variant/stock -> full ledger -> redemption -> ledger debit -> reward/store stock updates -> optional order/item -> Telegram -> push. The handler contains 16 Supabase call sites across branches. Non-store rewards skip variant/order work but retain balance/redemption/notification dependencies.

## Latency contribution classification

| Layer | Expected contribution | Evidence status |
|---|---|---|
| Database | VERY HIGH due number of serial remote operations | Static structure confirmed; timing unmeasured |
| Application | MEDIUM for validation/totals/mapping | Static; CPU time unmeasured |
| External providers | VERY HIGH potential because response awaits them | Await confirmed; provider timings unmeasured |
| Query/index design | LOW for product/stock PK/composite lookups at current scale | Live indexes/cardinality confirmed |
| Data volume | LOW | 31 products, 418 stock rows, 15 orders |
| Cache strategy | MEDIUM before checkout due 211 kB no-cache catalog | Payload/timing measured |

No percentage split is justified without span instrumentation.

## Atomicity and concurrency risks

1. Points balance is read/summed, then debited later. Concurrent spends can validate against the same balance.
2. Stock is read, then later overwritten by ID with a quantity derived from the old value. Concurrent orders can pass the same check and lose an update/oversell.
3. Order, items, ledger and stock use separate statements; compensation deletes do not form a database transaction.
4. Reward redemption has the same balance/stock read-modify-write pattern.
5. No public trigger or transactional checkout/redemption RPC exists.
6. The stock unique index includes nullable `size_id` without exported `NULLS NOT DISTINCT`, so no-size duplicates remain a data-rule question.
7. Provider success is not durably coupled to the completed order; failures are caught/logged without an outbox.

These are correctness risks that also extend latency by keeping the critical path long. Phase 2C does not redesign them.

## Safe future measurement protocol

Use staging with production-shaped catalog/member data and provider test doubles:

- one-, three-, and five-item carts for euro, points and mixed;
- span every database call, application phase and provider separately;
- record response bytes, statement count, p50/p95 and error result;
- concurrent same-variant orders and same-member spends;
- injected failures after order, items, ledger and stock steps;
- client retry/idempotency test;
- provider delay/timeout tests without real operational messages.

Do not execute this protocol against production without separate explicit authorization and reversible test data.

## Dominant causes

| Cause | Contribution |
|---|---|
| Frontend | LOW for submission; MEDIUM catalog readiness |
| HTTP/API round trips | MEDIUM browser-side, hidden server-side |
| Server logic | HIGH |
| Database round trips | VERY HIGH |
| Query design | LOW currently |
| Database data volume | LOW |
| Application-side aggregation | MEDIUM |
| External service latency | VERY HIGH potential |
| Cache strategy | MEDIUM for catalog |

