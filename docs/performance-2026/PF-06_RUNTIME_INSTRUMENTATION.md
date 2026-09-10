# PF-06 — Runtime performance instrumentation

## Status and scope

PF-06 is complete on `performance/foundation-2026`. It adds opt-in, structured server-side timing to a deliberately small set of high-value read endpoints. Instrumentation does not change database schema, queries, business rules, authentication, response bodies, status codes, dependencies, or production behavior when disabled.

Changed files:

- `src/lib/runtimePerf.ts`
- `src/app/api/store/products/route.ts`
- `src/app/api/circuits/[slug]/route.ts`
- `src/app/api/moviback/me/route.ts`
- `src/app/api/tournaments/[id]/live/route.ts`
- `src/app/api/tournaments/route.ts`
- `src/app/api/circuits/route.ts`
- `src/app/api/user/communications/route.ts`
- `docs/performance-2026/PF-06_RUNTIME_INSTRUMENTATION.md`

Checkout and redemption handlers were inspected but intentionally not modified or executed.

## Existing observability discovered

Targeted inspection found no existing reusable endpoint timer, structured performance logger, request correlation layer, `Server-Timing` implementation, middleware timer, Vercel instrumentation hook, performance feature flag, or external monitoring integration.

The application has ordinary `console.error`/`console.warn` diagnostics around some failures and non-blocking notification providers. Those messages are not structured request timings, do not correlate database and application time, and are not a suitable reusable performance system.

No existing facility was displaced or duplicated.

## Instrumentation design

`createRuntimePerf(endpoint)` creates a request-scoped tracker using the monotonic high-resolution `performance.now()` clock. It is enabled only when the server process has `PERF_INSTRUMENTATION=1`.

Each instrumented handler:

1. creates a tracker with a constant route template, never a raw URL or parameter;
2. wraps existing Supabase promises with `perf.db()` without changing their order or concurrency;
3. returns the original body/status through `perf.json()`;
4. emits one structured log in a `finally` block through `perf.finish()`.

Parallel DB spans are merged by elapsed wall-clock coverage. This prevents three concurrent 100 ms queries from being reported as 300 ms of request-level DB time. `db_operations` still counts all three operations.

`app_ms` is the request time not covered by DB or external spans. It includes cookie/auth processing, parameter handling, application transformations, approximate response-size calculation when enabled, and response construction within the handler. It is not a full Next.js network/server lifecycle measurement outside the route function.

No response timing/debug headers were added; API headers and semantics remain unchanged. Correlation exists only in server logs.

## Enable and disable

| Variable name | Purpose | Accepted values |
|---|---|---|
| `PERF_INSTRUMENTATION` | Enables PF-06 structured timing logs | `1` enables; unset or any other value disables |

The variable is checked server-side. It is not prefixed with `NEXT_PUBLIC_`, is not exposed to browser code, and does not need to be present in production. No environment file or real value was added to the repository.

To disable instrumentation, remove the variable or set it to any value other than exactly `1`. Disabled requests generate no `PERF` log and no response-size serialization pass.

## Metrics produced

Each enabled request logs one line beginning with `PERF`, followed by JSON containing:

| Field | Meaning |
|---|---|
| `endpoint` | Constant route template, without slug, tournament ID, query string, or user data |
| `request_id` | Random request-scoped UUID; it is not derived from any domain identifier |
| `status` | HTTP response status selected by the route |
| `total_ms` | Total elapsed time inside the route handler |
| `db_ms` | Union of Supabase wait intervals; concurrent waits are counted once in wall time |
| `app_ms` | Total time outside DB/external intervals |
| `external_ms` | Union of instrumented external-provider intervals; currently zero on read endpoints |
| `db_operations` | Number of wrapped Supabase operations actually started on the executed branch |
| `response_bytes_approx` | UTF-8 size of `JSON.stringify(responseBody)`; excludes HTTP headers |

All millisecond values are rounded to two decimal places.

Example with intentionally fake values and an all-zero opaque ID:

```text
PERF {"endpoint":"/api/example/[id]","request_id":"00000000-0000-4000-8000-000000000000","status":200,"total_ms":120.5,"db_ms":96.25,"app_ms":24.25,"external_ms":0,"db_operations":3,"response_bytes_approx":2048}
```

The example contains no production request or identifier.

## Endpoints instrumented

| Endpoint | Reason | DB operations reported |
|---|---|---:|
| `/api/store/products` | High-value Store catalog payload and nested product graph | 3 |
| `/api/circuits/[slug]` | Public ranking/stage aggregation | 3–4 depending on ranking groups |
| `/api/moviback/me` | Member summary, balance, ledger, redemptions, certificate | 0 guest; 3 without membership; 5 member |
| `/api/tournaments/[id]/live` | Five-second live state and standings/bracket recomputation | 1 no-run; about 3–5 active branch-dependent |
| `/api/tournaments` | Periodic Home tournament/count/live-state resource | 1–3 depending on returned tournaments |
| `/api/circuits` | Periodic Home circuit summary | 1–3 depending on groups/results |
| `/api/user/communications` | Completes the four-resource periodic Home waterfall | 0 guest; approximately 2–6 authenticated, branch-dependent |

Together, the last four relevant entries cover the complete PF-01 periodic Home request group: tournaments, circuits, MoviBack summary, and user communications. Bootstrap-only app settings/user identity were not instrumented to keep PF-06 focused.

## Runtime validation and measured overhead

