# Design — Smarter MoviBack fulfillment workflow

## Design objective

Staff should work from one concept:

> **Richieste premio da lavorare**

The UI should not require staff to understand `reward_redemptions`, `store_orders`, `store_order_items`, ledger rows, or the difference between reward and Store status. Those objects may remain internally separate where they provide useful accounting and logistics boundaries.

This document is design-only. It does not authorize schema, RPC, route, data, or UI changes.

## Principles derived from the audit

1. A redemption is the customer-facing root and must always be visible in one staff queue, with or without a Store order.
2. Fulfillment kind must be explicit and authoritative; free-text category names must not control mutations.
3. Point debit/refund, reward reservation/release, Store reservation/release, order state, and redemption state need idempotent transactional commands.
4. A physical reward QR must not be deliverable until fulfillment is ready.
5. One staff action should update all underlying objects required by that action.
6. History should be append-friendly and auditable; refunds should add ledger rows rather than delete debits.
7. Existing requested physical redemptions without orders must remain visible and repairable, not be classified as corrupt.

## Option 1 — Keep the dual-object model and improve the UI

### Model

Retain the current request-time creation and separate state machines. Add cross-links, badges, warnings, and synchronized action buttons to both screens.

### Tradeoffs

| Dimension | Assessment |
|---|---|
| Staff simplicity | Better than today, but staff still chooses between redemption and Store screens |
| User clarity | Can improve status labels, but QR/readiness remains difficult unless behavior also changes |
| DB complexity | Lowest initial change; existing objects remain |
| Migration complexity | Low to medium; add queries/actions rather than rebase the model |
| Risk | Medium: visual improvements can hide rather than eliminate state divergence |
| Current-data compatibility | High; orderless requested rows can be displayed with warnings |
| Store inventory | Current immediate decrement can remain, but explicit reservation semantics are still absent |
| Cancellation/refund | Requires new coupled commands despite otherwise minimal scope |
| Extensibility | Limited by category keywords and duplicated statuses |

This option is the safest short-term UI patch but does not fully remove the operational burden.

## Option 2 — Redemption-first model

### Model

`reward_redemptions` is the staff-facing root. One queue joins optional fulfillment data and classifies each request using an explicit catalog fulfillment policy. Store orders remain internal logistics records for physical rewards.

For physical rewards, the system creates or repairs the Store fulfillment automatically according to policy. Staff never needs to navigate to a separate Store screen for ordinary handling, though specialist/admin views may still exist.

### Tradeoffs

| Dimension | Assessment |
|---|---|
| Staff simplicity | High: one queue and one set of actions |
| User clarity | High: request, processing, ready, delivered/redeemed are coherent |
| DB complexity | Medium: existing tables remain but require a synchronization/command boundary |
| Migration complexity | Medium: explicit fulfillment classification, joined queue, and transition RPCs are needed |
| Risk | Medium and controllable; preserves current roots/FKs while centralizing behavior |
| Current-data compatibility | High: orderless physical requests appear in the queue and can generate/repair fulfillment |
| Store inventory | Can formalize request-time reservation and exactly-once release/consume |
| Cancellation/refund | Central commands can reverse points/reservations and cancel orders together |
| Extensibility | Good: service, physical, and partner handlers can share one request shell |

This option fixes the staff experience without requiring a wholesale replacement of Store logistics.

## Option 3 — Unified fulfillment model

### Model

Introduce a single generalized fulfillment aggregate for every reward request, with typed handlers such as `service`, `store_product`, `partner`, `event_entry`, or future classes. Redemptions, ledger, inventory, and supplier orders become children/integrations of that aggregate.

### Tradeoffs

| Dimension | Assessment |
|---|---|
| Staff simplicity | Potentially highest after completion |
| User clarity | Highest if every request shares one coherent state model |
| DB complexity | Highest; introduces a new aggregate and mapping layer |
| Migration complexity | High; existing redemption/order histories require mapping and compatibility views |
| Risk | High: broad redesign touches catalog, redemption, Store, QR, admin, and reporting |
| Current-data compatibility | Achievable but requires careful migration rules for missing/multiple orders and historical statuses |
| Store inventory | Can be modeled cleanly as reservation/commit/release events |
| Cancellation/refund | Can be first-class across handlers |
| Extensibility | Highest |

