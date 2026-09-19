# Phase 1 — Physical fulfillment command architecture

## 1. Status and scope

Phase 1 implements guarded server/database command boundaries for physical fulfillment without redesigning the Ordini Store UI. Validation was performed only against the unlinked local Supabase project on loopback endpoints. No production connection, remote SQL, deployment, real Telegram message, real push notification, or commit was performed.

The resulting operational model is:

```text
STORE order                 MOVIBACK physical redemption
pending/confirmed/supplier  requested/processing
          \                  /
           MARK READY (one transaction)
                    ↓
                  ready
                    ↓
             DELIVER (one transaction)
                    ↓
                delivered
```

For a normal Store order, only `store_orders` changes. For a MoviBack physical order, the linked `store_orders` and `reward_redemptions` rows change in the same PostgreSQL transaction.

## 2. Current unsafe write paths found

| Write path | Previous behavior | Phase 1 result |
|---|---|---|
| `POST /api/admin/store-orders/update-status` | Assigned any raw Store status from any prior status; did not inspect origin or synchronize a redemption | Disabled with HTTP `410`, code `RAW_STATUS_MUTATION_DISABLED`, and the allowed command names |
| `POST /api/admin/store-orders/export-summary` | Selected any pending order and bulk-set it to `confirmed`, including reward fulfillment | Restricted to `order_type = 'catalog'`; reward orders cannot be advanced by export |
| MoviBack lifecycle transition route | Used guarded lifecycle RPCs and synchronized physical readiness/delivery | Preserved; readiness is extended to accept `requested` or `processing`, validate same-state consistency, and create the customer event |
| Staff QR/manual delivery | Uses `deliver_moviback_redemption` | Preserved; the strengthened delivery RPC validates a linked physical order even on terminal replay |
| Smart reward redemption | Atomically debits points, reserves stock and creates linked order | Preserved unchanged |
| Normal Store checkout route | Performs current checkout writes and initial stock decrement | Out of scope; stock timing is preserved |
| MoviBack cancel/reject RPCs | Refund/release only with recorded reservation evidence and guarded order state | Reused by the order cancellation command for MoviBack origin |
| Normal Store cancellation | Previously could be represented by a raw status assignment with no reliable inventory/payment compensation | Explicitly blocked/deferred |

Other audited writers remain outside this change: product administration, paid-state updates, economics/procurement metadata, smart redemption creation, and loyalty administration. None is used to implement the new ready/deliver commands.

## 3. State ownership

- `store_orders` is the operational physical queue for both normal Store purchases and MoviBack physical rewards.
- `reward_redemptions` remains authoritative for points, reward identity, QR/manual credential eligibility, refund/release evidence and reward audit.
- `store_product_stock` remains the physical inventory source. Phase 1 does not change reservation timing.
- `loyalty_transactions` remains the points ledger. Ready and delivery never write it.
- `communications` remains the existing in-app notification feed. Phase 1 adds recipient-scoped event rows instead of creating a second notification system.
- SERVICE rewards remain entirely in the MoviBack lifecycle and never enter the physical order commands.

Origin is determined using the existing reliable pair:

- Store: `order_type = 'catalog'` and `related_redemption_id IS NULL`;
- MoviBack: `order_type = 'reward_redemption'` and a non-null `related_redemption_id`.

The existing partial unique index on `store_orders.related_redemption_id` already enforces at most one linked reward fulfillment order. Commands reject incomplete or contradictory origin/link combinations instead of inferring intent.

## 4. Authoritative command model

Three service-role-only PostgreSQL entry points back three admin-only HTTP endpoints:

| Command | RPC | HTTP endpoint |
|---|---|---|
| Mark ready | `mark_physical_store_order_ready` | `POST /api/admin/store-orders/{id}/ready` |
| Deliver | `deliver_physical_store_order` | `POST /api/admin/store-orders/{id}/deliver` |
| Cancel | `cancel_physical_store_order` | `POST /api/admin/store-orders/{id}/cancel` |

