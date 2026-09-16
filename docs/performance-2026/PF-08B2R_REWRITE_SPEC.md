# PF-08B2R — PF-08B2 rewrite specification

## Decision

The current uncommitted PF-08B2 must be **redesigned before route integration**. Its concurrency and atomicity foundation is reusable, but its category-driven fulfillment contract and request-only lifecycle are not the target business workflow.

This specification describes future work only. It does not modify the existing migration or tests.

## Keep as-is conceptually

The rewrite should preserve these proven patterns unless implementation review finds a concrete defect:

- server-authenticated, trusted user identity;
- authoritative database lookup of point cost, reward, product, variant, stock and customer data;
- PF-08B0 scoped idempotency claim/replay/conflict protocol;
- canonical request intent containing reward and nullable variant IDs;
- membership locking to serialize point spends with checkout;
- deterministic reward/exact-Store-stock locking;
- guarded finite-stock updates and row-count assertions;
- one database transaction for redemption, ledger, stock, fulfillment and idempotency result;
- rollback on validation, invariant, QR uniqueness, order or item failure;
- cryptographically random QR generation and uniqueness retry;
- stable error codes mapped by the server route;
- server-only function execution with `PUBLIC`, `anon`, and `authenticated` denied;
- no PII in stored idempotency results;
- PF-07 post-commit Telegram notifications for every newly committed redemption, never for replayed, failed, or rolled-back requests;
- transactional and concurrency test structure, forced-failure tests, ACL tests, and rollback assertions.

## Change in the request RPC

### Fulfillment classification

- Remove all category substring checks.
- Load and validate explicit `fulfillment_type`.
- Snapshot the type onto the redemption.
- Reject missing/ambiguous classification with a stable error; never guess at mutation time.
- Enforce compatible combinations, especially `store_product` requiring an active product and a valid selected variant.

### Initial state and QR response

- Create `service` redemptions as `ready`; other types as `requested`.
- Continue generating the token atomically, but return `qr_deliverable` separately.
- Do not treat token existence as readiness.
- The future route/user response must avoid exposing an actionable QR until ready.

### Stock semantics

- Keep immediate guarded decrement of finite reward stock for all types.
- Keep immediate guarded exact Store-stock decrement only for `store_product`.
- Persist whether and which finite quantities were actually reserved so cancellation can restore exactly once.
- Do not touch Store stock for `custom_physical`, `service`, or `partner`.

### Store fulfillment

- Create order/item atomically for `store_product` and `custom_physical` only.
- For `store_product`, store validated product/color/size identity.
- For `custom_physical`, create an explicit custom reward item using structured fulfillment instructions, not category text.
- Create no order for `service` or `partner`.
- Keep the internal order ID in the result when present, but expose it as internal fulfillment metadata rather than a second user workflow.

### Result contract

The stable stored result should minimally include:

```json
{
  "ok": true,
  "data": {
    "id": "redemption-uuid",
    "status": "requested-or-ready",
    "fulfillment_type": "service-or-store_product-or-custom_physical-or-partner",
    "points_cost": 0,
    "qr_token": "stable-token",
    "qr_deliverable": false,
    "store_order_id": "nullable-uuid"
  }
}
```

On replay, return the stored business result with `created=false`, `replayed=true`, and no duplicate notification request. Consider omitting `qr_token` from pre-ready HTTP responses while keeping it in the server-side stored result; route/API compatibility must choose one representation consistently.

### Telegram notification contract

Change the current B2 notification behavior from "only when a fulfillment order exists" to **one staff alert for every newly committed redemption**. The request RPC returns an ephemeral PF-07 notification payload only to the caller that created the committed result; it is not stored in the idempotency result and contains no technical database identifiers.

The post-commit route/service uses that payload to send Telegram after the database call succeeds. Its message includes the customer, reward, points, human fulfillment type, initial operational status, and next action in **Richieste premio**. It adds product/color/size for `store_product`, preparation information for `custom_physical`, partner handoff context when present, and a clear "no Store order handling required" instruction for `service`.

Telegram must not participate in transaction success, state transitions, or queue processing. Sending failure is a notification concern, not a redemption failure. A replay, validation failure, database rollback, or incomplete idempotency claim sends no alert.

## Add lifecycle commands

PF-08B2 cannot be considered complete with only the request RPC. Future implementation needs separate idempotent transactional commands for:

1. take in charge (`requested → processing`);
2. mark ready (`processing → ready`, plus linked-order readiness);
3. final delivery (`ready → delivered`, plus linked-order delivery);
4. reject/cancel/refund/release;
5. legacy fulfillment repair;
6. optionally, atomic variant transfer when a genuine business need is confirmed.

Each command has its own idempotency key. A key is not shared across the whole lifecycle. The canonical hash includes schema version, redemption ID, action, and normalized action-specific intent such as reason or confirmed fulfillment data.

### Idempotency boundaries

| Boundary | Protection required |
|---|---|
| Redemption request | No duplicate redemption, debit, stock decrement, order/item, or Telegram alert |
| Staff processing/readiness | No repeated transition, timestamp, supplier event, or side effect |
| Cancellation/rejection | No duplicate refund, reward restoration, Store restoration, or order cancellation |
| Final delivery | No duplicate delivery event or linked-order transition; identical retry returns prior outcome |

The idempotency registry's operation constraint will need a lifecycle-action value such as `moviback_fulfillment_action`, or separate narrowly named values. Reuse the PF-08B0 protocol rather than one global key.

## Cancellation/refund hooks

The request rewrite must record enough authoritative reservation identity for later reversal. The reversal command must:

- validate the permitted state and supplier boundary;
- lock all relevant rows in deterministic order;
- append a positive `refund` ledger row linked to the redemption;
- restore only finite reward/Store quantities actually reserved by this redemption;
- mark restoration exactly once;
- cancel a linked internal order without deleting it/items;
- transition redemption and stamp actor/reason/time;
- invalidate delivery eligibility;
- commit its idempotency result with all effects.

Post-delivery return/refund is not part of the ordinary cancellation RPC and needs a separately approved exception design.

## Database changes likely required

The smallest target schema still requires additions. Exact DDL and data checks belong to a later implementation phase.

| Change | Classification | Reason |
|---|---|---|
| `rewards_catalog.fulfillment_type` with four-value constraint | **REQUIRED** | Authoritative classification; eliminates category mutation logic |
| `reward_redemptions.fulfillment_type` snapshot, nullable for legacy then required for new writes | **REQUIRED** | Stable lifecycle/reversal semantics after catalog edits |
| Redemption status constraint supporting `processing` and `ready` while retaining legacy `approved` compatibility | **REQUIRED** | Target state machine and non-breaking history |
| `processing_at`, `ready_at`, `rejected_at` timestamps | **REQUIRED** | Auditable transitions not representable by current columns |
| Reservation evidence: whether finite reward stock was reserved, exact Store stock identity/quantity, and release marker/time | **REQUIRED** | Safe exactly-once restoration without inferring from mutable catalog data |
| Exactly-one request debit and at-most-one full refund constraints/indexes per redemption | **REQUIRED**, after compatibility verification | Protect accounting idempotency independent of application code |
| Unique reward-order relationship for new reward fulfillment | **REQUIRED**, after duplicate-data verification | Prevent multiple internal orders for one redemption |
| Extend PF-08B0 operation constraint for fulfillment actions | **REQUIRED** | Idempotent processing, cancellation, and delivery commands |
| Structured fulfillment instructions for custom physical rewards | **REQUIRED** if current description is not approved as authoritative | Avoid using category text as operational input |
| Partner reference/confirmation metadata | **OPTIONAL** initially | Can begin in audited notes; structured fields improve integration later |
| Dedicated fulfillment table/aggregate | **NOT NEEDED** | Existing redemption plus optional internal order supports the selected model |
| Separate inventory reservation table | **NOT NEEDED** | Immediate decrement plus persisted reversal evidence is simpler |
| Separate QR activation column | **NOT NEEDED** | Deliverability derives from locked redemption state |
| Rewrite all historical redemptions | **NOT NEEDED** | Compatibility mapping and nullable snapshots preserve history |
| Duplicate fulfillment-status column | **NOT NEEDED** | Redemption is the business state; Store order retains internal logistics detail |

All unique/check constraints require the already-planned live/staging verification before enforcement. Required means required by the target contract, not safe to deploy without data validation.

## Existing data and rollout

1. Inventory and classify every active reward with business-owner confirmation.
2. Add nullable schema support and compatibility reads without changing history.
3. Report duplicate debit/refund/order relationships and contradictory state pairs.
4. Make the unified queue redemption-rooted and show legacy exceptions explicitly.
5. Rewrite request tests and lifecycle tests against isolated local/staging data.
6. Introduce the new request and lifecycle commands together with the route/UI readiness gate.
7. Prevent generic Store endpoints from independently mutating reward-linked orders.
8. Only after active catalog classification and staging verification, require non-null catalog classification for new/active rewards.

Existing requested Store-linked rows without orders remain valid. They enter `fulfillment_setup_required`; an admin repair command can create fulfillment only after confirming missing variant/reservation facts. There is no bulk fabricated backfill.

## Test rewrite scope

Retain current rollback/concurrency/ACL coverage and change or add cases for:

- all four explicit fulfillment types;
- rejection of missing/invalid/ambiguous classification;
- category rename having no behavioral effect;
- service request created ready and deliverable;
- physical/partner request QR not deliverable before ready;
- Store product exact variant validation and stock reservation;
- custom physical order/item without Store stock mutation;
- partner flow without Store order;
- atomic order/item failure rollback;
- exactly one PF-07 Telegram alert payload for each newly committed redemption across all four fulfillment types;
- no Telegram alert payload for idempotent replay, validation failure, or rollback; Telegram transport failure cannot roll back a committed redemption;
- requested → processing → ready → delivered synchronization;
- forbidden requested → delivered and terminal rewinds;
- cancellation/rejection full refund and both inventory releases exactly once;
- repeated cancellation/delivery action idempotency and conflicting-key behavior;
- supplier-committed cancellation requiring admin decision;
- delivery and cancellation races producing one legal terminal outcome;
- historical requested-without-order compatibility and safe repair;
- linked-order state cannot diverge through reward commands;
- no second notification on replay.

The current tests asserting category-keyword fulfillment must be replaced, not preserved. Tests asserting immediate physical order creation remain conceptually valid for `store_product` and `custom_physical` under explicit classification.

## Out of scope for the rewrite implementation step

- authentication redesign;
- a general fulfillment aggregate/table;
- production history normalization without reviewed reconciliation;
- automatic post-delivery returns/refunds;
- partner API integration;
- route or UI integration before the database contract and tests are approved;
- changes to PF-08B0's core claim/replay algorithm beyond extending allowed operation names.

## Implementation gate

Do not replace the current B2 or integrate routes until:

- active rewards have reviewed fulfillment classifications;
- required schema additions and compatibility rules are approved;
- unique/refund/reservation invariants pass isolated and live read-only checks;
- unified staff roles and supplier-cancellation policy are confirmed;
- request plus lifecycle command tests pass in isolated staging;
- rollback and deployment ordering are documented.
