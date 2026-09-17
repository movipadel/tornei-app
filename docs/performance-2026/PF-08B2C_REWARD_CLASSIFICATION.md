# PF-08B2C — MoviBack reward classification audit

## Status and scope

PF-08B2C is a read-only classification audit and cutover design. No reward has been classified, no SQL has been executed, and no route, schema, migration, seed, or production data has been changed.

The review was limited to the committed `rewards_catalog` and `reward_categories` schema, the current reward/category administration routes and page, the current customer catalog and legacy redemption route, and the PF-08B2/PF-08B2R smart-redemption contracts. Production contents remain unknown until the owner manually runs `PF-08B2C_CLASSIFICATION_QUERY.sql`.

## Current reward model

### Catalog fields relevant to classification

| Field | Current evidence-supported meaning | Classification role |
|---|---|---|
| `id` | Stable reward UUID and redemption foreign-key target. | Required key for every owner-approved mapping. |
| `name` | Customer-facing reward name. | Business evidence only; never a runtime classifier. |
| `description` | Customer-facing description; the smart contract also uses it as fulfillment notes for custom/partner rewards. | Owner evidence. It must become operationally adequate for custom/partner fulfillment. |
| `category` | Nullable text copied from the selected category name. It is not a foreign key to `reward_categories`. | Presentation/filter metadata only. Never authoritative. |
| `points_cost` | Points charged for redemption. Current admin requires a positive value; the smart RPC rejects negative values. | No type inference. |
| `is_active` | Controls customer-catalog visibility and whether the smart RPC accepts the reward. | Every active row must be explicitly classified before cutover. |
| `stock_qty` | Nullable reward-level availability: `NULL` means unlimited; a finite value is reserved/decremented for every fulfillment type. | No type inference: services and partner entitlements may also have finite quotas. |
| `reward_type` | Existing `club`/`partner` descriptive field. Creation currently hardcodes `club`; editing does not expose or change it. | Supporting evidence only. It must not override `fulfillment_type`. |
| `store_product_id` | Nullable FK to `store_products.id`, with `ON DELETE SET NULL`. | Required linkage for `store_product`; forbidden for the other target types after normalization. |
| `requires_store_variant` | Legacy boolean used by the current customer UI and route to decide whether to request/validate a Store variant. | Transitional compatibility evidence, not the new source of truth. The smart RPC ignores it. |
| `fulfillment_type` | Nullable field introduced by the smart-redemption migration and constrained to the four target values. | Long-term authoritative source of truth. New smart redemptions reject `NULL`. |

`image_path`, timestamps, category sort order, and point-range configuration do not determine fulfillment behavior.

### Category model

`reward_categories` contains `id`, unique `name`, `sort_order`, `is_active`, and timestamps. A catalog reward stores only category text: there is no category ID or FK. Renaming/deleting a category therefore does not reclassify or rewrite existing rewards. Category names remain useful for display and owner review, but cannot safely drive mutations.

### Current administration behavior

- The form edits name, description, category text, points cost, image, reward stock, active state, Store product linkage, and `requires_store_variant`.
- It has no `fulfillment_type` control and no `reward_type` control.
- Creation hardcodes `reward_type = 'club'` and does not write `fulfillment_type`.
- Editing and the active-state toggle do not write or validate `fulfillment_type`, so an unclassified row can currently be activated.
- Clearing `store_product_id` forces `requires_store_variant = false`; linking a product does not force the flag to true.
- The product picker is populated by the public Store endpoint, which exposes active products only after active category/line checks and requires at least one active color. The admin mutation route does not independently validate those product/variant conditions.
- Category is optional in both the form and server routes. Reward creation does not reject negative finite stock, while editing does.

### Current customer and redemption behavior

