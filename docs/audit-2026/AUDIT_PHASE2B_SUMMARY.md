# MOVIPadel Audit Phase 2B Summary

## Status

Phase 2B is complete. The source code and prior audit documents were correlated with the local read-only production metadata export. No direct Supabase or production connection was made; no SQL was executed; no source, configuration, dependency, schema, or live metadata file was modified; and no optimization was implemented.

## Production database scale

- 44 public application tables.
- Approximately 3,483 estimated public rows in total.
- Approximately 3.81 MiB total public relation storage.
- Largest table: `loyalty_transactions`, 489 estimated rows / 168 kB.
- Largest relation by storage: `store_product_stock`, 418 rows / 264 kB.
- Other main history tables: 300 circuit results, 283 registrations, 232 Baraonda matches, 219 fixed-pair matches, 105 certificates, 51 redemptions, and 15 store orders/items.
- All 44 public tables have RLS enabled; none has forced RLS.
- Six public policies, three public views, two public security-definer staff RPCs, and zero public-schema triggers are present in the export.
- All public tables have primary keys and the principal domain graphs have foreign keys and useful integrity constraints.

These are planner estimates, but the order of magnitude is unambiguous: production data is currently small.

## Main conclusion

Database size itself is **not a major supported explanation** for broad current MOVIPadel slowness. A scan over hundreds of rows can still be inefficient, but current latency is more plausibly caused by repeated browser polling, multiple API and Supabase/PostgREST round trips, mostly sequential server orchestration, repeated small reads, full-state reload/recomputation, synchronous external providers, and cache/asset behavior.

The live metadata partially confirms targeted index concerns in MoviBack: the ledger has no membership/time index, memberships have no user index, certificates have no user/time index, and redemptions have no member/time index. These are important future-growth issues and can contribute to repeated endpoints, but tables are too small for those scan costs alone to explain system-wide slowness today.

## Top five confirmed performance problems

1. **Home request amplification:** six no-store requests every 15 seconds plus visibility refresh and a navigation session probe. One steady Home client generates about 24 API requests and 32–76 database operations per minute.
2. **Live tournament amplification:** one full-state request every five seconds per viewer, with 3–5 database operations and complete server recomputation each time.
3. **Checkout/redemption critical path:** item-by-item validation, balance/stock read-modify-write sequences, separate order/item/ledger/stock mutations, and awaited email/Telegram/push.
4. **N+1 and sequential orchestration:** circuit rankings query per circuit/group; certificate lookup per pending membership; 8–12-call tournament start/close workflows; row-by-row registration position updates.
5. **Repeated full-history/identity work:** duplicate ledger reads, balance summation in application memory, overlapping user/membership resolution, and coarse reloads after mutations.

## Top five optimization opportunities

1. Separate Home resources by freshness and stop polling settings/identity at 15-second cadence.
2. Reduce live full-state polling with conditional/versioned responses, short active-state caching, or a carefully designed delta/event channel.
3. Design a transactional, idempotent checkout/reward RPC with atomic points and stock handling; dispatch notifications after commit.
4. Replace transferred ledger scans with database aggregation/member summary, then add plan-validated membership/history indexes as growth preparation.
5. Batch circuit rankings and latest-certificate retrieval, removing browser/server N+1 patterns.

## Quick wins

- Remove `app-settings` and `user/me` from the Home interval, keeping explicit session/mutation refresh.
- Batch pending-member certificate retrieval.
- Parallelize independent MoviBack summary reads and remove the duplicate ledger transfer.
- Narrow high-confidence wildcard/nested payloads after consumer-field verification.
- Defer/reuse the public navigation admin-session probe.
- Refresh only affected admin resources after well-bounded mutations.

These require no database schema change and have low expected regression risk when characterized with existing response contracts.

## Potential database changes

Changes to evaluate, not implement, include:

- member/time index on `loyalty_transactions`;
- user index or invariant-backed unique constraint on `loyalty_memberships.user_id`;
- user/upload-time index on certificates;
- member/request-time index on redemptions;
- transactional RPCs for checkout/redemption and possibly run/registration workflows;
- an outbox table if operational notifications require durable delivery;
- stock uniqueness semantics for null-size variants;
- maintained balance/snapshot only if ledger growth and measured load justify its concurrency complexity.

No migration should be written before plans, data-quality checks, and correctness requirements are available.

## Phase 2C minimum measurements

1. Authenticated and guest Home HAR/server spans over at least 65 seconds.
2. Baraonda and fixed-pair live endpoint spans, payloads, and authorized 1/10/30/100-viewer read tests.
3. Staging checkout/redemption spans separating database and provider time, plus same-stock/same-balance concurrency tests.
4. Safe SELECT plans for membership lookup, ledger recent history, ledger aggregation, and latest certificate.
5. Circuit ranking browser/server trace and result-query plan.
6. Admin history/report payload, memory, transform, and growth baseline.
7. Staging registration and run lifecycle timing/concurrency.
8. Workbox cache, image/LCP, and poster render traces.

## RLS/security relationship

RLS is enabled on every public table, but current Next.js handlers use service role and normally bypass it. The six policies therefore do not explain current application query latency. A future move to direct authenticated Supabase access would couple performance and security: current custom cookies do not populate `auth.uid()`, and RLS predicates/index support would need fresh analysis. Execute grants and general table grants were not part of the export.

The absence of public triggers also confirms that checkout, balance, stock, run, and registration workflows receive no trigger-provided transaction coordination or derived-state maintenance.

## Required final answers

1. **Is the database size itself currently a major cause of MOVIPadel slowness?** No. At approximately 3,483 estimated public rows and 3.81 MiB, size is not a supported general root cause. Runtime query outliers remain possible.
2. **What are the 5 strongest confirmed causes of slowness?** Home polling amplification; five-second live full-state polling; sequential checkout/redemption plus providers; N+1/row-by-row orchestration; repeated ledger/identity reads and coarse reloads.
3. **What are the 5 highest-value optimizations?** Split Home freshness/cadence; reduce live full-state polling; transactional checkout/redemption; database ledger aggregation/member summary with measured indexes; batch circuits and certificates.
4. **Which optimizations can be made without changing the database?** Home cadence/cache changes, request batching at route level, query parallelization, duplicate-read removal, narrower selects, precise client invalidation, navigation-probe deferral, image optimization, and poster caching.
5. **Which require database changes?** New indexes, transactional RPCs, durable outbox, balance snapshot/maintained balance, stock null-size uniqueness change, and set-based transactional registration/run operations.
6. **Which require runtime measurements before deciding?** Live update architecture, provider decoupling design, every new index, report aggregation/pagination priority, service-worker cache changes, image/poster work, and all high-risk transactional rewrites.
7. **Recommended order of implementation.** Measure P0 flows; apply stable Home and duplicate-read quick wins; batch N+1 paths; reduce payload/reloads; address measured reporting/assets; implement tested transactional checkout/redemption; then registration/run transactions and only plan-proven indexes; consider event-driven live delivery last.
8. **Overall expected optimization potential: LOW / MEDIUM / HIGH / VERY HIGH.** **VERY HIGH**, because request-frequency and round-trip reductions can remove large amounts of repeated work without relying on database scale.
9. **Confidence level of that conclusion.** **HIGH** for architectural amplification and current database scale; **MEDIUM** for user-perceived ranking until Phase 2C runtime timings are collected.

