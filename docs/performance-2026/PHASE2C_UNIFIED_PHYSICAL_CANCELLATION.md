# Phase 2C — Unified physical cancellation

## Status and scope

Phase 2C implements one guarded, whole-order cancellation contract for normal Store orders and physical MoviBack fulfillments. It is local-only and has not been deployed. Service and partner rewards remain outside this command.

## Business rule

An operator must explicitly answer whether the physical goods are available to return to inventory. The client supplies only `reintegrate_stock: true|false`; it cannot supply a product, variant, quantity, points amount, or target status. PostgreSQL resolves those values from the locked order and redemption records.

Cancellation is allowed from the operational **Da preparare** and **Pronto** states. **Consegnato** is protected and returns `PF08_DELIVERED_CANCELLATION_FORBIDDEN` without mutations. Existing malformed or legacy states are not repaired automatically.

## Store cancellation

For a coherent `catalog` order, the transaction locks the order, validates its item rows and exact active stock identities, applies the one whole-order stock decision, and marks the order cancelled. There is intentionally no payment refund: Store payment occurs on delivery.

- Stock **YES** adds each tracked item quantity back exactly once.
- Stock **NO** performs no inventory mutation.
- A product with no active stock identity is treated as non-stock-tracked and does not cause a fabricated stock row.
- Multiple matching stock rows, missing product identity, missing items, conflicts, or delivered state fail atomically.

Store orders remain whole-order only. One YES/NO choice applies to every item quantity; item-level or mixed cancellation is not introduced.

## MoviBack cancellation

For `store_product` and `custom_physical`, the same transaction locks the linked Store order and redemption, verifies ownership and the one-to-one fulfillment link, checks the original redemption debit, and cancels both records consistently.

The exact `points_cost` is always credited back through a provenance-linked `refund` ledger row. This is not an operator choice. Existing uniqueness protection and the guarded transaction prevent a duplicate refund. QR/manual credentials are retained as audit data but cease to be usable because delivery is status-gated and the redemption becomes terminal.

The stock choice controls both reservation layers already recorded by PF-08: reward catalog stock and linked Store variant stock. With **NO**, neither reservation is restored; points are still refunded. No new redemption or synthetic credit is created.

Any active ready communication for that redemption is deactivated. Cancellation creates no Telegram, push, ready event, or new customer cancellation communication.

## Ready, delivered, and replay semantics

Requested/processing pairs and coherent ready/ready pairs may be cancelled. A delivered Store order or delivered redemption is rejected before stock, points, state, or communication changes.

`store_order_cancel` is persisted in `business_operation_idempotency`. Same-key/same-payload retry returns the committed result. Same-key/different-payload fails as an idempotency conflict. A later new key after terminal success observes the stored order decision and cannot reverse it: the first successful YES/NO decision wins. Row locks serialize concurrent attempts.

## Supplier batches

Cancellation before export makes the order ineligible because it is no longer in a preparing state. Cancellation after export never clears or rewrites `store_order_items.supplier_export_batch_id`; historical membership remains immutable and the item cannot enter a later batch. Stock and MoviBack points still follow their normal cancellation rules.

## Non-stock-tracked and named regressions

The tracked Asciugamano path restores its exact selected Store variant only when YES is selected. The variantless/non-stock-tracked Tubo Palline path performs no stock write and creates no stock identity, including when YES is selected. Existing PF-08B2R3 tests remain the canonical variant/stock identity coverage; Phase 2C adds cancellation-specific tracked and stockless assertions.

## Operator UI

`Ordini Store` exposes **Annulla** as a secondary action for coherent Store and physical MoviBack orders in Da preparare or Pronto. The modal shows customer, product, variant when present, and the three explicit choices:

- **Sì, aggiungi allo stock**
- **No, non modificare lo stock**
- **Indietro**

MoviBack additionally states that points are restored automatically. On success the existing reload moves the record from the active view to **Storico / Annullato**, refreshes counts and supplier eligibility, and exposes no further fulfillment action.

The generic MoviBack transition route refuses physical cancel/reject actions with `PHYSICAL_CANCELLATION_USE_STORE_ORDERS`; this prevents bypassing the mandatory stock decision. Non-physical lifecycle behavior is unchanged.

## Local acceptance

The local reset applied the additive migration successfully. Phase 2C integration coverage includes Store pending/ready YES and NO, multi-item quantities, stockless no-op, delivered rejection, MoviBack requested/ready YES and NO, exact single points refund, ready-event deactivation, replay, delivered rejection, and supplier batch preservation. A two-connection concurrency harness verifies that exactly one terminal decision applies and stock follows that first decision.

Existing Phase 1, Phase 2, Phase 2B, PF-08B2R3, PF-08B2L, PF-08B2C10 and PF-08B2C11 suites must remain green before rollout, together with TypeScript, targeted lint, and production build.

## Schema changes

The additive migration:

- admits `store_order_cancel` to the existing idempotency operation registry;
- records the immutable operational decision and audit metadata on `store_orders` (`cancellation_reintegrate_stock`, restoration/decision timestamps, reason, actor);
- adds the five-argument guarded `cancel_physical_store_order` overload;
- grants execution only to `postgres` and `service_role`.

The earlier four-argument RPC symbol remains for rolling-deploy compatibility but now returns the controlled `PF08_STOCK_DECISION_REQUIRED` error. It cannot silently select a stock policy or execute the historical automatic restore. All physical cancellation paths must use the five-argument overload.

## Production rollout dependency

No production action is authorized by this phase. Rollout requires the existing controlled process: backup and preflight, migration application, postflight function/grant/schema verification, application deployment, then authenticated Store and MoviBack smoke tests with both stock choices. The migration must precede the application because the new route supplies the fifth RPC argument and reads the new audit contract.

## Rollback considerations

Application rollback should precede any database rollback. The new columns and overload are additive and can remain safely unused. Do not remove them while a deployed application can call the five-argument RPC. Never attempt to reverse already committed cancellations automatically: stock decisions, ledger refunds, terminal states, and supplier batch history are business records requiring explicit reconciliation.
