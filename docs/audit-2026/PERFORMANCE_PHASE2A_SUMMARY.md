# MOVIPadel Performance Audit — Phase 2A Summary

## Status

Phase 2A is complete as a static, repository-only performance analysis. No application logic, database schema, configuration, dependency, deployment setting, or production behavior was changed. No optimization was implemented and Phase 2B was not performed.

Coverage included repository-wide searches across the 235 relevant source files identified in Phase 1, all 101 API route files, 35 page entry points, client lifecycle/fetch call sites, Supabase access patterns, notification integrations, PWA cache rules, and material image/poster paths. Detailed control-flow tracing concentrated on the priority user flows rather than generated/vendor content.

## Executive conclusion

MOVIPadel's likely slowness is not attributable to one isolated query from repository evidence. The dominant pattern is multiplication: frequently polling client pages call several independent route handlers; handlers then perform several mostly sequential Supabase operations, transfer broad row sets, aggregate in Node.js, and sometimes wait for external providers. As data and concurrent users grow, this structure can increase browser requests, database round trips, payload, and server CPU simultaneously.

The three highest-value areas to investigate first are:

1. **Home plus live-tournament read traffic** — quantify the cost of six-request 15-second polling and full tournament-state 5-second polling under realistic concurrency.
2. **Checkout and reward redemption critical paths** — split time between per-item database operations, ledger/stock consistency work, and awaited Resend/Telegram/push calls.
3. **Circuit rankings and MoviBack ledger aggregation** — profile confirmed N+1 and full-history patterns on production-sized data.

## Top 10 likely bottlenecks

1. **Home polling:** six no-store endpoints repeat every 15 seconds and on visibility restoration; navigation adds a seventh request. A member bootstrap is roughly 8–19 database reads.
2. **Live tournament polling:** each open dialog repeats approximately 3–5 database reads and full standings/bracket reconstruction every five seconds.
3. **Store checkout:** item-by-item product/variant/stock reads and stock writes produce about `4 + (4–5)M` database operations, with additional points branches.
4. **Awaited notification providers:** email, Telegram, and web push remain on registration, membership, redemption, and checkout response paths.
5. **Circuit rankings N+1:** the admin page fans out one browser request per circuit, while each handler performs one sequential result query per ranking group.
6. **MoviBack ledger aggregation:** member summary reads the ledger twice; admin/staff/reward flows repeatedly transfer and sum transaction history.
7. **Unpaginated order/economics reporting:** nested order/item histories are loaded and aggregated in application code; normal orders are not narrowed by the modern economics month parameter.
8. **Long tournament run workflows:** start and close handlers perform roughly 8–12 database operations, with looped legacy/maintenance branches and coarse post-mutation reloads.
9. **Row-by-row registration maintenance:** cancellation, reserve promotion, and reorder latency grows with the number of affected positions.
10. **Unpaginated MoviBack/admin and certificate enrichment:** user balances/history grow with ledger volume, while pending requests issue `1 + N` certificate reads.

Important secondary risks are broad `select("*")`/nested payloads, duplicate home identity/membership reads, internal HTTP calls from the admin run server page, raw unoptimized images, uncached poster rendering, and the mismatch between application `no-store` requests and service-worker NetworkFirst API caching.

## Known request scale by priority flow

| Flow | Browser/API requests | Database operations visible in normal path |
|---|---:|---:|
| Home, guest/member | 7 initial, plus optional search | roughly 8–19, plus optional search |
| Tournaments list | 2 initial, plus optional search | 3–4, plus optional search; repeats every 15s |
| Tournament live | 1 every 5s | about 3–5 each poll |
| Public circuit detail | 1 | `3 + G` |
| Admin circuits | `1 + C` | about `1 + sum(2 + G_i)` |
| MoviBack account | 1 | up to 6 sequential |
| Rewards page | 2 | roughly 9 combined in authenticated path, branch-dependent |
| Store catalog | 1 | 3 sequential |
| Store checkout | 1 mutation | about `4 + (4–5)M`, plus point/payment branches and providers |
| Staff scan + accreditation | 2 user actions | about 4 then 4–5 |
| Admin tournament list | 1 | 3 sequential |
| Admin run initial load | 2 internal HTTP calls | about 4 Baraonda / 6 fixed-pair |
| MoviBack admin requests | 1 | `1 + N` |
| Admin product management | 5 initial | endpoint-dependent, with overlapping category/line reads |
| Admin store orders | 2 initial | one broad nested order query plus access check |

Variables: `C` circuits, `G` ranking groups, `N` pending membership requests, `M` checkout items. Counts exclude early exits, fallbacks, notification subscription reads, and error branches unless noted.

## Confidence separation

### Confirmed from repository

- timer/visibility polling intervals and no-store client requests;
- browser fan-out and sequential handler call order;
- per-group, per-item, per-row, and per-membership query patterns;
- duplicate MoviBack ledger reads;
- broad/unpaginated query shapes and application-side aggregation;
- awaited external notification/email calls;
- Workbox NetworkFirst API rule and 10-second timeout;
- raw `<img>` use and absence of detected `next/image` imports;
- uncached poster rendering.

### Likely, dependent on production conditions

- very high backend amplification from polling under spectator concurrency;
- growing latency/memory from ledger, order, registration, and result history;
- image payload contribution to LCP/perceived speed;
- provider latency being a meaningful portion of mutation response time;
- repeated full-state refreshes causing noticeable UI delays.

### Requires live database verification

