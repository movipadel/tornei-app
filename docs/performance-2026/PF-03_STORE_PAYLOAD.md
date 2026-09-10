# PF-03 — Public Store payload reduction

## Status and scope

PF-03 narrows the public Store catalog database projection and JSON response while preserving the existing Store page, product modal, cart, stock checks and checkout request. It does not add caching or pagination and does not change database/schema state, prices, MoviBack rules, checkout/redemption logic, authentication, authorization, dependencies or UI behavior.

Affected files:

- `src/app/api/store/products/route.ts`
- `src/app/store/page.tsx`
- `docs/performance-2026/PF-03_STORE_PAYLOAD.md`

The secondary consumer `src/app/admin/moviback/catalog/page.tsx` was inspected but not changed because it only reads product `id` and `name`, which remain present.

## Original Store data flow

`src/app/store/page.tsx` mounts as a client page and issues one `cache: "no-store"` request to `GET /api/store/products`. The route performs three sequential Supabase/PostgREST operations:

1. Active `store_categories`, ordered by `sort_order` and name.
2. Active `store_lines`, ordered by `sort_order` and name.
3. Active `store_products`, ordered by product `sort_order` and `created_at`, with embedded category, line, colors, sizes and stock relations.

The route then removes products belonging to inactive categories/lines, filters inactive colors/sizes/stock, orders colors and sizes, requires at least one active color, and returns:

`{ data: { categories, lines, products[] } }`

Each product contains nested `category`, `line`, `colors[]`, `sizes[]` and `stock[]`. The response reaches six structural container levels from the root to a nested row. PF-03 keeps that shape and depth; it narrows only row fields.

The Store page uses the response for category/line filters, product ordering/cards, modal description and images, color/size selection, exact color/size stock lookup, quantity validation, cart pricing and checkout IDs. Checkout itself posts only product/color/size IDs and quantity to the unchanged `/api/store/orders` handler.

The only other direct consumer is the MoviBack reward administration page, which uses this endpoint to populate a product `<select>` with product ID and name.

## Root cause of the oversized response

The three queries used broad `select("*")` projections. The product query also embedded five wildcard relations:

- full category row repeated per product;
- full line row repeated per product;
- full color rows;
- full size rows;
- full stock rows.

The measured catalog has only 31 products but 418 stock rows. Every stock row repeated its own ID, product ID, active flag, SKU and timestamps even though the Store matches stock only by color ID, nullable size ID and quantity. Similar product IDs, active flags, sort fields and timestamps were repeated in color/size rows. This metadata amplification, rather than catalog cardinality, was the main source of the 211 KB body.

## Original response fields

The pre-change response exposed:

- Categories/lines: `id`, `name`, `slug`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- Products: all 14 table fields plus full category/line relations and nested arrays.
- Colors: all 9 table fields.
- Sizes: all 6 table fields.
- Stock: all 9 table fields.

The public Store did not consume timestamps, active/sort metadata after server filtering, stock row IDs/product IDs/SKUs, or product `allow_euro`, `allow_points` and `allow_mixed`. Payment UI behavior was already independent of those flags and checkout revalidates its own server-side data.

## Exact implementation

The route now selects only fields needed either for server filtering/ordering or the two known consumers.

Returned fields are:

- Categories/lines: `id`, `name`, `slug`.
- Products: `id`, `category_id`, nullable `line_id`, `name`, `description`, `base_price_euro`, `base_price_points`, minimal category/line objects, colors, sizes and stock.
- Colors: `id`, `color_name`, `color_hex`, `image_path`.
- Sizes: `id`, `size_label`.
- Stock: `color_id`, nullable `size_id`, `stock_qty`.

The product query still retrieves color/size `is_active` and `sort_order`, and stock `is_active`, but strips those internal fields after applying the unchanged filters and sorting. Product/category/line active filters and all ordering clauses remain in place.

Full category and line relations are no longer embedded in every product query row. Instead, minimal category/line objects are reconstructed from the already-fetched active lookup lists. Live schema evidence confirms the product category and line relationships are foreign keys; `category_id` is non-null and `line_id` remains nullable. A product with an inactive category or non-null inactive line remains excluded; a null line remains allowed.

The Store page's TypeScript model was narrowed to remove the stock/product fields no longer returned. No render, interaction or checkout function was changed.

## Fields removed from the public response

- Category/line: `is_active`, `sort_order`, `created_at`, `updated_at`.
- Product: `allow_euro`, `allow_points`, `allow_mixed`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- Color: `product_id`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- Size: `product_id`, `is_active`, `sort_order`, `created_at`.
- Stock: `id`, `product_id`, `sku`, `is_active`, `created_at`, `updated_at`.

