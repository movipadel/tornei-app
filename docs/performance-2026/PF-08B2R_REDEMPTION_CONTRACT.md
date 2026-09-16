# PF-08B2R — MoviBack redemption and fulfillment contract

## Status and scope

This document is the definitive business contract for the future PF-08B2 rewrite. It is design-only: it does not authorize a migration, RPC, route integration, data rewrite, or production change. The existing uncommitted PF-08B2 implementation remains technical reference only.

The target is **redemption-first smart fulfillment**. `reward_redemptions` is the business request and staff-facing root. Store orders and items may remain as internal logistics records, but staff must not have to coordinate two independent workflows.

## 1. Explicit fulfillment types

The four proposed types are sufficient for the currently evidenced business cases. Do not add a fifth type until a concrete workflow cannot be represented by these contracts. `PARTNER` means an externally fulfilled entitlement; it is not a generic flag to combine with the internal Store flow. A partner-supplied item managed through MOVIPadel's own physical logistics is `CUSTOM_PHYSICAL`, with partner information as metadata.

Database values should follow the project's lowercase convention: `service`, `store_product`, `custom_physical`, `partner`. The uppercase names below are business labels.

| Type | Physical in MOVIPadel | Variant required | Reward stock | Store stock | Internal Store order | QR/delivery behavior | Staff action | Ready rule |
|---|---|---|---|---|---|---|---|---|
| `SERVICE` | No | No | Yes when finite; `NULL` remains unlimited | No | No | Token exists immediately; request is immediately `ready`; QR/action records erogation | Erogate/deliver; no logistics preparation | Immediately ready in the request transaction |
| `STORE_PRODUCT` | Yes | Yes: active color and size when the product has active sizes | Yes when finite | Yes for the exact active variant when finite | Yes | Token exists, but delivery is rejected until `ready` | Take in charge, supplier/logistics work, mark ready, hand over | Linked internal order is complete and operationally ready |
| `CUSTOM_PHYSICAL` | Yes | No Store variant; the reward must contain adequate fulfillment instructions | Yes when finite | No | Yes, as a custom reward item | Token exists, but delivery is rejected until `ready` | Take in charge, source/prepare, mark ready, hand over | Staff confirms that the custom item is physically available |
| `PARTNER` | No internal physical fulfillment | No Store variant | Yes when finite | No | No | Token exists, but delivery is rejected until partner readiness is recorded | Initiate partner handoff and record confirmation/reference | Partner entitlement, voucher, or confirmation has been obtained |

Rules:

- Category remains presentation/filter metadata and must never choose mutation behavior.
- `reward_type` (`club`/`partner`) is legacy/descriptive and must not override `fulfillment_type`.
- `STORE_PRODUCT` requires an active `store_product_id`; its variant selection is authoritative client intent validated server-side.
- `CUSTOM_PHYSICAL` must not consume Store catalog stock. Its internal order/item is a work record, not proof that a Store SKU was reserved.
- `PARTNER` has no Store order in this contract. If supplier logistics later require a richer integration, design it explicitly rather than overloading Store rows.

## 2. Classification source of truth

The future source of truth is an explicit non-null `rewards_catalog.fulfillment_type`, constrained to the four lowercase values. `store_product_id`, variant configuration, and fulfillment type must form a valid combination; category text must not be a fallback after cutover.

Each new redemption must snapshot its resolved fulfillment type. This prevents later catalog edits from changing how an existing request is processed, cancelled, or refunded.

### Transition strategy

1. Add the field as nullable without changing runtime behavior.
2. Produce a review list for every active reward using current evidence only as a proposed mapping:
   - required Store variant plus valid product link → proposed `store_product`;
   - current physical category heuristic without required Store variant → proposed `custom_physical`;
   - `reward_type=partner` without internal physical logistics → proposed `partner`;
   - remaining clearly non-physical benefits → proposed `service`.
3. Require an administrator/business owner to confirm every active reward. Heuristics are migration suggestions, not authoritative classification.
4. Ambiguous rewards remain unavailable for new redemption and surface as `classification_required`; they must not silently fall back to category matching.
5. After all active rewards are classified and validated, make the catalog field non-null and switch the new RPC to it.
6. Snapshot the type into every new redemption. Historical rows may keep a nullable snapshot and use compatibility classification described below.

During the controlled transition, the old route and the future RPC must not run with different classification rules. Cutover is a release gate: either the legacy route remains active, or the explicit-type RPC and route are enabled together after classification is complete.

## 3. Request transaction

For a new redemption request, the backend performs one atomic, idempotent transaction:

