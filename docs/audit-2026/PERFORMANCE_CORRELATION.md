# MOVIPadel Performance Correlation — Phase 2B

## Correlation result

Live metadata confirms that the production database is currently small. It therefore weakens “large table scan” as a general explanation while strengthening Phase 2A's architectural diagnosis: many small queries are repeatedly transported across browser, Next.js, PostgREST, and provider boundaries. Some query/index mismatches are real, especially in MoviBack, but their current raw scan cost is unlikely to be the main system-wide latency source.

Verdict meanings:

- **CONFIRMED** — code and live metadata directly establish the mechanism.
- **PARTIALLY CONFIRMED** — the mechanism exists, but current user impact needs timing or volume distribution.
- **NOT SUPPORTED BY LIVE METADATA** — live scale/indexes do not support it as a current primary explanation.
- **STILL REQUIRES RUNTIME MEASUREMENT** — metadata cannot resolve the latency contribution.

## Contribution matrix

Contributions are qualitative: `L` low, `M` medium, `H` high, `—` not material/unknown. They express likely mechanism, not measured time.

| Phase 2A finding | Verdict | A frontend | B HTTP | C Next.js | D DB trips | E index/query | F volume | G app aggregation | H external | I cache |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Home polling | **CONFIRMED** architectural amplification | H | H | M | H | L | L | M | — | H |
| Live tournament polling | **CONFIRMED**, impact unmeasured | H | H | H | H | L–M | L now | H | — | H |
| Store checkout | **CONFIRMED** long critical path | L | M | H | H | L | L now | M | H | — |
| Synchronous external notifications | **CONFIRMED** | — | M | M | L | — | — | — | H | — |
| Circuit rankings | **CONFIRMED** N+1; scan size not current cause | H | H | H | H | L | L now | H | — | M |
| MoviBack ledger balance | **PARTIALLY CONFIRMED** current; strong growth risk | M | M | M | H | M | L now | H | — | M |
| Store order/economics history | **NOT SUPPORTED** as current volume bottleneck; future risk confirmed | M | M | M | M | L | L now | H | — | M |
| Tournament start/close | **CONFIRMED** round-trip/atomicity structure | L | M | H | H | L | L now | H | M | — |
| Registration row-by-row updates | **CONFIRMED** structure, current latency unmeasured | L | M | M | H | L | L–M | M | M | — |
| MoviBack certificate N+1 | **CONFIRMED** pattern; current N unknown/small-bound | M | M | M | H | M | L now | M | — | L |
| Broad `select("*")` | **PARTIALLY CONFIRMED**; payload effect unmeasured | M | M | M | M | L | L now | L | — | M |
| Repeated identity/membership reads | **CONFIRMED** | M | H | M | H | M | L | L | — | M |
| Coarse mutation reloads | **CONFIRMED** | H | H | M | H | L | L | M | — | H |
| Poster/image generation and caching | **CONFIRMED** implementation; impact unmeasured | M | M | H poster | — | — | asset-dependent | M | storage/CDN unknown | H |

## Home page analysis

`src/app/page.tsx` already starts its six main requests in parallel. Parallelization reduces critical-path duration but does not reduce total requests or database work.

| Endpoint | Change rate | Current work | Polling need | Cache/refresh disposition to investigate |
|---|---|---|---|---|
| `/api/tournaments` | Medium during registration/live operations; otherwise slow | 3 reads, counts in JS | Some refresh is useful, but not all day at one cadence | Short public cache; revalidate after registration/run mutation; active-event cadence only |
| `/api/app-settings` | Very slow/static | 1 row; table has 1 row | No genuine 15s need | Long cache/versioned revalidation |
| `/api/user/me` | Changes on login/profile mutation | 0–1 read | No periodic need | Session/bootstrap cache; refresh after login/profile/logout |
| `/api/circuits` | Slow; result summary changes on stage close | Up to 3 reads; 2 circuits, 5 groups, 300 results | No general 15s need | Cache and invalidate after circuit/tournament close |
| `/api/moviback/me` | Changes on membership review, accreditation, redemption/certificate actions | Up to 6 reads; duplicate ledger scan | Near-live may be desirable after an external staff scan, but 15s global polling is not inherently required | Refresh after local mutation; slower/focus/manual refresh or targeted invalidation |
| `/api/user/communications` | Changes on admin publication and user state actions | About 4–6 reads; only 1 communication and 0 state rows estimated | New-message polling may be useful, but can be slower/conditional | Cache publication list briefly; refresh state after read/dismiss |

Combining requests is plausible but should preserve authorization and freshness boundaries. A single monolithic response with one cache policy would repeat the current coupling. Better future designs could share one user/membership bootstrap, separate public slow-changing summaries from private dynamic data, and invalidate affected resources after mutations.

