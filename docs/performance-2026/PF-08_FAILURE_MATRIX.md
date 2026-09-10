# PF-08 — Transaction failure matrix

## Contract used by this matrix

This is a design artifact, not implemented behavior. “Expected DB state” describes the proposed transactional RPC architecture. Every controlled failure before commit leaves no new order/redemption/item/debit/stock/idempotency row. A successful commit contains the complete required mutation and its durable replay result.

The route continues to own authentication and HTTP mapping. Current public statuses should be retained where practical: `401` unauthenticated, `403` membership not approved, `404` missing user/reward, `400` invalid input/variant or insufficient points/stock, and `500` unexpected database failure. PF-08 adds `409` for conflicting reuse of an idempotency key. A timeout/disconnect can mean that no response reaches the client even though the server/database has a definite outcome.

“Retry safe” assumes the client reuses the same idempotency key and identical canonical request. A different key is a new operation.

## Store checkout

| Stage/failure | Current behavior/risk | Expected future DB state | Expected HTTP result | Retry safe? | Idempotency behavior |
|---|---|---|---|---|---|
| Missing/invalid user session | No writes | No writes | `401` | YES | No key claim; authenticate first |
| Malformed/empty cart, invalid club/payment, non-positive/non-integral quantity | Current route rejects most cases before writes; integrality/finiteness gaps remain | No writes | `400` | YES after correcting request | Invalid request does not create a committed claim; policy must define whether a corrected payload reuses or replaces the key |
| User row missing | No writes | No writes | `404` | YES after identity/data repair | No committed business result |
| Membership missing/not approved for point spend | No writes | No writes | `403` | YES after membership state changes | Rolled-back claim permits later retry with same key |
| Multiple memberships for one user | `maybeSingle()` errors before writes | No writes; invariant error | `500` until data corrected | YES after repair | No committed claim; motivates unique `user_id` audit/constraint |
| Invalid/inactive product or disallowed payment mode | No writes | No writes | `400` | YES with corrected/new request | Same key with changed canonical intent is a `409`; UI should intentionally create a new key after edits |
| Color does not belong to product; invalid/inactive size | No writes | No writes | `400` | YES with corrected/new request | Conflicting payload requires new key |
| Missing/null checkout stock under approved unlimited-stock semantics | Currently accepted and no decrement occurs | Complete order; no finite-stock decrement | `200` | Replay safe | Same result returned; semantics must be approved before implementation |
| Ambiguous multiple null-size stock rows | Current `maybeSingle()` fails | No writes; data-integrity failure | `500` | YES after cleanup | Claim rolls back; null-safe uniqueness prevents recurrence |
| Insufficient finite stock | No writes in the ordinary current path | No writes | `400` | YES if stock later changes | Same key may be retried after rollback; once committed it replays |
| Concurrent last-item purchase | Both current requests can pass and succeed against stale stock | Exactly one transaction commits; loser leaves no business rows | Winner `200`; loser `400` insufficient stock | Loser YES if stock replenished | Separate keys compete normally; same key serializes/replays one result |
| Duplicate same variant inside cart | Current server can under-decrement and oversell because lines use the same old quantity | Lines are aggregated before validation/lock/decrement; one snapshot item or an explicitly approved canonical representation is written | `200` if aggregate stock sufficient, otherwise `400` | YES | Canonical aggregate participates in request hash |
| Product/price/payment flag changes during checkout | Current reads can become stale before order insert | Catalog row lock freezes authoritative values for the transaction; admin update waits or checkout sees the new value | `200` with one coherent snapshot or `400` | YES | Committed replay returns original totals even if catalog later changes |
| Insufficient points | Current route rejects before writes, but concurrent spends can both pass | No writes | `400` | YES if balance later changes | Rolled-back claim may be retried |
| Concurrent checkout/redemption uses same points | Current requests can both validate the same ledger | Membership lock serializes protected spends; second sees committed debit and either succeeds against remaining balance or rolls back | `200` or `400` | YES | Keys remain independent; each committed result is replayable |
| Order insert failure | No later writes; `500` | Entire transaction rolls back, including idempotency claim | `500` | YES for transient failure | Same key is new because no claim committed |
| Order-item insert failure | Current order was already inserted; compensation outcome is not guaranteed | Entire transaction rolls back: no order/items/debit/stock | `500` | YES | Same key can retry from zero |
| Ledger debit insert/constraint failure | Current order/items exist and route attempts incomplete compensation | Entire transaction rolls back: no order/items/debit/stock | `500` | YES after transient/schema issue | No committed claim |
| Compatibility source fallback receives ambiguous network result | Current loop could duplicate a committed debit under another source | No application-side fallback inside the RPC; one schema-valid source and one transaction result | No response or mapped `500` | YES with same key | Retry either re-executes rolled-back work or returns committed result |
| First of several stock decrements succeeds; later decrement fails | Current earlier decrement remains and handler may still return success | Entire transaction rolls back, restoring all stock and removing order/items/debit | `500` or controlled `400` if a guarded decrement loses contention | YES | No partial committed result |
| Guarded stock update affects zero rows | Current code does not inspect affected-row outcome | Entire transaction rolls back as insufficient stock/concurrency loss | `400` | YES | No committed claim |
| Deadlock/serialization failure | Current multi-round-trip flow has no coherent retry contract | PostgreSQL rolls back the entire transaction | Mapped transient `409`/`503` per implementation contract | YES, bounded retry | Reuse same key; committed competing result replays, rolled-back request retries |
| Client double-click in one mounted UI | UI usually disables button, but durable duplicate protection is absent | One commit | Both responses `200` if both arrive | YES | Same key blocks then replays stored result |
| Browser/mobile retries identical request | Current retry creates another order/debit | One commit | `200`, with `created` internal on first and replay thereafter | YES | Same operation/user/key/hash returns stored result |
| Same key reused with different cart/payment/notes | No current concept | No additional writes | `409` | NO until client creates a new key intentionally | Conflict is explicit; never reinterpret an old key |
| Same payload sent with a different key | Current and future treat it as another purchase | A new complete order may commit | `200` | N/A | Correct by design; global payload dedupe would block legitimate repeat purchases |
| Server/client timeout before DB commit | Current prior independent statements may already remain; future RPC is atomic | Transaction rolls back if connection/statement aborts before commit | No response observed | YES | Same key starts new work because no row committed |
| Timeout after DB commit but before response reaches client | Current client retry duplicates | Complete order/items/debit/stock plus idempotency result remain | No response observed initially; retry returns `200` stored result | YES | Replay makes the ambiguous commit observable without another mutation |
| Response succeeds, notification later fails | PF-07 logs failure; business remains | Complete business commit remains unchanged | `200` | Business retry unnecessary | Replay does not repeat mutation; notification durability remains an outbox concern |

