# Store / Premi MoviBack / Ordini Store — deep architecture and UX audit

## 1. Executive summary

The desired three-area split is sound, but the current implementation has two competing operational surfaces and two independently writable physical state machines.

- **Store** correctly owns catalog, variants, prices and the shared physical stock table. Normal checkout currently creates Store orders, but the live route still uses a non-transactional multi-call implementation even though an atomic checkout RPC exists.
- **Premi MoviBack** correctly owns reward identity, point cost, point debit, classification, credentials and SERVICE fulfillment. For `store_product`, the smart RPC also atomically reserves Store stock and creates a linked Store order.
- **Ordini Store** already contains both normal Store orders and MoviBack physical orders. However, its generic status endpoint can directly assign any Store status—including reward-linked orders—without validating transitions or synchronizing `reward_redemptions`.
- **Richieste premio** is a second operational queue. Its lifecycle RPCs update redemption state and, at readiness/delivery/cancellation, also update the linked Store order. This is technically safer than Ordini Store but duplicates the physical operator workflow.

The repository-confirmed split-brain is:

```text
Ordini Store generic action ──> store_orders only
Richieste premio / QR action ─> reward_redemptions + linked store_orders
```

That split explains the reported Osimani case. A generic Store action can make the linked order `delivered` while the redemption remains `ready`. A later MoviBack delivery command requires the order to be exactly `ready`, so it rejects with `PF08_FULFILLMENT_STATE_CONFLICT`, exposed as “Stato ordine non compatibile con questa azione”.

### Recommendation

Adopt the **hybrid aggregate model (Option C)**:

1. `store_orders` is the authoritative operational state for every physical fulfillment, whether origin is STORE or MOVIBACK.
2. `reward_redemptions` remains authoritative for reward identity, points, SERVICE lifecycle, QR/manual credentials, cancellation/refund evidence and terminal reward audit.
3. During a safe compatibility period, physical redemption status remains a projection synchronized in the same database transaction as its linked order. It is never independently changed by UI routes.
4. The existing **Ordini Store** becomes the only physical work queue. **Richieste premio** remains the reward/service/exception view and does not offer duplicate physical preparation actions.
5. The operator sees only **Da preparare → Pronto → Consegnato**, plus **Annullato** when safe. `confirmed`, `ordered_to_supplier` and redemption `processing` may remain internal procurement/audit detail but should not be primary workflow states.

This gives one operational truth without requiring an immediate destructive schema rewrite.

## 2. Audit scope and evidence

Reviewed evidence includes:

- Store customer and admin pages and their route handlers;
- MoviBack catalog, redemption, customer-history, staff queue and delivery routes;
- Ordini Store list, status, paid-state and supplier-export routes;
- PF-08 baseline, idempotency, checkout, smart-redemption, lifecycle, variant-stock and manual-code migrations;
- PF-08 functional, concurrency and route-contract tests;
- PF-08 architecture, lifecycle, rollout and acceptance documentation.

The audit is static/local only. `npx supabase status` reported `linked_project: null`, but the local database container was not running, so no additional live metadata query was executed. No production system, remote SQL, environment value, Telegram endpoint or deployment target was touched.

The working tree already contained uncommitted PF-08B2C11 notification changes before this audit. Current-code observations include that worktree state; this audit adds only this document.

## 3. Current Store architecture

### Catalog and product management

`store_categories` and `store_lines` classify products. `store_products` owns commercial name, description, euro/point base prices, accepted payment modes, activity and display order. `store_product_colors` and `store_product_sizes` define selectable dimensions. `store_product_stock` represents an exact product/color/nullable-size identity; `stock_qty NULL` means untracked/unlimited.

The admin product UI writes through `/api/admin/store/products`. Creation performs separate product, color, size and stock inserts. Editing updates the product, then deletes all stock, sizes and colors and reinserts them. This edit is not one transaction and can be blocked by historical item/reservation foreign keys. It also changes variant IDs, so it is unsuitable as a safe “edit in place” model for referenced inventory.

The customer catalog route performs three sequential top-level reads—categories, lines and products with nested colors/sizes/stock—then filters and sorts nested data in application code. Products without an active color are hidden.

### Normal Store checkout

The customer page builds a local cart and calls `POST /api/store/orders`. Normal euro orders require only the authenticated user. Point and mixed orders additionally require an approved MoviBack membership.

The current route:

1. reads the user;
2. optionally reads membership and the full point ledger;
3. for each cart line sequentially reads product, color, optional size and stock;
4. inserts `store_orders`;
5. inserts `store_order_items`;
6. optionally inserts a loyalty debit;
7. updates each finite stock row separately;
8. schedules email, Telegram and push after database work.

