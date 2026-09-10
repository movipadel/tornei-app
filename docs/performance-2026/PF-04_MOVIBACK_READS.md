# PF-04 — MoviBack read-path optimization

## Status and scope

PF-04 is complete on `performance/foundation-2026`. The change is deliberately limited to existing MoviBack member-summary reads, staff membership lookup reads, and duplicate staff-session verification. It does not change database schema, indexes, migrations, dependencies, authorization rules, points rules, redemption writes, or API response contracts.

Files changed:

- `src/app/api/moviback/me/route.ts`
- `src/app/api/staff/lookup-membership/route.ts`
- `src/app/api/staff/earn-points/route.ts`
- `docs/performance-2026/PF-04_MOVIBACK_READS.md`

The redemption handler was analyzed but intentionally left unchanged because its balance read participates in a mutation-sensitive flow. No PF-05 work is included.

## Baseline flow reconstruction

### Member summary: `GET /api/moviback/me`

The browser calls `/api/moviback/me` from the MoviBack member experience. The handler obtains the user identity from the signed server-side user session and then previously executed these reads sequentially:

1. `users`: member identity/profile.
2. `loyalty_memberships`: membership state and metadata.
3. `loyalty_transactions`: latest 20 detailed rows for the visible transaction history.
4. `loyalty_transactions`: every `points_delta` row to calculate the current balance.
5. `reward_redemptions` joined to `rewards_catalog`: latest 10 redemptions.
6. `medical_certificates`: latest certificate.

The two transaction queries were confirmed duplicate reads of the same ledger rows for different projections: one supplied recent history, while the other supplied the complete balance. A member request therefore used six database round trips arranged in six latency stages. An authenticated user without a membership used three sequential reads. A guest exited before Supabase and used zero database calls.

### Staff membership lookup: `POST /api/staff/lookup-membership`

After validating the signed staff/admin session, the handler previously read:

1. `loyalty_memberships` by normalized membership code.
2. `users` for the matched member.
3. all `loyalty_transactions.points_delta` rows for balance.
4. the latest `medical_certificates` row.

Only the membership result is required to formulate the remaining three queries. Those dependent reads were sequential even though they are independent of each other.

### Staff accreditation: `POST /api/staff/earn-points`

The route previously called `guardStaff()` and then `getStaffSessionOrNull()`. Both helpers independently decoded and verified the same staff-session cookie/JWT for one request. The route then used the second result for `sid` and role-sensitive work. Promotion selection, membership lookup, ledger insert, and the post-insert balance read remain unchanged.

### Reward redemption: `POST /api/moviback/rewards/redeem`

The handler reads membership, reward/product/variant/stock information as applicable, and the full loyalty ledger before performing redemption-related writes and notifications. Its full-ledger balance calculation is a known scalability concern, but changing this mutation path safely requires atomic database-side design and live verification. PF-04 makes no change to it.

## Implemented optimizations

### 1. Parallelized independent member-summary reads

After the signed user identity is established, the `users`, `loyalty_memberships`, and latest `medical_certificates` reads now execute together with `Promise.all`. Once the membership ID is available, the loyalty-ledger and redemption reads execute together.

This preserves server-owned identity. No client-supplied user ID, membership ID, balance, role, or authorization result is trusted or reused.

### 2. Consolidated duplicate member ledger reads

`/api/moviback/me` now requests the detailed loyalty ledger once, in the same descending `created_at` order. The handler:

- sums all returned `points_delta` values to preserve the complete balance;
- takes the first 20 ordered rows to preserve the visible transaction history;
- returns exactly the same response fields and history limit.

No balance approximation, cached balance, pagination semantic, or points rule was introduced.

### 3. Parallelized dependent staff lookup reads

The membership lookup remains first because it supplies both `membership.id` and `membership.user_id`. Once found, the user, full ledger projection, and latest certificate are fetched concurrently. Response construction and error/status behavior remain unchanged.

### 4. Reused one verified staff session in accreditation

`/api/staff/earn-points` now calls `getStaffSessionOrNull()` once and directly enforces the same accepted roles (`admin` or `staff`) and required `sid`. Anonymous, invalid, expired, or unsupported-role sessions still receive `403 {"error":"Forbidden"}` before request-body processing or database work.

The prior route's later `401 "Sessione staff non valida"` branch could not be reached under a stable request after `guardStaff()` had already accepted the same cookie. Removing the second verification therefore removes redundant cryptographic/session work without relaxing authorization.

## Request and database-call comparison

Counts below are statically established from the handlers. A "latency stage" is one awaited database batch; calls inside a `Promise.all` remain separate Supabase HTTP operations but overlap in time.

| Flow | Database calls before | Database calls after | DB latency stages before | DB latency stages after |
|---|---:|---:|---:|---:|
| `/api/moviback/me`, guest | 0 | 0 | 0 | 0 |
| `/api/moviback/me`, authenticated without membership | 3 | 3 | 3 | 1 |
| `/api/moviback/me`, member | 6 | 5 | 6 | 2 |
| `/api/staff/lookup-membership`, matched member | 4 | 4 | 4 | 2 |
| `/api/staff/earn-points`, session verification | 2 cookie/JWT verifications | 1 cookie/JWT verification | 2 | 1 |

