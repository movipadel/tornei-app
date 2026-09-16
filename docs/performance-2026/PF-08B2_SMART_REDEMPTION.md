# PF-08B2R2 — Smart MoviBack redemption

## Scope and result

PF-08B2R2 replaces the disposable, uncommitted PF-08B2 request implementation with the redemption-first contract. It adds the schema support and one atomic request RPC needed by the approved PF-08B2R design. It does not integrate an application route, send Telegram, implement lifecycle/cancellation RPCs, change authentication, or modify production.

The implementation is in `supabase/migrations/20260916190000_pf08_smart_redemption.sql`. It was executed only against the unlinked local Supabase database at `127.0.0.1:54322/postgres`.

## Schema changes

### Explicit classification

`rewards_catalog.fulfillment_type` is nullable for rollout compatibility and constrained to:

- `service`
- `store_product`
- `custom_physical`
- `partner`

Every new RPC-created redemption snapshots the explicit value in `reward_redemptions.fulfillment_type`. The RPC rejects an unclassified reward with `PF08_FULFILLMENT_UNCLASSIFIED`; it never derives behavior from category text or legacy `requires_store_variant`.

Historical rewards/redemptions remain nullable. The migration does not classify, backfill, invent variants, or create orders for existing rows.

### State support

The redemption status check now accepts:

```text
requested, approved, processing, ready, delivered, cancelled, rejected
```

`approved` remains compatibility-only. New service requests start `ready`; Store product, custom physical, and partner requests start `requested`. New timestamps are `processing_at`, `ready_at`, and `rejected_at`; existing delivery/cancellation timestamps remain unchanged.

This phase defines but does not implement later controlled lifecycle transitions.

### Reservation/release evidence

The redemption stores the minimum evidence required by a future cancellation command:

| Column | Meaning |
|---|---|
| `reward_stock_reserved_qty` | `1` only when finite reward stock was decremented; otherwise `0` |
| `reserved_store_stock_id` | Exact finite Store stock row reserved by a Store-product request |
| `store_stock_reserved_qty` | `1` only when that finite Store stock row was decremented |
| `reservations_released_at` | Future exactly-once release marker; null in this request phase |
| `points_refunded_at` | Future refund marker; null in this request phase |

Checks restrict reservation quantities to zero/one and require Store identity and quantity to agree. Unlimited `NULL` stock produces no reservation marker and no stock mutation.

### Fulfillment-order uniqueness

A partial unique index permits at most one `reward_redemption` Store order per non-null `related_redemption_id`. It does not require an order and therefore leaves legitimate historical requested-without-order rows valid.

## RPC contract

```text
public.redeem_moviback_reward(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_reward_id uuid,
  p_store_color_id uuid default null,
  p_store_size_id uuid default null
) returns jsonb
```

The server supplies the authenticated user and a request idempotency key. Browser input cannot supply point cost, inventory, status, QR, fulfillment type, product text, customer snapshot, totals, or order metadata.

### Atomic sequence

1. Validate required identifiers and claim PF-08B0 operation `moviback_redemption`.
2. On matching committed replay, return the stored result without business writes or notification eligibility.
3. Lock the single membership and require `approved`.
4. Lock the active reward and require an explicit supported fulfillment type.
5. For Store products, validate the active product, color, applicable size, and unique exact stock identity; lock the stock row.
6. Calculate authoritative balance while the membership lock serializes competing point spends.
7. Insert the redemption and immutable negative ledger entry.
8. Guardedly decrement finite reward stock and, only for Store products, finite exact Store stock.
9. Create required internal fulfillment order/item for Store-product and custom-physical rewards.
10. Persist the stable business result and commit the idempotency claim in the same transaction.

Any uncaught validation, stock, QR, order/item, constraint, or invariant failure rolls back the claim and all business writes.

## Fulfillment behavior

| Type | Initial state | Reward stock | Store stock | Internal Store order/item | QR deliverable in result |
|---|---|---|---|---|---|
| `service` | `ready` with `ready_at` | Finite decrement | Unchanged | No | Yes |
| `store_product` | `requested` | Finite decrement | Exact finite variant decrement | Yes, linked atomically | No |
| `custom_physical` | `requested` | Finite decrement | Unchanged | Yes, custom item | No |
| `partner` | `requested` | Finite decrement | Unchanged | No | No |