- The customer catalog API does not select `fulfillment_type`. It returns active rewards, category text, legacy type/linkage fields, and nested Store variants/stock.
- The UI opens the variant picker only when both a linked product and `requires_store_variant` are truthy. Otherwise it submits the reward without a variant.
- The legacy redemption route treats `store_product_id + requires_store_variant` as Store-variant behavior. It additionally creates an internal Store order when the lowercased category contains `abbigliamento`, `accessori`, `accessorio`, or `store`.
- The smart RPC does not use category or `requires_store_variant`. It locks the active reward and accepts only explicit `fulfillment_type`; a null value returns `PF08_FULFILLMENT_UNCLASSIFIED`.

This difference is why classification, admin enforcement, customer variant behavior, and route cutover form one deployment gate.

## Authoritative classification rules

The business owner must decide the operational fulfillment path for every active reward. Existing fields can support that decision but cannot make it automatically.

| Type | Business test | Required catalog configuration | Forbidden/incompatible configuration | Smart-redemption effect |
|---|---|---|---|---|
| `service` | A non-physical MOVIPadel benefit requiring no Store/supplier preparation before it can be erogated. | Explicit type; useful service instructions; no Store link. Finite or unlimited reward stock is allowed. | `store_product_id`, Store variant requirement/input, Store stock, or internal Store order. | Starts `ready`; reward stock is reserved if finite; no Store order or Store-stock mutation. |
| `store_product` | The customer receives a normal product from the Store catalog and the selected Store variant is the inventory identity. | Active linked product; at least one active color; size required when active sizes exist; one unambiguous active stock identity for each selectable color/size combination. During legacy-UI coexistence, `requires_store_variant` must be true. | Missing/inactive product, absent color, ambiguous/missing exact stock identity, or custom-only fulfillment instructions standing in for a Store SKU. | Starts `requested`; reserves reward stock and exact finite Store stock; creates one linked internal order/item. |
| `custom_physical` | MOVIPadel must source/prepare a physical item that is not a normal Store SKU. | Explicit type; no Store link; no Store variant flag; description/fulfillment instructions sufficient for staff to identify and prepare the item. Finite or unlimited reward stock is allowed. | Store SKU/variant consumption or an externally controlled entitlement with no MOVIPadel physical handling. | Starts `requested`; reserves reward stock; creates a custom internal order/item; never mutates Store stock. |
| `partner` | An external partner fulfills an entitlement and MOVIPadel only coordinates/records that external handoff. | Explicit type; no Store link or variant flag; adequate partner/fulfillment instructions. Finite or unlimited reward stock is allowed. | Implicit Store order or inventory. A partner-supplied item physically managed through MOVIPadel logistics is `custom_physical`, not `partner`. | Starts `requested`; reserves reward stock; creates no Store order and mutates no Store stock. |

Additional rules:

- `fulfillment_type` alone selects runtime behavior after cutover.
- Category, `reward_type`, finite/unlimited stock, name, and description never act as fallback classifiers.
- Every new redemption snapshots the catalog classification so later catalog edits do not reinterpret history.
- A non-physical benefit that needs preparation before it is genuinely ready does not fit the current immediate-ready `service` contract automatically. The owner must decide whether it is an external `partner` flow or whether the business contract itself needs revision before classification.

## Ambiguous or invalid current configurations