## MoviBack redemption

| Stage/failure | Current behavior/risk | Expected future DB state | Expected HTTP result | Retry safe? | Idempotency behavior |
|---|---|---|---|---|---|
| Missing/invalid session | No writes | No writes | `401` | YES | No claim |
| Missing/not-approved membership | No writes | No writes | `403` | YES after approval | Rolled-back claim permits retry |
| Reward missing | No writes | No writes | `404` | YES if catalog changes | No committed result |
| Reward inactive | No writes | No writes | `400` | YES if reactivated | No committed result |
| Invalid Store product/color/size or required size absent | No writes | No writes | `400` | YES with corrected request | Changed variant under same key conflicts; use a new key |
| Required Store stock row missing/ambiguous | Current request rejects before writes | No writes | `400` for missing valid combination; `500` for data ambiguity | YES after correction | No committed result |
| Insufficient reward stock | Current pre-check races | No writes | `400` | YES if replenished | Claim rolls back |
| Insufficient Store variant stock | Current pre-check races | No writes | `400` | YES if replenished | Claim rolls back |
| Insufficient points | Current pre-check races | No writes | `400` | YES if balance increases | Claim rolls back |
| Concurrent redemption of last reward/variant | Both current requests can pass and write stale decrements | One complete commit; loser has no redemption/debit/order/item/stock changes | Winner `200`; loser `400` | Loser YES after replenishment | Independent keys compete; same key replays |
| Concurrent point spends | Current ledger sums can both pass | Membership lock serializes checkout/redemption protected debits | `200` or `400` | YES | Each key records one outcome only when committed |
| Redemption insert failure, including QR collision | No later current writes | Entire transaction rolls back; QR generation may retry collision inside a bounded function loop | `500` only if collision/retry or DB issue remains | YES | No committed claim on failure |
| Ledger insert fails after redemption insert | Current route attempts redemption deletion and ignores delete failure | Entire transaction rolls back; neither redemption nor debit exists | `500` | YES | No committed claim |
| Reward stock decrement fails | Current redemption/debit remain and error is ignored | Entire transaction rolls back | `500` or controlled `400` on contention | YES | No committed claim |
| Store stock decrement fails after reward stock changed | Current two inventory layers can diverge | Entire transaction rolls back both inventory changes and redemption/debit | `500` or `400` | YES | No committed claim |
| Required fulfillment order insert fails | Current redemption/debit remain; handler logs warning and returns success | Under the proposed required-fulfillment contract, entire transaction rolls back | `500` | YES | No committed claim; requires product-owner approval of required status |
| Required fulfillment item insert fails | Current order header remains without item and HTTP succeeds | Entire transaction rolls back order, item, redemption, debit and stock | `500` | YES | No committed claim |
| Duplicate key and identical reward/variant | Current creates another redemption | One complete commit | `200` replay | YES | Stored QR/redemption result returned; no second debit/stock/order |
| Duplicate key with different reward/variant | No current concept | No new writes | `409` | NO with that key | Conflicting reuse is explicit |
| Same redemption payload with a different key | Current and future allow another redemption if balance/stock allow | A distinct complete redemption may commit | `200` or business validation error | N/A | Different key is a deliberate new operation |
| Timeout before commit | Current subset may remain; future transaction does not | No writes survive | No response observed | YES | Retry same key starts new transaction |
| Timeout after commit | Current retry duplicates redemption/debit | Complete redemption/debit/stock and required fulfillment rows remain | Retry returns stored `200` result | YES | Same QR and result replayed |
| Telegram/push failure after Store-like commit | PF-07 warning-only; non-Store rewards do not trigger these notifications | Complete transaction remains | `200` | Business retry unnecessary | Do not mutate again; missed/duplicate delivery needs future outbox |

