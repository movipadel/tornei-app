# Phase 2B — Supplier Excel Queue

## 1. Business requirement

The Ordini Store operator has only two procurement/fulfillment decisions:

- if an item is already available, use **Segna pronto**;
- otherwise leave the card untouched and periodically use **Genera Excel**.

Every coherent physical Store or MoviBack item that is operationally **Da preparare** and has never been exported is included automatically. Supplier export is not a fulfillment state transition.

## 2. Previous supplier export behavior

`POST /api/admin/store-orders/export-summary` previously accepted browser-selected order IDs, loaded only `catalog` orders in raw `pending` state, generated a CSV, and then updated all selected orders to `confirmed`.

The page stored checkbox selection only in React state. There was no durable export marker, batch identity, or relationship from an exported line to its file. MoviBack physical orders were explicitly excluded.

## 3. Problems removed

- Manual per-order checkbox and transient browser selection.
- Store-only procurement treatment.
- CSV generation followed by a separate status mutation.
- Fulfillment status changes caused by procurement export.
- Repeat inclusion of a line with no immutable export evidence.
- Aggregation keys containing mutable display names when stable IDs exist.

## 4. Eligibility rule

Eligibility is database-owned and requires all of the following:

1. `store_order_items.supplier_export_batch_id IS NULL`.
2. The line has a product ID or a non-empty custom physical product name.
3. The parent order is coherent and operationally **Da preparare**:
   - Store: `order_type = catalog`, no redemption link, order status `pending`, `confirmed`, or `ordered_to_supplier`;
   - MoviBack: `order_type = reward_redemption`, an exact linked redemption, fulfillment `store_product` or `custom_physical`, order status `pending`, `confirmed`, or `ordered_to_supplier`, and redemption status `requested` or `processing`.

Ready, delivered, cancelled, SERVICE, contradictory and malformed records are excluded. Payment mode, points and origin do not influence supplier eligibility.

The displayed count is the sum of eligible line quantities, so “8 articoli” means eight physical units rather than eight orders.

## 5. Export granularity decision

Tracking is at `store_order_items` level.

This is required by current behavior: transactional Store checkout supports multi-item carts, and the existing PF-08B1 tests explicitly create an order with two order lines. Those items can represent different products and variants and therefore independent supplier demand. An order-level marker would incorrectly force every line in a mixed cart into one indivisible inclusion decision.

MoviBack fulfillment currently creates one physical line, but it uses the same item-level model and needs no special case.

## 6. Batch model

The additive migration creates:

- `supplier_export_batches`: immutable batch identity, unique idempotency key, filename/reference, optional creator label, legacy marker and timestamp;
- `store_order_items.supplier_export_batch_id`: nullable foreign key with `ON DELETE RESTRICT`;
- lookup indexes for claimed and unclaimed lines;
- a trigger preventing a non-null batch membership from being cleared or reassigned.

Each exported item belongs to exactly one batch. The batch-to-item relationship is the internal audit trail for the underlying order/customer lines even though the supplier file is aggregated.

## 7. Idempotency and concurrency

`claim_supplier_export_batch(idempotency_key, created_by)` is the only claiming command.

It first replays an existing batch for the same key. For a new key it selects eligible item rows with `FOR UPDATE OF item SKIP LOCKED`, creates a batch only when at least one row was locked, and assigns all locked rows inside the same database transaction.

Consequences:

- two concurrent operators cannot claim the same row;
- no empty batch is created;
- a retry with the same idempotency key returns the same batch and membership;
- file generation happens only after the durable claim;
- if file generation fails, the browser retains the key for retry and regenerates from that exact batch rather than claiming new demand.

The response exposes the batch ID in a header for diagnostics. Batch membership remains authoritative even if the HTTP download fails.

## 8. Excel aggregation

The route reads only lines belonging to the claimed batch and creates an Excel-readable SpreadsheetML `.xls` file with:

- Product;
- Color;
- Size;
- Quantity.

Aggregation uses product, color and size UUIDs when present. Snapshot text is used only where no stable identifier exists, such as a custom physical item. Source, customer, points, order IDs and MoviBack terminology are intentionally absent from the supplier-facing sheet.

Variantless items remain variantless; the export does not fabricate `UNICA` or another size. `Tubo Palline` therefore exports with blank color/size unless authoritative variant data exists.

## 9. Store and MoviBack equality

Coherent Store and physical MoviBack lines are claimed by the same SQL statement, assigned to the same batch and aggregated together. Origin is used only to validate coherence; it does not split batches or worksheet rows.

