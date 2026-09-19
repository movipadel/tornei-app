# Phase 2 — Ordini Store operator UX

## 1. Outcome

The existing **Ordini Store** page is now a mobile-first physical fulfillment queue for normal Store purchases and physical MoviBack rewards. It consumes the guarded Phase 1 commands and no longer calls the disabled raw status endpoint. No new admin section was created.

This work is local-only on branch `main`. It does not deploy, execute remote SQL, change production configuration, send Telegram/push, alter stock semantics, or implement rebranding.

## 2. Previous UX problems

The prior page exposed all six technical Store statuses in dropdowns on both card and modal. It defaulted to all records, mixed completed history with active work, showed supplier selection and payment controls prominently, and used the same commercial presentation for Store and MoviBack orders. It could not evaluate the linked redemption status, so a divergent pair such as Store `delivered` plus redemption `ready` still offered raw state choices that would predictably fail or worsen divergence.

The primary operator surface also included:

- five technical-status filters;
- an additional “closed” concept based on delivery plus payment;
- prominent supplier export;
- payment controls on MoviBack rewards;
- no canonical source badge for normal Store orders;
- newest-first ordering even for work waiting to be prepared;
- technical terms such as `pending`, confirmed and supplier status.

## 3. Simplified visible lifecycle

One shared helper maps backend data to four visible states:

| Visible state | Store technical states | MoviBack aggregate requirement |
|---|---|---|
| Da preparare | `pending`, `confirmed`, `ordered_to_supplier` | Order in a preparation state and redemption `requested` or `processing` |
| Pronto | `ready` | Both order and redemption `ready` |
| Consegnato | `delivered` | Both order and redemption `delivered` |
| Annullato | `cancelled` | Order cancelled and redemption cancelled or rejected |

Any contradictory or unsupported combination maps to **Da verificare**, never to a guessed source/state or active command.

## 4. Source badge model

- **STORE** requires `order_type = catalog` and no redemption link.
- **MOVIBACK** requires `order_type = reward_redemption`, a matching linked redemption, and physical fulfillment type `store_product` or `custom_physical`.
- Any missing/mismatched link, special order, legacy null classification, or linked SERVICE row is **DA VERIFICARE**.

The list API now batches the linked redemption projection (`id`, `status`, `fulfillment_type`) and attaches it to each order. The UI does not infer MoviBack state from an order label alone.

## 5. Card hierarchy

The default card shows only:

1. source badge and operational status;
2. customer;
3. first product/reward and real variant, when present;
4. count of additional items;
5. pickup club and order date;
6. Store euro total or MoviBack points, never both concepts indiscriminately;
7. one primary action.

Customer contacts, identifiers, all line items, payment metadata, notes, and technical conflict fields are in the details modal. MoviBack cards do not show commercial paid controls. Store payment remains available only in the Store details block.

`visibleVariant` renders a custom variant or the real color/size combination. Empty Tubo Palline variant data renders nothing; no “UNICA” or placeholder is fabricated.

## 6. Action model

There is no status dropdown. The one primary action is derived centrally:

- Da preparare → **Segna pronto**;
- Pronto → **Consegna**;
- Consegnato / Annullato / Da verificare → no primary action.

The client creates a UUID idempotency key and calls exactly one command endpoint. Buttons are disabled while the request is running, the list is refreshed from the server after success, and no optimistic status mutation is performed.

## 7. Filters and active queue

The default view is **Da preparare**. Its active items are oldest-first so waiting work rises to the top. Top-level segments are:

- Da preparare;
- Pronti;
- Storico.

Minimal secondary filters are origin (Tutti, Store, MoviBack), pickup club, and customer/product search. Technical status filtering and “Mostra chiusi” were removed.

Conflicts remain visible in Da preparare with a red **Da verificare** state and no mutation action. This makes legacy issues visible without pretending they are actionable fulfillment work.

## 8. History

Only coherent delivered and cancelled aggregates enter Storico. History is newest-first and has no fulfillment or cancellation actions. It retains customer, product, origin, date, final status, and expandable details.

Payment administration for a normal Store order remains in its details modal because it is a separate commercial concern; it does not change the fulfillment status.

## 9. Conflict and legacy handling

The operator sees:

> Ordine da verificare

and:

> Lo stato storico dell'ordine non è coerente. Nessuna modifica è stata eseguita.