### Architectural load per active Home client

Steady state at a 15-second interval is four cycles per minute. Each cycle is six API requests and approximately 8–19 database operations depending on guest/member/communication branches. `PublicNav` adds one request on initial navigation; phone search and visibility events are excluded.

| Active Home clients | API requests/minute | Estimated DB operations/minute |
|---:|---:|---:|
| 1 | 24 | 32–76 |
| 10 | 240 | 320–760 |
| 50 | 1,200 | 1,600–3,800 |
| 100 | 2,400 | 3,200–7,600 |

The first minute after all clients open the page can contain a fifth cycle because the initial load precedes steady polling: about 30 API requests and 40–95 database operations per client, plus the navigation probe. These are amplification estimates, not server-capacity claims.

Current public relation size is too small for the row scans alone to explain a consistently slow Home page. Network distance, route cold starts, many round trips, external asset loading, and service-worker behavior remain runtime questions.

## Live tournament analysis

An open live dialog polls every five seconds, or 12 steady-state requests per minute. Each call uses approximately 3–5 Supabase operations depending on Baraonda/fixed-pair/mixed branches and rebuilds response state in Node.js.

| Viewers | API requests/minute | Estimated DB operations/minute |
|---:|---:|---:|
| 1 | 12 | 36–60 |
| 10 | 120 | 360–600 |
| 30 | 360 | 1,080–1,800 |
| 100 | 1,200 | 3,600–6,000 |

Opening immediately can add one request per viewer to the first minute. No claim is made about Supabase's ability to serve this load.

The live child tables contain only 31–232 rows each and have relevant run/turn/group indexes. The primary current risk is request-frequency multiplication and full-state reconstruction, not proven index failure. Future options include conditional requests/version numbers, active-run response caching, delta/event delivery, or Supabase Realtime, but synchronization, authorization, disconnect recovery, and score freshness must be designed before selection.

## MoviBack special analysis

### Live evidence

- `loyalty_transactions`: 489 rows, 168 kB, the largest application table by row estimate; primary-key index only.
- `loyalty_memberships`: 93 rows, 80 kB; no `user_id` index or uniqueness, although code assumes a single row.
- `medical_certificates`: 105 rows, 72 kB; no user/upload-time index.
- `reward_redemptions`: 51 rows, 96 kB; no member/request-time index.
- No public trigger or balance-maintenance function exists.

Current data volume alone is **not sufficient to explain major slowness**. The member endpoint's six sequential calls and duplicate ledger reads can still be slow because PostgREST network latency is paid multiple times even for tiny scans.

### Flow correlation

- Member endpoint: user -> membership -> latest 20 ledger -> all ledger for balance -> latest 10 redemptions -> latest certificate.
- Staff lookup: membership code -> user -> all member ledger -> latest certificate.
- Accreditation: membership -> promos -> ledger insert -> all member ledger for returned balance.
- Redemption: membership -> reward/variant/stock -> all ledger -> redemption -> ledger debit -> stock updates -> optional order/item -> notifications.
- Admin requests: pending memberships -> one latest certificate query per row.

### Architectural alternatives, without implementation

| Alternative | Round-trip/payload effect | Consistency/concurrency implications | Suitability |
|---|---|---|---|
| Database `SUM(points_delta)` query | Stops transferring all ledger rows; one aggregate still scans member history | Transaction snapshot gives a consistent sum at query time; concurrent spend still needs atomic validation | Strong near-term candidate |
| Summary RPC returning balance + recent activity | Can combine member endpoint work and reduce HTTP/DB round trips | Must define one transaction snapshot and strict authorization/grants | Strong candidate after plan/timing |
| Ledger index by member/time | Improves filtering/recent sort as history grows | No balance atomicity; write overhead on every transaction | Strong growth preparation |
| Short-lived cached balance | Very fast reads | Invalidations across staff earn, redeem, checkout, admin adjustment; stale spend checks are unsafe | Display-only possibility, not authority |
| Balance snapshot table | Reduces historical summation | Must update atomically with every ledger insert and reconcile drift | Possible at larger scale; high design burden now |
| Maintained membership balance column | Fast read and conditional update | Must be transactionally coupled to immutable ledger; locking/idempotency/reconciliation required | Appropriate only with transactional write architecture |
| Materialized aggregate view | Efficient bulk reporting | Refresh lag conflicts with spend decisions; refresh cost/coordination | Better for admin reporting than authoritative checkout balance |

Any spend/accreditation redesign must retain the ledger as auditable history and make balance validation plus debit/credit atomic. A cached value must never be the sole spend authority unless updated within the same database transaction.

## Store/checkout special analysis

### Current request sequence

