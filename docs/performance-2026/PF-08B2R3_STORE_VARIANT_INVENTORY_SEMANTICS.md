# PF-08B2R3 — Store variant and inventory semantics

## Status and scope

PF-08B2R3 separates two concepts that the previous redemption RPC coupled:

1. `rewards_catalog.requires_store_variant` defines whether the customer must choose a Store variant.
2. Active `store_product_stock` rows define whether Store inventory is tracked for the linked product.

The change is local-only and additive. It replaces `public.redeem_moviback_reward` without changing its signature or response shape. It does not integrate application routes, send notifications, change admin UI, or alter production.

## Supported Store-product cases

| Case | Customer-selection policy | Active stock identities | RPC behavior |
|---|---|---:|---|
| A — selectable and tracked | `requires_store_variant=true` | One exact row for the supplied color/size | Require and validate the caller's selection; lock and decrement the exact finite stock row. |
| B — non-selectable and tracked | `requires_store_variant=false` | Exactly one logically valid row | Require no caller input; resolve the sole identity internally; snapshot its color/size; lock and decrement finite stock. |
| C — non-selectable and untracked | `requires_store_variant=false` | Zero rows | Require no caller input; create redemption and Store order/item without locking, creating, decrementing, or later restoring Store stock. |

If case B has more than one materially distinct valid active identity, the catalog is ambiguous. The RPC returns `PF08_AMBIGUOUS_STORE_VARIANT`; it never chooses an arbitrary default.

## Caller-input contract

When `requires_store_variant=true`, the supplied color is mandatory. A supplied size is also mandatory when the product has active size metadata. The color, size, and exact active stock identity must all belong to the linked active Store product. There is no fallback guessing.

When `requires_store_variant=false`, callers do not need to supply variant arguments. For backward compatibility, an exact caller-supplied color/size is accepted only when it matches the product's sole logically valid active stock identity. A partial or mismatched identity is rejected as `PF08_INVALID_STORE_VARIANT`; it is never silently replaced. Caller input cannot legitimize an ambiguous product: multiple identities still return `PF08_AMBIGUOUS_STORE_VARIANT`. A stockless product has no allowed identity, so any supplied variant is invalid. New routes should normally omit both fields for non-selectable rewards.

## Validation and errors

| Error | Meaning |
|---|---|
| `PF08_INVALID_STORE_PRODUCT` | The reward lacks a valid active linked Store product. |
| `PF08_MISSING_REQUIRED_VARIANT` | A selectable reward omitted required color or applicable size. |
| `PF08_INVALID_STORE_VARIANT` | Supplied metadata/stock is invalid, or an active stock row is not a coherent active product identity. |
| `PF08_STORE_STOCK_AMBIGUOUS` | More than one active row exists for the exact caller-selected identity. |
| `PF08_AMBIGUOUS_STORE_VARIANT` | A non-selectable product has multiple valid active stock identities. |
| `PF08_INSUFFICIENT_STORE_STOCK` | The resolved finite stock row has no available unit. |

All failures occur inside the transaction: no durable idempotency claim, redemption, points debit, stock mutation, order, or item survives.

## Logical stock identity

Only active stock rows for the linked active product are candidates. Their color must be active and belong to that product. A row with a size must reference an active size belonging to the product. If the product has no active sizes, a valid identity must have a null `size_id`; if it has active sizes, a valid identity must reference one.

For non-selectable products, any active stock row that does not meet those rules makes the configuration invalid rather than silently converting it to stockless behavior. Zero active rows is the only signal for non-stock-tracked Store inventory.

## Reservation evidence and stock mutation

Tracked finite stock preserves the existing `FOR UPDATE` lock and atomic decrement. The redemption records `reserved_store_stock_id` and `store_stock_reserved_qty=1`. A stock row with `stock_qty IS NULL` remains an unlimited tracked identity: it supplies coherent snapshots but is not decremented and records no finite reservation.

Stockless Store products record:

- `reserved_store_stock_id IS NULL`
- `store_stock_reserved_qty=0`
- null Store color/size snapshots
- the linked product ID and product-name snapshot on the order item

No stock row is fabricated. Reward-level finite `rewards_catalog.stock_qty` remains independent and is still reserved/decremented normally.

## Fulfillment, notification and idempotency

All successful new Store-product redemptions still create exactly one internal `store_orders` row and one `store_order_items` row. The existing response and PF-07 notification handoff remain intact: a new commit returns `should_notify_staff=true`; an idempotent replay returns the stored result with `created=false`, `replayed=true`, `should_notify_staff=false`, and no notification payload. SQL sends no Telegram message directly.

The PF-08B0 request hash continues to include the reward and nullable variant arguments. Same user/key/request replays one committed result. Conflicting reuse returns `PF08_IDEMPOTENCY_CONFLICT`. Stockless replay cannot invent inventory or duplicate the fulfillment order.

## Concurrency behavior

Tracked finite inventory retains the row-level stock lock, so two concurrent redemptions competing for one unit produce one winner and one `PF08_INSUFFICIENT_STORE_STOCK` result. Stockless products take no Store-stock lock, allowing independent users to redeem concurrently when points and reward-level stock permit it. The idempotency registry serializes concurrent requests for the same user/key into one new result plus one replay; different keys remain independent business operations.

## PF-08B2L reversal compatibility

No lifecycle-function migration is required. PF-08B2L restores Store stock only when `store_stock_reserved_qty=1` and a reserved stock ID exists. Therefore stockless and unlimited-row redemptions skip Store restoration, while cancellation still:

- refunds points exactly once;
- restores finite reward-level stock exactly once;
- marks the redemption cancelled;
- cancels its internal Store order;
- remains replay-safe.

## Verified catalog shapes

- **Asciugamano Sport** (`46709f62-3f5a-4025-965a-c5fcedcec826`) is exercised as selectable/tracked with linked product `671549a7-ed15-4eab-886d-4dff3f331d4d`, colors Grigio and Lime, size UNICA, and distinct finite stock rows.
- **Tubo Palline** (`1b1718ab-aba8-44bb-a2de-d90992e596a7`) is exercised as non-selectable/stockless with linked product `f442259b-1e5b-437a-b0ba-3d056d9d617d`, active color/UNICA metadata, and zero stock rows.
- A synthetic non-selectable product with one active identity verifies internal resolution and tracked decrement.
- A synthetic non-selectable product with two identities verifies deterministic ambiguity rejection.

## Future admin contract

Admin validation should eventually express these rules directly:

- every `STORE_PRODUCT` reward must reference an active Store product;
- `requires_store_variant=true` means customer selection and an exact stock identity are required;
- `requires_store_variant=false` means customer selection is not required; an exact legacy identity may be accepted only under the compatibility rule above;
- inventory tracking comes from active stock rows, not from the selection flag;
- zero active rows must be an intentional non-stock-tracked configuration;
- multiple active identities with the flag false are a blocking misconfiguration unless a future authoritative default mechanism is designed.

No admin UI behavior is implemented in PF-08B2R3.

## Production rollout prerequisites

Before production execution:

1. Run the approved classification/validation checks against current production-shaped metadata and confirm each Store reward belongs to case A, B, or C.
2. Confirm products with `requires_store_variant=false` have either zero or exactly one logically valid active stock identity; remediate ambiguous or incoherent rows first.
3. Confirm selectable rewards have valid active color/size metadata and exact active stock identities for every offered choice.
4. Confirm the application route omits variant IDs when the flag is false and supplies the complete authoritative selection when true.
5. Execute reset, functional, lifecycle-regression, and concurrency suites in an isolated staging/local environment.
6. Review an explicit rollback migration restoring the prior function definition and schedule observability for the new deterministic error codes.

Production remains blocked until those prerequisites and the normal deployment approval are complete.
