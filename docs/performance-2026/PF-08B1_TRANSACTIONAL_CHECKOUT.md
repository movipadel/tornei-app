# PF-08B1 — Transactional Store checkout

## Status and scope

PF-08B1 adds one server-only PostgreSQL RPC:

```text
public.checkout_store_order(uuid, uuid, text, text, integer, text, jsonb)
```

The RPC atomically performs Store checkout and integrates the existing PF-08B0 idempotency registry. The live Next.js checkout route remains unchanged; route integration and notification wiring are deferred to PF-08B4. No redemption logic or RPC is included.

## Current checkout contract reconstructed

The existing `POST /api/store/orders` route performs these operations across separate PostgREST calls:

1. validate the signed cookie and derive the MOVIPadel user ID;
2. normalize pickup club, payment mode, notes, requested mixed points, and cart lines;
3. load the user snapshot;
4. for points/mixed, find an approved membership and sum the loyalty ledger;
5. for every cart line, sequentially load product, color, optional size, and active exact stock;
6. derive authoritative item snapshots and euro/point totals;
7. insert the order;
8. insert all items;
9. insert a point debit when required;
10. sequentially overwrite finite stock values;
11. return success and schedule PF-07 notifications after database work.

The route's static database-operation shape is approximately `3 + (3–4)M + K` for `M` cart lines and `K` tracked stock rows, plus membership/ledger/debit work for points or mixed payment. PF-08B1 collapses the database portion to one RPC statement and one implicit PostgreSQL transaction.

## Compatibility decisions

PF-08B1 preserves the current rules rather than introducing future constraints:

- valid pickup clubs remain `CENTALLO`, `COSTIGLIOLE`, `MANTA`, `SALUZZO`, and `REVELLO`;
- payment modes remain `euro`, `points`, and `mixed`;
- euro checkout does not require a MoviBack membership;
- points and mixed checkout require exactly one approved membership;
- authoritative product prices and payment flags come from the database;
- `base_price_points NULL` falls back to rounded euro price × 10;
- points payment consumes the full authoritative point total and sets order euro total to zero;
- mixed payment clamps requested points to `[0, cart point total]` and subtracts €0.10 per point from the euro total;
- size remains optional even when active sizes exist, matching the current route;
- a missing active exact stock row is treated as untracked/unlimited;
- `stock_qty NULL` is treated as untracked/unlimited;
- order status is `pending`, type is `catalog`, and customer/contact fields are database snapshots;
- order-item euro and point values retain the full authoritative per-item totals for all payment modes;
- the point ledger debit uses `type='redeem'`, `source='manual_adjustment'`, and the current `Ordine Store MOVI: <order-id>` note. `manual_adjustment` is the first schema-supported source reached by the current route's fallback sequence.

Duplicate logical variants are now aggregated before validation and mutation as explicitly required by PF-08B1. This closes the existing oversell/lost-decrement path while preserving the UI's effective behavior, because the current UI already merges identical cart variants.

## RPC contract

### Inputs

| Parameter | Meaning |
|---|---|
| `p_user_id uuid` | User identity already validated by the future server route; never accepted directly from arbitrary browser identity input |
| `p_idempotency_key uuid` | Client-generated operation UUID retained across retries |
| `p_pickup_club text` | Pickup club; trimmed and uppercased |
| `p_payment_mode text` | `euro`, `points`, or `mixed` |
| `p_points_to_use integer` | Requested mixed-payment points; ignored for euro/points hashing and clamped for mixed |
| `p_notes text` | Trimmed optional order notes |
| `p_items jsonb` | Array containing only product ID, color ID, nullable size ID, and positive integer quantity |

The RPC does not accept client prices, totals, names, stock IDs/quantities, membership IDs, customer fields, order status, or ledger amounts.

### Output

The function returns JSONB:

```json
{
  "ok": true,
  "data": {
    "order_id": "uuid",
    "status": "pending",
    "total_euro": 0,
    "total_points": 0
  },
  "created": true,
  "replayed": false,
  "notification": {}
}
```

For a committed replay, `data` is the stored original result, `created=false`, `replayed=true`, and `notification=null`. The future route must schedule PF-07 notifications only when `created=true`.

The notification object on a new result contains the authoritative customer/order/item snapshot required by the existing email, Telegram, and push preparation. It is returned from the new transaction but is not persisted in the idempotency result, avoiding unnecessary duplicated PII.

## Canonicalization and request hash

The RPC derives the hash itself. It does not accept a caller-provided digest.

1. Require a JSON array of object entries.
2. Parse UUIDs and positive integral quantities.
3. Normalize empty size IDs to SQL/JSON null.
4. Aggregate duplicate `(product_id, color_id, nullable size_id)` lines by summing quantity.
5. Sort by product UUID, color UUID, then nullable size UUID.
6. Build a versioned JSONB envelope containing operation, normalized pickup club, payment mode, effective requested mixed points, trimmed/null notes, and normalized items.
7. Hash PostgreSQL's deterministic JSONB text representation as UTF-8 SHA-256 and store lowercase hexadecimal output.