Store-product color is mandatory. Size is mandatory only when the product has active sizes; a null-size product retains exact null-safe stock matching. Variant input on every other fulfillment type is rejected with `PF08_UNEXPECTED_VARIANT`.

Category text has no mutation role. Tests deliberately use a custom physical reward without a Store keyword and a partner reward with a Store keyword to prove explicit classification wins.

## Internal Store records

Store-product and custom-physical requests create a `pending`, points-funded, zero-euro `reward_redemption` order and exactly one item. They retain existing supplier/order infrastructure but are internal fulfillment objects. Notes direct operators to the future **Richieste premio** queue; this migration does not create UI or authorize independent Store-order workflow.

## QR semantics

The RPC generates and stores the existing random 48-character hexadecimal token in the request transaction. The stable replay result returns the same token.

`data.qr_deliverable` is derived from the authoritative initial state: true only for immediately-ready service redemptions and false for the other three types. This is the database/result contract for later route enforcement. The current QR route is intentionally unchanged in this phase.

## Points and inventory

Points are debited immediately using one `redeem` / `reward_redemption` ledger row linked to the new redemption. No debit is deleted or rewritten. Refund remains a future compensating positive ledger action.

Finite reward stock is decremented once for every fulfillment type. Exact finite Store stock is decremented once only for `store_product`. `NULL` remains unlimited. Delivery must not decrement inventory again; future cancellation will use the persisted evidence to restore actual reservations exactly once.

## Idempotency and result

The canonical version-2 intent includes reward, nullable color, and nullable size. PF-08B0 scope remains `(operation, user_id, idempotency_key)`.

- New request: one claim, mutation, stored result, and commit.
- Identical replay: same redemption/QR/result; zero debit, stock, order, or item changes.
- Conflicting reuse: `PF08_IDEMPOTENCY_CONFLICT`; zero second mutation.
- Concurrent same key: unique-claim serialization produces exactly one creator and one replay.
- Failed transaction: its processing claim rolls back and leaves no durable idempotency row.

The stable stored result contains redemption ID, QR token, QR deliverability, status, reward ID, points, fulfillment type, and optional internal order ID.

## Telegram post-commit contract

SQL does not send Telegram. A newly committed result returns:

```text
created = true
replayed = false
should_notify_staff = true
notification = server-oriented context
```

The ephemeral context contains user/reward identifiers, reward name, points, fulfillment type, optional product/variant or fulfillment notes, initial status, required staff action, and whether internal Store handling exists. It avoids embedding customer PII; the future authenticated server route can resolve the customer safely.

An identical replay returns `should_notify_staff=false` and `notification=null`. Failure/rollback returns no successful result. The future route must pass only the new-commit payload to PF-07 after commit. Telegram transport success or failure cannot affect the committed redemption.

## Security

The function is `SECURITY INVOKER`, volatile, parallel-unsafe, and uses fixed `search_path = pg_catalog, public, extensions`. Execute is explicitly revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `postgres` and `service_role`.

The application route remains responsible for signed-session validation and must never accept an arbitrary browser-provided user ID. No route integration is included here.

## Stable errors

The RPC preserves the `PF08_*` family, including malformed request, invalid/ambiguous/unapproved membership, invalid/inactive reward, insufficient points, depleted reward/Store stock, invalid/missing/ambiguous Store variant, invalid Store product, unexpected variant, idempotency conflict/incomplete result, plus `PF08_FULFILLMENT_UNCLASSIFIED` for the new classification gate.

## Deferred work and integration gate

Before route cutover, active rewards must receive reviewed explicit classifications. The reset seed intentionally remains unclassified because seed modification was prohibited and the production classification exercise is separate.

Still deferred:

- request-route integration and PF-07 Telegram sending;
- unified **Richieste premio** UI;
- processing/ready/delivery lifecycle RPCs;
- cancellation, rejection, refund, and reservation-release RPCs;
- generic Store-route restrictions for reward-linked orders;
- production deployment or historical reconciliation.

