# MOVIPadel Home Runtime Analysis — Phase 2C

## Exact current waterfall

The optimized `/` document is a statically prerendered shell (**MEASURED:** 10,446 bytes, 2.8 ms median locally, one-year shared-cache header). After hydration:

1. `src/app/page.tsx:129-136` starts six requests together with `Promise.all`:
   - `/api/tournaments`
   - `/api/app-settings`
   - `/api/user/me`
   - `/api/circuits`
   - `/api/moviback/me`
   - `/api/user/communications`
2. `src/components/PublicNav.tsx:13` independently requests `/api/admin/me`.
3. When an effective valid phone becomes available, a debounced registration search can add `POST /api/registrations/search`; it is not part of every guest load.

The six core requests are parallel, not sequential. The response cannot render its consolidated data until the slowest required result completes. In the guest baseline, the measured parallel group median was 253.9 ms and average 350.1 ms, with a 714.2 ms maximum across seven warm cycles.

## Per-request baseline and database work

| Endpoint | Guest median / bytes | Static DB operations | External provider | Current cache behavior |
|---|---|---:|---|---|
| `/api/tournaments` | 231.7 ms / 4,004 B | 3 sequential | None | Client `no-store`; no response cache header measured |
| `/api/app-settings` | 74.3 ms / 218 B | 1 | None | Client `no-store`; no response cache header measured |
| `/api/user/me` | 2.5 ms / 13 B | 0 guest, 1 authenticated | None | Client `no-store`; no response cache header measured |
| `/api/circuits` | 221.5 ms / 665 B | 3 sequential at current data | None | Client `no-store`; no response cache header measured |
| `/api/moviback/me` | 3.2 ms / 96 B guest | 0 guest; 2 without membership; up to 6 member | None | Client `no-store`; no response cache header measured |
| `/api/user/communications` | 2.4 ms / 11 B guest | 0 guest; about 4–6 authenticated | None | Client `no-store`; no response cache header measured |
| `/api/admin/me` | 2.1 ms / 21 B, 403 guest | no application-table read in normal path | None | Client `no-store`; no response cache header measured |

The public data endpoints contact Supabase; the guest identity endpoints return before database access. The 7-row upcoming tournament response still requires three remote database round trips, and the 2-circuit summary requires three more. This explains why their payloads are small but measured latency is much higher than guest session endpoints.

## Polling and visibility behavior

`src/app/page.tsx:531-546`:

- calls `loadAll()` on mount;
- calls the same six-request group every 15 seconds while visible;
- calls it again whenever document visibility returns to `visible`;
- aborts the prior client request group before starting a new one.

The abort prevents overlapping client state updates, but it does not guarantee that a route/database operation already started on the server is cancelled. A visibility event can also refresh soon after a timer cycle. Mutation success and cancellation paths explicitly call `loadAll()` again.

## Operations per minute

Steady state is four cycles per minute. Branch-refined database counts are:

- guest: about 7 operations/cycle (3 tournament + 1 settings + 3 circuit);
- authenticated user without membership: about 14–16/cycle;
- authenticated member: about 18–20/cycle.

The authenticated figures depend on communication/tournament/state branches. They exclude optional registration search and the one-time navigation probe.

| Continuously active clients | Core API calls/min | Guest DB ops/min | Member DB ops/min |
|---:|---:|---:|---:|
| 1 | 24 | ~28 | ~72–80 |
| 10 | 240 | ~280 | ~720–800 |
| 50 | 1,200 | ~1,400 | ~3,600–4,000 |
| 100 | 2,400 | ~2,800 | ~7,200–8,000 |

These are architectural counts, not server-capacity claims. Opening the page adds an initial cycle; a first full minute can therefore contain five cycles (30 core API calls, about 35 guest or 90–100 member DB operations) plus `/api/admin/me`. At the measured guest payload of 5,007 bytes per cycle, steady data bodies are about 20 kB/client/minute, excluding HTTP headers, HTML, JavaScript, images, and service-worker traffic.

## Freshness classification

| Data | Actual change profile | Current 15s justification | Plausible future policy |
|---|---|---|---|
| App settings | Very slow; 1 row | None found | Long cache; invalidate on admin change |
| User identity | Login/profile/logout only | None found | Session-scoped bootstrap; action refresh |
| Circuits summary | Changes mainly on circuit edit/stage close | Weak | Short/medium cache; invalidate on close/admin edit |
| MoviBack summary | Membership, certificate, earn/redeem changes | Some cross-device freshness value | Refresh after action/focus; targeted slower poll if required |
| Communications | Changes on publish and local state mutation | Some new-message value | Brief cache/slower poll; state refresh after action |
| Tournaments/counts/live flag | Changes on registration/run operations | Strongest polling candidate | Poll only active/changeable summary, cache stable metadata |

## Duplicate and combine opportunities

Identity and membership are independently resolved by `/api/user/me`, `/api/moviback/me`, and communications. Combining all six resources into one monolithic response would reduce browser calls but preserve a single overly aggressive freshness policy. A safer future shape is:

- static/slow public bootstrap: settings, circuit metadata, tournament metadata;
- private session bootstrap: user + membership identity shared once;
- dynamic summaries: registration counts/live flags, points/notifications with explicit freshness rules.

No implementation decision is made here.

## Runtime evidence classification

- Parallel Home waterfall and payload: **MEASURED** for guest/local optimized server.
- 15-second and visibility triggers: **STATICALLY CONFIRMED**.
- API/DB operations per minute: **ESTIMATED** from confirmed branches.
- Authenticated payload/timing and real-browser render: **NOT YET MEASURED**.
- Workbox NetworkFirst behavior in an installed production PWA: **NOT YET MEASURED**.

## Dominant causes

| Cause | Contribution |
|---|---|
| Frontend lifecycle | HIGH |
| HTTP/API round trips | VERY HIGH |
| Server logic | MEDIUM |
| Database round trips | VERY HIGH |
| Query design | LOW at current scale |
| Database data volume | LOW |
| Application aggregation | MEDIUM |
| External services | LOW/none in reads |
| Cache strategy | HIGH |

