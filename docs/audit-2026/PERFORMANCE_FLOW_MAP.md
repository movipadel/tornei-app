# MOVIPadel Performance Flow Map — Phase 2A

## Scope and method

This document reconstructs the current request paths from static repository evidence. It is not a benchmark and does not assume facts about the live Supabase project. Counts below are the number of browser requests and Supabase operations visible in the relevant execution branch; optional authentication, format, circuit, notification, and error/fallback branches are called out separately.

Confidence labels used throughout the Phase 2A audit:

- **CONFIRMED** — directly visible in the repository.
- **LIKELY** — supported by the code shape, but the user impact depends on live volume, latency, or runtime behavior.
- **REQUIRES LIVE DATABASE VERIFICATION** — needs schema, indexes, query plans, table statistics, or production telemetry not committed to this repository.

## Cross-cutting request model

The application is a Next.js App Router modular monolith. Most interactive pages are client components that call same-origin `/api/**` route handlers. Those handlers create a service-role Supabase client and perform PostgREST queries. Protected page navigation is checked by middleware, while protected API handlers perform their own staff/admin checks. This produces the common path:

`client page/effect -> fetch('/api/...') -> Next.js route -> auth/guard -> Supabase PostgREST -> JavaScript mapping/aggregation -> JSON -> React state/render`

There is little evidence of application-level data caching: many client GETs explicitly use `cache: "no-store"`, and no material `revalidate`/`unstable_cache` usage was found. The generated Workbox service worker separately applies NetworkFirst behavior to same-origin API GETs, with a 10-second network timeout and cached fallback.

## 1. Home/dashboard

Entry: `src/app/page.tsx`; shared navigation: `src/components/PublicNav.tsx`.

On mount, while the document is visible, `loadAll()` starts six browser requests concurrently:

1. `/api/tournaments`
2. `/api/app-settings`
3. `/api/user/me`
4. `/api/circuits`
5. `/api/moviback/me`
6. `/api/user/communications`

The same six-request group runs every 15 seconds and again on `visibilitychange`. `PublicNav` adds `/api/admin/me`, so the normal home bootstrap is **7 browser requests**, before an optional registration search. A debounced phone lookup adds `/api/registrations/search?phone=...` when an effective phone exists.

Server/database path:

- `/api/tournaments`: 3 sequential reads — future tournaments, their runs, and all matching registrations — followed by count/status aggregation in JavaScript.
- `/api/app-settings`: 1 settings read.
- `/api/user/me`: 0 reads for a guest cookie state; 1 user read when authenticated.
- `/api/circuits`: up to 3 sequential reads — circuits, groups, and circuit result rows — followed by count and distinct-stage aggregation in JavaScript.
- `/api/moviback/me`: 0 for a guest; up to 6 sequential reads for an authenticated member. It reads the recent ledger and then reads the ledger again for the balance.
- `/api/user/communications`: approximately 4–6 sequential reads for an authenticated user: user, membership, optional phone registrations, applicable communications, tournament communications, and state rows.
- `/api/registrations/search`: 1 read using wildcard `ILIKE` conditions, then exact normalization/filtering in JavaScript.
- `/api/admin/me`: session verification; no application table read visible in the normal path.

Known load estimate: **7 browser requests and roughly 8–19 database reads** for the initial page, depending on guest/member state and optional communication branches; phone search adds 1+1. Every visible 15-second poll repeats the six core requests and most of their database work.

Primary couplings: tournaments and registrations, circuits/results, user/session, MoviBack ledger/membership, communications, admin-session detection.

## 2. Login/session bootstrap

Entries: public login interactions in `src/app/page.tsx` and MoviBack UI; staff login at `src/app/staff/login/page.tsx`; admin login at `src/app/admin/login/page.tsx`.

Public user login posts to `/api/user/login`; subsequent pages independently load `/api/user/me`, `/api/moviback/me`, and communications. Staff/admin API requests validate their session again in each handler. `PublicNav` checks `/api/admin/me` on every public page even when the page does not need admin data.

**CONFIRMED:** page middleware and protected API guards are separate checks. Multi-request admin pages therefore repeat token/cookie parsing and verification. The cryptographic cost may be small; the larger effect is duplicate browser/API work and, where helpers query access state, added database reads.

## 3. Tournaments

Entry: `src/app/tornei/page.tsx`; cards/dialogs include `src/components/TournamentLiveDialog.tsx`.

The page starts `/api/tournaments` and `/api/user/me` concurrently, then repeats both every 15 seconds while visible and on visibility restoration. An authenticated phone can trigger `/api/registrations/search`.

Opening live details starts `/api/tournaments/[id]/live` immediately and every 5 seconds:

- common: run lookup;
- mixed-category branch: an additional registrations read;
- Baraonda: participants and turns with nested matches, then standings/rest/turn transformations in JavaScript; typically 3–4 total reads;
- fixed-pair: pairs, groups, optional group-pair assignments, and matches; typically 5 total reads including the run, with `select("*")` for match rows.