All endpoints require an active admin staff session, a UUID order ID, and a UUID idempotency key. Cancel also requires a non-empty reason. Browser roles have no direct execute grant on the RPCs.

Success returns a stable command projection containing:

```json
{
  "ok": true,
  "created": true,
  "replayed": false,
  "data": {
    "order_id": "uuid",
    "source": "STORE | MOVIBACK",
    "operational_status": "ready | delivered | cancelled",
    "next_allowed_action": "deliver | null",
    "message": "operator-safe text",
    "applied": true
  }
}
```

Blocked requests return a structured HTTP error with a stable code and operator-safe message. Raw PostgreSQL error text is not returned.

## 5. Transaction boundaries

Each RPC invocation is one database transaction. Relevant rows are locked before state mutation.

- MoviBack-origin wrappers delegate to the existing lifecycle functions inside the same transaction, avoiding a second reward/points/stock implementation.
- Store-origin commands lock the order and use the shared `business_operation_idempotency` registry.
- The MoviBack READY lifecycle locks the redemption and linked order, changes both, and inserts the in-app event before commit.
- The MoviBack DELIVER lifecycle locks the redemption and linked order and changes both before commit.
- Any validation, notification insert, or idempotency-finalization failure rolls back the whole database command.

Telegram and web push are not called from these transactions or command routes.

## 6. MARK READY contract

### Store origin

Accepted prior states are `pending`, `confirmed`, and `ordered_to_supplier`. The command writes `status = 'ready'`, preserves an existing `ready_at` or sets it once, and updates `updated_at`.

An already-ready order is a safe no-op. `delivered` and `cancelled` cannot move backward. No redemption, points, stock, MoviBack credential, or MoviBack-ready notification is touched.

### MoviBack origin

The wrapper resolves the unique linked redemption and invokes `ready_moviback_redemption`. The redemption may be `requested` or `processing`; the linked order may be `pending`, `confirmed`, `ordered_to_supplier`, or already `ready` while applying the forward transition. The transaction:

1. locks the redemption and linked order;
2. validates non-legacy fulfillment classification;
3. sets both rows to `ready`;
4. populates `ready_at` once;
5. preserves the existing QR/manual credentials, which become deliverable through the existing status gate;
6. inserts the recipient-scoped reward-ready communication exactly once;
7. commits the idempotency result.

If the redemption is already ready, the command requires the linked order also to be ready and performs no historical notification backfill. A mismatched state returns `PF08_FULFILLMENT_STATE_CONFLICT`.

## 7. DELIVER contract

### Store origin

Only `ready` may advance to `delivered`. Already-delivered is a safe no-op. Earlier, cancelled, or otherwise incompatible states return `PF08_INVALID_STORE_ORDER_TRANSITION`. No points, inventory, reward, or notification rows change.

### MoviBack origin

Only a ready redemption with its linked order also exactly ready can be delivered. The lifecycle RPC updates both rows and their delivery timestamps in one transaction. Already-delivered modern physical rows are accepted only if both records are delivered; a divergent terminal pair is rejected rather than repaired.

Legacy delivered redemption rows with no fulfillment classification retain the pre-existing safe terminal no-op behavior. Delivery does not debit points, change stock, create an in-app ready event, or send Telegram.

## 8. Cancellation findings

### MoviBack origin

The physical order command delegates to `cancel_moviback_redemption`. This preserves the proven PF-08 behavior:

- only eligible active requests can cancel;
- the linked physical order must still be `pending`;
- exactly one refund ledger row is written;
- only reservation quantities recorded on the redemption are released;
- reward and Store stock are restored at most once;
- both order and redemption become cancelled atomically;
- same-key replay returns the committed result without repeating compensation.

Supplier-committed or ready physical fulfillment remains blocked by `PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN`.

### Store origin

Normal Store cancellation is **deferred**. Current order items do not record sufficiently strong stock-reservation provenance, the live checkout path is not yet the transactional checkout RPC, and payment/refund state is external to a safe cancellation aggregate. `cancel_physical_store_order` therefore returns `PF08_STORE_CANCELLATION_DEFERRED` and changes nothing. No stock or payment compensation is guessed.

