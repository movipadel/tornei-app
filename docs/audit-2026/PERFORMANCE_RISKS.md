# MOVIPadel Performance Risks — Phase 2A

## Assessment boundaries

This report identifies likely causes of slowness from source inspection only. It does not state that any database index is missing. The live dataset, Supabase region/tier, PostgreSQL configuration, CDN behavior, browser traces, and production request timings were not available.

## Confirmed architectural risks

### 1. Public polling multiplies a heavy home bootstrap

`src/app/page.tsx` executes six no-store requests at mount, every 15 seconds while visible, and on visibility restoration. Those endpoints collectively perform roughly 8–19 database reads for a normal bootstrap depending on session state. `PublicNav` adds an admin-session request. Several responses contain low-churn data such as settings and circuit metadata.

Impact mechanism: network setup, Next.js handler execution, repeated auth/identity reads, repeated database work, JSON transfer, and React state updates continue even when underlying data is unchanged.

Classification: **CONFIRMED pattern; LIKELY HIGH user and backend impact**.

### 2. Live tournament views poll and recompute the entire graph every 5 seconds

`TournamentLiveDialog` requests `/api/tournaments/[id]/live` every five seconds. The handler performs about 3–5 reads and reconstructs standings, turns, rest information, groups, and/or brackets in JavaScript. Fixed-pair match rows are selected broadly.

Impact mechanism: query/payload/CPU grows with tournament history and is multiplied by concurrent spectators.

Classification: **CONFIRMED pattern; live concurrency and payload size require verification**.

### 3. Circuit ranking request waterfall and N+1 queries

The admin circuit list first loads circuits, then calls a ranking endpoint for every circuit. Each endpoint queries every ranking group sequentially. Public circuit detail contains the same per-group pattern.

Impact mechanism: browser latency is `1 + C` requests; database work is approximately `1 + sum(2 + G_i)` for the admin list. Slowest child determines completion time.

Classification: **CONFIRMED**.

### 4. Checkout validates and updates variants item by item

`POST /api/store/orders` reads product, color, optional size, and stock sequentially inside the cart loop, later updates stock per item, and may read membership/all ledger entries for points. It then awaits three external integration stages.

Impact mechanism: database latency grows linearly with cart items; the multi-step flow holds consistency-sensitive state over many round trips; email/Telegram/push latency is added before response.

Classification: **CONFIRMED; VERY HIGH expected impact on checkout latency**.

### 5. External “best effort” notification work is on write critical paths

Registration, MoviBack request, reward redemption, and order flows await Telegram, web push, and/or Resend. Push dispatch also reads subscriptions before sending.

Impact mechanism: slow or degraded providers directly extend the initiating user request. Parallel push delivery helps within the push stage but does not remove it from the route latency.

Classification: **CONFIRMED**.

### 6. MoviBack balance is repeatedly calculated from ledger rows

`/api/moviback/me` reads recent transactions and then reads all transactions again to calculate balance. Admin user listing reads ledger rows for the returned population and aggregates balances in JavaScript. Staff and redemption flows repeat ledger-based validation.

Impact mechanism: duplicated reads and payload scale with lifetime transaction history.

Classification: **CONFIRMED; cardinality-driven severity requires live data**.

### 7. Unpaginated admin histories and reports

Admin store orders, economics, MoviBack users, dashboard histories, catalogs, and communications expose broad collections. Store economics loads all non-cancelled normal orders and nested items even when a month parameter is present; that parameter filters only special orders. The server then constructs KPIs and monthly summaries in JavaScript.

Impact mechanism: database result size, server memory/CPU, JSON serialization, transfer, and client rendering all increase over time.

Classification: **CONFIRMED data shape; current live impact requires measurement**.

### 8. Pending membership certificates use an N+1 pattern

`/api/admin/moviback/requests` loads pending memberships, then starts a separate latest-certificate query for each row through `Promise.all`.

Impact mechanism: concurrency reduces waterfall time but still creates `1 + N` database requests and can create a burst against Supabase.

Classification: **CONFIRMED**.

### 9. Run lifecycle handlers perform long sequential workflows

Baraonda and fixed-pair start/close handlers execute many reads and writes. A new Baraonda start is approximately 10 database operations; circuit close can be approximately 11–12. Legacy generation and some maintenance routes insert/update rows in loops.

Impact mechanism: accumulated network latency, longer partial-failure windows, and reload of the full run after mutations.

Classification: **CONFIRMED structure; exact latency requires tracing**.

### 10. Registration position maintenance is row-by-row

Cancellation, reserve promotion, and reorder paths update multiple registration positions sequentially.

Impact mechanism: O(number of shifted registrations) PostgREST requests; cost is greatest on full tournaments and bulk reorder.