Failure compensation only deletes the order in selected cases. Stock updates are unchecked, the route has no request idempotency key, and retries can create duplicate orders/notifications. The atomic `checkout_store_order` RPC exists and is tested, but the repository explicitly documents that route integration was deferred and the current route does not call it.

### Current Store ownership versus desired ownership

Current Store code owns product data, stock mutation, commercial orders, Store point-spend calculation and direct loyalty-ledger writes. It should continue to own catalog, variants, stock and commercial order intent. The loyalty subsystem should own point authorization/debit/refund, invoked transactionally by checkout rather than reimplemented in the Store route.

Normal Store orders exist without MoviBack: euro checkout does not require membership. Point/mixed Store payments are a current cross-domain coupling that needs an explicit product decision, not silent removal.

## 4. Current Premi MoviBack architecture

### Reward catalog and classification

`rewards_catalog` owns reward name, description, point cost, active state, optional reward-level stock, `fulfillment_type`, optional `store_product_id` and `requires_store_variant`. The admin API validates active rewards as follows:

- `service`: no Store product or Store variant selection;
- `store_product`: requires an active linked Store product and coherent active stock identities;
- active `custom_physical` and `partner`: currently rejected by the admin contract because required metadata/workflow is not implemented.

For `store_product`, customer variant options are derived from the linked Store product and its available stock identities. The reward point cost remains independent of the Store product euro/point price.

### Smart redemption transaction

`redeem_moviback_reward` is the current atomic path when the smart flag is enabled. It locks membership, reward and relevant stock; validates classification and variants; computes the ledger balance; then atomically:

- creates `reward_redemptions`;
- writes exactly one point debit by intended contract;
- decrements finite reward-level stock;
- decrements finite Store variant stock;
- creates one linked `store_orders` row and one item for physical Store/custom rewards;
- commits an idempotency result.

SERVICE begins `ready` and has no Store order. Other supported classes begin `requested`. QR and manual-code values are created/stored with the redemption but are exposed only while status is `ready`.

### Important current coupling

A `store_product` reward can decrement both `rewards_catalog.stock_qty` and `store_product_stock.stock_qty`. These can represent two legitimate concepts only if the first is explicitly a campaign/redemption quota. Today both are named and presented as “stock”, creating double-inventory semantics and operator ambiguity.

The route still contains a feature-flagged legacy fallback. If smart redemption is disabled in production, that fallback uses category-name inference, sequential writes, best-effort Store-order creation, no idempotency registry and different SERVICE behavior. It is a material regression path and should be retired after rollback strategy no longer depends on it.

### Telegram

In the current worktree, a new committed `store_product` result schedules one physical preparation Telegram through PF-07 `after()`. SERVICE schedules no preparation Telegram, and replay schedules none. Telegram is post-commit and non-authoritative. The existing generic admin push contract remains separate.

## 5. Current Ordini Store architecture

`/admin/store-orders` reads all `store_orders` with all item columns, sorted newest first. It can therefore display:

- `catalog`: normal Store customer orders;
- `reward_redemption`: MoviBack physical fulfillment;
- `special`: special orders represented in the main table.

The schema also contains `store_special_orders`, supplier batches and order economics structures; these are accounting/procurement concerns and are not a coherent part of the primary fulfillment state machine in the reviewed UI.

### Current actions

- A status dropdown exposes every Store status on every card and modal.
- `/api/admin/store-orders/update-status` directly assigns the requested status and timestamp. It does not load the current row, enforce a transition graph, detect zero-row updates, inspect `order_type`, call a lifecycle RPC, or synchronize a redemption.
- “Pagato” is independently toggled for every non-pending order, including point-only MoviBack orders.
- Pending orders can be selected for supplier CSV export. The export does not filter `order_type`; it bulk-updates all selected pending orders to `confirmed`, including reward-linked orders, without changing redemption state.
- “Closed” means `delivered && is_paid`. A delivered MoviBack points order normally remains unpaid, so it remains in the default active list.

Technically, the page exposes existing data and supports procurement. Operationally, it asks staff to understand `pending`, `confirmed`, `ordered_to_supplier`, `ready`, `delivered`, payment state, supplier export state and the separate MoviBack state machine.

## 6. Domain model map