## 9. Stock and points safety

Phase 1 preserves the existing timing:

- normal Store checkout decrements stock during checkout;
- smart MoviBack redemption decrements its recorded reward quota and exact Store stock reservation during redemption;
- ready and delivery perform zero stock mutations;
- ready and delivery perform zero points mutations;
- cancellation for MoviBack restores only recorded reservation quantities and writes one refund;
- Store cancellation does not run until equivalent provenance exists;
- replay performs no second debit, decrement, refund or release.

The Asciugamano exact variant identity and Tubo Palline stockless behavior remain governed by B2R3 and passed their regression suite.

## 10. Reward-ready notification event

The existing `communications` feed is extended with:

- `recipient_user_id` for a single-user event;
- `event_type` for reusable event classification;
- `event_key` for durable event uniqueness;
- target `user`, constrained to require a recipient;
- a partial unique index on non-null `event_key`;
- an index supporting active recipient feed reads.

On the first successful physical MoviBack transition to ready, the transaction creates:

- title: `Il tuo premio è pronto`;
- body: `Il tuo premio [reward name] è pronto per il ritiro. Apri MoviBack per mostrare il QR o il codice premio.`;
- CTA: `Apri MoviBack`;
- URL: `/moviback`;
- type: `moviback_reward_ready`;
- key: `moviback_reward_ready:{redemption_id}`.

The customer communications route now merges only the authenticated user's recipient-scoped rows into the existing feed. Existing read, dismiss and read-all behavior is reused unchanged.

## 11. Notification idempotency and failure semantics

The unique event key is the database guarantee. The event is inserted only while applying a new forward physical READY transition and uses conflict-safe insertion. Therefore:

- first transition: one event;
- same-key replay: zero additional events;
- a different key against an already-ready aggregate: zero additional events;
- refresh: read only, zero events;
- legacy already-ready reconciliation: zero automatic historical events;
- failed or rolled-back transition: zero committed events.

The required in-app event is part of the business transaction, so the system cannot report a newly applied MoviBack physical READY state without its feed event. This differs intentionally from optional transports.

## 12. Push capability

The repository's current web-push implementation is admin-only (`admin_push_subscriptions` and `sendAdminPushNotification`). There is no audited customer subscription model. Phase 1 therefore does not attempt customer push and sends no real push locally. A later customer-push feature can consume the durable `event_type`/`event_key` pattern asynchronously; provider failure must never reverse readiness.

## 13. Telegram separation

Telegram remains the PF-07 post-commit physical-work alert created only by a newly committed smart redemption. The ready, deliver and cancel routes import no Telegram or post-commit provider helper. READY customer communication is an in-app recipient event, not a staff preparation alert. Ready and delivery therefore schedule zero Telegram messages.

## 14. SERVICE preservation

SERVICE redemption remains immediate-ready with QR/manual credentials, no Store order and no physical ready command/event. The lifecycle ready no-op for an already-ready SERVICE remains valid. B2C10 service/manual-code regression passed.

## 15. Legacy conflict handling

Commands do not auto-reconcile historical rows. The following return controlled conflicts:

- missing reward link on a reward order;
- contradictory Store origin/link fields;
- missing linked physical order;
- null fulfillment type when a non-terminal transition needs classification;
- order and redemption ready/delivered mismatch;
- forward, backward or terminal transition not allowed by the command;
- ambiguous refund/reservation evidence;
- supplier-committed cancellation.

Already-delivered legacy redemption behavior is retained as an idempotent terminal read. No historical ready notification is synthesized.

## 16. Database and schema changes

The additive migration `20260919120000_physical_fulfillment_commands.sql`:

1. extends `communications` for recipient-scoped durable events;
2. adds recipient/event indexes and constraints;
3. extends allowed idempotency operations for Store ready/delivery;
4. replaces the existing ready/deliver lifecycle functions with compatible stricter versions;
5. adds three service-role-only aggregate command RPCs.

