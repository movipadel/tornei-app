# MOVIPadel Phase 2C Measurement Plan

## Objective and safety boundary

Phase 2C should collect the minimum runtime evidence needed to choose optimizations with high confidence. Phase 2B did not execute these measurements.

Production measurement must be read-only and privacy-safe unless a separate staging/concurrency authorization is granted. Do not place PII, cookies, tokens, certificate paths, push endpoints, or order contents in reports. Use query fingerprints and opaque IDs. `EXPLAIN ANALYZE` actually executes a query: use it only for bounded SELECT statements judged safe, preferably against staging/production-shaped data. Never run it on mutations or RPCs with side effects.

## Minimum prioritized measurement set

### M1 — Home browser/server trace

Priority: **P0**. Decision unlocked: Home cadence, caching, composition, and first quick wins.

Capture one authenticated-member and one guest session on mobile 4G and normal Wi-Fi:

- Network waterfall for `/api/tournaments`, `/api/app-settings`, `/api/user/me`, `/api/circuits`, `/api/moviback/me`, `/api/user/communications`, `/api/admin/me`, and optional registration search.
- DNS/connect/TLS/TTFB/download time, response bytes, status/cache headers, service-worker source, and duplicate timer/visibility requests.
- Server timing split: middleware/guard, Next.js compute, each Supabase await, serialization.
- One 65-second trace to include initial load and four steady polling intervals; one hide/show visibility test.
- Web Vitals and main-thread long tasks for the Home route.

Minimum output: per-endpoint p50/p95 from a representative production window plus two annotated HAR traces. Avoid exporting response bodies.

### M2 — Live tournament amplification trace

Priority: **P0**. Decision unlocked: conditional polling/cache versus event/delta architecture.

Measure `/api/tournaments/[id]/live` separately for one active Baraonda and one active fixed-pair run:

- route duration, Supabase time per child query, server transformation time, JSON serialization time, payload bytes;
- browser render/commit time and whether unchanged responses cause meaningful work;
- 65-second single-viewer trace;
- authorized staging/load test at 1, 10, 30, and 100 viewers using read-only GET traffic, reporting p50/p95/p99, errors and database utilization.

Do not infer production capacity from request arithmetic alone.

### M3 — Checkout and redemption span trace

Priority: **P0**. Decision unlocked: transactional RPC boundaries and notification decoupling.

In a safe staging environment, trace one-, three-, and five-item checkout for euro and points/mixed modes, plus store-linked reward redemption:

- duration of user/membership/ledger validation;
- every product/color/size/stock read;
- order/item/ledger/stock writes;
- compensation paths;
- Resend, Telegram, subscription read, and web-push duration separately;
- request/response bytes and end-to-end browser latency.

Run controlled concurrency tests for same stock variant and same points balance. Verify oversell, lost update, double spend, duplicate order, idempotent retry, and partial-failure behavior. These are state-changing tests and must not run against production without explicit authorization and a reversible test protocol.

### M4 — Four MoviBack SELECT plans

Priority: **P1**. Decision unlocked: aggregate/RPC/index choice.

Obtain sanitized plans for representative small, median, and largest member histories:

1. `loyalty_memberships` by `user_id`.
2. `loyalty_transactions` by `membership_id` ordered newest with limit 20.
3. `SUM(points_delta)` by `membership_id` compared with current full-row transfer.
4. latest `medical_certificates` by `user_id`, upload time descending, limit one.

Collect planning/execution time, actual/estimated rows, buffers, scan type, sort method, and bytes returned. Use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` only for these bounded SELECTs under safe load. Compare candidate indexes with hypothetical/planning tools if available before creating anything.

### M5 — Circuit ranking trace and plan

Priority: **P1**. Decision unlocked: API consolidation versus SQL/RPC aggregation.

- Browser waterfall for `/admin/circuits` including every per-circuit ranking request.
- Server spans for circuit/group/result queries and JavaScript grouping/sorting.
- Response bytes by circuit/group.
- Plan for `circuit_results WHERE ranking_group_id = ?`, including public date ordering.
- Compare existing multi-call implementation with a read-only prototype query plan that fetches all required groups in one operation; do not deploy it.

### M6 — Admin history/report payload baseline

Priority: **P1**. Decision unlocked: pagination, period filtering, database aggregation.

Measure `/api/admin/store-orders`, both store economics endpoints, `/api/admin/moviback/users`, `/api/admin/moviback/dashboard`, and user detail:

- response rows/bytes, DB time, Node transform time, serialization, peak function memory, browser render time;
- production growth trend for orders/items/ledger over 30/90/365 days if available;
- plan for order/date/status nested retrieval and admin ledger population query.

Given only 15 current orders, stop analysis if timings are already negligible; treat it as future design rather than a current optimization.

### M7 — Registration and run lifecycle timing

Priority: **P1**. Decision unlocked: which workflows justify transactional RPC work first.

In staging with representative tournament sizes, instrument:

- registration create, cancel with reserve promotion, and reorder;
- Baraonda start/score/close;
- fixed-pair start/bracket/score/close.

Report statement count, total Supabase wait, domain-computation time, notification time, post-mutation reload time, locks/errors, and partial-failure behavior. Use controlled concurrent registration at the last available place. Do not run state-changing `EXPLAIN ANALYZE` in production.

### M8 — PWA, image, and poster measurement

Priority: **P2**. Decision unlocked: cache and perceived-performance work.

- Inspect Workbox API cache keys, hit/miss/fallback timing, and behavior across login/logout, user change, deploy, offline, and visibility restoration.
- Capture image request count, encoded/display dimensions, bytes, format, CDN/storage cache headers, decode time, and LCP attribution.
- Measure poster route cold/warm CPU, render time, response bytes, identical-request frequency, and double-fetch behavior.

## Targeted plan inventory after the minimum set

Only if M1–M8 leave material database uncertainty, obtain plans for:

- future tournaments by `date/time` and by circuit/date;
- newest active run by tournament/status/creation;
- registration wildcard phone search across both player columns;
- reward redemption history by member/request time;
- fixed-pair match graph by run and display order;
- user communication active/date/target and tournament branches;
- nested product/color/size/stock and order/item/economics PostgREST SQL;
- circuit player-key merge lookup.

## Required telemetry fields

For endpoints: request fingerprint, route, persona, response status, duration, response bytes, cache status, cold/warm indicator, region, Supabase total wait, provider total wait, and transformation/serialization time.

For database queries: normalized fingerprint, calls, rows, mean/p95 if available, total execution time, shared blocks hit/read, temp blocks, planning time, relation/index names, and error/timeout/lock counts.

For concurrency: offered request rate, active users, completed rate, p50/p95/p99, error rate, connection/pool utilization, CPU/I/O, and correctness outcomes. Never include bind values containing PII.

## Decision thresholds

Avoid universal millisecond thresholds before baseline. Use these comparative rules:

- Optimize repeated work first when unchanged calls dominate request volume even if each is individually fast.
- Prefer round-trip reduction when Supabase await count/latency dominates handler compute.
- Prefer SQL aggregation/index work when plans show growing scanned rows, sorts, poor estimates, or transferred history dominates.
- Prefer provider decoupling when external services are a material portion of p95 mutation time.
- Prefer payload/image work when transfer/decode/render dominates TTFB or LCP.
- Do not add an index if plans show negligible time at projected growth or an existing index is adequate.

## Phase 2C deliverable recommendation

Produce one evidence table mapping each P0/P1 candidate to baseline, bottleneck share, selected design, expected improvement, correctness constraints, rollout/rollback, and post-change acceptance test. Keep rebranding work separate.