| Object | Responsibility / owner | Writers | Readers | Key relations and invariants |
|---|---|---|---|---|
| `store_categories`, `store_lines` | Store taxonomy | Admin Store APIs | Store catalog/admin | Products reference category and optional line |
| `store_products` | Commercial product master | Admin Store APIs | Store, rewards, economics | Reward may link with `ON DELETE SET NULL` |
| `store_product_colors`, `store_product_sizes` | Product variant dimensions | Admin Store APIs | Store/reward selectors, order snapshots | Product-owned; historical order items reference IDs |
| `store_product_stock` | Physical inventory identity and quantity | Admin Store; Store checkout; MoviBack redeem/reversal | Store/reward availability | Exact product/color/size; nullable size complicates uniqueness; `NULL` quantity means unlimited |
| `store_orders` | Commercial order or physical work record | Store checkout; MoviBack RPC; admin status/export; lifecycle RPCs | Ordini Store, economics, reward queue, staff delivery | `order_type`; optional redemption FK; one indexed reward order per redemption |
| `store_order_items` | Immutable order-line snapshot plus live product/variant FKs | Checkout/redemption | Order UI, supplier export, queue | Quantity positive; lacks explicit stock reservation provenance for normal checkout |
| `store_order_economics`, product costs, supplier fields | Accounting/procurement | Economics/admin APIs | Economics and supplier reporting | Orthogonal to customer fulfillment but displayed near operational workflow |
| `rewards_catalog` | Reward identity, point cost and fulfillment policy | MoviBack admin APIs; redeem/reversal adjusts optional quantity | Customer/admin reward catalog | Optional Store-product FK; fulfillment type nullable for legacy |
| `reward_redemptions` | Reward transaction, credentials and lifecycle | Redeem/lifecycle RPCs; legacy route | Customer, Richieste premio, QR/staff | Membership/reward FKs; credential uniqueness; physical order link is reverse from order |
| `loyalty_memberships` | MoviBack eligibility | Membership/admin flows | Checkout/redemption/queues | Multiple rows per user remain schema-possible; RPC rejects ambiguity |
| `loyalty_transactions` | Authoritative point ledger | Store route/RPC, reward RPCs, staff/admin adjustments | Balance calculations, audits | Redemption link has no FK shown in baseline; refund has a partial unique index; debit uniqueness is not schema-enforced |
| `business_operation_idempotency` | Exactly-once operation registry | PF-08 RPCs | PF-08 RPCs | Unique operation/user/key and committed-result invariant |

All relevant tables have RLS enabled. Most Store tables have no browser policy in the baseline; server routes use the service-role client after cookie guards. Admin Store routes require admin. The MoviBack staff queue and lifecycle route permit admin or staff.

## 7. Current state machines

### A. Store order

Declared states:

```text
pending | confirmed | ordered_to_supplier | ready | delivered | cancelled
```

The generic API does not implement a true state machine: any state can be assigned from any other state, including backwards movement and terminal rewinds. It stamps the destination timestamp but does not clear conflicting historical timestamps.

Observed triggers:

| Transition | Trigger | Effects | Idempotency / reversibility |
|---|---|---|---|
| New → `pending` | Normal checkout or physical redemption | Order/items created; stock already decremented | Normal route not idempotent; reward RPC idempotent |
| `pending` → `confirmed` | Supplier CSV export or dropdown | Order timestamp only | Export not operation-idempotent; arbitrary reversal possible |
| Any → any Store state | Status dropdown | Order row only | No transition guard; reversible even from terminal |
| Physical linked order → `ready` | MoviBack ready RPC | Order and redemption updated atomically | Idempotent command |
| Physical linked `ready` → `delivered` | MoviBack delivery/QR RPC | Order and redemption updated atomically | Idempotent command |
| Linked `pending` → `cancelled` | MoviBack cancel/reject RPC | Order, redemption, points and reservations updated atomically | Idempotent; committed supplier states blocked |

Normal Store cancellation currently changes only status. It does not restore stock or Store point spend.

### B. MoviBack redemption

Modern states are `requested`, `processing`, `ready`, `delivered`, `cancelled`, `rejected`; legacy `approved` remains accepted by the schema.

```text
physical: requested -> processing -> ready -> delivered
              \          \          \
               +----------+-----------> cancelled/rejected (guarded)

service: ready -> delivered
```

- `process`: updates only the redemption. A linked order normally remains `pending`.
- `ready`: requires redemption `processing`; linked physical order may be pending/confirmed/ordered/ready and is forced to `ready` atomically.
- `deliver`: requires redemption `ready`; linked physical order must be exactly `ready`, then both become delivered.
- `cancel`/`reject`: allow active redemption states but require a linked physical order to be `pending`. Confirmed/ordered/ready means supplier commitment and is blocked; delivered/cancelled is a state conflict. On success, exactly one refund is appended and recorded reservations are restored.
- Repeating the same command key returns its stored result. Already-terminal same-state branches generally do not revalidate the linked order, so pre-existing divergence can persist.