| Observed pattern | Why it is unsafe to infer | Owner decision / evidence required |
|---|---|---|
| Product linked, `requires_store_variant = false` | The link may be stale, informational, or an intended Store reward whose current UI skips variant selection. | Confirm normal Store SKU fulfillment versus service/custom/partner. If Store, approve `store_product`, validate variants/stock, and align the transitional flag/UI. Otherwise remove the stale link in the later reviewed change. |
| Product linked, `requires_store_variant = true` | Strong Store evidence, but not proof that the link, variants, and stock are operationally valid. | Confirm it is a normal Store item and validate active product/color/size/exact stock identities. |
| `requires_store_variant = true` with no product | Current UI/route cannot satisfy the claimed requirement. | Identify and link the correct Store product or choose another type and clear the flag. Do not activate as-is. |
| Physical-looking category with no product | Category keyword previously created an order, but cannot distinguish a custom physical item from stale/misnamed metadata. | Confirm physical handling. Choose `custom_physical` only when MOVIPadel prepares it; otherwise service/partner as appropriate. |
| Partner reward with Store-looking category or product link | Category/linkage conflicts with external fulfillment semantics. | Decide who controls inventory and handover. External entitlement is `partner`; MOVIPadel Store SKU is `store_product`; MOVIPadel-managed non-SKU item is `custom_physical`. |
| `reward_type = 'partner'` without clear external workflow | The field is legacy/descriptive and may be stale. | Confirm the real fulfillment actor and required operational evidence. |
| `reward_type = 'club'` but fulfillment is external | Creation always hardcodes `club`, so the value cannot disprove partner fulfillment. | Owner confirms `partner`; later decide whether to synchronize the legacy field or retire its semantic use. |
| Finite-stock benefit that otherwise looks like a service | Finite stock can mean a quota, not a physical item. | Confirm whether stock counts available entitlements or physical units. Classification follows fulfillment, not quantity. |
| Missing/inactive category or free-text category drift | Categories are presentation text with no FK; absence does not reveal fulfillment. | Classify from the real operating procedure. Category cleanup is optional and separate. |
| Active Store-linked product is missing/inactive, lacks active colors, or has missing/duplicate exact stock identities | The smart RPC cannot safely reserve the requested SKU. | Repair/replace the Store configuration or select a different owner-approved type before activation/cutover. |
| Product linked to `service`, `custom_physical`, or `partner` | The smart RPC would ignore the stale link for those types, leaving misleading configuration. | Confirm the non-Store type and remove the link/variant flag in the later exact-ID change. |
| Description is insufficient for custom/partner work | Staff cannot execute the request from the authoritative queue. | Owner supplies operational instructions before the reward is redeemable. |
| Inactive unclassified reward | It is not currently redeemable, but reactivation would introduce a cutover failure. | It may remain null; classification and validation become mandatory before reactivation. |

No row matching any ambiguous pattern should be assigned a type without explicit owner approval.

## Production inventory query

`PF-08B2C_CLASSIFICATION_QUERY.sql` contains one SELECT-only inventory query. It returns reward business fields, category status, linked Store product identity/status, and active color/size/stock counts. It contains no customer, membership, redemption, contact, or secret data.

The expression `to_jsonb(r) ->> 'fulfillment_type'` deliberately makes the query compatible with both schema states: it returns the value when the column exists and `NULL` when it does not. The query has not been executed.

The counts are evidence, not an automatic classification or a substitute for the existing PF-08 stock-identity checks. In particular, a nonzero stock-row count does not prove that every selectable variant has exactly one valid stock row.

## Existing-reward mapping strategy

1. The owner manually runs the inventory SELECT against production and exports the result through an approved channel.
2. For every active reward, prepare a review manifest containing exact `reward_id`, expected reward name, approved `fulfillment_type`, decision rationale, and any configuration normalization required.
3. Resolve every ambiguous row with the business owner. Do not generate mappings from category keywords or bulk patterns.
4. Validate every proposed `store_product` against its active product, selectable variants, and exact stock identities. Validate custom/partner descriptions against staff needs.
5. Review the manifest for stable IDs and stale-snapshot protection immediately before the later data change. A name is a human cross-check, never the mutation key.
6. In a separate authorized phase, implement exact-ID assignments only. Any normalization of product linkage, variant flag, legacy `reward_type`, or instructions must be explicit in the same reviewed manifest rather than incidental.
7. Run read-only post-change validation: every active reward is classified, every classification is internally coherent, and no unexpected row changed.
8. Test the exact mapping and cutover in an isolated environment before any production action.

There is intentionally no migration or data statement in PF-08B2C.

## Inactive and historical strategy

