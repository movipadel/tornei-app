# PF-08B1 — Checkout validation

## Result

**PASS — migration, functional behavior, security, idempotency, contention, rollback, and clean-reset reproducibility validated locally.**

All execution targeted the unlinked local Supabase database at `127.0.0.1:54322/postgres`. Direct identity reported PostgreSQL 17.6, database/user `postgres`, and the expected Docker-internal server endpoint.

## Migration execution

Migration:

```text
supabase/migrations/20260916180000_pf08_transactional_store_checkout.sql
```

The reset applied, in order:

1. production-equivalent public baseline;
2. PF-08B0 idempotency migration;
3. PF-08B1 checkout migration;
4. unchanged PF-08L6 synthetic seed.

The initial application completed without SQL correction. Runtime smoke checkout created one order/item and decremented stock inside a test transaction; the enclosing rollback restored zero catalog orders, zero idempotency rows, and original stock.

## Functional test suite

Script:

```text
supabase/tests/pf08b1_checkout.sql
```

Every scenario runs under `service_role`, uses a savepoint, asserts database state, and returns to the seed baseline. Results:

| # | Scenario | Result |
|---:|---|---|
| 1 | Normal one-item euro checkout | PASS |
| 2 | Multi-item checkout | PASS |
| 3 | Duplicate identical lines aggregate to one item | PASS |
| 4 | Aggregate quantity 10 consumes stock 10 exactly | PASS |
| 5 | Stock 1 succeeds once | PASS |
| 6 | Subsequent stock 1 attempt fails with no residue | PASS |
| 7 | User A points checkout succeeds with one debit | PASS |
| 8 | User B insufficient-points checkout fails atomically | PASS |
| 9 | Invalid product | PASS |
| 10 | Cross-product color | PASS |
| 11 | Cross-product size | PASS |
| 12 | Null-size Store variant | PASS |
| 13 | Identical idempotency replay | PASS |
| 14 | Same key/different hash conflict | PASS |
| 15 | Same key/different users independent | PASS |
| 16 | Different keys/identical request independent | PASS |
| 17 | Forced order-item database failure rolls everything back | PASS |

Additional passing coverage includes mixed payment, note/club normalization, JSON key-order independence, empty cart, invalid club, invalid payment, and missing membership.

After the suite's outer rollback:

- catalog orders: 0;
- idempotency rows: 0;
- stock fixtures: 10 and 1;
- User A balance: 2,000;
- User B balance: 500.

## Idempotency evidence

Identical replay returned the original order ID and stable `data`, with `created=false`, `replayed=true`, and no second order, item, debit, or stock decrement.

Changing quantity under the same operation/user/key raised `PF08_IDEMPOTENCY_CONFLICT`; the first order/result remained the only mutation.

The same key for different users created two independent orders. Identical requests with different keys created two legitimate orders.

## Stock concurrency

Two local sessions competed for Product B's only unit. The winning transaction held the exact stock row lock before checkout; the competing RPC waited and then evaluated the committed quantity.

Observed result:

- winner: one committed order and one item for User A;
- loser: `PF08_INSUFFICIENT_STOCK` after waiting approximately 5.1 seconds;
- final stock: 0;
- committed idempotency rows for both attempts: 1 (winner only);
- extra ledger debits: 0;
- no loser order/item/claim residue.

This proves the stock lock and guarded decrement prevent two buyers from purchasing one finite unit.

## Same-key concurrency

A separate membership-locking session held User A's membership. The first points checkout inserted its idempotency claim and then waited on that membership; a second identical checkout concurrently contended on the same unique key.

Observed result:

- second call waited approximately 15.9 seconds;
- second call returned the first order ID with `replayed=true`;
- one committed idempotency row;
- one order;
- one item;
- one 250-point ledger debit;
- one stock decrement.

This proves same-key contention cannot produce independent business mutations.

## Failure/rollback evidence

A test-only `pg_temp` trigger deliberately raised during `store_order_items` insertion after the RPC had already created its claim and order. The call returned the forced exception and assertions confirmed:

- zero catalog orders;
- no additional order item;
- no additional ledger row;
- unchanged stock;
- no idempotency row.

Expected validation errors were also caught inside PostgreSQL subtransactions. Every failure asserted unchanged order/item/ledger/stock/idempotency state.

## Security validation

Catalog metadata confirms:

| Property | Result |
|---|---|
| Owner | `postgres` |
| SECURITY DEFINER | false (`SECURITY INVOKER`) |
| Search path | `pg_catalog, public, extensions` |
| EXECUTE `postgres` | yes |
| EXECUTE `service_role` | yes |
| EXECUTE `PUBLIC` | no |
| EXECUTE `anon` | no |
| EXECUTE `authenticated` | no |

An actual invocation after `SET ROLE anon` failed with `permission denied for function checkout_store_order`.

## Final reset and reproducibility

The required final local reset completed successfully in approximately 69.9 seconds. It reapplied all three migrations and the unchanged seed.

Final state:

- catalog test orders: 0;
- idempotency rows: 0;
- ledger rows: 4 fixture rows;
- stock quantities: 10, 1, and 3;
- User A balance: 2,000;
- User B balance: 500;
- RPC remained `SECURITY INVOKER` with only `postgres`/`service_role` execute ACL.

No test state accumulated.

## Architectural performance result

The current route performs sequential PostgREST operations proportional to cart size. PF-08B1 exposes one server-to-database RPC call; its internal reads, locks, set-wise item insert, optional debit, stock updates, and idempotency completion run inside PostgreSQL.

Expected architectural effect:

- browser → server request count is unchanged until PF-08B4;
- future server → database interaction becomes one RPC round trip;
- duplicate line work is aggregated;
- cart item insertion is set-wise;
- lock waits replace stale-read race windows;
- all required writes commit or roll back together.

No production HTTP latency claim is made from local Docker timings.

## Regression assessment

Current application regression risk is **LOW** because no route calls the new RPC. Database migration risk is **MEDIUM** because the function is a large transactional surface, but it is additive, server-only, and fully reset-tested. Future route integration risk remains **HIGH** until PF-08B4 maps every code/result and preserves PF-07 notification behavior without fallback to the legacy mutation path.

PF-08B2 was not started.
