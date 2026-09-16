# Targeted audit — MoviBack redemption and Store fulfillment

## Audit boundary

This is a read-only code/schema audit. No SQL was executed, no database was contacted or reset, and no source, migration, test, configuration, environment, or existing PF-08B2 artifact was modified.

Evidence was limited to the current reward catalog/redemption routes and pages, Store fulfillment routes/page, QR delivery flow, relevant public-schema definitions, the uncommitted PF-08B2 migration, and existing PF-08 workflow evidence. Production category rows were not queried, so the repository can establish operational classes and literal code conditions but cannot enumerate every category name currently stored in production.

## Executive findings

1. `reward_type` permits `club` and `partner`, but it does not select a workflow. The current admin creation route always writes `club`; `partner` is effectively descriptive/legacy in the inspected application code.
2. There is no authoritative `physical/service/partner` fulfillment field. Runtime behavior is inferred from `store_product_id + requires_store_variant` and free-text category substrings.
3. Every successful request immediately creates a `requested` redemption, debits points, generates a QR, and decrements finite reward stock.
4. A Store order is created immediately only when a required Store variant exists or category text contains one of four Italian/Store keywords.
5. Store-order/item failures are warning-only. The route still returns success after redemption/debit/stock writes, naturally allowing a requested physical redemption with no order or an order with no item.
6. Redemption and Store-order lifecycles are independently managed. No current route synchronizes their states.
7. The only implemented redemption completion transition is QR validation from `requested` directly to `delivered`. Physical fulfillment readiness is not checked.
8. No automatic rejection refund, cancellation refund, reward-stock restoration, Store-stock restoration, or linked-order cancellation exists.
9. PF-08B2 matches normal non-Store and successful Store request paths, but changes physical-reward failure/pending semantics and preserves the underlying dual-state operational ambiguity.

## Evidence map

| Concern | Current implementation |
|---|---|
| User reward catalog and variant selection | `src/app/moviback/premi/page.tsx` |
| Reward/catalog payload | `src/app/api/moviback/rewards/route.ts` |
| Request-time mutation | `src/app/api/moviback/rewards/redeem/route.ts` |
| User redemption/QR list | `src/app/api/moviback/me/route.ts`, `src/app/moviback/page.tsx` |
| QR detail and delivery | `src/app/riscatto-premio/[token]/page.tsx`, `src/app/api/reward-redemptions/[token]/route.ts`, `validate/route.ts` |
| Admin member history | `src/app/admin/moviback/users/[id]/page.tsx`, corresponding API route |
| Store fulfillment queue | `src/app/admin/store-orders/page.tsx`, `src/app/api/admin/store-orders/*` |
| Exit cancellation | `src/app/api/moviback/leave/route.ts` |
| Manual point adjustment | `src/app/api/admin/moviback/users/[id]/adjust-points/route.ts` |
| Catalog/stock administration | MoviBack catalog routes/page and Store product routes/page |
| Tables/status constraints | `supabase/migrations/20260916143214_production_public_baseline.sql` |
| Candidate transactional request | `supabase/migrations/20260916190000_pf08_transactional_redemption.sql` |

## A. Reward classification

### Important modeling fact

`reward_categories` is a configurable list, while `rewards_catalog.category` is plain text rather than a foreign key. The admin UI copies the selected category name into that text field. Category names can therefore be renamed, removed, spelled differently, or vary by case independently of historical rewards.

The request route does not branch on `reward_type`. It branches on:

```text
needsStoreVariant = Boolean(store_product_id) && Boolean(requires_store_variant)

shouldCreateStoreOrder =
  needsStoreVariant
  OR lower(category) contains "abbigliamento"
  OR lower(category) contains "accessori"
  OR lower(category) contains "accessorio"
  OR lower(category) contains "store"
```

Consequently, the meaningful classes are behavioral combinations, not a reliable enumeration of category names.

### Classification matrix

