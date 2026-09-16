# PF-08B2L — MoviBack redemption lifecycle commands

## Scope

PF-08B2L adds five explicit, server-controlled commands after the PF-08B2 smart-redemption request transaction. It keeps redemption state, ledger, reservation evidence, internal Store fulfillment, QR readiness, timestamps, and idempotency consistent.

This phase does not integrate routes, QR scanning, staff UI, or Telegram. It does not implement supplier exceptions, post-delivery returns, or a generic status setter.

## Migration

`supabase/migrations/20260916200000_pf08_redemption_lifecycle.sql`

Small additive schema changes:

- extends PF-08B0's allowed operation names for five lifecycle boundaries;
- adds `reward_redemptions.terminal_reason` for cancellation/rejection audit context;
- adds a partial unique refund index enforcing at most one `refund` / `reward_redemption` ledger row per redemption.

No earlier migration or seed is changed.

## Explicit RPCs

```text
process_moviback_redemption(actor_id, idempotency_key, redemption_id)
ready_moviback_redemption(actor_id, idempotency_key, redemption_id)
deliver_moviback_redemption(actor_id, idempotency_key, redemption_id)
cancel_moviback_redemption(actor_id, idempotency_key, redemption_id, reason)
reject_moviback_redemption(actor_id, idempotency_key, redemption_id, reason)
```

The authenticated server route will supply the actor. PF-08B0 lifecycle claims are scoped to the redemption owner's `public.users` ID because the shared registry's `user_id` is a foreign key to that table; actor identity is independently stored as `handled_by`.

## Transition matrix

| Command | Allowed source | Target | Same-target behavior | Forbidden examples |
|---|---|---|---|---|
| Process | `requested` | `processing` | Already `processing` returns `applied=false` | Service, ready, delivered, cancelled, rejected, approved |
| Ready | `processing` | `ready` | Already `ready` returns `applied=false` | Requested, delivered, cancelled, rejected, approved |
| Deliver | `ready` | `delivered` | Already `delivered` returns `applied=false` | Requested, processing, cancelled, rejected, approved |
| Cancel | `requested`, `processing`, safe `ready` | `cancelled` | Already `cancelled` returns `applied=false` | Delivered, rejected, approved; supplier-committed physical fulfillment |
| Reject | `requested`, `processing`, safe `ready` | `rejected` | Already `rejected` returns `applied=false` | Delivered, cancelled, approved; supplier-committed physical fulfillment |

Legacy `approved` remains readable but is never a normal command source or target.

## Processing

Processing means a non-service request has been taken in charge.

- locks the redemption;
- requires `requested`, except target-state no-op handling;
- sets `processing_at` once and records `handled_by`;
- leaves points and both inventory layers unchanged;
- leaves the internal order's supplier status unchanged—normally `pending`—so meaningful supplier state is not overwritten;
- returns `qr_deliverable=false`.

New services are immediately ready and cannot be moved backward into processing. A historical requested redemption with no fulfillment snapshot/order can be taken in charge, but later readiness/reversal requires controlled reconciliation rather than guessed fulfillment.

## Ready

Readiness requires `processing`; direct requested-to-ready is not supported. A service created ready resolves safely as an already-applied target state.

For `store_product` and `custom_physical`:

- exactly one linked reward-fulfillment order must exist;
- its state must be `pending`, `confirmed`, `ordered_to_supplier`, or already `ready`;
- the command atomically changes redemption and order to `ready` and sets both readiness timestamps once;
- no points or stock change occurs.

Partner readiness changes only the redemption. A null historical fulfillment snapshot returns `PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN` before readiness is guessed.

The result returns `qr_deliverable=true`.

## Delivery

Delivery is the authoritative handover/erogation action and requires `ready`.

- sets redemption `delivered`, `delivered_at`, and actor;
- for Store/custom physical types, requires the linked order to be exactly `ready` and atomically sets it `delivered`;
- does not debit/refund points or alter inventory;
- returns `qr_deliverable=false`;
- an already-delivered request resolves without repeating effects.

A valid QR token alone is insufficient. The future QR route must call this RPC; requested/processing physical requests cannot skip readiness.

## Cancellation and rejection

Cancellation and rejection have the same economic reversal but retain distinct terminal statuses, timestamps, notes, and idempotency operations.

- `cancelled` represents a legitimate request/operation cancellation;
- `rejected` represents staff/admin refusal before fulfillment completion.

Each command atomically:

