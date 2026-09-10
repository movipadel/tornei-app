# MOVIPadel Audit Phase 2C Summary

## Status

Phase 2C collected the maximum safe local runtime evidence available without production mutations, private sessions, or direct SQL. It also prepared a minimal query-plan and staging measurement set. No performance change, rebranding work, database change, dependency change, or commit was made.

## What was measured

- Successful optimized Next.js/Webpack production build and static/dynamic route classification.
- Seven warm samples of public/guest Home endpoints through the local optimized server and normally configured data service.
- Seven parallel Home data cycles: median 253.9 ms, 5,007 response bytes for guest.
- Public Store catalog: median 282.5 ms, 211,150 bytes for 31 products and 418 stock rows.
- Public circuit detail: one group at 308.0 ms/10,682 bytes; four groups at 515.7 ms/30,240 bytes.
- Public HTML shell timing/size for Home, tournaments, circuit, MoviBack, rewards and Store.
- Production build artifact estimates for initial JavaScript: approximately 125.5–203.5 KiB gzip-equivalent across key routes.
- Static frontend counts: 63/78 TSX files are client components; 21 raw images; no detected Next image import/loading attributes; only one width/height occurrence.

These are local end-to-end observations, not Vercel production percentiles or browser Web Vitals.

## What remains unavailable

- Authenticated member, staff and admin route timing/payloads.
- An active live tournament response; none of the seven upcoming public tournaments exposed live state.
- Checkout, redemption, accreditation or other mutation timing.
- External Resend, Telegram and web-push duration.
- Direct PostgreSQL/Supabase query plans and execution spans.
- Browser HAR, LCP, INP, CLS, hydration CPU and Workbox runtime/cache behavior.
- Production cold starts, region/network split, concurrency and p95/p99.

## Strongest evidence

1. Home's static document is fast, while useful data waits for six parallel no-store APIs. Tournaments and circuits each measured around 220–232 ms median and repeat every 15 seconds.
2. Store's initial catalog response is 211 kB, far larger than all other sampled public APIs, despite only 31 products.
3. Circuit detail shows runtime scaling consistent with the confirmed per-group sequential query loop.
4. Live polling performs 12 full refreshes/viewer/minute and 36–60 DB operations/viewer/minute by confirmed control-flow estimate.
5. Checkout/redemption has a confirmed sequential, non-atomic read/check/write path and awaits three provider stages, but its latency is not measured.

## Performance Foundation Implementation Plan

No PF step is implemented. Each step is intended to be independently reviewable and reversible.

### PF-01 — Runtime timing foundation

- Objective: add privacy-safe route/database/provider spans and response-byte reporting for priority endpoints.
- Files/features affected: shared server timing helper; Home/live/MoviBack/ranking/checkout handlers; deployment telemetry.
- Expected benefit: high-confidence before/after decisions.
- Complexity: MEDIUM.
- Regression risk: LOW.
- Database migration required: NO.
- Prerequisite: telemetry destination, PII-redaction and sampling policy.
- Validation: compare emitted spans with controlled local/staging requests; confirm no values/bodies are logged.
- Rollback: disable sampling/remove timing wrapper; application behavior remains unchanged.

### PF-02 — Split Home freshness cadence

- Objective: remove app settings and identity from the 15-second timer; define explicit refresh for mutations and visibility.
- Files/features affected: `src/app/page.tsx`, `PublicNav`, Home data endpoints.
- Expected benefit: HIGH; removes repeated API/DB work for every active client.
- Complexity: LOW–MEDIUM.
- Regression risk: LOW–MEDIUM.
- Database migration required: NO.
- Prerequisite: PF-01 baseline and accepted freshness rules.
- Validation: 65-second guest/member HAR; login/logout/profile and admin settings tests; unchanged Home content checks.
- Rollback: restore the single `loadAll` timer path.

### PF-03 — Home/session request consolidation

- Objective: share user/membership resolution and separate slow-changing public bootstrap from private dynamic summaries.
- Files/features affected: Home route/client, user auth helper, MoviBack and communication read services.
- Expected benefit: HIGH for authenticated Home.
- Complexity: MEDIUM.
- Regression risk: MEDIUM.
- Database migration required: NO.
- Prerequisite: authenticated PF-01 trace and response contract tests.
- Validation: compare data parity for guest, user without membership, approved/suspended member; request/DB-call count.
- Rollback: retain old endpoints behind a client fallback/feature flag.

