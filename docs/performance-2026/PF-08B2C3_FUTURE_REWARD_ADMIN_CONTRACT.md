# PF-08B2C3 — Future reward admin contract

## Activation invariant

`fulfillment_type` is mandatory before a reward can become active or redeemable. Validation must run server-side on create, edit, activation, and reactivation; UI checks alone are insufficient.

## Fulfillment rules

### SERVICE

- Store linkage and Store variant selection are forbidden.
- No Store order or inventory mutation is expected.

### STORE_PRODUCT

- `store_product_id` must be a valid, active Store product UUID.
- Identity is linked by immutable UUID, never free text, product name, category, or keyword.
- If the linked product becomes inactive, the reward must cease being redeemable until corrected.
- `requires_store_variant=true` requires the customer to choose an authoritative active color and applicable size with an exact active stock identity.
- `requires_store_variant=false` requires no customer choice. Zero active stock identities explicitly means non-stock-tracked inventory; one coherent identity auto-resolves; multiple materially distinct identities are a configuration error unless a future authoritative default mechanism exists.
- Inventory tracking derives exclusively from active `store_product_stock` identities, not from the selection flag.

### CUSTOM_PHYSICAL

- Normal Store linkage should be absent unless a later explicit contract permits it.
- Operational fulfillment instructions must be present and validated.

### PARTNER

- Normal Store linkage is forbidden by default.
- Authoritative partner/fulfillment metadata must be required when that model is implemented.

## Administrative behavior

- The product picker must use authoritative active Store products and persist UUIDs.
- Variant policy must be explicit and validated against current inventory topology.
- Deactivation or topology changes must revalidate every linked active reward.
- Inactive historical rewards may remain unclassified, but reactivation requires the complete current contract.
- Category/name keywords must never infer fulfillment behavior.

This phase defines the contract only; it does not implement admin UI or routes.