## Cross-cutting state guarantees

| Outcome | Idempotency row | Business roots/items | Ledger | Finite stock | Notification |
|---|---|---|---|---|---|
| Validation rejection | Absent | Unchanged | Unchanged | Unchanged | Not scheduled |
| Unexpected failure before commit | Absent | Unchanged | Unchanged | Unchanged | Not scheduled |
| Successful new checkout/redemption | Committed with result | Complete | Complete when required | Fully decremented | PF-07 scheduled after RPC return |
| Successful replay | Existing result reused | No additional rows | No additional row | No additional decrement | Normally not rescheduled; outbox gap documented |
| Conflicting key reuse | Existing result unchanged | No additional rows | No additional row | No change | Not scheduled |
| Provider failure | Existing committed result | Complete | Complete | Complete | Failure logged; no rollback |

## Items requiring pre-implementation confirmation

- Exact FK delete actions for order items and redemption-related rows.
- Exact live check expressions rather than constraint names alone.
- Whether Store checkout deliberately permits products with active sizes to use a null size.
- Whether missing checkout stock rows and null quantities both mean unlimited/untracked stock.
- Whether every category-based Store reward requires a fulfillment order/item.
- Whether one membership per user, one debit per redemption and one fulfillment order per redemption are approved hard invariants.
- HTTP mapping for transient deadlock/serialization errors and whether the server performs one bounded same-key retry.
- Notification policy on idempotent replay until a durable outbox exists.