| Operational class | Physical? | Store-linked | Requires variant | Finite reward stock | Store stock | Fulfillment order | Staff action |
|---|---|---:|---:|---:|---:|---:|---|
| Service/club benefit: no required Store variant and no physical keyword | Normally no, but not structurally encoded | Usually no; may accidentally be yes | No | Optional (`NULL` = unlimited) | No | No | Staff/admin scans QR and marks delivered |
| Keyword-classified physical/custom reward: category contains one of the four literals, no required Store variant | Intended yes, inferred from text | May be no or yes | No | Optional | No Store stock validation/decrement | Yes, immediate custom order/item | Admin manages order; staff/admin separately validates QR |
| Variant-linked physical Store reward: product link plus `requires_store_variant=true` | Yes | Yes | Yes: color; size when product has active sizes | Optional | Exact active row required; finite quantity decremented | Yes, immediate linked order/item | Admin manages logistics; staff/admin separately validates QR |
| Product-linked but `requires_store_variant=false`, category has no keyword | Ambiguous/misconfigured | Yes in data, ignored operationally | No | Optional | No | No | Treated like a service QR despite product link |
| Product-linked, `requires_store_variant=false`, category has keyword | Intended physical but weakly modeled | Yes | No | Optional | No | Yes, but item is created as custom with null product/color/size because product is loaded only for the required-variant branch | Admin manages a custom order plus separate QR |
| Partner reward (`reward_type=partner`) | Unknown; orthogonal | Depends on the same fields/text | Depends on the same fields | Optional | Depends on the same fields | Depends on the same keyword/variant predicate | Same workflow as `club`; no partner-specific handler was found |

“Finite reward stock” is not a reward type: every class may independently use a finite integer or unlimited `NULL`. Likewise, a Store stock row may itself be finite or unlimited `NULL`, but it is consulted only in the required-variant class.

## B. Current request-time behavior

### Common path for every reward

1. Signed-cookie user identity is required.
2. A single membership is read and must be `approved`.
3. The reward must exist and be active; finite reward stock must be above zero.
4. Ledger rows are read and summed in application code; balance must cover the catalog point cost.
5. A cryptographic 24-byte random value is encoded as a 48-character hexadecimal QR token.
6. `reward_redemptions` is inserted with authoritative reward/membership/cost and `status=requested`.
7. A linked loyalty row is inserted with `type=redeem`, `source=reward_redemption`, and negative catalog cost.
8. Finite reward stock is overwritten with the previously read value minus one.
9. The route returns the redemption ID/token.

There is no approval step between request and QR visibility. The user's MoviBack page immediately shows every `requested` redemption with a token under “Premi da ritirare”.

### Required Store-variant path

Before the common writes, the route additionally:

- requires a color;
- loads and requires the linked Store product to be active;
- validates that color belongs to the product and is active;
- loads active sizes and requires a size if at least one exists;
- validates the optional size belongs to the product and is active;
- requires exactly one active exact stock identity using nullable-size matching;
- rejects finite Store stock at zero.

After the redemption/debit, finite Store stock is overwritten with the previously read quantity minus one.

### Store-order creation answer

**ONLY UNDER SPECIFIC CONDITIONS.** A `store_order` and `store_order_item` are attempted immediately when either:

1. `store_product_id` is non-null **and** `requires_store_variant=true`; or
2. lowercased category text contains `abbigliamento`, `accessori`, `accessorio`, or `store`.

The immediate order has:

- `status=pending`;
- pickup `CENTALLO`;
- payment `points`;
- zero euros and the reward point cost;
- `order_type=reward_redemption`;
- `related_redemption_id` set;
- customer snapshot and special notes.

Variant-linked rewards produce a product/color/nullable-size item. Keyword-only rewards produce a custom item with null Store references and category text as the custom variant.

### Failure and notification semantics

Order insertion failure is logged and ignored. Item insertion failure is also logged and ignored. Therefore:

- redemption/debit/both prior stock changes can commit with no order;
- an order can commit with no item;
- the HTTP response still reports success;
- Telegram/push notifications are scheduled only when the order header was created, even if item insertion failed;
- non-Store/service rewards produce no request notification.

Stock update errors and affected-row outcomes are likewise ignored in the current route.

## C. Current staff/admin processing flow

### Visibility

| Need | Current location | Capability |
|---|---|---|
| See a member's redemptions | `/admin/moviback/users/[id]` | Read-only list of name, raw status, and points; requires finding/opening a member |
| See physical requests with successfully created orders | `/admin/store-orders` | Global order queue with “Premio MoviBack” badge and items |
| See service requests globally | Not found | No global redemption queue |
| See physical requested redemptions missing an order | Not found | Visible only in individual member history or when customer presents QR |
| Deliver any requested reward | `/riscatto-premio/[token]` | Staff or admin confirms QR and changes redemption directly to delivered |

### Store fulfillment actions

`/admin/store-orders` is admin-only. It lists catalog, special, and reward-redemption orders in one queue. Admin can:

- change any order directly to any allowed status;
- select pending orders and export a supplier CSV, which also changes selected pending orders to `confirmed`;
- independently toggle “paid” after an order is no longer pending;
- inspect customer, item, variant, totals, and special notes.