### PF-04 — Batch ranking and certificate reads

- Objective: replace per-group and per-membership read loops with batched result sets while preserving server aggregation.
- Files/features affected: public/admin circuit APIs; admin MoviBack request API.
- Expected benefit: HIGH rankings, MEDIUM certificate queue.
- Complexity: LOW–MEDIUM.
- Regression risk: LOW–MEDIUM.
- Database migration required: NO.
- Prerequisite: ranking/certificate response fixtures.
- Validation: byte-for-byte normalized ranking/order/latest-certificate parity and reduced DB operation count.
- Rollback: restore loop implementation.

### PF-05 — Reduce Store initial payload

- Objective: stop shipping unnecessary fields/full stock graph before the user selects a product/variant.
- Files/features affected: `/api/store/products`, Store/rewards/admin catalog consumers.
- Expected benefit: HIGH; current measured payload is 211 kB.
- Complexity: MEDIUM.
- Regression risk: MEDIUM.
- Database migration required: NO.
- Prerequisite: field-use inventory and cart/variant behavior tests.
- Validation: response-size target, product/variant/stock UI parity, slow-mobile LCP/interaction trace.
- Rollback: versioned endpoint or retain previous full-payload mode.

### PF-06 — Conditional live refresh foundation

- Objective: add a response version/fingerprint and avoid retransmitting/recomputing unchanged live state before considering Realtime.
- Files/features affected: live route, `TournamentLiveDialog`, score mutation responses.
- Expected benefit: VERY HIGH during active events if unchanged-refresh rate is substantial.
- Complexity: MEDIUM–HIGH.
- Regression risk: HIGH.
- Database migration required: POSSIBLE, but initial response fingerprint can avoid one.
- Prerequisite: active-event PF-01 trace and score freshness contract.
- Validation: Baraonda/fixed-pair 65-second traces, score propagation, reconnect/visibility behavior, 1/10/30/100-viewer read test.
- Rollback: client feature flag returns to full 5-second fetch.

### PF-07 — MoviBack aggregate and parallel reads

- Objective: use database-side balance aggregation, run independent member reads concurrently, and remove duplicate ledger transfer.
- Files/features affected: member summary, staff lookup/accreditation response, checkout/reward balance helpers.
- Expected benefit: MEDIUM now, HIGH with ledger growth.
- Complexity: MEDIUM.
- Regression risk: HIGH for authoritative balance; LOW for read parallelization.
- Database migration required: NO for aggregate query; POSSIBLE for RPC/index.
- Prerequisite: QP-01/QP-02 plans and ledger characterization tests.
- Validation: balance equality for every transaction type, concurrent spend/earn tests, payload and call-count reduction.
- Rollback: retain ledger-sum implementation behind one server helper switch.

### PF-08 — Post-commit notification delivery

- Objective: remove provider latency from user response while defining reliable delivery semantics.
- Files/features affected: email, Telegram, admin-push helpers and registration/membership/order/redemption routes.
- Expected benefit: HIGH if provider time is material.
- Complexity: MEDIUM without durability; HIGH with outbox.
- Regression risk: HIGH due operational-message loss/duplication.
- Database migration required: YES for durable outbox; NO for non-durable post-response dispatch.
- Prerequisite: measured provider spans and delivery requirements.
- Validation: delay/failure/retry/duplicate tests; response latency; operator delivery audit.
- Rollback: switch routes back to awaited dispatch.

### PF-09 — Transactional checkout/redemption

- Objective: atomically validate/debit points, conditionally decrement stock, and create order/items/redemption with idempotency.
- Files/features affected: checkout/reward handlers, new narrowly granted database RPC, ledger/stock/order access.
- Expected benefit: VERY HIGH for correctness and HIGH for latency.
- Complexity: VERY HIGH.
- Regression risk: VERY HIGH.
- Database migration required: YES.
- Prerequisite: staging concurrency/failure tests, data-quality checks, idempotency and pricing rules.
- Validation: same-stock and same-balance races, rollback injection at every stage, retry/idempotency, parity with current totals.
- Rollback: versioned RPC and route feature flag to prior flow; migrate no data destructively.

### PF-10 — Plan-validated indexes

- Objective: add only indexes proven useful for membership/ledger/certificate/redemption hot queries.
- Files/features affected: future database migration; no UI contract.
- Expected benefit: LOW now, HIGH future resilience.
- Complexity: LOW–MEDIUM.
- Regression risk: LOW–MEDIUM, including write overhead.
- Database migration required: YES.
- Prerequisite: QP-01/QP-02 plans, index-size/write-rate and duplicate checks.
- Validation: before/after plans and endpoint spans; index usage; write latency.
- Rollback: drop only the new independently named index after confirming no dependency.