Known load estimate: base page **2 browser requests / 3–4 DB reads**, repeated each 15 seconds; optional search adds 1/1. An open live dialog adds **1 browser request / approximately 3–5 DB reads every 5 seconds** plus full standings/bracket reconstruction.

## 4. Tournament registration

Entry components are reached from home/tournament cards; routes include `src/app/api/tournaments/[id]/registrations/route.ts` and cancellation/update routes under `src/app/api/registrations`.

Create flow:

`registration form -> POST /api/tournaments/[id]/registrations -> optional user lookup -> tournament/capacity reads -> optional circuit group and prior-registration reads -> position read -> insert -> awaited Telegram/admin-push work -> response -> page re-fetch`

Static branches imply approximately **5–9 database operations** for a normal create, depending on authentication and circuit participation, plus a push-subscription read and external network calls. The exact count varies with validation and conflict branches.

Cancellation reads the registration/tournament context, updates status, and then renumbers affected registrations with sequential row updates; reserve promotion adds more reads/writes and notification calls. Cost therefore grows with the number of positions shifted. Registration administration similarly refreshes registration data and the tournament list after mutations, duplicating parts of the response path.

**LIKELY:** wildcard phone search and client-side exact matching become slower as registrations grow. Whether a suitable index can support the expression is **REQUIRES LIVE DATABASE VERIFICATION**.

## 5. Circuits and rankings

Public list: home calls `/api/circuits`. Public detail: `src/app/circuiti/[slug]/page.tsx` calls `/api/circuits/[slug]` once with `no-store`.

Public detail path:

`page -> GET /api/circuits/[slug] -> circuit read -> group read -> future-tournament read -> for each ranking group: circuit_results read -> JS grouping/sorting -> JSON -> render`

Known cost: **1 browser request / 3 + G sequential DB reads**, where `G` is the number of ranking groups.

Admin list: `src/app/admin/circuits/page.tsx` first loads `/api/admin/circuits`, then starts one `/api/admin/circuits/[id]/rankings` request per circuit. Each rankings handler performs a circuit read, group read, then one sequential result read per group.

Known cost: **1 + C browser requests** and approximately `1 + sum(2 + G_i)` database reads, where `C` is the number of circuits. This is a browser-level fan-out combined with a server-side N+1 pattern. Results are aggregated, sorted, and duplicate-name information is derived in application code.

## 6. Baraonda

Admin run entry: `src/app/admin/tournaments/[id]/run/page.tsx` and run clients/components; server routes under `src/app/api/admin/tournaments/[id]/run`.

The server page makes two same-origin HTTP requests in parallel: run state and tournament detail. Both traverse route handlers and admin guards. Initial database work is typically about 4 reads for Baraonda (run plus participant/turn graph and tournament), with an additional fallback run lookup in some states.

Run start performs a sequence resembling: tournament, existing run, registrations, run insert, participants insert, turn upserts, turn read, match upserts, run update, tournament update. The new-run path is approximately **10 database round trips**, mostly sequential. Generation/legacy branches can insert turns and matches row-by-row. Score mutation clients subsequently reload or `router.refresh()`, causing the full server page request graph again.

Closing a circuit Baraonda can perform roughly **11 database operations**: tournament/run/group/rules/participants/turns/matches, replacement of circuit results, and run/tournament updates. Exact branches vary.

## 7. Fixed-pair groups/brackets

Fixed-pair run routes are under `src/app/api/admin/tournaments/[id]/fixed/run`; public live display uses the common live endpoint.

Start reads tournament/run/registrations, creates the run, pairs and groups, assigns pairs, creates matches, and updates run/tournament state. A normal branch is approximately **8–10 database operations**; static call-site totals are higher because alternative branches coexist in the handler. Bracket and match handlers select broad match rows and reconstruct standings/brackets in JavaScript. Mutations trigger server reloads similar to Baraonda.

The 5-second public live poll repeatedly re-reads the pair/group/match graph. Payload and CPU scale with match history.

## 8. MoviBack

Entry: `src/app/moviback/page.tsx`.

Load path:

`page -> GET /api/moviback/me -> user -> membership -> recent 20 transactions -> all transactions for balance -> redemptions -> latest certificate -> response -> render`

Known authenticated cost: **1 browser request / up to 6 sequential DB reads**. The ledger is queried twice, once for display and once for balance aggregation. After login, the page directly fetches `/api/moviback/me` again rather than always sharing the existing bootstrap result.

Membership request can perform up to 13 static database/storage call sites across conditional branches and awaits Telegram then admin push before returning.

Admin dashboard: `/admin/moviback` makes one browser request whose handler runs seven database reads in parallel and aggregates monthly transactions/certificates in JavaScript. Admin users list reads memberships and all associated ledger rows, then calculates balances in JavaScript without pagination. User detail returns multiple history collections (up to 80 transactions, 40 redemptions, 20 promos) after several sequential reads.

## 9. MoviBack Store / public store

Entry: `src/app/store/page.tsx`.

`page -> GET /api/store/products -> categories -> lines -> nested products/colors/sizes/stock -> response -> render`