The page visually badges reward orders, but it does not load the linked redemption and cannot update it. A `staff` role can validate the QR but cannot use these admin-only Store-order endpoints.

### Approval, rejection, cancellation, refund, inventory

- No reward-redemption approval API or admin action was found.
- No admin reward-redemption rejection API or action was found.
- User voluntary MoviBack exit bulk-cancels all `requested` redemptions after suspending membership.
- Exit cancellation does not refund points, restore reward stock, restore Store stock, or cancel linked Store orders.
- Store-order cancellation updates only the order.
- QR delivery updates only the redemption.
- An admin can manually add points from the member detail page, but the adjustment is generic, requires a free-text note, and is not linked to the redemption.
- Reward stock can be edited in catalog administration and Store stock can be rebuilt/edited in Store product administration, but neither is a redemption-aware reversal.

## D. Actual redemption state machine

The schema permits `requested`, `approved`, `delivered`, `cancelled`, and `rejected`. The inspected application implements only these transitions:

```text
new request -> requested
requested --staff/admin QR validation--> delivered
requested --user leaves MoviBack--> cancelled
```

| Transition | Trigger | Redemption writes | Points | Inventory | Store order |
|---|---|---|---|---|---|
| New → `requested` | User redemption route | Insert, requested timestamp default, QR | Immediate debit | Immediate finite reward decrement; finite Store decrement for required variant | Immediate attempt only under fulfillment predicate |
| `requested` → `delivered` | Staff/admin QR confirmation | `status`, `delivered_at`, optional staff `handled_by`, delivery note | None | None | None; no readiness/status check or synchronization |
| `requested` → `cancelled` | User voluntary program exit | `status`, `cancelled_at`, cancellation note | No refund | No restoration | No cancellation/synchronization |

No repository path was found that writes reward-redemption `approved`/`approved_at` or `rejected`. Those are schema possibilities, not current application transitions. QR validation accepts only `requested`, so an externally created `approved` redemption would not be deliverable through the current QR action.

There is no staff action to reverse a delivered reward. There is no transition guard beyond the QR endpoint's requested predicate; the Store order is not considered.

## E. Store-order state machine

The schema and admin selector allow:

```text
pending
confirmed
ordered_to_supplier
ready
delivered
cancelled
```

The request route creates reward orders as `pending`. Supplier-summary export changes selected `pending` orders to `confirmed`. Otherwise the admin selector can set any allowed state from any current state; ordered progression is not enforced. Entering a state stamps its corresponding timestamp, but moving backward does not clear later timestamps.

Payment is a separate boolean. The UI calls an order “Chiuso” only when `status=delivered` and `is_paid=true`. Reward orders already consumed points at redemption time but are created with default `is_paid=false`, so the interface can ask staff to mark a zero-euro, points-paid reward order as paid again.

### Unsynchronized combinations that can exist

| Redemption | Order | Meaning/problem |
|---|---|---|
| `requested` | none | Known legitimate pending request, invisible from Store queue |
| `requested` | `pending/confirmed/ordered_to_supplier/ready` | Normal physical work in progress, but user already sees a deliverable QR |
| `requested` | `delivered` | Logistics says delivered while QR remains active |
| `delivered` | `pending/confirmed/ordered_to_supplier/ready` | QR says handed over while logistics says incomplete |
| `delivered` | `cancelled` | Contradictory terminal outcomes |
| `cancelled` | active or delivered | Program exit cancelled QR but left fulfillment alive |
| any | order header without item | Current item-insert warning path |
| any | `delivered`, `is_paid=false` | Appears operationally open although points were already debited |

Staff/admin must know which object is authoritative in each case; the application does not answer that question.

## F. Two legitimate requested Store rewards without orders

The current code **can naturally produce** `requested + requires_store_variant=true + zero store_orders`:

1. variant/product/stock validation succeeds;
2. redemption and debit are inserted;
3. reward and Store stock decrements are attempted;
4. `store_orders` insertion fails;
5. the route logs a warning, returns success, and leaves the requested redemption active.

This is not hypothetical from control flow: order creation is explicitly non-fatal. The repository alone cannot prove that the two production rows came from this failure branch. Other plausible origins remain legacy/pre-Store integration or manual/imported rows. There is no inspected current supported route that deliberately creates a physical requested redemption first and later creates its Store order, and no repair action exists in the UI. Therefore the rows are legitimate business requests, not corruption, but their exact origin is unresolved without operational history/logs.

## G. PF-08B2 comparison

