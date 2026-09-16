# PF-08B2R — Unified staff workflow

## Operating principle

The primary staff experience is one queue named **Richieste premio**. Staff works a customer request, not `reward_redemptions`, `store_orders`, and `store_order_items` separately. Technical records remain linked behind the queue.

The queue is rooted in all redemptions and left-joins optional fulfillment. It must therefore include services, partner rewards, new physical requests, legacy physical requests without orders, and terminal history.

## Queue information

Each row/card shows only operationally useful information:

| Field | Contract |
|---|---|
| Customer | Name plus the minimum contact detail needed for fulfillment |
| Reward | Reward name and concise fulfillment instructions |
| Points | Authoritative points charged; show refunded badge when applicable |
| Fulfillment type | Human label: Servizio, Prodotto Store, Premio fisico personalizzato, Partner |
| Variant | Product/color/size for Store products; `—` otherwise |
| Availability/readiness | Reserved/available, blocked, setup required, or ready; no raw quantity unless useful |
| Requested at | Local date/time and request age |
| Status | One translated redemption state |
| Required action | One contextual next step, never a raw status dropdown |
| Exception | Missing fulfillment, stock discrepancy, supplier commitment, or legacy reconciliation flag |

Filters: actionable, requested, processing, ready, completed, cancelled/rejected, fulfillment type, age, and exception. The default view is actionable oldest-first.

## Staff actions

| Action | Visible when | Normal actor | Result |
|---|---|---|---|
| `PRENDI IN CARICO` | `requested` for Store/custom/partner | Staff or admin | Redemption → `processing`; linked order progresses automatically where applicable |
| `ORDINA AL FORNITORE` | Processing physical request that requires supplier work | Authorized staff or admin by club policy | Keeps redemption `processing`; records supplier progression on internal order |
| `PRONTO` | Processing request with prerequisites satisfied | Staff or admin | Redemption → `ready`; linked order → `ready`; QR becomes actionable |
| `CONSEGNATO / EROGATO` | `ready` | Staff or admin | Redemption → `delivered`; linked order → `delivered`; actor/time recorded |
| `RIFIUTA` | Requested/processing and not delivered | Admin; staff only if explicitly authorized by policy | Redemption → `rejected`; refund/release/order cancellation atomically applied |
| `ANNULLA` | Safe pre-delivery cancellation boundary | Staff/admin; user request may trigger backend when still requested | Redemption → `cancelled`; refund/release/order cancellation atomically applied |
| `CONFIGURA FULFILLMENT` | Legacy physical request lacks recoverable fulfillment | Admin | Collects confirmed variant/custom data, then creates missing fulfillment safely |
| `GESTISCI ECCEZIONE` | Supplier-committed cancellation, contradictory history, post-delivery issue | Admin | Starts explicit exception handling; no automatic destructive rewind |

`SERVICE` requests are created directly as `ready`, so their normal action is `EROGATO`. `PARTNER` uses `PRENDI IN CARICO`, records the external reference/confirmation, then `PRONTO` and `EROGATO`.

## Automatic updates per action

### PRENDI IN CARICO

- lock the redemption and reject stale/terminal state;
- transition `requested → processing` and stamp actor/time;
- for linked physical fulfillment, move the internal order from pending to the appropriate in-progress state;
- do not change points or inventory;
- write/return an idempotent action result.

### ORDINA AL FORNITORE

- require a processing physical request and linked order;
- progress only the internal supplier status and timestamp;
- keep the business redemption state `processing`;
- do not expose or require a separate second queue action.

### PRONTO

- require `processing` except for explicitly auto-ready service requests;
- validate fulfillment prerequisites and linked-order consistency;
- transition redemption to `ready` and stamp readiness actor/time;
- transition the linked order to `ready` in the same transaction;
- make QR presentation and delivery acceptance available;
- do not decrement inventory again.

### CONSEGNATO / EROGATO

- require a locked `ready` redemption;
- transition it to `delivered` and stamp actor/time;
- transition a linked internal order to `delivered` in the same transaction;
- confirm the existing reservations as consumed without another stock mutation;
- make the QR permanently non-reusable;
- return the same result for an identical retry, with no duplicate effects.

### RIFIUTA / ANNULLA

- require a non-delivered, non-terminal redemption and an allowed cancellation boundary;
- lock redemption, membership, reserved inventory identities, linked order, ledger boundary, and idempotency claim in deterministic order;
- append exactly one full positive refund linked to the redemption;
- restore each finite reservation actually made by the request exactly once;
- transition the redemption to `rejected` or `cancelled` with actor, reason, and time;
- cancel the linked order while retaining order/items as audit history;
- disable QR delivery;
- return a stable replay result.

### CONFIGURA FULFILLMENT

- applies only to legacy orderless physical requests;
- never guesses color or size from the current catalog;
- requires administrator-confirmed fulfillment evidence;
- validates current product/variant and stock before reservation;
- creates the linked order/item and records whether Store stock was newly reserved;
- leaves the request in `requested` or moves it to `processing` according to the explicit admin action;
- if safe repair is impossible, offers rejection/cancellation with refund rather than silent partial data.

## Role boundaries

### Staff

- view the unified queue for their authorized operational scope;
- take requests in charge;
- progress ordinary supplier/logistics work when club policy allows;
- mark ready;
- deliver/erogate via queue or QR;
- perform safe, policy-authorized pre-commitment cancellation with a required reason.

### Admin

- all staff actions;
- classify and configure reward fulfillment policy;
- reject requests;
- repair legacy missing fulfillment;
- resolve supplier-committed cancellations, contradictory history, returns, and accounting/inventory exceptions;
- access specialist Store/supplier reporting without independently changing reward business state.

### Automated backend

- derive authenticated actor and enforce role/scope;
- validate transitions and prerequisites;
- synchronize redemption and internal-order state;
- debit/refund points and reserve/release stock transactionally;
- enforce idempotency and exactly-once effects;
- determine QR deliverability;
- create notifications only after successful commits;
- surface invariant failures for intervention instead of silently succeeding.

Authentication itself is unchanged. The target minimizes privilege fragmentation by permitting ordinary staff to complete the normal lifecycle while reserving classification and exception decisions for admins.

## User experience

The user sees one request status:

- `Richiesta ricevuta`
- `In lavorazione`
- `Pronta` (with actionable QR)
- `Consegnata / erogata`
- `Annullata — punti rimborsati`
- `Rifiutata — punti rimborsati`

Before `ready`, the UI may show a request reference but not an actionable QR. A cancellation request can complete automatically only while the redemption is still at the safe pre-processing boundary; otherwise it becomes a staff/admin decision without promising an immediate refund.

## Operational safeguards

- No raw Store-order status selector for reward orders.
- No manual “paid” requirement for points-only reward fulfillment.
- No QR transition directly from requested to delivered.
- No independent Store delivery after redemption delivery or vice versa.
- No generic manual points adjustment as the normal refund path.
- No category-name inference in the queue or mutation commands.
- Every failure is either a full rollback or an explicit blocked/exception state.