- Inactive catalog rewards may remain `fulfillment_type = NULL` indefinitely while they remain inactive.
- Reactivation must pass the same classification and coherence validation as new activation; an inactive null row cannot simply be toggled active.
- Inactive rows may be classified opportunistically when the owner has reliable evidence, but this is not a route-cutover prerequisite.
- Existing redemption snapshots may remain null under the compatibility contract. Catalog classification must not retroactively invent fulfillment, variants, orders, or reservation evidence for historical redemptions.
- Historical repair/reconciliation remains a separate admin workflow governed by the PF-08B2R contract.

## Future admin validation contract

Validation must be enforced server-side; client validation should mirror it for operator feedback. A row may be saved as an inactive draft with null/incomplete classification, but it must not be created, updated, or toggled to active unless all applicable rules pass.

### Rules for every active reward

- `fulfillment_type` is one of the four supported values and is explicitly chosen.
- Name and positive points cost remain required; finite reward stock is a non-negative integer.
- The type-specific configuration is coherent at the time of activation.
- Category remains optional presentation metadata and cannot satisfy type validation.
- The UI explains fulfillment effects (initial state, Store-order behavior, inventory source, and staff action) instead of asking the operator to infer them from technical fields.

### Type-specific form and server rules

| Type | Required | Must be absent/false | Activation checks |
|---|---|---|---|
| `service` | Service instructions adequate for erogation. | `store_product_id`; `requires_store_variant`. | Operator confirms immediate-ready semantics and no logistics preparation. |
| `store_product` | `store_product_id`; active product; variant-selection contract. | Custom-only fulfillment substitution. | At least one active color; size semantics derived from active sizes; exactly one active stock identity for each offered variant. Until customer UI derives behavior from type, force `requires_store_variant = true`. |
| `custom_physical` | Clear preparation/sourcing instructions in the available description/fulfillment field. | `store_product_id`; `requires_store_variant`. | Operator confirms MOVIPadel handles the physical item and no Store SKU stock is consumed. |
| `partner` | Clear external fulfillment instructions/reference requirements. | `store_product_id`; `requires_store_variant`; internal Store-order expectation. | Operator confirms the partner owns fulfillment and staff understands the readiness evidence. |

If `reward_type` is retained, the UI should expose its descriptive purpose and flag conflicts (`partner` fulfillment normally corresponds to `reward_type = 'partner'`; internally fulfilled types normally correspond to `club`). Because its current meaning is legacy and the contract makes `fulfillment_type` authoritative, enforcing that correspondence as a database/business invariant requires an explicit owner decision; it must never become a second runtime classifier.

Category rename/delete operations must state that they affect display metadata only and must not change fulfillment.

## Smart-route integration gate

The smart-redemption route may be enabled only when all of the following are true at the same reviewed release boundary:

1. A fresh production inventory covers every active/redeemable reward.
2. The business owner has approved an exact-ID mapping for every active reward; there are no null or disputed active classifications.
3. Every active mapping passes the type-specific coherence rules, including active product and exact Store variant/stock validation for `store_product`.
4. Any active `store_product` works with the customer variant-selection path: either the transitional legacy flag is coherently true or the UI/API are changed in the same cutover to derive behavior from `fulfillment_type`.
5. The exact-ID classification change has been reviewed, staged, and paired with read-only pre/post validation and a rollback plan.
6. Admin create/edit/activate routes and UI prevent future active unclassified or incoherent rewards no later than the route cutover.
7. The customer catalog exposes the authoritative type and the redemption route invokes the smart RPC without category or legacy-flag fallback.
8. PF-08B2/PF-08B2L isolated tests, authorization checks, idempotency behavior, and PF-07 post-commit notification behavior pass for all four types.
9. Old and new mutation paths cannot concurrently apply different classification rules; cutover is atomic at the application-release level.

Until all conditions pass, the route integration is **blocked**. This document does not authorize classification, SQL execution, or route work.