- whether any index is missing or unsuitable;
- actual query plans, scanned rows, buffer activity, sort/spill behavior, and lock waits;
- row counts and distributions per tenant/club/tournament/circuit/member;
- cost of PostgREST nested relations, live RLS, functions, and triggers;
- whether a database aggregate, view, materialized view, RPC, or maintained summary is the safest improvement.

## Exact information required from live Supabase for Phase 2B

Phase 2B should begin only after obtaining the following read-only evidence. Secret values, service-role keys, JWTs, and user PII must not be exported.

### A. Authoritative schema and database behavior

1. PostgreSQL version and enabled extensions.
2. DDL for all application tables/views/materialized views, including columns, types, defaults, nullability, primary/foreign/unique/check constraints.
3. Full index inventory from `pg_indexes`/catalogs, including partial and expression indexes and index sizes.
4. Definitions of database functions/RPCs, triggers, trigger functions, and scheduled jobs touching audited relations.
5. RLS enabled/forced flags and policy definitions by relation; role grants for anon/authenticated/service roles.
6. Relationship metadata used by PostgREST for nested product/order/user queries.

### B. Cardinality and growth, aggregated only

7. Estimated and exact-safe row counts for: tournaments, registrations, runs, participants, turns, matches, fixed pairs/groups/group assignments, circuits, ranking groups, circuit results, users, MoviBack memberships/transactions/certificates/redemptions/promos, communications/state, store products/colors/sizes/stock/orders/items/economics, and push subscriptions.
8. Distribution summaries: registrations per tournament; groups/results/stages per circuit; matches per run; ledger rows per member; items per order; pending membership count; orders and communications per month.
9. Table and index sizes plus recent growth rates; dead tuples, last analyze/vacuum, and statistics freshness for high-use relations.

### C. Query plans for exact hot shapes

10. Sanitized `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)` for representative, parameterized forms of:
    - future tournaments and runs;
    - registration counts/list by tournament/status and phone wildcard search;
    - circuit/group/result list and ranking queries;
    - live run participant/turn/match and fixed pair/group/match queries;
    - MoviBack recent ledger and full balance aggregation;
    - pending memberships with latest certificate;
    - user communications audience/tournament/state queries;
    - product/variant/stock nested catalog;
    - order/item/economics history and month reporting;
    - checkout variant/stock reads and stock update predicates.
11. For PostgREST nested selects, the actual generated SQL or Supabase query-plan output where available.

Plans must use non-sensitive representative IDs and must not expose user names, phones, emails, tokens, addresses, certificate contents, or order details.

### D. Production telemetry

12. p50/p95/p99 duration, request count, response bytes, status/error rate, and concurrency for each priority API route over at least a representative seven-day window and a tournament peak window.
13. Supabase database time, rows returned, cache hit ratio, connection/pool utilization, slow-query samples/fingerprints, lock waits, statement timeouts, CPU, memory, and I/O for the same windows.
14. Correlation of home 15-second and live 5-second polling traffic with active sessions/spectators.
15. Vercel/Next.js server timing or equivalent: middleware, route compute, Supabase wait, serialization, cold starts, region, and function memory.
16. Geographic regions for deployment, Supabase, and main user population.

### E. Browser, PWA, assets, and integrations

17. Sanitized HAR/Web Vitals traces for home, tournaments, live dialog, circuit rankings, MoviBack, store, checkout, staff scan, and key admin pages on mobile 4G and normal Wi-Fi.
18. LCP/INP/TTFB/CLS by route and device; JavaScript bundle/chunk sizes and long-task profiles.
19. API response byte sizes and duplicated request evidence, including timer/visibility transitions and mutation reloads.
20. Workbox runtime cache contents, hit/miss/fallback timing, cache keys, and login/logout/offline behavior for user-specific APIs.
21. Image URL inventory with encoded dimensions, file bytes, format, CDN/cache headers, and LCP attribution; poster render CPU/time and duplicate request frequency.
22. Resend, Telegram, and web-push p50/p95 duration, timeout, retry, and failure rates, separated from core route time.

### F. Correctness constraints needed before optimization design

23. Required freshness for tournament lists, live scores, rankings, points balances, notifications, catalog/stock, and admin reports.
24. Transaction and idempotency requirements for registration capacity/position, run start/close, point earning/redemption, checkout/stock, and notification delivery.
25. Expected peak concurrency for registration openings, live tournaments, QR accreditation, and store campaigns.

## Recommended Phase 2B scope

Phase 2B should remain measurement and validation focused:

1. Establish route/database/provider timing baselines and budgets.
2. Reproduce the five highest-priority flows against production-shaped, privacy-safe data.
3. Validate query plans and current indexes without presuming changes.
4. Model concurrency and freshness requirements for polling/live state.
5. Verify transaction, locking, and idempotency behavior in registration, run lifecycle, points, redemption, and checkout.
6. Produce an evidence-backed optimization plan with projected impact, safety risk, rollback, and verification steps.

It should not combine measurement with rebranding or broad refactoring.

## Phase 2A deliverables

- `PERFORMANCE_FLOW_MAP.md` — end-to-end priority flow traces.
- `DATABASE_ACCESS_MAP.md` — endpoint/relation/round-trip map.
- `PERFORMANCE_RISKS.md` — confirmed, likely, and verification-required risks.
- `PERFORMANCE_PRIORITY_MATRIX.md` — P0–P3 ranked findings with impact and risk.
- `PERFORMANCE_PHASE2A_SUMMARY.md` — conclusions, top bottlenecks, and exact Phase 2B evidence request.