### C. SERVICE

```text
redeem atomically
  -> points debit
  -> reward reservation if finite
  -> redemption ready + credentials
  -> deliver/erogate
  -> redemption delivered
```

No Store order or Store stock is involved in the smart flow. Cancellation/rejection before delivery refunds points and releases reward-level reservation. The legacy fallback does not preserve these semantics and is therefore a rollback hazard.

### D. Physical MoviBack

```text
redeem atomically
  -> debit points
  -> reserve/decrement reward quota if finite
  -> reserve/decrement exact Store stock if finite
  -> create redemption(requested)
  -> create Store order(pending) + item snapshot
  -> process redemption
  -> ready both records
  -> deliver both records
```

The workflow is safe only when all mutations use MoviBack lifecycle RPCs. Generic Ordini Store mutations bypass the aggregate.

## 8. Ownership matrix: current and target

| Business concern | Current truth | Target truth |
|---|---|---|
| Product/catalog/price/variant | Store tables | Store tables |
| Physical stock | `store_product_stock`, mutated by two modules | Store inventory service/table; mutation only through transactional reservation commands |
| Reward identity/point cost | `rewards_catalog` | `rewards_catalog` |
| Reward quota | Ambiguous `rewards_catalog.stock_qty` | Explicit optional redemption quota, renamed/presented separately from physical stock |
| Commercial order | `store_orders` | `store_orders` |
| Point balance/debit/refund | Ledger, written by several flows | Loyalty ledger through one transactional command boundary |
| Physical preparation | Both order and redemption statuses | Store order operational status |
| Physical ready-for-pickup | Duplicated `ready` | Store order authoritative; redemption projection/derived credential gate |
| Physical delivery | Duplicated `delivered` | One aggregate command; order operational truth plus redemption terminal audit |
| Service readiness/delivery | Redemption | Redemption |
| Cancellation | Generic Store status or MoviBack reversal | Origin-aware transactional command with explicit financial/inventory policy |
| Customer physical status | Redemption API | Derived from linked order plus terminal redemption outcome |
| QR/manual availability | Redemption status | Redemption credential policy derived from authoritative readiness |
| Telegram work request | Redemption route | Post-commit event pointing to filtered Ordini Store physical queue |

## 9. Duplicated responsibilities

`requested` versus `pending` are the same accepted physical task in different tables. `processing` versus `confirmed/ordered_to_supplier` overlap but are not exact: redemption processing is customer-facing progress, while supplier states are procurement detail. `ready` and `delivered` are direct duplicates. `cancelled` is duplicated but has radically different effects depending on which API writes it.

The useful distinction is:

- **Operational fulfillment:** da preparare, ready, handed over—owned by Store order for physical goods.
- **Procurement detail:** supplier confirmation/order—internal metadata under “Da preparare”.
- **Reward financial/credential state:** debit, refund, QR eligibility, terminal audit—owned by MoviBack.

The current UI exposes all three layers as if they were peer states.

## 10. State divergence matrix

| Redemption | Store order | Classification | Reason / treatment |
|---|---|---|---|
| requested | pending | Valid modern initial | Atomic smart redemption result |
| processing | pending | Valid but operationally transitional | Current process RPC changes only redemption |
| processing | confirmed / ordered | Valid | Work active; supplier detail differs |
| ready | ready | Valid | Credentials actionable |
| delivered | delivered | Valid terminal | Aligned success |
| cancelled/rejected | cancelled | Valid terminal | Aligned reversal |
| requested | confirmed / ordered | Ambiguous | Can result from supplier export/direct Store action before process |
| requested/processing | ready | Invalid by intended model | Generic Store action bypassed redemption |
| requested/processing | delivered | Invalid | Physical handover recorded without reward completion |
| ready | pending/confirmed/ordered | Invalid/legacy | Readiness duplicated but order not aligned |
| ready | delivered | Invalid; Osimani pattern | Delivery command will reject because order is not `ready` |
| delivered | pending/confirmed/ordered/ready | Invalid | Current delivered replay does not repair order |
| cancelled/rejected | active or delivered | Invalid | Refund/terminal truth conflicts with active/fulfilled physical work |
| active physical redemption | no order | Legacy-valid only / setup exception | Modern smart RPC makes this impossible on successful commit |
| STORE catalog/special order | no redemption | Valid | Normal Store concern |
| reward-redemption order | no redemption link | Invalid malformed fulfillment | Schema does not require the link by order type |
| fulfillment type NULL | any | Legacy/ambiguous | Automated lifecycle actions intentionally blocked |
| approved redemption | any | Legacy/ambiguous | Accepted by schema, not written by modern commands |