SERVICE rewards are excluded because their redemption fulfillment type is not physical and they must not have a valid physical Store fulfillment order.

## 10. Ready before export

When the operator has the item locally and uses **Segna pronto** first, the existing Phase 1 command changes the operational state to ready. The item is then ineligible and receives no supplier batch marker.

## 11. Ready after export

An exported line remains **Da preparare**. When goods arrive, **Segna pronto** runs the normal guarded command:

- Store order becomes ready;
- linked physical MoviBack order and redemption become ready together;
- QR/manual code becomes deliverable where applicable;
- the existing customer in-app ready notification is created once.

The historical `supplier_export_batch_id` is unchanged.

## 12. No lifecycle side effects

Supplier export does not update:

- `store_orders.status` or timestamps;
- `reward_redemptions` status or credentials;
- stock or reservation quantities;
- loyalty ledger or point balance;
- customer communications;
- Telegram/push channels.

The route contains no status update and no notification transport. Its only write is the transactional batch claim performed by the RPC.

## 13. Cutover boundary and historical data

The removed checkbox never persisted a flag; it only supplied order IDs to the old route. Therefore it contains no historical data to preserve.

At rollout, every coherent physical Store item already present is treated as historical supplier demand, regardless of whether its order is `pending`, `confirmed`, `ordered_to_supplier`, `ready`, `delivered`, or `cancelled`. Phase 2B assigns all such items to the same internal legacy batch, identified as **LEGACY PRE-CUTOVER 2026-09-19**. This is procurement metadata only: order status, linked redemption status, stock, points, QR/manual credentials, delivery state and communications remain unchanged.

The physical-item definition is deliberately strict:

- the line has a product ID or a non-empty custom physical product name; and
- its parent is either a coherent Store `catalog` order with no redemption link, or a coherent `reward_redemption` order linked to an existing redemption classified as `store_product` or `custom_physical`.

SERVICE rewards and malformed links are excluded. The migration does not create missing Store orders or item rows.

This creates a clean cutover boundary: only coherent physical items created after Phase 2B, still operationally **Da preparare**, and having `supplier_export_batch_id IS NULL` can enter a newly generated supplier Excel. An active legacy order remains in its current operational state and can still progress through **Segna pronto** and **Consegna**, but it can never be exported again.

The old `confirmed` and `ordered_to_supplier` columns/states remain supported by fulfillment logic and are not removed. Future cleanup requires production-data review.

## 14. Local acceptance

Local SQL acceptance covers:

- all pre-cutover coherent physical lines sharing one legacy batch across pending, confirmed, ready, delivered and cancelled states;
- preservation of Store/redemption states, stock, points, credentials and communications during legacy assignment;
- eligible post-cutover pending Store and physical MoviBack lines in one new batch;
- SERVICE and malformed cutover exclusions, plus ready/delivered/cancelled exclusion for post-cutover exports;
- multi-line Store order and item-level membership;
- Asciugamano Sport, Lime / UNICA aggregation;
- variantless Tubo Palline without fabricated variant data;
- immutable membership and second-export exclusion;
- later order entering a later batch;
- ready-before-export exclusion;
- ready-after-export synchronization with preserved history;
- empty export without an empty batch;
- unchanged Store/redemption state during export;
- unchanged stock, points and communications during export.

The separate local concurrency harness runs two simultaneous claims and verifies one winner, one empty result, one membership and same-key replay.

## 15. Production rollout dependency

No production action was performed. Production rollout requires:

1. backup and migration preflight;
2. review counts of all coherent physical lines that will enter the single legacy cutover batch, grouped by origin and lifecycle state;
3. apply the additive migration before deploying the route/UI;
4. verify RPC/table grants for the production service role;
5. deploy application code;
6. smoke-test eligible count, mixed Store/MoviBack Excel content, empty behavior and retry using a controlled account;
7. monitor batch and item membership after the first operator export.

Deploying application code before the migration would make list/export calls fail because the new RPCs and column would not exist.

## 16. Rollback considerations

Application rollback is safe while the additive database objects remain: the prior app ignores the new item column and batch table. Database rollback should not clear or reassign claimed item memberships because that would destroy the “never export twice” guarantee.

If the new UI/route must be disabled, stop application access to **Genera Excel**, retain all batch data, and diagnose before any schema removal. A later cleanup migration may remove unused legacy status semantics only after production history has been reconciled; it is outside Phase 2B.