No existing table, status, reward credential, stock column, points rule, checkout contract, or one-redemption/one-order index is removed.

## 17. API contract for the future Ordini Store UI

The future UI must create one UUID idempotency key per user intent and call only:

```text
POST /api/admin/store-orders/{orderId}/ready
{ "idempotency_key": "uuid" }

POST /api/admin/store-orders/{orderId}/deliver
{ "idempotency_key": "uuid" }

POST /api/admin/store-orders/{orderId}/cancel
{ "idempotency_key": "uuid", "reason": "..." }
```

It should render `data.operational_status`, `data.source`, `data.next_allowed_action`, and `data.message`. On non-2xx it should render the operator-safe `error` and use `code` for deterministic handling. It must not offer a raw status dropdown.

The existing Ordini Store UI was intentionally not redesigned in this phase. Its legacy raw endpoint is now disabled, so wiring the page to these commands is a required follow-up before staff use the page for transitions.

## 18. Local acceptance evidence

The local target was verified as unlinked (`linked_project: null`) with database/API endpoints on `127.0.0.1`. The CLI's reset command recreated the database but returned before its asynchronous schema initialization was visible; migrations were therefore explicitly applied with `supabase migration up --local`, followed by the synthetic seed. No remote target was used.

Passed checks:

- new Phase 1 SQL: atomic physical ready/delivery, one event, replay, Store isolation, safe cancel and legacy conflict;
- PF-08B2R3: variants, stockless inventory, ambiguity, replay and cancellation;
- PF-08B2L: lifecycle, rollback and authorization regression;
- PF-08B2C10: SERVICE readiness, QR/manual code and delivery;
- B2C11/PF-07 Telegram contract;
- command route and personal-feed contract tests;
- TypeScript;
- production build;
- targeted lint for all new files and the modified command/feed routes;
- `git diff --check`.

No external provider was invoked.

The all-changed-file lint invocation reports eight pre-existing `no-explicit-any` errors in `export-summary/route.ts`; the Phase 1 change in that file adds only the `order_type = 'catalog'` filter and introduces no `any`. Per scope, that unrelated legacy lint debt was not refactored. All other changed/new TypeScript and test files lint cleanly.

## 19. Production rollout plan

Phase 1 is not deployed. A future controlled rollout requires:

1. production backup and reviewed preflight queries;
2. verification that all current communication targets satisfy the new recipient constraint;
3. verification of one-order-per-redemption and origin/link consistency;
4. reviewed migration execution in a controlled window;
5. postflight checks for functions, grants, constraints and indexes;
6. application deployment with the command routes;
7. Ordini Store UI command wiring before staff transition use;
8. controlled Store and MoviBack ready/deliver smoke tests;
9. confirmation that one personal feed event appears and no Telegram is repeated;
10. monitored activation with an immediate rollback plan.

Database migration rollback requires a reviewed forward migration; do not edit or delete the applied migration. Application rollback must not restore the unsafe raw mutation endpoint. If command UI wiring is not ready, keep transitions operationally paused rather than reopening arbitrary status writes.

## 20. Risks and remaining blockers

- Normal Store cancellation remains blocked until checkout records durable reservation provenance and payment/refund policy is defined.
- The current Ordini Store UI still targets the disabled generic endpoint; command-button wiring is deliberately deferred by the no-redesign scope.
- Existing supplier-export semantics for catalog orders still combine CSV generation and a status mutation; this is now origin-safe but remains a separate procurement design concern.
- Customer web push is not supported by the current admin-only subscription schema.
- The in-app event is transactionally durable, but a future optional push worker/outbox requires separate design.
- Production data compatibility and rollout must be rechecked immediately before migration; local synthetic acceptance does not establish production cleanliness.
- Concurrent command behavior inherits the existing lifecycle lock order and idempotency registry. The SQL suites cover replay and invariants; a dedicated multi-session command race harness is still advisable before production.