## 11. Osimani case analysis

The observed combination is redemption `ready` plus linked Store order `delivered`. The most direct repository-supported causes are the unrestricted Store status endpoint or another direct Store update; supplier export similarly changes reward orders without redemption synchronization, although it moves to `confirmed` rather than delivered.

When staff presses **Consegnato** in Richieste premio or uses QR/manual delivery, the route calls `deliver_moviback_redemption`. The RPC locks the ready redemption, loads the linked reward order, and explicitly requires `v_order.status = 'ready'`. Because the order is already `delivered`, it raises `PF08_FULFILLMENT_STATE_CONFLICT`; the route maps this to “Stato ordine non compatibile con questa azione”.

Today there is no global authority: the safe lifecycle RPC treats redemption as the command entry state and the order as a mandatory consistency precondition, while Ordini Store can independently overwrite the order. This is why staff sees a business action that appears redundant yet fails technically.

For reviewed historical rows where a delivered Store order is reliable evidence of actual handover, reconciliation should mark the redemption delivered without changing points or stock. That must be a one-time audited repair after excluding refunded/cancelled conflicts—not a runtime rule that blindly trusts every legacy Store status.

## 12. Stock ownership analysis

Stock is consumed at acceptance, not at readiness/delivery:

- normal Store checkout decrements `store_product_stock` after creating order/items;
- smart physical redemption decrements the exact Store stock row inside the redemption transaction;
- physical cancellation/rejection restores only the reservation quantities recorded on `reward_redemptions`;
- delivery never decrements again.

This reservation-at-checkout model is appropriate, but ownership is fragmented. Normal Store order items do not record the exact reserved stock row or release timestamp, and generic cancellation does not restore inventory. MoviBack records one exact reservation on the redemption and reverses it safely.

Target: Store inventory remains authoritative, but every stock mutation must occur through an idempotent transaction that records reservation provenance. For multi-line normal Store orders, each item needs exact reserved-stock identity, reserved quantity and release evidence. MoviBack should request Store inventory reservation inside its transaction; it should not maintain an independent physical quantity. If reward-level stock is retained, call it `redemption_quota` and treat it as a distinct campaign cap.

## 13. Telegram role

Telegram must remain a one-shot, post-commit attention signal—not a workflow, state store or action surface.

- New physical MoviBack redemption: one work request.
- SERVICE: no preparation alert.
- Replay, readiness, processing, delivery and reconciliation: no repeat of the original alert.
- Transport failure: no business rollback.

Under the target architecture, the alert should deep-link or clearly direct staff to the **MOVIBACK / Da preparare** filter in Ordini Store. The authoritative task must be the linked Store order. It should not direct physical preparation to a competing queue.

## 14. Current Ordini Store UX problems

1. Every card exposes a raw status selector instead of one safe next action.
2. English/technical labels such as “Pending” and “Fornitore” are primary statuses.
3. Any transition or terminal rewind appears possible.
4. The source badge exists only for MoviBack/special orders; normal STORE origin is implicit.
5. Reward orders show `€0.00` prominently while points are secondary.
6. Point-only reward orders expose a meaningless “Pagato” checkbox.
7. Delivered reward orders remain in the active list because “closed” requires `is_paid`.
8. Supplier-export selection includes every pending order, including MoviBack rewards, and silently changes status.
9. Search, club, raw status, show-closed, KPIs, payment, supplier export and economics compete with the core fulfillment task.
10. The same status control appears on both card and modal.
11. Customer contact and technical detail dominate before the product/variant task.
12. Physical MoviBack work also appears in Richieste premio with separate actions, so staff must know which surface is safe.

## 15. UX simplification opportunities

- Collapse `pending`, `confirmed` and `ordered_to_supplier` into the visible state **Da preparare**.
- Keep supplier progression in an expandable “Approvvigionamento” detail only when required.
- Replace dropdowns with one contextual primary action: **Segna pronto**, then **Consegna**.
- Show **Annulla** as a secondary guarded action only while policy permits.
- Always display an origin badge: **STORE** or **MOVIBACK**.
- Default to active work; move delivered/cancelled into History.
- For MOVIBACK show points and reward name; hide payment controls.
- For STORE show price/payment; keep accounting controls outside the fulfillment card.
- Do not expose IDs until detail expansion.
- Remove duplicate physical actions from Richieste premio.