1. Validate user cookie and input.
2. Read `users` by primary key.
3. For points/mixed payment, read membership by unindexed `user_id`, then read all ledger rows to calculate balance.
4. For each cart item, sequentially read product by PK.
5. Read color by PK plus product.
6. Optionally read size by PK plus product.
7. Read stock by product/color/size and active status.
8. Calculate totals in Next.js.
9. Insert `store_orders` and return the full inserted row.
10. Bulk insert order items.
11. Insert loyalty debit when applicable; compatibility fallback can retry alternative source values.
12. For each item, update stock by stock-row ID using the previously read quantity.
13. Await Resend email.
14. Await Telegram message.
15. Await admin push, including subscription read and provider requests.
16. Return to browser.

The database shape supports exact product/variant/stock lookups with PKs and a composite stock key. At 31 products, 90 colors, 139 sizes, 418 stock rows, and 15 orders, index lookup cost is not the central latency risk.

### Round trips and dependencies

For `M` items, euro checkout is approximately `4 + (4–5)M` database operations including order/item work and stock updates; points/mixed adds membership, balance, and ledger work. Product -> color/size -> stock validation is sequential per item, and stock writes occur only after order/items creation. Provider calls add three serial stages.

### Atomicity and race risks confirmed by correlation

- Stock is read, checked, then later overwritten with `old quantity - requested quantity`; the update predicate is row ID only. Concurrent checkouts can both pass and overwrite each other.
- Reward catalog and reward-linked store stock use similar read-then-update behavior.
- Balance is summed, validated, then debited later; concurrent spends can both observe the same balance.
- Order, items, ledger, and stock are separate statements with compensating deletes that do not restore every possible partial mutation.
- No public trigger or transactional checkout RPC exists in the snapshot.
- The stock unique key does not guarantee uniqueness for null `size_id` under the exported definition.

### Transactional RPC suitability

A PostgreSQL transactional RPC is an appropriate **future architecture candidate**, not yet an implementation decision. It could validate all products/variants, lock or conditionally decrement stock, atomically validate/debit points, create the order/items, and return a compact result in one database transaction and one application-to-database call.

Design prerequisites are high: idempotency key, deterministic pricing authority, stock null-size uniqueness decision, row-lock ordering, retry behavior, ledger immutability, permissions, fixed `search_path`, minimal execute grants, error contract, and concurrency tests. Email/Telegram/push should occur only after commit, preferably through a durable outbox if delivery guarantees matter; external network calls must not be made inside the database transaction.

## Other Phase 2A findings correlated with live scale

### Circuit rankings

Two circuits, five ranking groups, and 300 result rows mean scans are currently small. Existing group indexes support the predicate. The admin `1 + C` browser fan-out and per-group query loop are confirmed, but database volume does not currently justify describing ranking SQL as a primary bottleneck. Consolidating group retrieval and server aggregation remains high value because it removes fixed round-trip cost and scales better.

### Store order/economics history

There are only 15 orders and 15 items. Full-history reporting cannot currently be slow due to data volume alone. The lack of pagination/month filtering for normal orders is a clear future scalability risk, not a current confirmed root cause.

### Tournament run lifecycle

Run/result tables contain tens to low hundreds of rows and key child filters are indexed. Start/close latency is primarily the 8–12 sequential PostgREST statements, TypeScript schedule/standings work, and notification/reload behavior. Database query plans could still reveal outliers, but size is not the default explanation.

### Registration ordering

The `(tournament_id, is_reserve, position)` index is already present. Row-by-row update cost is caused by multiple write round trips and transaction boundaries, not an evident missing lookup index. Total registrations are 283, while any one tournament is a subset.

### Broad selects and images/posters

Tiny tables limit current database harm from broad selects, but image/text/JSON columns can make payload bytes disproportionate to row count. Only runtime response-size and browser traces can decide impact. Image/poster behavior is not explained by PostgreSQL metadata.

## Final Phase 2A disposition

| Finding group | Phase 2B disposition |
|---|---|
| Polling, request duplication, sequential calls, coarse reloads | **CONFIRMED** by source; live DB size makes architecture the stronger explanation |
| N+1 circuits/certificates and per-item/per-row workflows | **CONFIRMED** pattern; current cardinality moderates scan cost but not network-round-trip cost |
| Missing-index hypotheses | **PARTIALLY CONFIRMED** for specific predicates; **NOT SUPPORTED** as general current root cause |
| Full-history reporting/aggregation | **NOT SUPPORTED** as current data-volume bottleneck; **CONFIRMED future risk** |
| Ledger scalability | **PARTIALLY CONFIRMED current**, **HIGH-confidence future risk** |
| External-provider, cold-start, asset, PWA/cache latency | **STILL REQUIRES RUNTIME MEASUREMENT** |

