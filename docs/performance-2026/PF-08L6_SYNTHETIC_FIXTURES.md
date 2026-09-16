# PF-08L6 — Synthetic local fixtures

## Status

**PASS — deterministic local-only PF-08 fixtures created, applied, validated, and reproduced by a second reset.**

The fixtures live in `supabase/seed.sql` and are intended only for the unlinked local Supabase database at `127.0.0.1:54322/postgres`. No production system, remote project, real identity, provider configuration, application source, baseline migration, or future PF-08 object was accessed or changed.

## Contract inspected

Fixture design was derived from the 13 PF-08 tables and their direct insert dependencies in `20260916143214_production_public_baseline.sql`. The relevant current constraints were preserved:

- membership status `approved`;
- ledger types/sources `earn` + `manual_adjustment` and `redeem` + `reward_redemption`;
- redemption states `requested` and `delivered`;
- Store order type `reward_redemption`, payment mode `points`, pickup club `CENTALLO`, and status `delivered`;
- positive order-item quantity;
- existing FK insertion order and nullable-size behavior;
- one matching debit for each seeded redemption.

No baseline incompatibility was found.

## Local-target verification

Before each reset, `npx supabase status -o json` was checked programmatically:

| Property | Result |
|---|---|
| Linked project | None |
| Database target | `127.0.0.1:54322/postgres` |
| API / Studio | Loopback-only endpoints |
| Production connection | None |

Local-development credentials emitted by the CLI were not copied into documentation.

## Seed execution

The first local reset completed successfully in approximately 41.8 seconds:

```powershell
npx.cmd supabase db reset
```

Execution order was:

1. recreate the disposable local database;
2. initialize Supabase-managed schemas and roles;
3. apply `20260916143214_production_public_baseline.sql`;
4. apply `supabase/seed.sql`;
5. restart local containers.

No SQL, constraint, FK, or duplicate-key error occurred.

## Validated fixture state

| Table | Expected | Observed after first reset | Observed after second reset |
|---|---:|---:|---:|
| `users` | 2 | 2 | 2 |
| `loyalty_memberships` | 2 | 2 | 2 |
| `loyalty_transactions` | 4 | 4 | 4 |
| `store_categories` | 1 | 1 | 1 |
| `store_lines` | 1 | 1 | 1 |
| `store_products` | 3 | 3 | 3 |
| `store_product_colors` | 3 | 3 | 3 |
| `store_product_sizes` | 2 | 2 | 2 |
| `store_product_stock` | 3 | 3 | 3 |
| `rewards_catalog` | 2 | 2 | 2 |
| `reward_redemptions` | 2 | 2 | 2 |
| `store_orders` | 1 | 1 | 1 |
| `store_order_items` | 1 | 1 | 1 |

All other 31 public application tables contained zero rows. Variant-to-product checks found zero mismatches. Both redemptions have exactly one ledger row with the correct membership, canonical type/source, and negative cost. The delivered Store redemption has exactly one linked fulfillment order and one item; the legitimate requested non-Store redemption has neither.

## Balance validation

Balance is represented only through `loyalty_transactions.points_delta`:

| Member | Credit | Historical redemption debits | Calculated current balance |
|---|---:|---:|---:|
| User A | +2,600 | -200, -400 | **2,000** |
| User B | +500 | none | **500** |

There is no fabricated balance column.

## Edge-case coverage

| Test need | Fixture use |
|---|---|
| Sufficient-points checkout | User A with Product A, B, C, or a multi-item cart |
| Insufficient-points checkout | User B with Product A + Product B (650 points total), or another quantity exceeding 500 |
| Normal finite stock | Product A, sized stock quantity 10 |
| Last-item concurrency | Product B, sized stock quantity 1 |
| Null-size path | Product C, one stock row with `size_id IS NULL`, quantity 3 |
| Multi-item cart | Products A + B, or A + C |
| Store-linked redemption | Reward A, linked to Product C and requiring a Store variant |
| Non-Store redemption | Reward B, no Store product or fulfillment requirement |
| Pending lifecycle | Requested Reward B redemption with its canonical debit |
| Completed lifecycle | Delivered Reward A redemption with debit, order, and item |
| Retry/replay preparation | Stable IDs and unchanged reset state provide deterministic preconditions |
| Conflicting payload preparation | Multiple products/rewards provide alternate payloads; no registry exists yet |

No idempotency table, RPC, constraint, trigger, or transactional implementation was added.

## Repeatability

A second local `npx supabase db reset` completed successfully in approximately 37.9 seconds. It reproduced:

- the same deterministic user, membership, ledger, catalog, variant, stock, reward, redemption, order, and item IDs;
- the same table row counts;
- balances of 2,000 and 500;
- stock quantities of 10, 1, and 3;
- reward states and costs;
- requested/delivered redemption states;
- one debit per redemption;
- the same single fulfillment order/item chain.

No rows accumulated and no duplicate-key failure occurred.

## RLS and service-role compatibility

RLS was not changed or weakened. Under `SET LOCAL ROLE service_role`, the existing local role retained `BYPASSRLS` and read all fixture rows required by later PF-08 server-side tests: users, memberships, ledger, products, stock, rewards, redemptions, orders, and items.

No real `auth.users` rows were created. Direct authenticated-user RLS testing is outside this fixture task; later current-route and RPC tests use the existing service-role server boundary described by the PF-08 design.

## Safety confirmation

- User names, membership codes, tax-code placeholders, SKUs, QR tokens, product names, and reward names are prefixed with `PF08`.
- Email addresses use the reserved `.invalid` domain.
- Phone values are artificial and used only as local fixture data.
- No push subscription, Telegram recipient, Resend destination, provider token, or external endpoint exists in the seed.
- No production-derived row or customer identifier was used.
- No commit was created.

PF-08B was not started.
