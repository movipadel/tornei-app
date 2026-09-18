# PF-08B2C5 — Smart redemption route integration

## Status and safety boundary

PF-08B2C5 is implemented and locally validated. No production system, remote Supabase project, deployment, production environment, or prior migration was changed. Database execution was restricted to the verified unlinked local endpoint `127.0.0.1:54322/postgres`.

## Legacy path versus smart path

| Concern | Legacy path | Smart path |
|---|---|---|
| Entry | `POST /api/moviback/rewards/redeem` | Same stable endpoint |
| Authentication | Signed user session cookie | Same signed user session cookie; authoritative `uid` passed server-side |
| Membership | Route query and status check | Locked and validated inside `redeem_moviback_reward` |
| Points | Route loads every ledger row and sums in JavaScript | RPC validates and debits atomically |
| Reward/Store stock | Route reads then updates independently | RPC locks, validates, and reserves/decrements atomically |
| Variant | Route validates product/color/size/stock through separate queries | Client sends authoritative `color_id`/`size_id`; RPC remains authoritative |
| Redemption/ledger | Independent inserts with a compensating redemption delete | One transaction |
| Store fulfillment | Category/name heuristic and independent order/item inserts | Classification-driven, atomic RPC inserts |
| QR | Random route token exposed while `requested` | RPC token is exposed only when status is `ready` |
| Telegram | Sent only after some legacy Store orders | Every newly committed type uses RPC notification context post-commit |
| Retry | No durable operation identity | Browser intent UUID plus database idempotency registry |
| Partial success | Possible after debit, catalog decrement, Store writes, or notification preparation | Transaction rollback leaves no partial database result; notification cannot roll back success |

The legacy implementation remains in the route as an explicitly selected feature-flag branch. There is no fallback from a smart-RPC error to legacy writes.

## Modified application paths

- `src/app/api/moviback/rewards/redeem/route.ts`: smart RPC integration, feature-gated legacy isolation, stable response, post-commit notification.
- `src/app/api/moviback/rewards/route.ts`: classification, customer-input requirement, and authoritative selectable ID pairs without stock quantities.
- `src/app/moviback/premi/page.tsx`: stable intent key, generic variant selection, authoritative IDs, readiness-aware success text.
- `src/app/api/moviback/me/route.ts`, `src/app/api/moviback/redemptions/route.ts`, `src/app/moviback/page.tsx`: suppress QR token until `ready`.
- `src/app/api/reward-redemptions/[token]/*`, `src/app/riscatto-premio/[token]/page.tsx`: readiness-aware QR read and lifecycle-RPC delivery.
- `src/app/api/admin/moviback/redemptions/*`: unified queue contract and lifecycle commands.
- `src/app/api/admin/moviback/rewards/*`, `src/app/admin/moviback/catalog/page.tsx`: future active-reward fulfillment validation.
- `src/lib/movibackContracts.ts`: shared public error, QR, replay, and notification contract.
- `src/lib/movibackRewardAdmin.ts`: server-side activation invariants.

## Redemption request and idempotency contract

Request:

```json
{
  "reward_id": "uuid",
  "idempotency_key": "uuid",
  "color_id": "uuid-or-null",
  "size_id": "uuid-or-null"
}
```

The authenticated user identity is never accepted from the body. The client stores one UUID in `sessionStorage` under the reward/color/size intent signature. A retry of that intent reuses the key, a successful redemption removes it, and a different variant/reward has a distinct signature. The server requires a valid UUID and calls `redeem_moviback_reward` exactly once.