Testing used the same optimized local Next.js production build with two simultaneous servers: one with instrumentation disabled and one enabled. Only read-only public or anonymous requests were sent. Each representative comparison used 21 paired requests, alternating which server was called first.

| Representative endpoint | OFF median | ON median | Median paired ON−OFF delta | Interpretation |
|---|---:|---:|---:|---|
| Guest `/api/moviback/me` (0 DB) | 3.57 ms | 3.46 ms | +0.16 ms | Best isolation of local tracker/log overhead; negligible |
| No-run live endpoint (1 DB) | 80.98 ms | 88.78 ms | −0.15 ms | Supabase/network variation dominates tracker cost |
| Store catalog (3 DB, 87,508-byte body) | 296.81 ms | 281.11 ms | −10.52 ms | Enabled run was not slower; remote variation is much larger than instrumentation |

The median of paired differences is the useful overhead signal; independent medians can move in the opposite direction because remote calls vary. PF-06 does not claim the negative deltas are speed improvements. The observed positive isolated delta was approximately 0.16 ms.

An additional seven-sample OFF/ON smoke covered all seven endpoints. Every response retained the same status, UTF-8 byte length, and SHA-256 content fingerprint between modes. Selected sizes included Store at 87,508 bytes, circuit detail at 10,682 bytes, guest MoviBack at 96 bytes, guest communications at 11 bytes, and no-run live state at 19 bytes. These sizes describe the current read-only fixtures, not stable API limits.

With instrumentation enabled, logs correctly reported:

- Store catalog: 3 DB operations;
- circuit detail fixture: 4 DB operations;
- no-run live fixture: 1 DB operation;
- guest MoviBack and communications: 0 DB operations;
- non-zero `db_ms` only for database branches;
- zero `external_ms` for these read endpoints.

## Privacy and security review

PF-06 logs only timing/count metadata, response status/size, a constant route template, and a random UUID. It does not log or derive correlation from:

- names, email addresses, phone numbers, membership/user/order IDs;
- route parameters, slugs, query values, request or response bodies;
- cookies, authorization headers, session values, JWTs, QR contents;
- SQL/PostgREST filters or database result rows;
- environment or secret values.

Error response bodies are returned as before but are not copied into performance logs. Instrumentation does not change auth checks, access decisions, or Supabase credentials. The control variable name is documented without exposing any real environment configuration.

## Checkout and redemption preparation

Mutation paths were deliberately left unchanged because adding wrappers across their compensating writes and notification error boundaries would enlarge regression risk in an observability-only foundation phase. No checkout, redemption, stock, points, order, email, Telegram, or push action was executed.

Future safe insertion points are:

### `POST /api/store/orders`

- one DB aggregate around user/membership/balance, per-item product/color/size/stock validation, order/item inserts, points insert, compensating deletes, and stock updates;
- a dedicated email span around `sendStoreOrderEmail` inside its existing non-blocking `try/catch`;
- a Telegram span around `sendTelegramMessage`;
- a push span around `sendAdminPushNotification`;
- final response timing after all existing notification awaits.

Instrumentation must not log the cart body, customer fields, generated notification text, order ID, or provider error payload. The existing execution order and ignored-versus-fatal failure boundaries must remain intact.

### `POST /api/moviback/rewards/redeem`

- DB aggregate around membership/reward/variant/stock/balance reads, redemption and ledger inserts, compensating redemption delete, catalog/stock decrements, and optional Store order/item writes;
- Telegram and push spans inside the existing ignored notification `try/catch`;
- final response timing without logging reward, member, QR token, redemption, or Store order identifiers.

Database writes and external providers should be timed individually without being moved, parallelized, retried, or made more/less blocking.

## Validation performed

- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed; existing Browserslist-age and Next.js `themeColor` metadata warnings remain.
- Read-only optimized-server smoke: all instrumented endpoints returned `200` in OFF and ON modes for the available fixtures.
- Response body status, byte length, and content fingerprints matched between OFF and ON modes.
- Instrumentation OFF emitted no `PERF` records; ON emitted one useful structured record per request.
- Targeted ESLint: the new utility, Store route, Home circuits route, and communications route are clean. Existing audited routes still report 40 pre-existing `no-explicit-any` errors and one pre-existing unused-parameter warning; PF-06 introduced no diagnostic at a changed line.
- No relevant automated endpoint test suite exists in `package.json` or the targeted paths.
- `git diff --check`: passed apart from line-ending conversion notices.

Build-generated changes to `public/sw.js`, `public/workbox-f1770938.js`, and `tsconfig.tsbuildinfo` were removed after validation.

## Regression risk

Risk is low:

- disabled behavior is the original code path plus one feature-flag branch/function call around existing promises;
- enabled behavior adds monotonic timestamps, interval bookkeeping, one response-body size calculation, a random UUID, and one log line;
- existing promise order and concurrency are preserved;
- response creation still uses `NextResponse.json` with the original bodies and statuses;
- no timing header or client-visible debug contract was introduced.

The main operational consideration is log volume if enabled during high-frequency Home/live polling. Enable it only for bounded diagnostic windows or in staging, and filter/aggregate by the `PERF` prefix and `endpoint` field.

## Rollback

1. Restore the seven route files to direct Supabase awaits and `NextResponse.json`.
2. Delete `src/lib/runtimePerf.ts`.
3. Remove `PERF_INSTRUMENTATION` from the runtime environment if it was configured externally.
4. Remove this PF-06 report if abandoning the phase entirely.

No database, migration, index, dependency, API, or deployment rollback is required.