Known cost: **1 browser request / 3 sequential DB reads**. The endpoint uses broad selects for categories and lines and a deeply nested product graph. The response is not visibly paginated or application-cached.

Admin product entry: `src/app/admin/store/products/page.tsx` starts product, category, line, promotion, and economics-access requests: **5 browser requests**. Product results already contain category/line relations, while separate category and line endpoints load overlapping reference data. Client stock display also performs repeated `.find()` operations inside variant combinations; this is secondary unless catalog size is large.

Catalog bridge: `src/app/admin/moviback/catalog/page.tsx` loads rewards, reward categories, point ranges, and the full store product graph as four requests.

## 10. Rewards and orders

Rewards entry: `src/app/moviback/premi/page.tsx` starts `/api/moviback/me` and `/api/moviback/rewards` concurrently. Rewards listing uses approximately 3 sequential reads. Redemption can touch membership, balance ledger, reward/variant/product/stock, redemption/order rows, ledger, and notification integration; the handler contains **16 Supabase call sites** across branches.

Store checkout is item-driven:

`checkout -> POST /api/store/orders -> user/membership/balance validation -> for each item: product + color + optional size + stock reads -> order insert -> order-items insert -> optional points-ledger insert -> for each item: stock update -> awaited email -> awaited Telegram -> awaited push -> response`

For `M` items, the visible structure is approximately **4 + (4–5)M database operations** for euro checkout, with additional membership/ledger work for point payments and fallback ledger insert attempts. Product/color/size/stock reads are sequential inside the item loop, followed later by per-item stock updates. External Resend, Telegram, and push operations are awaited on the response path.

Admin orders entry: `src/app/admin/store-orders/page.tsx` starts orders and economics-access requests. The orders handler returns all matching orders and nested items with no pagination. Economics handlers retrieve broad order histories and aggregate KPIs/months in JavaScript; the modern endpoint executes four major reads in parallel, but its `month` parameter filters special orders only, not normal store orders.

## 11. Staff QR scanning and points accreditation

Entries: `src/app/staff/scanner/page.tsx` and `src/app/staff/page.tsx`.

`camera/QR -> parsed membership identifier -> POST /api/staff/lookup-membership -> membership/user/certificate/points reads -> member card`

Lookup performs approximately **4 sequential DB reads**. Accreditation then posts to `/api/staff/earn-points`, which revalidates staff/member state, scans ledger information, reads promotion data, and inserts points; approximately **4–5 database operations**, conditional on promo and validation branches. Global promotion rows are selected broadly.

Repeated scans intentionally repeat lookup and authorization. Camera decoding itself is local; the material latency begins after a successful code is sent to the server.

## 12. Admin pages

- Tournaments: **1 initial browser request / 3 sequential DB reads**; opening registrations adds another request/read. Mutations often reload both registrations and list data.
- Run page: **2 internal same-origin HTTP requests**, repeated guards, about 4 DB reads for Baraonda or 6 for fixed-pair on initial load.
- Circuits: **1 + C browser requests**, then per-group database N+1.
- Store products: **5 initial browser requests**, overlapping category/line data.
- Store orders: **2 initial requests**; unpaginated nested order data.
- Communications: **2 initial requests**; the tournament endpoint supplies run/count data beyond selector needs.
- MoviBack dashboard: **1 request / 7 parallel DB reads**, broad month/history aggregation.
- MoviBack requests: **1 request / 1 + N DB reads** because each pending row causes a latest-certificate query.
- MoviBack catalog: **4 initial requests**, including full store catalog.
- MoviBack users: **1 request / 2 sequential broad reads**, no pagination, application balance aggregation.

## 13. Notifications

User notification feed is part of the home six-request polling group and performs several sequential reads whose user/membership/registration inputs overlap other home endpoints.

Write flows frequently wait for notifications:

- registration create/cancel: Telegram and admin push;
- MoviBack membership request: Telegram and admin push;
- reward redemption/store reward: Telegram and admin push;
- store checkout: email, Telegram, then admin push.

Admin push reads active subscriptions and sends pushes with `Promise.all`, but the route caller still awaits completion. These integrations are described as best effort in places, yet their network latency remains on the user-visible HTTP critical path.

## Rendering, caching, and perceived speed

- `cache: "no-store"` appears across important client reads, including frequently polled pages.
- No material server data revalidation/cache policy was found for low-churn public lists.
- The Workbox service worker applies NetworkFirst to `/api/` GETs and can wait up to 10 seconds before cached fallback. Runtime behavior for authenticated API responses requires browser verification.
- The codebase uses at least 21 raw `<img>` elements and no detected `next/image` import. Tournament posters, circuit logos, communication media, rewards, and store imagery therefore lack Next.js image transformation evidence. Actual effect depends on dimensions, formats, storage CDN headers, and network traces.
- Poster generation uses Satori/Resvg and deliberately returns `Cache-Control: no-store`; repeated requests regenerate the asset. Some admin share/fallback behavior can request the poster more than once.

