# PF-08B2C4 — Route compatibility audit

## Result

The classification columns are schema-compatible with the current application, but the classification data change is **not behavior-neutral** for every live client. Production rollout must therefore treat database classification and route adoption as separate, explicitly reviewed steps.

## Current live paths

| Path | Current behavior | Reads `fulfillment_type` / smart RPC? | Classification-only effect |
|---|---|---:|---|
| `GET /api/moviback/rewards` | Reads `store_product_id`, `requires_store_variant`, and nested Store metadata | No | Asciugamano begins returning linked product/variants; Tubo returns a product with no available colors because availability is stock-row-derived. |
| `/moviback/premi` | Opens picker only when link and flag are truthy; otherwise posts reward ID only | No | Asciugamano starts requiring Grigio/Lime selection. Tubo remains variantless. |
| `POST /api/moviback/rewards/redeem` | Legacy multi-step inserts/updates with compensating delete; category keywords decide some Store orders | No | Does not invoke PF-08 RPCs. Asciugamano follows legacy variant/order path. Tubo still does not derive fulfillment from its new classification and may depend on category keywords for order creation. |
| QR read/validate routes | Read/update legacy redemption status and token directly | No | Non-null catalog classification does not affect them. |
| Store checkout/order routes | Separate Store flow | No | No direct effect. |
| Admin reward create/edit | Writes link/flag but not `fulfillment_type` | No | Existing forms continue working, but can create active unclassified rewards; admin guard implementation remains required. |
| Post-commit notification helper | Used by legacy redemption after order creation | No | Classification alone does not trigger a new notification path. |

## Explicit safety answers

- **Break current redemption creation?** No schema-level break is identified, but the legacy flow remains non-atomic and Tubo does not gain smart Store fulfillment merely from classification.
- **Alter current redemption behavior?** Yes for Asciugamano: the corrected link and true flag activate the legacy picker and Store-order path. Tubo remains variantless, but its intended stockless Store semantics are not consumed by the legacy route.
- **Alter existing Store checkout?** No.
- **Alter QR delivery?** No direct effect.
- **Alter existing admin workflows?** No immediate API break; they still omit classification and can introduce drift.
- **Trigger the smart RPC automatically?** No.
- **Affect existing clients without route deployment?** Yes, through Asciugamano’s link/flag and the reward-list payload. Other non-null classifications are ignored by current clients.

## Rollout implication

The data migration can technically run before route integration, but it is not a no-behavior-change deployment. It requires an explicit acceptance test for the current Asciugamano legacy flow and an acknowledged interval in which Tubo is classified but still handled by legacy heuristics. Smart-route integration remains a separate deployment and must not be assumed by this migration.

Recommendation: schedule classification in a controlled window after database infrastructure is present, keep the existing route deployed only for the shortest reviewed interval, and block route activation until its own regression/rollback plan is approved.

## Zero-downtime and locking

The classification transaction updates 26 rows and validates a small catalog. Row locks affect only those reward rows; ordinary reads continue under PostgreSQL MVCC. The transaction takes no explicit table lock, creates no index, and alters no schema. It should be short, but can wait on concurrent admin edits/redemptions touching the same reward rows. Use `lock_timeout`/`statement_timeout` at execution time and abort rather than wait through sustained contention.

The supporting infrastructure migrations are additive but include `ALTER TABLE`, constraints, and unique-index creation; those can acquire stronger locks or scan existing data. They must be deployed and verified separately, in order, before classification. `CREATE OR REPLACE FUNCTION` takes a brief function-object lock and affects new calls after commit; existing transactions retain their normal PostgreSQL behavior.