1. locks the redemption and checks the transition;
2. requires a non-null smart fulfillment snapshot;
3. locks/checks linked fulfillment;
4. locks the membership to serialize its ledger boundary;
5. proves exactly one original debit of the authoritative point cost;
6. locks reservation rows identified by the smart-redemption snapshot;
7. inserts exactly one positive refund;
8. restores only the finite reward/Store quantities actually reserved;
9. cancels the linked pending order without deleting it/items;
10. writes terminal status, timestamp, actor, reason, refund marker, and release marker;
11. commits the idempotency result.

The original debit and all business history remain immutable.

## Refund contract

Refund ledger rows use existing allowed values:

```text
type   = refund
source = reward_redemption
points_delta = original redemption points_cost
related_redemption_id = redemption ID
```

The partial unique index prevents a second effective refund independently of route/RPC idempotency. `points_refunded_at` records completion. Generic manual adjustment is not used.

## Inventory release contract

Release never infers from current catalog configuration:

- reward stock increases only when `reward_stock_reserved_qty=1`;
- Store stock increases only on `reserved_store_stock_id` when `store_stock_reserved_qty=1`;
- unlimited inventory has quantity zero and is not changed;
- a reserved row that no longer has finite quantity is an invariant error, not a guessed restoration;
- `reservations_released_at` is written in the same transaction as refund and terminal state;
- reservation quantities remain as audit evidence and are not zeroed.

## Store-order synchronization and supplier boundary

| Redemption action/state | Internal reward order behavior |
|---|---|
| Requested | Created `pending` by PF-08B2 where required |
| Processing | Preserve current supplier state; normally remains `pending` |
| Ready | Set `ready` from pending/confirmed/ordered-to-supplier/ready |
| Delivered | Require and atomically change `ready → delivered` |
| Cancelled/rejected | Automatically change only `pending → cancelled` |

Automatic cancel/reject is blocked when a linked order is `confirmed`, `ordered_to_supplier`, or `ready`, returning `PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN`. `delivered` or already-cancelled contradictions return a fulfillment-state conflict. This prevents an automatic refund/restock from claiming that physically committed inventory was recovered.

Service/partner requests without Store orders can be safely cancelled from ready when all other reversal evidence is valid.

## Idempotency

PF-08B0 now permits:

- `moviback_redemption_processing`
- `moviback_redemption_ready`
- `moviback_redemption_delivery`
- `moviback_redemption_cancel`
- `moviback_redemption_reject`

Every command has a separate key. Canonical intent contains schema version, operation, and redemption ID; cancellation/rejection also include normalized reason.

- identical replay returns the committed result without side effects;
- same key with different intent returns `PF08_IDEMPOTENCY_CONFLICT`;
- the redemption row lock protects state even when competing callers use different keys;
- failures roll back their processing claim with all business writes;
- target-state calls under a new key may commit an explicit `applied=false` result without repeating effects.

## Notification result

All five lifecycle commands return:

```text
should_notify_staff = false
notification = null
```

PF-08B2 already alerts staff when the new redemption is committed. No additional ready, delivery, cancellation, or rejection Telegram product requirement has been approved, so this phase does not expand PF-07 behavior. Replays also remain non-notifying.

## Security

Every RPC is `SECURITY INVOKER`, volatile, parallel-unsafe, and uses fixed `search_path = pg_catalog, public, extensions`. Execute is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `postgres` and `service_role`.

The future server route remains responsible for authenticating the actor and authorizing staff/admin scope. No browser-direct RPC execution is permitted.

## Stable lifecycle errors

Key lifecycle errors include:

- `PF08_INVALID_REDEMPTION`
- `PF08_INVALID_REDEMPTION_TRANSITION`
- `PF08_FULFILLMENT_REQUIRED`
- `PF08_FULFILLMENT_STATE_CONFLICT`
- `PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN`
- `PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN`
- `PF08_LEGACY_REVERSAL_REQUIRES_ADMIN`
- `PF08_LEDGER_INVARIANT`
- `PF08_RESERVATION_STATE_CONFLICT`
- `PF08_REVERSAL_STATE_CONFLICT`
- existing PF-08B0 idempotency errors.

## Historical compatibility

- Historical null fulfillment snapshots remain valid.
- A requested orderless legacy redemption can enter processing but cannot be auto-readied or reversed without reviewed fulfillment/reservation evidence.
- Legacy delivered rows are terminal and may resolve delivery as already applied.
- Legacy approved remains readable but cannot participate in the new lifecycle.
- No historical stock, refund, order, or variant is inferred.

## Deferred integration

- Application and QR routes must be updated later to use these commands.
- The unified **Richieste premio** staff UI remains separate work.
- Admin supplier-commit exceptions and post-delivery returns/refunds require their own approved workflow.
- No Telegram/PF-07 code is changed here.