JSON object key order and incoming item order therefore do not affect replay. Quantity, variant, notes, pickup club, payment mode, or effective mixed-point intent changes do affect the hash.

## Idempotency integration

The RPC uses operation `store_checkout` and PF-08B0's unique `(operation, user_id, idempotency_key)` scope.

- New claim: insert `processing`, perform the transaction, store the stable result, set `committed`, return `created=true`.
- Matching committed hash: return the stored result with `replayed=true`; no order, item, ledger, or stock write occurs.
- Different hash: raise `PF08_IDEMPOTENCY_CONFLICT`; no checkout mutation occurs.
- Concurrent same key: PostgreSQL unique-index conflict handling waits for the owner. Commit produces replay; rollback lets the waiter acquire a fresh claim.

Claim, business writes, and result completion share the same function statement/transaction. Any uncaught error removes a new claim with all other writes.

## Locking and balance strategy

Lock order is:

1. idempotency unique claim;
2. approved membership row `FOR UPDATE` when points/mixed is selected;
3. product, color, and optional size rows `FOR SHARE` in canonical variant order;
4. active tracked stock rows `FOR UPDATE` in ascending stock UUID order;
5. business writes.

After acquiring the membership lock, the RPC sums `loyalty_transactions.points_delta`. It does not add a cached balance column. PF-08 checkout/redemption callers must use the same membership-lock protocol; unrelated legacy ledger writers remain a documented coordination gap.

Stock rows are revalidated after locking. Finite stock must satisfy aggregated quantity and is decremented with `stock_qty >= quantity` in the update predicate. A zero-row guarded update raises and rolls back. Null stock remains unchanged.

## Atomic writes

On success the transaction performs:

1. one `store_orders` insert;
2. one set-wise `store_order_items` insert from aggregated authoritative snapshots;
3. zero or one loyalty debit;
4. one guarded decrement per finite stock row;
5. one idempotency completion update.

Failure at any stage rolls back all five categories. Notifications remain outside the database transaction and are not implemented here.

## Error contract and future HTTP mapping

| Code | Meaning | Intended future HTTP mapping |
|---|---|---:|
| `PF08_MALFORMED_REQUEST` | Null IDs, malformed JSON/UUID/quantity, overflow | 400 |
| `PF08_EMPTY_CART` | No cart lines | 400 |
| `PF08_INVALID_PICKUP_CLUB` | Unsupported club | 400 |
| `PF08_INVALID_PAYMENT_MODE` | Unsupported payment mode | 400 |
| `PF08_INVALID_USER` | Server-bound user no longer exists | 404 |
| `PF08_MEMBERSHIP_REQUIRED` | No membership for points/mixed | 403 |
| `PF08_MEMBERSHIP_NOT_APPROVED` | Membership exists but is not approved | 403 |
| `PF08_MEMBERSHIP_AMBIGUOUS` | More than one membership violates route assumption | 500 / invariant alert |
| `PF08_INVALID_PRODUCT` | Missing/inactive product | 400 |
| `PF08_PAYMENT_NOT_ALLOWED` | Product disallows selected mode | 400 |
| `PF08_INVALID_COLOR` | Missing/inactive/cross-product color | 400 |
| `PF08_INVALID_SIZE` | Missing/inactive/cross-product size | 400 |
| `PF08_INVALID_VARIANT` | Locked stock no longer matches variant | 400 |
| `PF08_STOCK_AMBIGUOUS` | Multiple active exact stock rows | 500 / invariant alert |
| `PF08_INSUFFICIENT_STOCK` | Aggregated finite stock unavailable | 400 |
| `PF08_INSUFFICIENT_POINTS` | Locked ledger balance is insufficient | 400 |
| `PF08_IDEMPOTENCY_CONFLICT` | Same scoped key, different canonical request | 409 |
| `PF08_IDEMPOTENCY_INCOMPLETE` | Persisted idempotency invariant violation | 500 / invariant alert |

Authentication failure remains a route-level 401 before the RPC. The future adapter must map stable codes and suppress unexpected raw database details.

## Security

- `SECURITY INVOKER`—the RPC has no elevated definer authority.
- Owner: `postgres`.
- Fixed search path: `pg_catalog, public, extensions`.
- Volatility/parallel: `VOLATILE`, `PARALLEL UNSAFE`.
- EXECUTE: `postgres` and `service_role` only.
- EXECUTE denied: `PUBLIC`, `anon`, and `authenticated`.
- All referenced application objects are explicitly schema-qualified.

The current server service-role boundary supplies the required table privileges and bypasses RLS. The browser must never invoke this function directly.

## Remaining model limitations

- `loyalty_memberships(user_id)` is not unique. The RPC returns an invariant error when multiple rows are visible, but the schema does not prevent a concurrent new membership outside this lock protocol.
- Null-size stock identity is not null-safe unique. The RPC rejects multiple visible active rows and locks the selected row, but cannot gap-lock a concurrently inserted duplicate under the current model.
- Missing stock and null quantity deliberately remain unlimited compatibility semantics.
- Legacy ledger writers that do not lock the membership row are not serialized with PF-08 protected spends.

These are explicit follow-up risks; PF-08B1 does not silently add unrelated constraints.