## 16. Architecture options

| Option | Clarity | Implementation/migration | Risk | UX/maintenance | Assessment |
|---|---|---|---|---|---|
| A. Keep two full state machines and synchronize strictly | Medium | Medium-high; every writer must update both | High long-term drift risk | Operator can be shielded, but domain remains duplicated | Compatible with PF-08 but preserves core complexity |
| B. Store order fully authoritative; derive all physical redemption status at read time | Very high | High; APIs, schema, QR rules and historical reads change | Medium-high migration risk | Best final simplicity | Strong destination, too abrupt as first change |
| C. Store order operational authority plus transactional redemption projection | High | Medium; reuse PF-08 RPCs and columns | Lowest practical migration risk | One operator truth; compatibility retained | **Recommended** |

Option C can later evolve into B after evidence shows the physical projection is no longer independently consumed.

## 17. Recommended target architecture

```text
STORE
  catalog + variants + price + inventory
       │
       ├─ normal purchase ───────────────┐
       │                                ▼
PREMI MOVIBACK                    STORE ORDER aggregate
  reward + points + classification ── physical work
       │                                │
       ├─ SERVICE -> redemption only    ▼
       └─ STORE_PRODUCT -> redemption + linked order
                                        │
                                        ▼
                              ORDINI STORE (one queue)
```

Commands must be origin-aware:

- normal Store command updates order, inventory reversal and Store payment/point effects;
- MoviBack physical command updates order and redemption projection/credentials atomically;
- SERVICE command updates redemption only.

No generic API may directly set arbitrary status on a reward-linked order.

## 18. Target Store lifecycle

Visible workflow:

```text
DA PREPARARE -> PRONTO -> CONSEGNATO
      |
      +-> ANNULLATO (when safe)
```

At checkout, stock is reserved/decremented atomically and reservation provenance is recorded. “Pronto” and “Consegnato” do not touch stock again. Cancellation restores only unreleased recorded reservations and, if applicable, performs an idempotent point refund. Procurement fields may record confirmed/supplier-ordered milestones without changing the primary operator state.

## 19. Target MoviBack physical lifecycle

1. Validate membership, reward, mapping and exact Store variant.
2. Debit points and reserve explicit reward quota if any.
3. Reserve Store inventory.
4. Create redemption and one linked Store order/item atomically.
5. Show the order in Ordini Store as **MOVIBACK · Da preparare**.
6. Operator selects **Segna pronto**; one command makes order ready and redemption credentials actionable.
7. Operator/customer completes handover by button, QR or manual code; one command finalizes both.
8. Cancellation uses one guarded aggregate command and exactly-once refund/release.

The physical redemption projection is not directly editable.

## 20. Target SERVICE lifecycle

```text
redeem -> ready immediately -> QR/manual available -> erogato/delivered
```

No Store order, physical queue, Store stock, supplier state or preparation Telegram. SERVICE remains in the MoviBack/service queue and scanner flow.

## 21. Target Ordini Store workflow

Default view: active physical work, oldest actionable first.

- **Da preparare:** primary action `Segna pronto`.
- **Pronto:** primary action `Consegna` or scan credential for MoviBack.
- **Consegnato/Annullato:** history only.
- Supplier detail is secondary and does not require a customer-visible “In lavorazione” state.

Smallest useful filters:

- origin: Tutti / Store / MoviBack;
- work status: Da preparare / Pronti;
- separate History: Consegnati / Annullati, with date range/search;
- optional club filter only if operators truly manage multiple pickup locations.

## 22. Synchronization rules

1. One physical MoviBack redemption has exactly one linked reward order.
2. A reward order cannot exist without `related_redemption_id`; non-reward orders cannot carry it.
3. Only aggregate RPCs may transition reward-linked orders.
4. Order ready and redemption credential readiness commit together.
5. Order delivered and redemption delivered commit together.
6. Cancellation/refund/inventory release/order cancellation commit together.
7. All commands are idempotent and validate current state under row locks.
8. Direct admin repair is a separate audited exception command, never the ordinary status route.
9. Reconciliation never sends a “new request” Telegram.
10. Reads surface mismatch as an exception until repaired; they never silently invent financial or stock effects.

## 23. Legacy reconciliation strategy