1. Derive the user from the authenticated server session; never trust a browser-selected user.
2. Claim the request idempotency key and validate its canonical intent.
3. Lock and validate the single approved membership.
4. Lock and validate the active reward and its explicit fulfillment configuration.
5. For `STORE_PRODUCT`, validate and lock the active exact variant stock identity.
6. Lock the member's spending boundary and calculate the authoritative ledger balance.
7. Reject insufficient points or unavailable finite inventory before any durable partial result.
8. Insert the redemption with a fulfillment-type snapshot and initial state:
   - `SERVICE` → `ready`;
   - all other types → `requested`.
9. Append one authoritative negative `redeem` ledger row linked to the redemption.
10. Decrement finite reward stock by one. This is the reservation for this redemption.
11. For `STORE_PRODUCT`, decrement finite exact Store stock by one. This is the Store reservation.
12. For `STORE_PRODUCT` and `CUSTOM_PHYSICAL`, create the internal Store order and item atomically. Failure rolls back the complete request.
13. Generate and persist the QR token, but return an explicit `qr_deliverable` flag based on state.
14. Commit the stable result into the idempotency registry.
15. After the database transaction has committed, the server's PF-07 post-commit notification flow sends one Telegram alert for this **new** redemption.

There is no warning-only success for a new physical request. A new request either has all required internal fulfillment data or does not commit.

### Telegram alert contract

Every successfully committed **new** redemption sends one Telegram notification to staff, regardless of whether its fulfillment type is `service`, `store_product`, `custom_physical`, or `partner`.

- Telegram is an alert channel only. It never approves, prepares, delivers, cancels, or otherwise changes a redemption.
- The database transaction, durable idempotency result, points debit, inventory reservation, and internal fulfillment all succeed or roll back independently of Telegram delivery.
- The PF-07 post-commit architecture receives an ephemeral, server-derived alert payload only from the new-commit path. It must send only after the RPC/database call has committed.
- An idempotent replay returns the stored business result without an alert payload and must not create a second Telegram notification.
- A validation failure, rollback, or failed/unfinished request emits no Telegram notification.
- Telegram delivery failure is logged/retried by the notification mechanism where available, but it does not turn the committed request into a failure and must not cause another redemption mutation.

The message uses business language and directs staff to **Richieste premio**. It includes customer, reward, points, fulfillment type, initial operational status, and the next staff action. For `store_product`, it also includes product and selected color/size; for `custom_physical`, the relevant preparation/fulfillment instruction; for `partner`, the partner handoff/reference context when available; and for `service`, an explicit statement that no Store-order handling is required. It must not expose redemption IDs, order IDs, raw statuses, database table names, secrets, or other technical implementation details.

## 4. Point debit contract

Points are debited immediately when the request commits (**Option A**).

This preserves current customer expectations, gives a simple authoritative balance under concurrency, and avoids a separate points-reservation subsystem. A rejected or safely cancelled request receives a compensating positive `refund` ledger entry. The original debit is never edited or deleted.

The UI must state that points are charged on request and automatically returned when a pre-delivery rejection/cancellation is accepted. Only one effective full refund may exist for a redemption.

## 5. Inventory contract

No separate inventory-reservation table is required for the initial redesign. A finite quantity is decremented at request and is **business-reserved** by the redemption. Delivery does not decrement it again.

| Type | Reward catalog stock | Store stock |
|---|---|---|
| `SERVICE` | Decrement finite stock at request; restore on valid pre-delivery reversal | Unchanged |
| `STORE_PRODUCT` | Decrement finite stock at request | Decrement exact finite variant stock at request |
| `CUSTOM_PHYSICAL` | Decrement finite stock at request | Unchanged |
| `PARTNER` | Decrement finite stock at request | Unchanged |

`NULL` continues to mean unlimited and is never decremented/restored. The redemption must persist enough reservation evidence to restore only quantities it actually reserved, even if the catalog or order changes later. Restoration is guarded and exactly once.

## 6. Store-order timing

Choose **Option 3: create internally immediately, hide it from ordinary staff, and manage it automatically**.

This keeps order/item creation in the same transaction as points and stock, gives physical requests a durable logistics record from inception, preserves supplier/reporting compatibility, and eliminates the current missing-order failure window for new requests. Delaying creation until staff processing would require carrying variant/reservation data elsewhere and would reintroduce repair and atomicity gaps.

The unified reward queue is authoritative for reward work. The generic Store-order page may remain an administrator/supplier view, but its reward orders are read-only or action-routed through redemption commands; it must not independently mutate their business status.

## 7. QR contract

Choose **generate the token immediately, but enforce readiness at both presentation and delivery**:

- the stable token is generated in the request transaction and supports idempotent replay;
- the user UI does not render an actionable QR before `ready`;
- the delivery endpoint treats the token only as an identifier and accepts it only when the locked redemption status is `ready`;
- `requested`, `processing`, `cancelled`, `rejected`, and `delivered` cannot be delivered;
- scanning and the queue's deliver action call the same transactional delivery command;
- a successful delivery atomically marks the redemption and any linked internal order delivered.