### PF-11 — Registration/run transactional workflows

- Objective: replace row-by-row position maintenance and partial multi-step run transitions with atomic/idempotent operations.
- Files/features affected: registration create/cancel/promote/reorder; Baraonda/fixed start/close/reset.
- Expected benefit: HIGH during operations; very high correctness value.
- Complexity: VERY HIGH.
- Regression risk: VERY HIGH.
- Database migration required: YES likely.
- Prerequisite: characterization suite and staging concurrency/rollback evidence.
- Validation: capacity/reserve races, position uniqueness, every tournament formula/format, close/reopen/reset and circuit-result parity.
- Rollback: versioned RPC/feature flags and untouched existing route implementation until acceptance.

### PF-12 — Browser/PWA/image pass

- Objective: align private/public caching, add responsive/intrinsic image handling, and reduce measured hydration/long tasks.
- Files/features affected: PWA configuration, image components, main public pages and service-worker lifecycle.
- Expected benefit: MEDIUM–HIGH on mobile, pending browser evidence.
- Complexity: MEDIUM–HIGH.
- Regression risk: HIGH for cache/session behavior; LOW–MEDIUM for image sizing.
- Database migration required: NO.
- Prerequisite: production browser HAR/Web Vitals and Workbox login/logout/offline tests.
- Validation: LCP/CLS/INP, cache isolation, offline/update behavior, visual regression.
- Rollback: cache-rule version rollback and per-image component rollback.

## Required final conclusions

1. **Current performance baseline available.** A local optimized public/guest baseline is available for Home endpoints, circuit rankings, Store catalog, page documents and build artifacts; it is not a production percentile baseline.
2. **Top 5 measured or strongest evidenced bottlenecks.** Home periodic request amplification; 211 kB Store catalog; circuit per-group query scaling; full five-second live refresh architecture; checkout/redemption serial non-atomic path with awaited providers.
3. **Dominant cause for each.** Home: HTTP/DB round trips and cache strategy. Store: payload/query shape and client readiness. Ranking: DB round trips and app aggregation. Live: frontend polling, DB trips, recomputation and cache. Checkout: DB trips, server orchestration and external latency.
4. **Quick wins confirmed by runtime evidence.** Remove settings/identity from Home polling; batch circuit groups/results; reduce initial Store catalog payload. Certificate batching and MoviBack parallel reads are strong static quick wins but lack authenticated timing.
5. **Optimizations that should NOT be attempted yet.** Realtime replacement, authenticated PWA caching, maintained balance, broad client/server refactor, speculative composite indexes, or non-durable background notification changes.
6. **Database changes that appear justified.** A transactional checkout/redemption boundary is justified primarily for consistency and round-trip reduction; an outbox is justified only if reliable notifications are required. Implementation still needs staging tests.
7. **Database changes that remain unproven.** Every proposed index, maintained balance/snapshot, ranking RPC, live-version column, and transactional registration/run RPC remains unproven by runtime plans/tests.
8. **Frontend optimizations justified by evidence.** Home cadence separation, Store payload reduction, ranking request batching, and targeted conditional live-response work after an active trace. Image optimization is plausible but not yet Web-Vitals-proven.
9. **Recommended implementation sequence.** PF-01 instrumentation; PF-02 Home cadence; PF-04 ranking/certificate batching; PF-05 Store payload; PF-03/PF-07 authenticated consolidation; PF-06 live conditional refresh; PF-08 provider delivery; PF-09 checkout transaction; PF-10 measured indexes; PF-11 run/registration transactions; PF-12 PWA/image work as evidence directs.
10. **Expected user-perceived improvement potential: LOW / MEDIUM / HIGH / VERY HIGH.** **HIGH** from currently justified request/payload reductions; architectural capacity for improvement remains very high.
11. **Confidence level.** **HIGH** in bottleneck mechanisms and public local measurements; **MEDIUM** in production user-perceived magnitude.
12. **Any measurements still missing.** Authenticated/admin traces, active live payload/unchanged rate, staging checkout/provider/concurrency spans, PostgreSQL plans, production p50/p95/p99, browser Web Vitals/HAR, image metrics, and Workbox session/offline behavior.