| Category | Target action | Points / stock | Credentials / Telegram |
|---|---|---|---|
| Order delivered; redemption active | If delivery evidence is trusted and no refund exists, mark redemption delivered | No change | Hide credentials by terminal status; no Telegram |
| Both active and compatible | Normalize visible state from order; preserve timestamps/evidence | No change | Availability follows normalized ready state; no Telegram |
| Redemption delivered; order active | If redemption delivery evidence is trusted, mark order delivered; otherwise manual review | No change | Already non-actionable; no Telegram |
| Active physical redemption without order | Create fulfillment only from verified historical variant/reservation evidence; otherwise exception/cancel path | Never decrement again without proof; refund only through audited reversal | Preserve credentials; no Telegram |
| Store order without redemption | Catalog/special is valid; reward-type orphan requires link repair or exception classification | No automatic financial/stock change | No Telegram |
| `fulfillment_type NULL` | Classify from verified business evidence, not category guessing | No change | Keep automated actions blocked until classified |
| Historical SERVICE | Classify SERVICE; remove/ignore erroneous Store coupling only after review | No Store stock change | Ready/delivered from evidence; no preparation Telegram |
| Modern aligned | No change | No change | No change |

Additional conflict rule: any delivered order paired with a refunded/cancelled redemption is not auto-reconciled. It requires human review because physical delivery and financial reversal conflict.

Reconciliation should run in dry-run/report mode first, snapshot affected IDs/states/ledger/reservations, apply bounded idempotent batches, and produce before/after evidence.

## 24. Likely schema changes

Subject to live-data preflight:

- enforce reward-order link semantics with CHECK constraints around `order_type` and `related_redemption_id`;
- retain/verify the partial unique one-order-per-redemption index;
- add an explicit operational origin/source projection if `order_type` cannot cleanly serve UI semantics;
- add normal Store item reservation provenance: reserved stock row, quantity and release timestamp;
- add a Store-order relation on loyalty transactions for exact debit/refund audit and uniqueness;
- add unique partial protection for one reward debit per redemption;
- clarify `rewards_catalog.stock_qty` as a distinct reward quota or remove it for Store-product rewards after migration;
- enforce non-negative finite stock and null-safe stock identity only after compatibility queries;
- consider a lifecycle event/audit table for actor, command, from/to state and idempotency key;
- keep existing physical status columns during compatibility, but prevent direct writes outside controlled functions.

A new section/table is not required for the operator queue. A view or server query can project unified cards from existing orders, items and optional redemption/reward data.

## 25. UI redesign

### Information hierarchy

Primary card content: origin, customer, product, variant, age/date, one status and one action. Secondary drawer: phone/email, pickup club, price or points, reward name, supplier detail, payment/economics, IDs and timestamps.

### Source presentation

- **STORE:** show commercial total/payment in secondary summary.
- **MOVIBACK:** show reward name and points; never show “Pagato”.

### History

Use a separate History tab rather than “show closed”. History defaults to a recent date window and contains delivered/cancelled orders. It should not compete with today’s work or inflate active KPIs.

## 26. Textual wireframes

### Active queue

```text
ORDINI STORE
[Da preparare  8] [Pronti  3] [Storico]

Origine: [Tutti] [Store] [MoviBack]      [Cerca]

[MOVIBACK]  DA PREPARARE                  18 min
Mario Rossi
Asciugamano — Grigio · UNICA
500 punti · Ritiro Centallo
                              [SEGNA PRONTO]
                              [Dettagli ▾]

[STORE]     PRONTO                         ieri
Laura Bianchi
Felpa — Blu · M
€45,00 · Ritiro Saluzzo
                              [CONSEGNA]
                              [Dettagli ▾]
```

### Expanded MOVIBACK order

```text
Premio: Asciugamano MoviBack
Punti: 500
Contatto: ...
Riferimento richiesta: ...
Approvvigionamento: non richiesto / dettagli secondari
Azioni secondarie: [Annulla richiesta] (solo se consentito)
```

### Expanded STORE order

```text
Totale: €45,00      Pagamento: da incassare
Contatto / club / note
Approvvigionamento e costi (se autorizzato)
Riferimento ordine: ...
```

### History

```text
STORICO
[Consegnati] [Annullati]  [Ultimi 30 giorni] [Cerca]
Rows are read-only; exception repair is an admin-only explicit flow.
```

## 27. Implementation phases

### Phase 1 — Normalize command boundary

- Code: introduce origin-aware Store-order command service/RPC; block generic reward-order status writes and supplier-export mutation.
- DB: additive constraints/audit fields only after preflight.
- Tests: transition matrix, authorization, idempotency, direct-write rejection.
- Rollback: feature flag routes to read-only old UI; do not restore unsafe direct reward mutations.

### Phase 2 — Synchronize aggregate and integrate checkout RPC

