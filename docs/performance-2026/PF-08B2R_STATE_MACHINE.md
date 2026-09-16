# PF-08B2R — State machine and lifecycle rules

## Redemption states

The target lifecycle uses exactly six active states:

```text
requested -> processing -> ready -> delivered
    |            |          |
    +------------+----------+-> cancelled
    +------------+----------+-> rejected

service request -> ready -> delivered
```

`cancelled` and `rejected` are terminal pre-delivery outcomes. `delivered` is terminal for the ordinary workflow. Post-delivery returns/exceptions do not rewind this state machine.

| State | Meaning | Allowed previous state | Who enters it | User visibility | Staff visibility | QR |
|---|---|---|---|---|---|---|
| `requested` | Accepted, charged, inventory protected, awaiting work | New request | Backend request transaction | Request received | Actionable queue item | Token retained; not actionable |
| `processing` | A staff/partner/logistics actor is working the request | `requested` | Staff/admin action; backend applies | In lavorazione | Owner, logistics and blockers | Not actionable |
| `ready` | All prerequisites for immediate handover/erogation are satisfied | New `SERVICE` request or `processing` | Backend auto-readies service; staff/admin for others | Ready plus QR | Ready queue | Actionable |
| `delivered` | Customer actually received item/service/entitlement | `ready` | Staff/admin via queue or QR command | Completed | Completed with actor/time | Permanently spent/non-actionable |
| `cancelled` | A valid cancellation ended the request before delivery | `requested`, `processing`, or `ready` within policy boundary | User-triggered backend at safe boundary; staff/admin otherwise | Cancelled and refund outcome | Terminal with reason/reversal evidence | Disabled |
| `rejected` | MOVIPadel declined an unfulfilled request | `requested`, `processing`, or exceptionally `ready` | Admin or explicitly authorized staff | Rejected and refund outcome | Terminal with reason/reversal evidence | Disabled |

The existing `approved` state is not part of the new lifecycle. It remains accepted by compatibility reads until historical rows are reconciled; new commands never write it.

## Allowed transitions and guards

| From | Action | To | Mandatory guards and coupled effects |
|---|---|---|---|
| New | Redeem service | `ready` | Approved membership, active classified reward, points, finite reward stock; debit/reserve/token atomically |
| New | Redeem Store/custom/partner | `requested` | Same plus type-specific validation, Store variant/stock and internal order where applicable |
| `requested` | Take in charge | `processing` | Authorized actor; linked physical fulfillment valid or explicit legacy setup resolved |
| `processing` | Mark ready | `ready` | Type-specific readiness rule satisfied; linked order synchronized |
| `ready` | Deliver/erogate | `delivered` | Authorized actor, QR/action valid, linked fulfillment consistent; atomic order delivery |
| `requested` | Cancel | `cancelled` | Safe cancellation; full refund and actual reservation release exactly once |
| `processing`/`ready` | Cancel | `cancelled` | Policy boundary allows it; supplier-committed cases require admin decision |
| `requested`/`processing`/`ready` | Reject | `rejected` | Authorized reason; full refund/release exactly once; linked order cancelled |

Forbidden transitions include requested/processing directly to delivered, terminal-to-active rewinds, cancelled↔rejected changes, delivery after refund/release, and ordinary cancellation after delivery.

## Internal fulfillment states

For reward-linked internal Store orders, the existing logistics detail may remain:

```text
pending -> confirmed -> ordered_to_supplier -> ready -> delivered
   |          |                 |             |
   +----------+-----------------+-------------+-> cancelled
```

This state is subordinate to the redemption workflow:

| Redemption | Permitted internal order state |
|---|---|
| `requested` | `pending` |
| `processing` | `confirmed` or `ordered_to_supplier` (and transitional `pending` if just claimed) |
| `ready` | `ready` |
| `delivered` | `delivered` |
| `cancelled`/`rejected` | `cancelled` |

Normal staff commands update both objects. Generic Store actions must not create combinations outside this table for reward-linked orders. Historical mismatches are surfaced as exceptions rather than automatically overwritten.

## Type-specific paths

### SERVICE

```text
request + debit + reward reservation -> ready -> erogated/delivered
                                      -> cancelled/rejected + refund/release
```

There is no order or Store stock. Immediate readiness is what distinguishes this type from a service needing external preparation.

### STORE_PRODUCT

```text
request + debit + both reservations + internal order/item
  -> requested -> processing -> ready -> delivered
       |             |           |
       +-------------+-----------+-> cancelled/rejected + refund/releases/order cancel
```

Variant and stock identity are fixed by the request. A variant change is a specific transfer operation: release the old exact reservation and acquire the new one atomically; it is not a free edit.

### CUSTOM_PHYSICAL

```text
request + debit + reward reservation + custom internal order/item
  -> requested -> processing -> ready -> delivered
```

No Store SKU stock is changed. The order is the preparation/supplier work record.

### PARTNER

```text
request + debit + reward reservation
  -> requested -> processing -> ready after external confirmation -> delivered/issued
```

Partner references and evidence belong to fulfillment metadata/audit, not Store orders.

## QR state machine

| Redemption state | Token stored | Shown as actionable | Delivery accepted |
|---|---:|---:|---:|
| `requested` | Yes | No | No |
| `processing` | Yes | No | No |
| `ready` | Yes | Yes | Yes, once |
| `delivered` | Yes for audit | No | No; idempotent identical delivery retry may return prior result |
| `cancelled`/`rejected` | Yes for audit or cryptographically rotated by later policy | No | No |

The endpoint locks the redemption and validates state and actor before any transition. Knowledge of a token is never sufficient to deliver an unready request.

## Reversal invariants

For every redemption:

1. Exactly one request debit exists.
2. At most one effective full refund exists.
3. Each finite reward reservation is released at most once.
4. Each finite Store reservation is released at most once.
5. A refund/release and terminal transition commit together.
6. Delivery and refund are mutually exclusive in the ordinary lifecycle.
7. Order/items and ledger history are retained.
8. Retries return the stored action outcome without repeating effects.

## Failure behavior

- Validation failure before commit: no redemption, debit, stock change, order, or durable idempotency success.
- Internal physical order/item failure: complete request rollback.
- Staff transition prerequisite failure: state remains unchanged.
- Notification failure after commit: business result remains committed and notification retry is separate.
- Delivery-side operational failure before handover: keep `ready`; do not refund or alter stock automatically.
- Invariant mismatch: reject the command with a stable internal error and surface the queue item for admin repair.

## Historical compatibility mapping

| Historical condition | Unified interpretation |
|---|---|
| Requested, non-Store | `requested` or immediately-ready candidate after reviewed classification; do not auto-deliver |
| Requested, Store-linked, no order | `requested` + `fulfillment_setup_required` |
| Requested, Store-linked, order present | Derive work detail from order; redemption remains business state |
| `approved` | Legacy in-review state requiring reconciliation; do not silently rewrite |
| Delivered | Delivered history, regardless of absent newer snapshots |
| Cancelled/rejected | Terminal history; show refund/restoration evidence as known/unknown |
| Redemption/order contradiction | Exception queue requiring human reconciliation |

