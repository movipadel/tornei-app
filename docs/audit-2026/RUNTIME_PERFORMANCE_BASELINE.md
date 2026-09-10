# MOVIPadel Runtime Performance Baseline — Phase 2C

## Evidence labels

- **MEASURED** — observed in this Phase 2C local run.
- **STATICALLY CONFIRMED** — established from source/build artifacts, not timed at runtime.
- **ESTIMATED** — calculated from confirmed call structure/cardinality.
- **NOT YET MEASURED** — requires an authenticated, active-event, browser, provider, or database-plan environment not safely available here.

## Measurement environment and limits

Measurements were made on 2026-09-09 from an optimized local Next.js 16.1.5 production server on Windows. The server loaded the application's existing local configuration and reached the normally configured Supabase service only through existing read-only GET route handlers. No direct Supabase connection, SQL, mutation endpoint, production checkout, redemption, or authenticated session was used. No secret or response body containing PII was recorded.

Each endpoint was warmed once and sampled seven times. Timings are end-to-end from a local HTTP client through local Next.js to the configured remote data service and back, with bodies fully read. They are **not Vercel production timings**, do not include a real browser's JavaScript/hydration/rendering, and are too few for a production p95/p99. Cache headers are HTTP response headers observed by that client; the Workbox service worker was not in the measurement path.

The production build succeeded with Webpack. It confirmed static prerendering for the main public shells and on-demand rendering for dynamic route segments/APIs. Build-generated tracked PWA artifacts were restored after inspection.

## Warm public/guest endpoint baseline

| Endpoint | Status | Payload bytes | Min ms | Median ms | Average ms | Max ms | Observed Cache-Control | Evidence |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `/` | 200 | 10,446 | 2.3 | 2.5 | 2.9 | 5.8 | `s-maxage=31536000` | **MEASURED** |
| `/api/tournaments` | 200 | 4,004 | 217.6 | 231.7 | 241.3 | 289.3 | absent | **MEASURED** |
| `/api/app-settings` | 200 | 218 | 65.4 | 74.3 | 77.1 | 96.0 | absent | **MEASURED** |
| `/api/user/me` guest | 200 | 13 | 2.4 | 2.5 | 2.6 | 3.4 | absent | **MEASURED** |
| `/api/circuits` | 200 | 665 | 200.2 | 221.5 | 234.1 | 297.5 | absent | **MEASURED** |
| `/api/moviback/me` guest | 200 | 96 | 2.6 | 3.2 | 3.3 | 3.9 | absent | **MEASURED** |
| `/api/user/communications` guest | 200 | 11 | 2.0 | 2.4 | 2.5 | 2.9 | absent | **MEASURED** |
| `/api/admin/me` guest | 403 | 21 | 2.0 | 2.1 | 2.3 | 3.2 | absent | **MEASURED** |
| `/api/store/products` | 200 | 211,150 | 272.6 | 282.5 | 306.9 | 454.4 | absent | **MEASURED** |

The six Home data requests run concurrently in source. Seven measured parallel guest cycles transferred 5,007 response bytes per cycle and completed in 221.1–714.2 ms, median **253.9 ms**, average **350.1 ms**. The slowest data endpoints were consistently tournaments and circuits. The spread cannot be assigned to PostgreSQL, network, or server compute without spans/plans.

## Public page-document baseline

| Page | HTML bytes | Median ms | Min–max ms | Cache-Control | Build rendering |
|---|---:|---:|---:|---|---|
| `/` | 10,446 | 2.8 | 1.9–4.9 | `s-maxage=31536000` | Static |
| `/tornei` | 11,006 | 2.1 | 1.8–13.9 | `s-maxage=31536000` | Static |
| `/moviback` | 12,681 | 2.5 | 2.4–3.0 | `s-maxage=31536000` | Static |
| `/moviback/premi` | 12,769 | 2.0 | 1.7–2.6 | `s-maxage=31536000` | Static |
| `/store` | 13,553 | 1.8 | 1.6–2.6 | `s-maxage=31536000` | Static |
| `/circuiti/[slug]` | 12,203 | 10.0 | 9.0–14.2 | `private, no-store/no-cache` | Dynamic segment |