- Code: integrate `checkout_store_order`; make physical ready/deliver/cancel use one aggregate command; preserve scanner adapters.
- DB: reservation provenance and Store-order ledger link.
- Tests: concurrency, points, stock, multi-item cancellation, notification isolation.
- Rollback: retain old reads; commands revert only if schema remains backward-compatible.

### Phase 3 — Legacy reconciliation

- Code/DB: dry-run classifier, explicit repair commands, immutable audit output.
- Tests: every divergence category, rerun safety, no duplicate ledger/stock/Telegram.
- Rollback: pre-batch backup plus inverse state plan; never blindly reverse delivered/refunded conflicts.

### Phase 4 — Simplify existing Ordini Store UI

- Code: source/status filters, active/history split, one contextual action, detail drawer; remove physical actions from Richieste premio.
- DB: normally none; use a projection/view only if justified.
- Tests: mobile/tablet usability, keyboard/accessibility, source-specific fields, stale-action handling.
- Rollback: UI flag; underlying command boundary remains safe.

### Phase 5 — Controlled production cutover

- Preflight: backup, counts, divergence report, constraints, flags and credentials.
- Deploy: DB additions, command adapters, app with guarded flags, reconciliation, then UI.
- Smoke: normal Store, MoviBack variant/variantless, SERVICE, ready/delivery, cancellation, replay, Telegram and history.
- Rollback: flags off, app rollback, no destructive schema reversal during incident response.

## 28. Test strategy

- Contract tests for origin-aware cards and available actions.
- SQL transition tests for every allowed/forbidden state pair.
- Concurrency tests for last stock unit, duplicate checkout/redemption, ready-vs-cancel and deliver-vs-cancel.
- Ledger assertions: one debit, at most one refund, correct Store-order relation.
- Inventory assertions: one reservation and at most one release per item/redemption.
- Divergence tests including Osimani `ready/delivered` and terminal mismatches.
- Authorization tests for admin/staff/customer boundaries.
- QR/manual tests: visible/accepted only when authoritative state is ready; terminal credentials unusable.
- Notification tests: one new physical alert; none for SERVICE/replay/transitions/reconciliation; provider failure safe.
- UI tests on mobile/tablet for one-action cards, origin filters, history and stale command responses.
- Full Store, MoviBack, staff scanner, economics and supplier-export regressions.

## 29. Rollback strategy

Rollback must separate code rollback from data rollback. Additive schema should remain during app rollback. State/ledger/stock changes must never be reversed from timestamps alone.

Before each production batch:

- capture order/redemption/item/ledger/reservation snapshots;
- record exact IDs and expected before-state;
- use idempotent repair keys;
- stop on any count mismatch;
- disable new command/UI flags before rolling application code back.

Do not restore the generic reward-order status endpoint as an emergency workflow. If the new command path fails, make physical mutations temporarily unavailable and retain read-only operational visibility.

## 30. Risks and open questions

### Principal risks

- Unrestricted current Store status writes can create new divergence until blocked.
- Supplier export can silently mutate MoviBack orders.
- Normal Store checkout remains non-atomic and non-idempotent despite the available RPC.
- Normal Store cancellation has no stock/point reversal provenance.
- Reward quota and Store stock can look like duplicate inventory.
- Legacy fallback redemption can reintroduce category inference and partial writes.
- Product variant replacement can conflict with historical references/reservations.
- Existing reconciliation evidence may be insufficient to distinguish actual handover from an accidental direct status change.

### Open questions requiring owner/live evidence

1. Should normal Store purchases continue to support MoviBack points and mixed payments?
2. Is `rewards_catalog.stock_qty` a deliberate redemption quota distinct from physical inventory?
3. Is supplier ordering operationally needed for all physical items, or only selected products?
4. Which historical actor/action made each delivered Store order authoritative enough for automated reconciliation?
5. Are payment/economics responsibilities handled by the same operator as physical fulfillment?
6. Should staff (not only admin) operate Ordini Store after unification, and with which club scope?
7. What is the approved cancellation boundary after supplier commitment for normal Store and MoviBack orders?
8. Are `custom_physical` and `partner` planned for activation, and where should their non-Store fulfillment live?
9. Can legacy `approved` redemptions be mapped from audit evidence, or must they remain exception rows?
10. Are there external consumers that depend directly on physical `reward_redemptions.status`?
11. Does production contain reward-type Store orders with missing links, duplicate debits, or undocumented direct updates?
12. What retention and operator-access policy applies to customer contact, QR/manual references and lifecycle audit history?

No implementation, migration, data reconciliation or production approval is part of this audit.
