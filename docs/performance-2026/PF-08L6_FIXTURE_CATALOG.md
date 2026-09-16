# PF-08L6 — Fixture catalog

## Identity namespace

All IDs use the deterministic synthetic namespace `00000000-0000-4000-8000-*`. Timestamps are fixed UTC values in January 2026 so reset output does not depend on execution time.

## Users and memberships

| Fixture | User ID | Membership ID | Email | Membership code | State | Current balance | Intended use |
|---|---|---|---|---|---|---:|---|
| User A | `00000000-0000-4000-8000-000000001001` | `00000000-0000-4000-8000-000000002001` | `pf08-user-a@example.invalid` | `PF08-LOCAL-MEMBER-A` | approved | 2,000 | Successful checkout/redemption and balance concurrency |
| User B | `00000000-0000-4000-8000-000000001002` | `00000000-0000-4000-8000-000000002002` | `pf08-user-b@example.invalid` | `PF08-LOCAL-MEMBER-B` | approved | 500 | Insufficient multi-item checkout and independent-member tests |

Names are `PF08 TEST USER A` and `PF08 TEST USER B`; phone and tax-code fields are artificial PF-08 fixture values.

## Loyalty ledger

| ID | Member | Type / source | Delta | Related redemption | Purpose |
|---|---|---|---:|---|---|
| `00000000-0000-4000-8000-000000003001` | A | `earn` / `manual_adjustment` | +2,600 | — | Opening credit; produces 2,000 after historical debits |
| `00000000-0000-4000-8000-000000003002` | B | `earn` / `manual_adjustment` | +500 | — | Exact low-balance state |
| `00000000-0000-4000-8000-000000003003` | A | `redeem` / `reward_redemption` | -200 | `…a001` | Debit for requested non-Store redemption |
| `00000000-0000-4000-8000-000000003004` | A | `redeem` / `reward_redemption` | -400 | `…a002` | Debit for delivered Store redemption |

## Store reference rows

| Type | ID | Value |
|---|---|---|
| Category | `00000000-0000-4000-8000-000000004001` | `PF08 TEST CATEGORY` |
| Line | `00000000-0000-4000-8000-000000004101` | `PF08 TEST LINE` |

## Products, variants, and stock

| Fixture | Product ID | Color ID | Size ID | Price | Stock ID / quantity | Intended use |
|---|---|---|---|---|---|---|
| Product A | `00000000-0000-4000-8000-000000005001` | `…6001` (`PF08 BLUE`) | `…7001` (`PF08-M`) | €25 / 250 points | `…8001` / **10** | Normal sized checkout; multi-item cart |
| Product B | `00000000-0000-4000-8000-000000005002` | `…6002` (`PF08 RED`) | `…7002` (`PF08-L`) | €40 / 400 points | `…8002` / **1** | Last-unit race; multi-item cart |
| Product C | `00000000-0000-4000-8000-000000005003` | `…6003` (`PF08 BLACK`) | `NULL` | €30 / 300 points | `…8003` / **3** | Null-size stock lookup and Store-linked reward |

Full color IDs are:

- `00000000-0000-4000-8000-000000006001`
- `00000000-0000-4000-8000-000000006002`
- `00000000-0000-4000-8000-000000006003`

Full size IDs are:

- `00000000-0000-4000-8000-000000007001`
- `00000000-0000-4000-8000-000000007002`

Full stock IDs are:

- `00000000-0000-4000-8000-000000008001`
- `00000000-0000-4000-8000-000000008002`
- `00000000-0000-4000-8000-000000008003`

Products A + B form a canonical two-item, 650-point cart. User A can afford it; User B cannot.

## Rewards

| Fixture | Reward ID | Cost | Catalog stock | Store link | Variant rule | Intended use |
|---|---|---:|---:|---|---|---|
| Reward A | `00000000-0000-4000-8000-000000009001` | 400 | 4 | Product C | required | Store-linked/null-size redemption and fulfillment |
| Reward B | `00000000-0000-4000-8000-000000009002` | 200 | `NULL` (unlimited) | none | not required | Non-Store redemption without fulfillment |

Both rewards are active and use synthetic names/descriptions.

## Redemption history

| Fixture | Redemption ID | Reward | Status | Debit | Fulfillment | Intended use |
|---|---|---|---|---|---|---|
| Pending | `00000000-0000-4000-8000-00000000a001` | Reward B | `requested` | `…3003`, -200 | none | Legitimate pending non-Store lifecycle |
| Completed | `00000000-0000-4000-8000-00000000a002` | Reward A | `delivered` | `…3004`, -400 | one order + one item | Complete Store-linked historical chain |

QR tokens are deterministic local-only values:

- `PF08-LOCAL-QR-PENDING-0001`
- `PF08-LOCAL-QR-DELIVERED-0001`

## Fulfillment chain

| Object | ID | Relationship |
|---|---|---|
| Delivered reward order | `00000000-0000-4000-8000-00000000b001` | User A → completed redemption `…a002` |
| Delivered reward item | `00000000-0000-4000-8000-00000000c001` | Order `…b001` → Product C / Color C / `size_id NULL` |

The order is `reward_redemption`, paid with 400 points, delivered at `CENTALLO`, and has exactly one quantity-one item. The requested non-Store redemption intentionally has no order or item.

## Expected public-table state

Exactly 13 tables are populated with these counts:

```text
users                    2
loyalty_memberships      2
loyalty_transactions     4
store_categories         1
store_lines              1
store_products           3
store_product_colors     3
store_product_sizes      2
store_product_stock      3
rewards_catalog          2
reward_redemptions       2
store_orders             1
store_order_items        1
```

The remaining 31 public application tables must be empty immediately after reset.

## Mutation-test guidance

These are baseline fixtures, so mutation tests must reset or isolate state between scenarios:

- use stock `…8002` for the two-request last-unit race;
- use stock `…8003` for null-size resolution;
- use Products A + B for multi-item and User B insufficient-balance checkout;
- use Reward A for Store fulfillment and Reward B for the non-Store branch;
- use stable fixture IDs when later idempotency tests compare identical and conflicting payloads;
- never treat the historical redemption IDs as future idempotency keys.

No idempotency registry exists in this catalog.