Generating the token only at readiness would require a second token-creation path and more retry handling without adding meaningful security. Server-side status enforcement is the real authorization boundary.

## 8. Meaning of ready and delivered

`ready` means every prerequisite for immediate handover/erogation is satisfied:

- `SERVICE`: no preparation is required, so it is ready at request;
- `STORE_PRODUCT`: the selected item is physically available for handover and the internal order is ready;
- `CUSTOM_PHYSICAL`: staff has confirmed the custom item is physically available;
- `PARTNER`: the partner entitlement/voucher/confirmation is available and can be issued.

`delivered` means the customer actually received the item, service, or partner entitlement. It is a terminal fulfillment event, not a synonym for supplier order or preparation. For a physical request, redemption delivery and internal-order delivery are one atomic command.

## 9. Cancellation, rejection, and refund

All normal reversals are transactional, idempotent, append-only in the ledger, and preserve order/item history.

| Scenario | Redemption | Points | Reward stock | Store stock | Internal order | QR |
|---|---|---|---|---|---|---|
| User/staff cancellation before processing | `cancelled` | One full compensating refund | Restore finite reservation once | Restore exact finite reservation once | `cancelled` if present | Disabled |
| Rejection | `rejected` | One full compensating refund | Restore once | Restore once | `cancelled` if present | Disabled |
| Cancel after order exists, before supplier commitment | `cancelled` | Full refund | Restore once | Restore once | `cancelled`, rows retained | Disabled |
| Cancel after supplier commitment but before delivery | No automatic transition; admin decision required | Policy decision recorded; normally refund customer if request cannot be fulfilled | Restore only if reservation is released | Restore only when item is recoverable/returned | Cancel/exception outcome recorded | Remains non-deliverable unless restored to valid processing |
| Inventory discrepancy/unavailable | Stay `processing` with blocked reason while resolving; otherwise `rejected`/`cancelled` | No second debit; full refund if terminated | Release on termination | Release/transfer safely on termination or approved variant change | Updated automatically | Disabled until `ready` |
| Delivery failure at final action | Remain `ready` if no handover occurred | No ledger change | No change | No change | Remain `ready` | Still usable for retry unless administratively blocked |
| Post-delivery return/exception | Remains `delivered`; separate exception/return record or audited adjustment | Refund only after explicit admin decision | Restore only if business entitlement is reversed | Restore only after a valid physical return | Preserve delivered history; record exception separately | Cannot deliver again |

An ordinary cancellation may never rewind `delivered`. Supplier-committed cancellations and post-delivery exceptions are admin-only because financial recovery and physical return cannot be inferred from database status alone.

## 10. Existing-data compatibility

The redesign does not require rewriting all historical rows:

- historical delivered/cancelled/rejected rows remain unchanged and are shown with legacy status mapping;
- historical `approved` is displayed as legacy/in-review until reconciled; new code does not create it;
- a requested non-Store redemption remains valid and is classified from a snapshot when present, otherwise from a reviewed compatibility mapping;
- a Store-linked redemption with an order joins that order into the unified queue;
- a requested Store-linked redemption without an order remains a legitimate request and appears as `fulfillment_setup_required`, never as corrupt/orphaned;
- no variant is invented for an orderless historical request. Staff/admin must confirm recoverable variant evidence before a repair command creates fulfillment and reserves any missing Store stock;
- contradictory historical redemption/order states are reported for reconciliation, not silently normalized.

Compatibility reads may use a versioned, explicit mapping table/view or reviewed catalog mapping. They must not reinstate category substring matching as the new mutation source of truth.

## 11. Final target model — unambiguous answers

1. Reward type is classified by explicit catalog `fulfillment_type` and snapshotted on redemption.
2. A request atomically validates membership, points, classification and inventory; writes redemption/debit/reservations; and creates internal physical fulfillment.
3. Points are debited at request.
4. Finite reward stock is decremented/reserved at request.
5. Exact finite Store stock is decremented/reserved at request only for `STORE_PRODUCT`.
6. Internal Store order/item is created at request for `STORE_PRODUCT` and `CUSTOM_PHYSICAL`.
7. A QR token is generated immediately, but is actionable only in `ready`.
8. Staff works one redemption-rooted queue and invokes guarded business actions.
9. Ready means all prerequisites for immediate handover/erogation are satisfied.
10. Delivered means actual customer receipt and atomically completes linked fulfillment.
11. Pre-delivery cancellation terminates the request, refunds points, releases actual reservations once, cancels linked fulfillment, and disables QR.
12. Refund is a positive linked ledger entry; it never deletes or changes the debit.
13. Historical records coexist through nullable snapshots, compatibility mapping, explicit repair states, and no forced history rewrite.
14. Every new committed request creates one post-commit Telegram alert; the application queue remains the authoritative place to process it.