Classification: **CONFIRMED**.

### 11. Page and API auth checks are repeatedly layered

Middleware checks protected navigation, then each admin/staff endpoint checks its token again. The admin run server page calls two internal HTTP APIs, and each performs another guard. Public navigation also checks admin session on every public page.

Impact mechanism: repeated internal routing and token work; possible repeated access reads in helper-backed routes. This is probably smaller than database fan-out but is pervasive.

Classification: **CONFIRMED; expected impact LOW to MEDIUM without profiles**.

### 12. Broad selects and overlapping endpoint payloads

Examples include `select("*")` for live matches and reference/catalog rows, nested wildcard store graphs, and separate category/line calls beside products that already include those relations. Communications loads the full admin tournament summary endpoint just to populate tournament choices.

Impact mechanism: unnecessary database columns/joins, larger JSON, and redundant mapping/render work.

Classification: **CONFIRMED query shape; impact requires response-size evidence**.

### 13. Service-worker and application cache policies are not aligned

The application frequently requests with `no-store`, while generated Workbox code applies NetworkFirst caching to same-origin API GETs and waits up to ten seconds before fallback. No clear separation between public low-churn resources and user-specific authenticated data is visible in the generated rule.

Impact mechanism: online requests still hit the network first; poor connectivity can delay fallback; correctness/security semantics depend on cache keys and browser lifecycle.

Classification: **CONFIRMED configuration; runtime behavior REQUIRES BROWSER VERIFICATION**.

### 14. Images bypass Next.js image optimization

Static search found at least 21 raw `<img>` elements and no `next/image` import. Dynamic Supabase media includes posters, circuit logos, communication images, rewards, and products.

Impact mechanism: potentially oversized images, missing responsive variants, decode/layout cost, and slower largest-contentful paint.

Classification: **CONFIRMED implementation; performance severity requires actual asset and network measurements**.

### 15. Poster generation is uncached and may be requested twice

The poster route renders SVG/PNG through Satori/Resvg, reads local assets, and returns `Cache-Control: no-store`. Admin share/fallback paths can request the poster for a blob and then open its URL again.

Impact mechanism: repeated CPU rendering and asset loading for identical tournament state.

Classification: **CONFIRMED**.

## Likely query-plan risks requiring live verification

These are not missing-index claims:

- Registration phone search uses leading/trailing wildcard `ILIKE` over normalized alternatives. Obtain `EXPLAIN (ANALYZE, BUFFERS)` and index definitions before deciding whether the predicate or indexing must change.
- User/admin text search includes wildcard predicates, including related user fields. Verify generated PostgREST SQL and plans.
- Frequent filters/orderings include tournament dates/status, registration tournament/status/position, circuit result circuit/group/player/stage, ledger membership/created time, certificate membership/created time, order status/created time, and communication audience/date fields. Verify existing indexes and selectivity.
- Nested PostgREST relationships for orders/items/economics and products/variants/stock may generate efficient or expensive plans depending on constraints/indexes. Inspect live plans.
- RLS is not reconstructable from committed files. Although service-role handlers may bypass RLS, live policies/functions/triggers can still affect direct or function execution and must be inventoried.

## Client lifecycle/revalidation risks

- Home and tournaments use timer plus visibility events; browser tracing should establish whether a visibility event immediately duplicates a recent interval request.
- MoviBack fetches the member summary at mount and again directly after login.
- Mutations in tournament/admin run clients commonly call list reloads or `router.refresh`, refetching more data than the changed entity.
- Admin tournament mutations often reload registrations and the overall tournament list sequentially.
- No request deduplication library or shared client cache was found; independent components own their fetch lifecycle.

## Server transformation risks

The server repeatedly performs aggregation that the database could potentially do with fewer transferred rows:

- tournament registration counts;
- circuit result counts, stages, standings, and duplicate detection;
- MoviBack balances and monthly dashboard summaries;
- live standings/bracket reconstruction;
- store economics, monthly totals, margins, and payer/club summaries;
- registration exact-normalization checks after broad search.

Moving work is not automatically faster; a live plan and correctness requirements must determine whether SQL aggregation, views, RPCs, incremental state, or cache materialization is appropriate.

## Measurement gaps

Static analysis cannot answer:

- p50/p95/p99 route and Supabase latency;
- live row counts, growth rates, payload bytes, cache hit ratios, or concurrent users;
- which user flow is perceived as slowest;
- current PostgreSQL indexes, plans, function cost, triggers, locks, or connection pressure;
- Supabase project/app geographic distance;
- provider latency/failure rate for Resend, Telegram, and web push;
- actual image sizes, transforms, CDN cache headers, and LCP contribution;
- Workbox cache behavior after login/logout and across app upgrades.