The accreditation route's database count remains branch-dependent and unchanged: membership, promotion resolution, insert, and post-insert balance operations were not altered.

## Ledger rows and payload effects

Let `L` be the total number of ledger entries for a membership.

Before PF-04, `/api/moviback/me` fetched `L` narrow balance rows plus `min(L, 20)` detailed history rows. It now fetches `L` detailed rows once.

| Ledger size | Rows before | Rows after | Row reduction |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 |
| 10 | 20 | 10 | 10 |
| 100 | 120 | 100 | 20 |
| 1,000 | 1,020 | 1,000 | 20 |

The API response payload is statically unchanged: at most 20 transaction objects and 10 redemption objects are returned. The database-to-server byte profile has a tradeoff: older ledger entries now include the detailed transaction projection instead of only `points_delta`. This removes a round trip and duplicate rows, but for very large histories it may transfer more column bytes than a database aggregate plus a separate recent-history query. That aggregate design is deferred because no committed RPC/view exists for it.

## Correctness and edge cases

- **Balance:** all ledger rows are still included. The audited schema evidence identifies `points_delta` as an integer, so positive, negative, and zero deltas produce the same numeric sum independent of row order.
- **History:** rows retain the existing `created_at DESC` ordering and the first 20 are returned. The old query had no secondary tie-breaker for identical timestamps; PF-04 does not invent one.
- **Empty ledger:** balance remains `0` and history remains `[]`.
- **Missing membership:** the same user, membership, and certificate result shape is returned with zero points and empty transaction/redemption arrays.
- **Certificate and redemption limits:** latest certificate and latest 10 redemption behavior are unchanged.
- **Identity and authorization:** signed server cookies remain the only identity source. Staff roles are checked before body parsing and database access.
- **Concurrent failures:** independent queries can now already be in flight when another fails. Error responses retain the prior validation priority where practical, but concurrent work cannot be cancelled through the current Supabase client.
- **Read consistency:** the old sequential reads were not transactionally consistent. Parallelization narrows elapsed time between related snapshots but does not claim atomic consistency.

## Runtime measurements and verification

Measurements used the optimized production build on localhost. The first request was treated as cold and excluded from the warm median.

| Check | Result |
|---|---|
| `GET /api/moviback/me`, anonymous, 7 samples | All `200`, all 96 bytes; warm median 4.12 ms (6 warm samples) |
| Historical Phase 2 anonymous baseline | 96 bytes; 3.2 ms median |
| `POST /api/staff/lookup-membership`, anonymous | `403 {"error":"Forbidden"}` |
| `POST /api/staff/earn-points`, anonymous | `403 {"error":"Forbidden"}` |
| `GET /moviback` | `200`, 12,681-byte HTML response |

The anonymous member-summary path performs no database work and is not expected to improve; its timing is a regression guard, not evidence of authenticated speedup. No safe authenticated member/staff fixture or reusable session was available, so authenticated latency, database bytes, and exact production response-size comparisons require controlled staging or live observability. No mutation endpoint was exercised.

Validation performed:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed with existing Next.js `themeColor` metadata warnings.
- targeted ESLint on the three modified route files: no new diagnostic; it reports seven pre-existing `@typescript-eslint/no-explicit-any` errors in the member-summary and accreditation handlers.
- no targeted test/spec files exist under the affected MoviBack/staff API paths.
- `git diff --check`: passed apart from Git's line-ending conversion warnings.

Build-generated changes to `public/sw.js`, `public/workbox-f1770938.js`, and `tsconfig.tsbuildinfo` were removed after verification and are not part of PF-04.

## Deferred work

The following opportunities are explicitly outside PF-04:

1. Introduce a database aggregate, view, or RPC that returns authoritative balance without transferring the complete ledger.
2. Make accreditation and redemption balance validation plus ledger/inventory writes atomic in database transactions/RPCs.
3. Replace the redemption handler's full-ledger read after transaction-safe live-schema analysis.
4. Rework promotion fallback and applicability evaluation, which remain branch-dependent reads and application-side processing.
5. Share identity/session state across separate browser requests; this would affect wider application/session architecture.
6. Add or change indexes. Query plans and the complete live index inventory are required before making an index claim.
7. Add authenticated performance fixtures and production/staging tracing for response bytes, Supabase duration, row counts, and p95/p99 latency.

## Risk and rollback

Overall implementation risk is low to medium. Public response contracts, limits, ordering, balance inputs, session source, and write behavior are preserved. The principal tradeoff is the wider projection for ledger rows older than the visible 20, and the principal operational uncertainty is authenticated production latency without a safe fixture.

Rollback is isolated: restore the three route files to their pre-PF-04 versions. That reinstates the two member ledger reads, sequential member/staff lookups, and double accreditation session verification. No database or deployment rollback is needed.