This is attractive as a long-term domain model but disproportionate before policies and production categories are confirmed.

## Preferred target: Option 2, redemption-first

Option 2 is the technically safest operational simplification. It preserves proven tables and Store logistics while giving staff a single source of work. It can be introduced incrementally and can later evolve toward Option 3 if the reward catalog grows more diverse.

### Catalog policy

Replace free-text runtime inference with an explicit fulfillment policy on each reward conceptually equivalent to:

```text
fulfillment_kind:
  service
  store_product
  custom_physical
  partner

variant_policy:
  none
  color
  color_and_optional_size

inventory_policy:
  unlimited
  reward_stock
  store_stock
  reward_and_store_stock
```

Exact schema is deferred. The important rule is that category remains presentation/filter metadata, not a mutation switch. Existing `reward_type`, `store_product_id`, and `requires_store_variant` can inform migration but are insufficient alone.

### Ideal staff experience

1. **New request** appears in `/admin/.../reward-requests` regardless of type or order presence.
2. Queue card shows customer, reward, explicit type, requested variant, points, request age, and one human status.
3. System automatically routes the request:
   - service/club: show service instructions and no Store controls;
   - Store product: show product, variant, reserved stock, supplier/order readiness;
   - custom physical: show custom description and sourcing controls;
   - partner: show partner-specific handoff/validation details.
4. Physical request automatically has an internal Store fulfillment record/order when policy requires it. If a historical request lacks one, the card says “Fulfillment da creare” and offers one safe repair action.
5. Staff advances the request with contextual actions rather than raw status selectors:
   - “Prendi in carico”;
   - “Ordina al fornitore” when relevant;
   - “Segna pronto”;
   - “Consegnato / Erogato”;
   - “Rifiuta / Annulla”.
6. Each action runs one transactional command that updates redemption, linked order, timestamps, inventory/reservation, and any ledger reversal required.
7. User sees a single translated status:
   - richiesta ricevuta;
   - in lavorazione;
   - pronta al ritiro / pronta per erogazione;
   - consegnata / erogata;
   - annullata/rifiutata with refund outcome.
8. A physical QR is displayed or accepted only when the request is ready. A service reward may be ready immediately if its policy permits.
9. QR confirmation invokes the same “deliver” command as the staff queue, so it also completes the linked Store order and cannot diverge.

### Internal state approach

The UI should expose one derived business state while internal objects retain appropriate detail:

| Staff-facing state | Service redemption | Physical redemption + order |
|---|---|---|
| New | Redemption requested | Redemption requested; fulfillment/order pending or repair-needed |
| In lavorazione | Optional acceptance/processing marker | Order confirmed/ordered to supplier |
| Pronto | Service ready or immediately fulfillable | Order ready |
| Consegnato / Erogato | Redemption delivered | Redemption delivered and order delivered in one command |
| Rifiutato / Annullato | Redemption terminal plus reversal outcome | Redemption/order terminal plus reversal outcome |

Do not overload the existing unused `approved` state without first defining its meaning. A derived view or explicit fulfillment status may be clearer than pretending the two current enums already form one state machine.

## Inventory timing recommendation

Keep request-time stock protection because it prevents accepting more finite rewards than can be fulfilled, but name and manage it as a **reservation**:

- reward stock is reserved when the request commits;
- exact Store stock is reserved for variant-linked physical rewards;
- delivery consumes/confirms the reservation without a second decrement;
- rejection/cancellation before delivery releases the reservation exactly once;
- unlimited `NULL` inventory remains unaffected.

If the owner instead wants staff approval before reserving, that is a different business policy and requires availability/waitlist behavior. It should be decided before rebuilding PF-08B2.

## Cancellation and reversal model

All reversal actions should be idempotent transactional commands keyed by the redemption and action, not a checklist of manual edits.

### Reject before fulfillment

In one command:

1. require a non-terminal request;
2. mark redemption rejected with actor/reason/time;
3. append one positive refund ledger row linked to the original redemption/debit;
4. release finite reward reservation;
5. release finite Store reservation if present;
6. cancel the internal order if one exists and has not progressed beyond the allowed boundary;
7. invalidate the QR;
8. store reversal result for replay.

### Cancel before delivery

Use the same economic/inventory reversal as rejection, while preserving a distinct cancellation reason and actor. If an order exists, cancellation and redemption transition must be atomic. The order/item should normally remain as audit history rather than be deleted.

