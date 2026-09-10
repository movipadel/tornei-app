# MOVIPadel Database Access Map — Phase 2A

## Reading this map

This is a static call-path inventory, not a live query profile. “Operations” counts Supabase/PostgREST calls visible in the selected normal branch. Nested PostgREST relationships are one HTTP operation but may still be expensive inside PostgreSQL. Counts exclude early validation failures and may change with conditional branches.

Repository-wide static indicators:

- 101 Next.js API route files.
- Approximately 431 `.from(...)` call sites across route code. This is a branch-inclusive complexity indicator, not a per-page count.
- 3 `.rpc(...)` call sites.
- 15 storage API call sites.
- Only 4 route files visibly use `Promise.all` for database/asset work.
- Numerous broad `select("*")`, no-argument `.select()`, and nested wildcard selections occur in live, store, MoviBack, circuit, and admin handlers.

No committed migrations or authoritative index definitions are available. Index sufficiency, row estimates, RLS execution cost, and query plans are **REQUIRES LIVE DATABASE VERIFICATION**.

## High-use read endpoints

| Endpoint | Main relations | Known DB operations | Shape | Processing / concern |
|---|---|---:|---|---|
| `GET /api/tournaments` | `tournaments`, `tournament_runs`, `registrations` | 3 | Sequential | Reads registrations for every future tournament, calculates counts/status in JS; polled every 15s on two public pages. |
| `GET /api/app-settings` | settings relation | 1 | Single | Low-churn data is repeatedly fetched with home polling. |
| `GET /api/user/me` | `users` | 0–1 | Single | Repeated alongside endpoints that independently need the same user. |
| `GET /api/circuits` | circuits, ranking groups, `circuit_results` | up to 3 | Sequential | Reads result rows to derive counts/distinct stages in JS. |
| `GET /api/circuits/[slug]` | circuits, groups, tournaments, `circuit_results` | `3 + G` | Sequential N+1 | One result query per ranking group, then JS aggregation/sorting. |
| `GET /api/moviback/me` | users, memberships, ledger, redemptions, certificates | 0–6 | Sequential | Ledger queried twice: recent list, then all rows for balance. |
| `GET /api/user/communications` | users, memberships, registrations, communications, state | about 4–6 | Sequential | Duplicates identity/membership/registration reads made by adjacent home endpoints. |
| `GET /api/registrations/search` | registrations | 1 | Single broad predicate | Two wildcard `ILIKE` predicates then exact JS filtering; plan/index support unknown. |
| `GET /api/tournaments/[id]/live` | run plus participant/turn/match or pair/group/match graph | about 3–5 | Sequential | Invoked every 5s while dialog open; repeatedly rebuilds standings/bracket. |
| `GET /api/store/products` | categories, lines, nested product variant/stock graph | 3 | Sequential | Broad/nested catalog payload, no visible pagination/cache. |
| `GET /api/moviback/rewards` | rewards, categories/ranges/related state | about 3 | Sequential | Loaded alongside a separate MoviBack account request. |

## Tournament mutation and run endpoints

| Endpoint / operation | Known or estimated DB operations | Scaling behavior | Notes |
|---|---:|---|---|
| Registration create | about 5–9 | Conditional | User, tournament/capacity, optional circuit, prior registration/position, insert; external notifications follow. |
| Registration cancel | base reads/writes + one update per shifted row | O(affected registrations) | Position compaction and reserve promotion use sequential row updates. |
| Admin registration reorder | base read + one update per item | O(items) | Row-by-row writes rather than one set-based operation. |
| Baraonda start, new run | about 10 | Turns/matches affect payload/write cost | Mostly sequential reads, bulk upserts where supported, final state updates. |
| Legacy run generate | branch-dependent | O(turns + matches) round trips | Turn/match insertion loops are visible. |
| Fixed-pair start | about 8–10 | Groups/pairs/matches | Builds grouping/bracket data in application code and persists several collections. |
| Run read | about 3 Baraonda / 5 fixed | Match history | Used through an internal HTTP hop from the admin server page. |
| Run close, circuit Baraonda | about 11 | Results volume | Reads full run graph, replaces circuit results, updates run/tournament. |
| Run close, fixed/circuit | about 11–12 | Results/final bracket | Alternative branch; static handler has 16 `.from` call sites total. |
| Match update / bracket | branch-dependent, up to several | Reload follows write | Broad match row selections; clients reload full state. |

## Circuit and ranking endpoints

| Endpoint | Known DB operations | Pattern | Evidence classification |
|---|---:|---|---|
| `GET /api/admin/circuits` | normal list approximately 1 | Nested list | CONFIRMED call path. |
| `GET /api/admin/circuits/[id]/rankings` | `2 + G` | Sequential per-group N+1 | CONFIRMED. |
| Admin circuits page total | `1 + sum(2 + G_i)` | Browser fan-out plus DB N+1 | CONFIRMED formula; live `C/G` determines impact. |
| Merge player keys | initial reads + per-wrong-key row query and update/delete | Nested-loop query/write pattern | CONFIRMED; severity depends on affected rows. |

