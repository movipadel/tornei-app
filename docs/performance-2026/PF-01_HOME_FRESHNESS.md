# PF-01 — Home freshness

## Status and scope

PF-01 separates Home bootstrap freshness from the existing 15-second live refresh. It does not change API contracts, database/schema state, authentication, authorization, dependencies, UI, business rules, or mutation behavior.

Files affected:

- `src/app/page.tsx` — Home refresh selection only.
- `docs/performance-2026/PF-01_HOME_FRESHNESS.md` — this implementation record.

`src/components/PublicNav.tsx` and all route handlers were inspected but not modified.

## Original behavior

`HomePage.loadAll()` started these six `cache: "no-store"` requests together with `Promise.all`:

| Endpoint | Initial mount | Visible 15-second timer | Visibility return | Manual/post-mutation | Server/database work | Freshness and sensitivity |
|---|---:|---:|---:|---:|---|---|
| `/api/tournaments` | Yes | Yes | Yes | Yes | Three sequential Supabase reads at current cardinality: tournaments, runs, registrations | Live/changeable registration counts and run state; keep periodic |
| `/api/app-settings` | Yes | Yes | Yes | Yes | One `app_settings` read | Very slow-changing public presentation data; bootstrap/action refresh is sufficient |
| `/api/user/me` | Yes | Yes | Yes | Yes | Signed user-cookie verification; guest exits without DB access, authenticated request reads one user row | User/session-specific and security-sensitive; login/logout update local state and visibility/full refresh revalidates it |
| `/api/circuits` | Yes | Yes | Yes | Yes | Up to three sequential reads: circuits, ranking groups, results | Slow-changing, but stage-close/admin changes can occur independently; conservatively keep periodic |
| `/api/moviback/me` | Yes | Yes | Yes | Yes | Guest exits without DB access; authenticated path performs 2 to 6 reads depending on membership | User-specific points, membership, certificate and redemption state can change cross-device; keep periodic |
| `/api/user/communications` | Yes | Yes | Yes | Yes | Guest exits without DB access; authenticated path performs approximately 4 to 6 reads depending on branches/data | User-specific publications/read state can change independently; keep periodic |

The six core requests were already parallel. Starting a new group aborted the prior browser request group. Mount, every visible timer tick, every return to `document.visibilityState === "visible"`, and successful registration/cancellation all used the same full group.

`PublicNav` independently called `/api/admin/me` once on mount. It was not part of `loadAll`, the timer, or the visibility listener. A valid phone can also trigger debounced `POST /api/registrations/search`; this optional flow is not included in the fixed Home counts below.

## Root cause

One refresh function imposed the most aggressive freshness policy on every resource. Consequently, immutable-within-session presentation and identity state were reread every 15 seconds even though Home already updates identity immediately after login/logout and performs a full refresh after visibility return and relevant mutations.

The live database is small. The cost addressed here is repeated browser/API/database round-trip amplification per active client, not row-volume processing.

## Exact change

`loadAll` now accepts `includeBootstrap`, defaulting to `true`:

- Mount: unchanged full six-request parallel load.
- Visible 15-second timer: four parallel requests; it omits `/api/app-settings` and `/api/user/me`.
- Visibility return: unchanged full six-request parallel load, revalidating presentation and user/session state after backgrounding.
- Successful registration and cancellation: unchanged full six-request refresh.
- Login: unchanged; the login response supplies the user and Home stores it immediately.
- Logout: unchanged; Home clears user, registrations and communications immediately.

No response payload, state fallback, interval, abort behavior, or server route was changed. The timer continues to refresh tournaments, circuits, MoviBack and communications.

## Admin/session probe security review

`PublicNav.checkAdmin()` calls `/api/admin/me` once when the navigation mounts. The handler verifies the signed staff-session cookie and requires `role === "admin"`. The result controls:

- whether the settings button routes directly to `/admin` or to `/admin/login`;
- its signed-in title and styling.

No equivalent admin state is available to the Home component. Deferring the request until click would change the initial admin UI and routing behavior; eliminating it would lose those behaviors. It is therefore not proven redundant and remains unchanged.

The probe is not an authorization boundary. Existing admin route handlers and guards continue to enforce authorization server-side. It normally performs cookie/JWT verification without an application-table read, returns `403` for a guest, and is not repeated by Home polling.

The user probe also remains server-verified on initial load and visibility return. Removing it only from active timer ticks does not change cookie validation, login/logout semantics, consent gating, or server authorization.

## Before/after request and database work

Counts assume one continuously visible Home client and four timer ticks in 60 seconds. They exclude the optional registration search and user actions.