| Concern | Current route | PF-08B2 | Compatibility |
|---|---|---|---|
| Initial redemption status | `requested` | `requested` | Match |
| Point debit | At request, linked ledger row | At request, same canonical type/source | Match on success; PF is atomic/locked |
| Reward stock | At request, finite decrement; errors ignored | At request, locked guarded decrement | Intended result matches; failure semantics change |
| Store stock | Required-variant only, at request | Same class/timing, locked guarded decrement | Intended result matches; failure semantics change |
| Non-Store order/item | None unless category keyword matches | Same predicate | Match |
| Variant-linked physical order/item | Immediate attempt | Immediate required atomic writes | Happy-path match; warning-only pending-without-order path removed |
| Keyword-only physical item | Custom item with null product/variant IDs | Same custom representation | Match on success |
| QR | 24 random bytes → 48 hex; immediately active while requested | Same format/status | Match; workflow weakness remains |
| Extra variant on non-variant reward | Ignored by route | Rejected | Direct API behavior change; normal UI does not send it |
| Order/item failure | Success can remain with missing fulfillment | Entire request rolls back | Material semantic change for physical rewards |
| Notification | Only after order header; can occur despite missing item | Intended only after full atomic result during future integration | Safer, but not exact failure-path match |
| Cancellation/reversal | Not handled transactionally | Not implemented by B2 | Existing gap remains |
| Redemption/order status synchronization | None | None after request | Existing dual-state gap remains |

### Compatibility verdict

**C — PF-08B2 matches some reward types/paths but not others.**

It is an exact conceptual match for the normal non-Store request and the successful Store happy path, while deliberately changing Store fulfillment failure semantics. It also preserves the current brittle category predicate and does not resolve the dual state machines. At an architectural level, **D is also true of the current application**: it contains multiple, ambiguous operational flows even where PF-08B2 reproduces the request-time result.

## H. Staff friction assessment

| Friction | Severity | Evidence/impact |
|---|---|---|
| No single “reward requests” queue | HIGH | Service requests and physical requests missing orders are absent from Store queue; member history is per-user and read-only |
| One customer request becomes two independently managed objects | HIGH | Redemption and Store order have separate statuses and screens with no synchronization |
| QR is valid immediately for physical rewards | HIGH | Staff can mark delivered before order is confirmed, ready, or even present |
| Cancellation has no refund or stock/order reversal | HIGH | User exit cancels only redemption; points and both inventory layers remain consumed |
| Store order cancellation does not cancel/refund redemption | HIGH | Direct contradictory terminal states are possible |
| QR delivery does not deliver the linked order | HIGH | Admin may need a second manual update and can forget it |
| Current route can create requested physical work without a usable order | HIGH | Warning-only insert; no repair UI or later order-generation route |
| Physical/service classification relies on category words | HIGH | Staff/admin must know that Italian spelling affects order creation; renamed categories can alter behavior |
| Product link without required variant has inconsistent semantics | HIGH | It can be ignored or produce a custom item rather than use the linked product |
| Store screen is admin-only while QR delivery permits staff | MEDIUM | Operational responsibility is split by role and may require handoff |
| Reward orders expose generic “paid” action after points were already debited | MEDIUM | “Delivered + paid” closure model is confusing for point-only reward orders |
| Any Store status can be selected from any state | MEDIUM | No enforced progression; timestamps can contradict current status |
| Supplier export silently changes pending orders to confirmed | MEDIUM | Export is also a workflow mutation, which may surprise staff |
| `approved`/`rejected` redemption statuses exist but have no application flow | MEDIUM | Schema vocabulary suggests actions that staff cannot perform |
| Partner reward type has no partner-specific behavior | MEDIUM | Type communicates a distinction that operations do not implement |
| Refund requires generic manual point adjustment | MEDIUM | Not linked/idempotent to redemption; inventory/order reversal remains separate |
| Admin member view shows raw status only | LOW | Useful for history but not actionable and uses internal status vocabulary |

## Questions not answerable from repository alone

- Complete production category vocabulary and which categories owners intend to be physical/service/partner.
- Whether the two known orderless physical requests came from warning-only failures, legacy deployment timing, import, or manual creation.
- Whether physical stock is intended to be reserved at request, consumed at delivery, or ordered only after staff approval.
- Whether every physical reward should have an order immediately or only after staff accepts it.
- Which role should own supplier processing versus customer handover.
- Whether “approved” should become a real reward lifecycle step.
- Business policy for cancellation after supplier order, readiness, delivery, or physical return.
- Whether reward orders should ever use the generic paid flag.