The code groups, normalizes player keys, sorts rankings, derives stage counts, and detects duplicates in Node.js. Database-side aggregation or purpose-built RPC/view could replace multiple calls, but the exact design belongs to a later optimization phase.

## MoviBack, staff, and rewards endpoints

| Endpoint | Main access | Known DB operations | Concern |
|---|---|---:|---|
| `GET /api/moviback/me` | member summary | up to 6 sequential | Duplicate ledger reads; all-ledger balance aggregation. |
| `POST /api/moviback/request-membership` | user/membership/certificate/storage | up to 13 static call sites | Complex conditional transaction-like flow plus awaited notifications. |
| `GET /api/admin/moviback/dashboard` | membership/ledger/certificate/reward aggregates | 7 parallel | Good parallelism, but broad rows and JS monthly aggregation can grow. |
| `GET /api/admin/moviback/requests` | pending memberships + certificate per member | `1 + N` | Confirmed N+1, concurrent child requests via `Promise.all`. |
| `GET /api/admin/moviback/users` | memberships/users + ledger | about 2 sequential | Unpaginated; all balances computed in JS. |
| `GET /api/admin/moviback/users/[id]` | membership, history, certificate, redemptions, promos | about 5 for GET | Large fixed history limits and sequential collections. |
| `POST /api/staff/lookup-membership` | membership/user/certificate/ledger | about 4 sequential | Repeated for every scan. |
| `POST /api/staff/earn-points` | staff/member/ledger/promos/insert | about 4–5 | Ledger/balance validation and broad promo select. |
| `POST /api/moviback/rewards/redeem` | reward/member/ledger/variant/stock/order/redemption | branch-dependent; 16 static call sites | Store-linked variants and notifications produce a long critical path. |

Balance computation is repeatedly implemented by reading ledger rows and summing in application code. A database aggregate/RPC or maintained balance could reduce payload and round trips, subject to correctness/concurrency design in a later phase.

## Store endpoints

| Endpoint | Known DB operations | Access pattern | Concern |
|---|---:|---|---|
| `GET /api/store/products` | 3 sequential | Categories, lines, nested catalog | Deep, broad response; repeated separately in admin/catalog contexts. |
| `POST /api/store/orders` | roughly `4 + (4–5)M`, plus points branches | Per-item sequential reads, then per-item stock writes | Confirmed item-driven N+1 pattern and external services on response path. |
| `GET /api/admin/store-orders` | 1 nested query | All matching orders/items | No pagination; large payload growth. |
| `GET /api/admin/store/economics` | 4 parallel | Products, costs, all non-cancelled orders/items/economics, special orders | Normal orders are not month-filtered; all KPIs/months built in JS. |
| `GET /api/admin/store-economics` | 1 nested query | Broad order history | Filters/aggregates in JS, no pagination. |
| Product sort | one update per product | Sequential row writes | O(products) round trips. |

`M` is checkout item count. Points checkout adds membership and full-ledger balance work. The ledger insertion code has compatibility fallbacks, so failed schema-shape attempts may create additional round trips in some deployments.

## Notifications and external-call adjacency

Push dispatch first reads active subscriptions, then sends external web-push requests concurrently. Telegram, push, and Resend calls are awaited by several mutation handlers. Consequently, route latency includes both database latency and external provider latency. This is **CONFIRMED** from control flow; production timings and failure rates require traces.

## Broad reads and in-process aggregation inventory

Confirmed categories include:

- `select("*")` in public live matches, store catalog reference tables, admin communications/circuits, staff promotions, reward catalogs, and store economics special orders.
- Nested wildcard selections in store product and order graphs.
- All matching future registrations for tournament card counts.
- All circuit result rows for list counts and per-group ranking calculations.
- All MoviBack ledger rows for balances and admin user lists.
- All normal non-cancelled orders for store economics, even when a month query parameter is supplied.
- No visible pagination on admin order, MoviBack user, and several catalog/report endpoints.

The existence of a broad read is confirmed. Its performance severity is **LIKELY** and depends on live cardinality/payload measurements.

## Operations that are candidates for fewer round trips

These are analysis targets, not implementation recommendations for this phase:

- One home/bootstrap endpoint or shared server data layer for identity, membership, communications metadata, settings, and public summaries.
- Database aggregate/view/RPC for tournament registration counts and status summaries.
- One circuit ranking query grouped across all groups, or an RPC returning computed standings.
- One member summary RPC for balance, recent activity, certificate, and redemption summary.
- Batch checkout validation and atomic stock/order/points operation.
- Set-based registration reorder/cancellation position compaction.
- Set-based player-key merge.
- Batched latest-certificate lookup for all pending memberships.
- Database-side store economics/month aggregation.

Each candidate requires live schema, constraints, transaction semantics, and query plans before design.