No description, name, price, image path, visible variant identifier, stock matching key or stock quantity was removed. Detail-only data was not lazy-loaded because the current modal requires it immediately and a second stock-sensitive API would add complexity.

## Before/after measurements

Measured on 2026-09-10 using the same local Next.js 16.1.5 optimized production-server method as the audit. The server used the repository's existing configuration and read-only public GET routes. Each API was warmed once and sampled seven times with the response body fully read.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Response bytes | 211,150 | 87,508 | -123,642 / -58.6% |
| Median response time | 240.6 ms | 299.1 ms | +58.5 ms |
| Average response time | 277.9 ms | 344.5 ms | +66.6 ms |
| Range | 208.1–412.9 ms | 216.1–573.0 ms | Network variance present |
| Database operations | 3 sequential | 3 sequential | unchanged |
| Categories | 5 | 5 | unchanged |
| Lines | 2 | 2 | unchanged |
| Products | 31 | 31 | unchanged |
| Active colors | 90 | 90 | unchanged |
| Active sizes | 139 | 139 | unchanged |
| Active stock rows | 418 | 418 | unchanged |

The payload reduction is confirmed; this sample did not show lower end-to-end response latency. Query count is unchanged, and remote database/network variability dominates a seven-sample timing set. The latency result must not be interpreted as a proven regression or improvement without production traces and larger interleaved samples.

The `/store` static HTML smoke remained 200 and 13,553 bytes.

## Transfer-volume illustration

Uncompressed JSON body only, excluding HTTP headers, HTML, JavaScript, images and compression:

| Store loads | Before | After | Avoided |
|---:|---:|---:|---:|
| 1 | 211,150 B | 87,508 B | 123,642 B |
| 10 | 2,111,500 B | 875,080 B | 1,236,420 B |
| 100 | 21,115,000 B | 8,750,800 B | 12,364,200 B |

These are transfer illustrations, not throughput or capacity claims.

## Correctness validation

A normalized before/after model retained and compared every field that can affect public Store behavior:

- category/line IDs, names, slugs and order;
- product IDs/order, names, descriptions, category/line IDs and relations;
- euro and point prices;
- color IDs/order, names, hex values and image paths;
- size IDs/order and labels;
- stock color IDs, nullable size IDs and quantities.

The normalized model SHA-256 matched exactly before and after. Counts also matched: 31 products, 90 colors, 139 sizes and 418 stock rows. Consequently the available products, filters, names, descriptions, cards, images, prices, modal choices, selected stock rows, null-size handling, available quantities and sold-out/quantity rejection behavior are unchanged for the measured fixture.

Additional checks:

- Public catalog returned 200 in every measured post-change sample.
- `/store` page returned 200.
- Product and variant ordering clauses remain unchanged.
- Products still require an active color.
- The admin MoviBack product selector still receives its required `id` and `name`.
- `cache: "no-store"` remains on the browser request; no stock cache was introduced.
- Checkout and reward-redemption files were not modified.

## Tests and checks

- `npx tsc --noEmit --pretty false` — passed.
- `npm run build` — passed, including Next.js TypeScript validation and generation of all 91 static pages.
- Public Store API smoke and seven-sample measurement — passed.
- Store page HTTP smoke — passed.
- Normalized visible-model parity — passed exactly.
- Targeted ESLint — the API handler is clean; `src/app/store/page.tsx` retains its pre-existing seven `no-explicit-any` errors and eight warnings. No PF-03 change introduced a diagnostic.
- No Store-specific test/spec files exist under the Store page/API paths.

Existing build warnings about `themeColor` metadata and browserslist age were not changed.

## Regression risk and limitations

Risk is low:

- The public response intentionally no longer includes unused metadata fields. An uncommitted or external consumer unknown to this repository could depend on them; repository-wide direct-consumer search found only the Store page and MoviBack product selector.
- Stock freshness is unchanged. No response cache, schema, transaction or checkout behavior was added.
- Product detail and all stock rows remain eagerly loaded, so further reduction would require a separate detail/availability request and stronger interaction tests.
- Runtime validation covered the current live public fixture, not every future null/tie condition.
- Measurements are local warm samples, not browser HAR/Web Vitals, compressed wire bytes, Vercel timings or production p95/p99.
- The service worker's existing NetworkFirst behavior was not changed or separately measured.

## Rollback

No database or deployment rollback is required. To revert PF-03:

1. Restore wildcard selects for categories, lines, products and embedded relations.
2. Restore the spread-based product mapping and full nested rows.
3. Restore the removed Store page type fields.
4. Remove this document if PF-03 is abandoned entirely.

Checkout, redemption, schema, environment and dependency rollback steps are not required because none were changed.