No command is offered. The details modal may show the order type and the two technical states for an administrator, but the card never exposes a PF-08 code or database terminology.

The Osimani-type case—Store order `delivered`, redemption `ready`—maps to conflict, stays visible under Da preparare for attention, and offers neither Consegna nor Annulla. The UI does not repair either row.

Server command errors are rendered from the operator-safe Phase 1 message. Technical codes are used only to choose safe handling and are not presented as primary copy.

## 10. Cancellation limitations

The secondary **Annulla** action appears only for a coherent MoviBack order whose Store order is still `pending` and whose redemption remains in preparation. This matches the Phase 1 cancellation transaction's safe stock/refund boundary.

It is hidden for:

- normal Store orders;
- confirmed or supplier-ordered MoviBack fulfillment;
- ready, delivered or cancelled records;
- conflicts and legacy records.

Normal Store cancellation remains a manual/admin exception until checkout records adequate reservation provenance and the payment-refund policy is defined.

## 11. Notification feedback

The UI creates no notification. After a successful MoviBack ready command it checks the authoritative response field `customer_notification_created`. Only when true does it say:

> Premio pronto. Notifica cliente registrata.

This wording confirms durable in-app event registration, not device delivery. Store readiness receives ordinary Store copy. Ready/deliver actions do not send Telegram or push.

## 12. Supplier and accounting details

Supplier export is preserved as a collapsed secondary tool under Da preparare. Selection appears only on normal Store orders with technical status `pending`. The Phase 1 server filter continues to enforce `order_type = catalog`, so a forged selection cannot advance a MoviBack order.

Economics remains a secondary header link for authorized users. Commercial payment state is accessible only in Store details and does not dominate the operational card.

## 13. Mobile behavior

Active work remains card-based with no wide-table dependency. At phone widths:

- KPI cards reduce to two and then one column;
- view segments and filters stack;
- product/date/club metadata becomes one column;
- action buttons become full-width touch targets;
- supplier tools stack;
- the details modal becomes a bottom sheet;
- item rows stack without horizontal overflow.

Primary buttons have a minimum 48-pixel height, while source/status remain at the top of every card.

## 14. API integration and removed legacy usage

The page calls:

```text
POST /api/admin/store-orders/{id}/ready
POST /api/admin/store-orders/{id}/deliver
POST /api/admin/store-orders/{id}/cancel
```

It consumes `source`, `operational_status`, `message`, and `customer_notification_created` from the Phase 1 response. Operational display rules live only in `storeOrderOperational.ts` and are shared by cards, filtering, actions and tests.

No relevant UI code references `/api/admin/store-orders/update-status`. Repository search found no other consumer after this change. The endpoint remains disabled with HTTP 410 as a compatibility guard.

## 15. Local acceptance

The Supabase CLI confirmed loopback-only endpoints and `linked_project: null`. Local SQL regression and contract tests cover:

- physical MoviBack ready/delivery and one durable customer event;
- command replay without duplicate notification, points or stock mutation;
- Asciugamano real variant and ready notification;
- Tubo Palline variantless/stockless behavior and ready notification;
- Store-only ready/delivery with no MoviBack effects;
- SERVICE without a Store order;
- safe MoviBack cancellation and hidden Store cancellation;
- visible lifecycle/source/action mapping;
- delivered/ready conflict with no action;
- coherent terminal rows only in history;
- no legacy endpoint reference;
- Store-only supplier export;
- responsive card contract, TypeScript, build and targeted lint.

No real notification provider is involved.

## 16. Production rollout dependency

Phase 2 depends on the Phase 1 migration and command routes shipping in the same controlled release. Do not deploy the new UI without the command endpoints, and do not deploy Phase 1 alone while the old UI still expects raw mutation.

A future controlled rollout requires:

1. backup and production data preflight;
2. Phase 1 migration and postflight;
3. application deployment containing both Phase 1 and Phase 2;
4. admin authorization smoke;
5. one normal Store and one MoviBack physical preparation/delivery smoke;
6. exact Asciugamano and Tubo presentation checks;
7. customer in-app event verification without duplicate Telegram;
8. Osimani-type conflict fixture verification;
9. mobile/tablet visual smoke;
10. monitored staff activation.

Normal Store cancellation and customer web push remain explicitly outside this release.