Successful response:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "requested-or-ready",
    "qr_deliverable": false,
    "fulfillment_type": "store_product",
    "store_order_id": "uuid-or-null"
  },
  "created": true,
  "replayed": false
}
```

Internal notification context and idempotency-table details are not returned to the browser.

## Variant and catalog contract

Catalog rewards expose `fulfillment_type`, `store_product_id`, `requires_store_variant`, and `customer_input_required`. For customer-choice products the nested Store object exposes active colors, active sizes, and `variant_options` containing only authoritative `{color_id,size_id}` pairs with available active stock. Stock row IDs and quantities are not exposed.

- `requires_store_variant=true`: UI requires an offered pair; RPC independently validates it.
- `requires_store_variant=false`: UI sends no variant. RPC auto-resolves one coherent identity, supports zero identities as non-stock-tracked, and rejects ambiguity.
- No reward UUID, product name, or category heuristic drives UI behavior.

Asciugamano therefore offers Grigio/Lime with size UNICA and rejects a missing/invalid pair. Tubo Palline shows no selector, sends no variant, fabricates no stock, and the RPC creates its Store fulfillment order/item.

## Post-commit notification contract

Only `created=true`, `replayed=false`, `should_notify_staff=true` schedules notifications through the PF-07 `after()` infrastructure. SQL never sends Telegram. The message uses operational language: customer, reward, points, fulfillment type, product/variant when applicable, initial status, and staff action. SERVICE explicitly states that no Store order handling is required. Every message points staff to **Richieste premio** and states that Telegram is only an alert.

The response is already committed before notification execution. Telegram/push exceptions are caught and logged; they cannot change redemption success. Replays and failed/rolled-back RPC calls schedule nothing.

## QR and lifecycle contract

- SERVICE starts `ready`; its token may be exposed immediately.
- Physical `requested`/`processing` rows retain a database token but customer APIs replace it with `null`.
- Only `ready` is QR-deliverable.
- QR delivery invokes `deliver_moviback_redemption`; it cannot bypass processing/readiness and atomically delivers a linked Store order.
- QR repeat uses a deterministic operator/redemption delivery key, while the RPC is also same-target safe.
- Staff actions use `process`, `ready`, `deliver`, `cancel`, and `reject` lifecycle RPCs with caller-supplied intent UUIDs.
- Supplier-commit and repair errors are mapped to stable `PF08_*` codes and non-technical messages.

## Unified staff queue contract

`GET /api/admin/moviback/redemptions` uses two bounded queries rather than an N+1 loop. It returns reward, customer, fulfillment type, status/timestamps, Store order/items, QR readiness, historical marker, and available actions. `POST /api/admin/moviback/redemptions/{id}/transition` executes one lifecycle RPC. Telegram is not a work queue.

A dedicated **Richieste premio** page is not built in this phase. The server contract is ready for that immediate UI follow-up.

## Historical compatibility

Reading does not mutate historical rows. Legacy rows remain present in history/queue and are marked when `fulfillment_type` is absent. Already-delivered legacy rows remain readable and repeat-safe. Unsafe processing, delivery, cancellation, or reversal returns a controlled legacy/manual-repair error; no automatic backfill or silent legacy write fallback occurs.

## Admin activation validation

Active rewards require explicit classification. SERVICE forbids Store linkage. STORE_PRODUCT requires an active product and coherent topology: required choice needs an active identity, variantless allows zero/one identity, and multiple identities are rejected. Active CUSTOM_PHYSICAL/PARTNER creation remains blocked until their required operational metadata contracts exist. Inactive historical rewards may remain unclassified.

## Error contract

Known PF-08 failures are returned as `{error,code}` with a stable HTTP status. The route covers unclassified fulfillment, required/invalid/ambiguous variants, stock, points, inactive reward/product, idempotency conflict/incomplete, lifecycle transition, supplier commitment, ledger/reservation reversal, and legacy repair. Raw database details are never returned for unknown failures.

## Local validation evidence

- Node route-contract tests: 4/4 pass.
- TypeScript: pass.
- Next production build: pass (existing metadata warnings only).
- Atomic redemption SQL: pass.
- Lifecycle SQL: pass.
- PF-08B2R3 Store inventory regression: pass.
- PF-08B2C3 classification harness: all strict aborts, service, Asciugamano, Tubo, replay, cancellation, and final reset pass.
- Full repository lint remains red because of the repository’s pre-existing lint backlog (665 errors across unrelated files); no lint cleanup was attempted.

Test coverage mapping:

| Requested case | Evidence |
|---|---|
| SERVICE | B2C3 validation + smart redemption SQL |
| Asciugamano Grigio/Lime/missing | B2C3 and B2R3 SQL |
| Tubo Palline | B2C3 and B2R3 SQL |
| Single-identity false flag | B2R3 SQL |
| Same-key replay/new-key intent | smart SQL/concurrency + client contract test/static integration |
| Insufficient points/Store stock | smart/B2R3 SQL |
| Telegram failure after commit | PF-07 post-commit isolation + route contract test/static integration |
| Requested cannot deliver; processing → ready → delivered | lifecycle SQL |
| Cancellation/supplier boundary/exact-once refund | lifecycle SQL |
| Historical row readable/manual repair | queue/read implementation + lifecycle SQL |

## Remaining blockers

- PF-08B2C4 production GO checklist is still incomplete; no application cutover is authorized.
- A browser-authenticated local smoke test should validate rendered Asciugamano/Tubo catalog UX and staff scanning with real cookies.
- Build the staff **Richieste premio** UI on the new server contract.
- Operational owners must validate Telegram formatting/delivery with a safe test bot/channel before production.
- Production monitoring, backup, preflight, classification, owner approval, and deliberate feature-flag activation remain mandatory.