### Cancel after Store order creation or supplier submission

The command must inspect order state:

- before supplier commitment: cancel and release/refund automatically;
- after supplier commitment: require admin confirmation and record whether stock/cost is recoverable;
- ready but not handed over: normally return reserved stock and refund;
- already delivered: do not use ordinary cancellation.

### After delivery

Treat this as a return/exception workflow, not a status rewind. Require evidence of physical return or service compensation. Refund points and restore Store stock only when policy and actual return condition permit. The current schema has no explicit return state, so this needs design before implementation.

### Store stock unavailable

The transactional reservation should normally detect this before accepting the request. If an external discrepancy appears later, staff should see one blocked request with choices:

- choose an approved alternative variant (new intent and stock transfer);
- wait for replenishment without a second debit;
- reject/cancel and run the complete refund/release command.

Never leave the customer with a debited, invisible orderless request as the silent fallback.

### Point refunds

- Append a positive ledger transaction; never delete or rewrite the original debit.
- Link the refund to the redemption and original debit where schema permits.
- Enforce at most one effective full refund, or explicitly model partial adjustments.
- Show “rimborsato” in the unified queue and user history.
- Keep generic manual adjustments for exceptional accounting, not normal cancellation.

### Reward and Store stock restoration

- Restore only finite inventory that this redemption actually reserved.
- Restore each inventory layer once and in the same deterministic lock order used at request.
- Do not infer restoration from current catalog fields alone; persist enough reservation snapshot/identity to reverse safely.
- Do not restore after delivery unless a return workflow explicitly authorizes it.

## Existing-data compatibility

The unified queue must be rooted in redemptions, not an inner join to Store orders. This automatically includes:

- service rewards with no order by design;
- the two confirmed requested physical rewards with no order;
- delivered historical redemptions;
- orders/items linked where available.

For an orderless physical request, classification should be `needs_fulfillment_setup`, not `orphan` or `corrupt`. A controlled repair command can create the missing order from authoritative reward/user/variant evidence only when the selected variant is recoverable. The current redemption row does not itself store color/size, so those two production cases may require operational confirmation; do not invent a variant.

Historical contradictory state pairs should be reported for human reconciliation before enforcing synchronization constraints.

## PF-08B2 decision

### Recommendation: REDESIGN

Pause acceptance of the current uncommitted PF-08B2 migration and redesign the redemption transaction around the redemption-first workflow before route integration.

This does **not** mean discarding its technical work. Reuse:

- server-trusted inputs;
- canonical idempotency;
- membership/balance locking;
- reward and exact Store-stock locking;
- atomic debit/redemption/reservation writes;
- QR generation and server-only grants;
- functional, rollback, and concurrency test patterns.

Change the business contract before committing it:

1. replace category substring fulfillment decisions with explicit policy;
2. decide and document whether physical fulfillment is created immediately or during staff acceptance;
3. model stock decrement as a reversible reservation;
4. define the staff-facing state and QR readiness gate;
5. define atomic deliver/reject/cancel/refund/release commands, not request RPC alone;
6. define how orderless historical physical requests enter and are repaired from the unified queue;
7. make reward delivery and linked Store-order delivery one command;
8. remove the generic paid requirement from point-only reward fulfillment unless accounting explicitly needs it.

Committing PF-08B2 exactly as-is would make its immediate-order assumption and category heuristic harder to unwind, while still leaving the main staff problem unresolved. Correcting it merely to reproduce warning-only missing-order behavior would restore a known failure mode. The safer moment to settle the workflow is now, while the migration is local and uncommitted.

## Required decisions before replacement design

1. Confirm the intended fulfillment kind for every active production reward.
2. Confirm reservation timing: request or staff acceptance.
3. Confirm whether custom physical rewards use Store logistics.
4. Confirm who can progress supplier/order states: admin only or staff roles.
5. Confirm cancellation boundaries and supplier-cost policy.
6. Confirm whether points are always fully refunded before delivery.
7. Confirm whether a QR becomes visible at request or only at readiness.
8. Reconcile the two orderless physical requests, including their selected variants if recoverable.
9. Define user-facing status wording and notification events.
10. Define rollout compatibility for current route, PF-08B0 idempotency, existing orders, and uncommitted PF-08B2 tests.