These fast HTML-shell results do not mean the screens become useful in the same time: data fetch and client hydration happen after the shell loads.

## Ranking and catalog baseline

Two public circuits were returned. Their current ranking-group distribution was one and four groups.

| Endpoint shape | Groups | DB operations from code | Payload | Median ms | Average ms | Evidence |
|---|---:|---:|---:|---:|---:|---|
| `/api/circuits/[slug]` | 1 | 4 (`3 + G`) | 10,682 B | 308.0 | 313.8 | **MEASURED** |
| `/api/circuits/[slug]` | 4 | 7 (`3 + G`) | 30,240 B | 515.7 | 517.4 | **MEASURED** |

The larger group count coincided with approximately 208 ms more median latency and 19.6 kB more response data. Two samples cannot prove a per-query latency coefficient, but they provide runtime support for the statically confirmed per-group access pattern.

The Store catalog response represented 5 categories, 2 lines, 31 products, 90 colors, 139 sizes, and 418 stock rows. Its **211,150-byte** JSON payload is the largest measured API response by a wide margin despite the small database.

## Production-build client artifact estimates

The build produced 171 JavaScript chunks totaling about 1.98 MiB raw across the entire application. Route-level initial JavaScript was reconstructed from build/client-reference manifests plus shared root chunks and compressed locally with gzip. These are artifact estimates, not browser transfer measurements; Vercel may use Brotli and browser caching changes repeat cost.

| Route | Raw JS KiB | Gzip-equivalent KiB | Route/dependency chunk KiB raw | Evidence |
|---|---:|---:|---:|---|
| `/` | 570.1 | 169.8 | 182.4 | **ESTIMATED from build artifacts** |
| `/tornei` | 668.5 | 203.5 | 280.8 | **ESTIMATED** |
| `/circuiti/[slug]` | 418.3 | 125.5 | 30.6 | **ESTIMATED** |
| `/moviback` | 543.9 | 164.4 | 156.1 | **ESTIMATED** |
| `/moviback/premi` | 451.2 | 135.3 | 63.5 | **ESTIMATED** |
| `/store` | 527.6 | 160.7 | 139.9 | **ESTIMATED** |

## Measurements unavailable in this environment

- Authenticated member Home/MoviBack response time, row count, and payload.
- Admin circuit waterfall and protected routes.
- A representative live endpoint: the public tournament list returned seven upcoming tournaments and none had live state exposed.
- Checkout/redemption/accreditation timing because safe audit rules prohibit production mutations.
- Resend, Telegram, and web-push timing.
- PostgreSQL `EXPLAIN` because direct production SQL is not authorized.
- Vercel middleware/function cold starts, region effects, server timing, connection-pool pressure, or production percentiles.
- Real browser HAR, LCP, INP, CLS, hydration/long tasks, image decode, and Workbox runtime behavior.

## Baseline bottleneck classification

| Area | Frontend | HTTP/API trips | Server logic | DB trips | Query design | DB volume | App aggregation | External latency | Cache strategy |
|---|---|---|---|---|---|---|---|---|---|
| Home | HIGH | VERY HIGH | MEDIUM | VERY HIGH | LOW | LOW | MEDIUM | LOW | HIGH |
| Live tournament | HIGH | VERY HIGH | HIGH | VERY HIGH | MEDIUM | LOW now | HIGH | LOW | HIGH |
| MoviBack member | MEDIUM | HIGH | MEDIUM | VERY HIGH | MEDIUM | LOW now | HIGH | LOW | MEDIUM |
| Circuit rankings | MEDIUM | HIGH | HIGH | VERY HIGH | LOW–MEDIUM | LOW now | HIGH | LOW | MEDIUM |
| Checkout/redemption | LOW | MEDIUM | HIGH | VERY HIGH | LOW for lookups | LOW now | MEDIUM | VERY HIGH | LOW |
| Store catalog | MEDIUM | MEDIUM | MEDIUM | MEDIUM | broad response | LOW | MEDIUM | LOW | HIGH |

This classification combines measured public timings with confirmed architecture. It is not a latency percentage allocation.