| Window | Before | After | Change |
|---|---:|---:|---:|
| Timer API calls per active minute | 24 (4 × 6) | 16 (4 × 4) | -8 / -33.3% |
| First 60 seconds core calls, including initial load | 30 | 22 | -8 / -26.7% |
| First 60 seconds including one admin probe | 31 | 23 | -8 / -25.8% |
| Guest DB operations per timer minute | ~28 | ~24 | ~-4 / -14.3% |
| Authenticated, no membership DB operations per timer minute | ~56–64 | ~48–56 | ~-8 |
| Authenticated member DB operations per timer minute | ~72–80 | ~64–72 | ~-8 |

The authenticated values are static estimates from confirmed branches and depend on communications, membership and returned data. Initial DB work is unchanged. Including the initial full refresh, guest first-minute DB work falls from about 35 to 31; member work falls from about 90–100 to 82–92.

## Optimized-server measurements

Measured on 2026-09-10 with the same local Next.js 16.1.5 optimized production-server method used in Phase 2C. The server used the repository's existing local configuration to reach the configured Supabase service through read-only GET handlers. Each group was warmed once and sampled seven times; bodies were fully read but not printed or retained.

| Sample | Requests | Statuses | Bytes/cycle | Median | Average | Min–max |
|---|---:|---|---:|---:|---:|---:|
| Before refresh group | 6 | all 200 | 5,007 | 218.4 ms | 244.7 ms | 206.8–366.6 ms |
| After refresh group | 4 | all 200 | 4,776 | 205.3 ms | 207.4 ms | 190.9–244.0 ms |
| Home HTML smoke | 1 | 200 | 10,446 | 2.1 ms | 2.2 ms | 2.0–3.2 ms |
| Guest admin probe | 1 | expected 403 | 21 | 1.9 ms | 2.2 ms | 1.8–3.1 ms |

The measured refresh-group median decreased by 13.1 ms (about 6.0%). This small seven-sample local difference is directional, not a production percentile or proof of user-visible render improvement. Tournaments and circuits remain the slowest parallel requests, so the primary benefit is lower repeated work rather than initial-render latency.

For a guest, fixed response bodies over the four timer ticks fall from approximately 20,028 to 19,104 bytes per active minute (-924 bytes, -4.6%). A first 60 seconds including initial data and the admin probe falls from approximately 25,056 to 24,132 bytes. These figures exclude HTTP headers, HTML/JavaScript/images, service-worker traffic, optional searches, and authenticated payload variability.

Initial Home data and timing are intentionally unchanged: the initial call still starts all six resources in parallel, while `PublicNav` still performs its separate one-time probe.

## Validation performed

- `npx tsc --noEmit --pretty false` — passed.
- `npm run build` — passed; all 91 static pages generated and `/` remained statically prerendered. Existing `themeColor` metadata and browserslist-age warnings remain.
- Optimized Home document smoke — `GET /` returned 200 in all seven samples.
- Optimized API group smoke — all six initial endpoints returned 200; all four timer endpoints returned 200.
- Guest admin probe — returned the expected 403 without exposing session information.
- Source-path verification — mount, visibility return and both post-registration refresh paths still use the default full load; only the timer passes `includeBootstrap: false`.
- Full `npm run lint` — did not pass because of the repository's existing baseline (835 findings: 668 errors and 167 warnings across generated and application files).
- Targeted ESLint for `src/app/page.tsx` and `src/components/PublicNav.tsx` — reported the existing six `no-explicit-any` errors and ten warnings; PF-01 introduced no diagnostic at a changed line.

No Home-specific automated test script exists in `package.json`. The unrelated Baraonda test was not run. No authenticated test credentials or safe browser session were available, so authenticated/member/admin UI flows were verified from unchanged control flow and type/build checks rather than live login.

## Regression assessment and limitations

Risk is low but not zero:

- A user row or app setting changed remotely while the tab remains continuously visible can remain stale until a visibility return, full post-mutation refresh, or navigation. Home login/logout remains immediate. This is the accepted freshness boundary for session/bootstrap data.
- Dynamic tournament, circuit, MoviBack and communication data retains its prior 15-second cadence.
- A visibility event can still occur close to a timer tick. The existing abort behavior remains; no timing/deduplication mechanism was added because that would expand the change and could alter freshness.
- Measurements are local warm samples, not browser HAR/Web Vitals, Vercel latency, cold-start data, concurrency results, or production p95/p99.
- Authenticated response bytes and real member database-operation counts were not measured.
- Store is not fetched by Home and was not changed or retested beyond the successful application build.

## Rollback

Rollback requires only restoring the prior Home timer path:

1. Change the timer call back to `loadAll({ silent: true })`.
2. Remove `includeBootstrap` from the `loadAll` options/signature.
3. Restore unconditional `/api/app-settings` and `/api/user/me` requests and their unconditional response handling.
4. Remove this implementation record if the entire PF-01 change is being abandoned.

No database, environment, deployment, dependency, or API rollback is required.
