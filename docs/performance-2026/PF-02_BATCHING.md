# PF-02 — Circuit and certificate batching

## Status and scope

PF-02 removes two confirmed database fan-out patterns without changing schemas, API contracts, ranking calculations, certificate rules, authentication, authorization, UI, dependencies, or mutation behavior.

Affected files:

- `src/app/api/circuits/[slug]/route.ts`
- `src/app/api/admin/circuits/[id]/rankings/route.ts`
- `src/app/api/admin/moviback/requests/route.ts`
- `docs/performance-2026/PF-02_BATCHING.md`

No page/component required a change because all response shapes remain the same.

## Part A — Original circuit-ranking architecture

### Public circuit detail

`src/app/circuiti/[slug]/page.tsx` issues one no-store browser request to `GET /api/circuits/[slug]`. The handler performed these Supabase calls sequentially:

1. Circuit by slug.
2. Ranking groups for the circuit, ordered by category and level.
3. Future tournaments for the circuit, ordered by date and time.
4. One `circuit_results` query per ranking group, sequentially inside the group loop.

For `G` groups the route therefore used `3 + G` database operations. Each result query ordered rows by `tournament_date DESC NULLS LAST`, then `created_at ASC`. Application code then grouped rows by player and stage, summed points/events, sorted ranking rows and stage results, matched future tournaments to each group, and emitted every group—including empty groups.

### Protected circuit rankings

Both the admin detail page and the duplicate-summary overview use `GET /api/admin/circuits/[id]/rankings`. The endpoint first runs the unchanged admin guard, then queried:

1. Circuit by ID.
2. Ranking groups ordered by category and level.
3. One `circuit_results` query per group, sequentially.

The endpoint used `2 + G` database operations. It retained separate group maps for player totals, played stages and possible duplicate identities.

The admin overview still loads its circuit list first and then issues one ranking browser request per circuit in parallel. PF-02 intentionally does not redesign that browser/API contract.

## Part A — Implementation

Each ranking handler now:

1. Collects the ranking-group IDs in the existing group order.
2. Skips the result query when there are no groups.
3. Fetches all circuit result rows with one `.in("ranking_group_id", groupIds)` query.
4. Includes `ranking_group_id` only in the internal database projection.
5. Partitions rows into a `Map<string, ResultRow[]>`.
6. Runs the existing per-group aggregation code unchanged over the mapped rows.

The public batch query retains the same database ordering clauses. Filtering the globally ordered rows into group arrays preserves each group's relative order. Group response order still comes from the original ordered group query. The protected route retains its original absence of a database ordering clause; its user-facing rankings, stage lists and stage results continue to use the existing explicit application sorting.

No scoring, tie, player-key, duplicate-detection, future-stage, empty-state or response-envelope logic moved or changed.

## Part A — Query counts

| Flow | Groups | Before | After | Reduction |
|---|---:|---:|---:|---:|
| Public detail | 0 | 3 | 3 | 0 |
| Public detail | 1 | 4 | 4 | 0 |
| Public detail | 4 | 7 | 4 | 3 / 42.9% |
| Protected ranking endpoint | 0 | 2 | 2 | 0 |
| Protected ranking endpoint | 1 | 3 | 3 | 0 |
| Protected ranking endpoint | 4 | 6 | 3 | 3 / 50.0% |

For the currently observed two-circuit admin overview with one and four groups, estimated database work falls from about 10 operations to 7: one circuit-list query plus two three-query ranking handlers. Browser requests remain three (`1 + C`).

## Part A — Before/after measurements

Measurements used the same local Next.js 16.1.5 optimized production-server approach as the audit. The same live public one-group and four-group fixtures were available before and after. Each endpoint was warmed once and sampled seven times; response bodies were read for byte/hash/count validation but were not printed or retained.

| Fixture | Query calls before → after | Median before → after | Average before → after | Range before | Range after | Payload before/after |
|---|---:|---:|---:|---:|---:|---:|
| 1 ranking group | 4 → 4 | 442.1 → 348.0 ms | 461.8 → 342.3 ms | 307.1–742.5 ms | 252.4–440.2 ms | 10,682 B / 10,682 B |
| 4 ranking groups | 7 → 4 | 567.3 → 354.3 ms | 577.6 → 433.5 ms | 490.6–670.0 ms | 280.3–957.3 ms | 30,240 B / 30,240 B |

The four-group median decreased by 213.0 ms (37.5%) while three remote database round trips were removed. The seven-sample ranges show material network variance, so these are directional local results rather than production p95/p99. The one-group query count is unchanged; its timing difference must not be attributed to batching.

Both fixtures produced exactly the same response bytes and SHA-256 before and after. The one-group fixture retained 35 ranking rows and 12 played stages. The four-group fixture retained 156 ranking rows and 15 played stages. This validates group boundaries, members, positions, scores, ordering, stages and empty response-envelope behavior for the available data.

Protected endpoint timing was not measured because no admin session was available. Its guest authorization smoke remained `403`.

## Part B — Original certificate architecture

`src/app/admin/moviback/requests/page.tsx` requests `GET /api/admin/moviback/requests`. After the unchanged admin guard, the handler queried pending memberships with joined user name/phone, ordered by membership `created_at ASC`.

It then mapped every returned membership through `Promise.all`. Each item made a separate `medical_certificates` query matching `user_id`, ordered by `uploaded_at DESC`, limited to one and using `maybeSingle()`. The certificate queries were concurrent, but still created one database operation per membership: `1 + N` total.

Missing or failed certificate lookups produced `certificate: null`; successful lookups returned `id`, `status`, `expiry_date`, `file_path` and `uploaded_at`.

## Part B — Implementation

The handler now:

1. Preserves the pending-membership list and its order.
2. Normalizes, removes null/empty values, and deduplicates its user IDs.
3. Skips certificate access when no valid user IDs exist.
4. Fetches all matching certificate rows in one `.in("user_id", userIds)` query ordered by `uploaded_at DESC`.
5. Walks that ordered result once and stores only the first certificate for each user.
6. Maps the selected certificate back to every membership without returning the internal `user_id` field.

This preserves the original latest-uploaded selection rule, missing-certificate behavior, membership order and response shape. Duplicate membership user IDs reuse the same latest certificate. Null identifiers remain mapped to `null`. Multiple certificates for a user remain resolved by the original `uploaded_at DESC` rule; equal timestamps had no secondary tie-breaker before PF-02 and still do not.

The prior per-item implementation ignored certificate-query errors and returned a null certificate for those failures. The batched implementation likewise treats a failed/empty batch as no certificates rather than changing the endpoint's error contract.

## Part B — Query counts

For `N` pending membership rows with at least one valid user identifier:

| Pending members | Before | After |
|---:|---:|---:|
| 1 | 2 | 2 |
| 10 | 11 | 2 |
| 50 | 51 | 2 |

If the list is empty or contains no valid identifiers, both paths require only the initial list query after authorization. If user IDs are duplicated, the new certificate query uses unique identifiers while the old path still queried once per row.

These are architectural operation counts, not production capacity claims. Authenticated timing and payload measurements were unavailable because no admin test session was provided.

## Correctness and security validation

- Public one-group and four-group endpoint responses matched their pre-change bytes and hashes exactly.
- Group counts, ranking-row counts, played-stage counts and payload sizes remained identical on both fixtures.
- Empty groups remain emitted with empty ranking/stage arrays because every original group is still processed and missing map entries resolve to `[]`.
- A player appearing in multiple groups is isolated by the `ranking_group_id` partition.
- Ranking scores, positions, tie sorting, stage sorting, duplicate detection and future-stage matching use the unchanged code.
- Certificate payload fields and `null` fallback match the previous response contract.
- Pending membership ordering remains controlled solely by the unchanged initial query.
- `GET /api/admin/circuits/[id]/rankings` returned `403` to a guest before any data access.
- `GET /api/admin/moviback/requests` returned `403` to a guest before any data access.
- No authentication/authorization helper or guard was changed.

## Tests and checks

- `npx tsc --noEmit --pretty false` — passed before the production build.
- `npm run build` — passed, including Next.js TypeScript validation and generation of all 91 static pages.
- Focused public endpoint smoke — both fixtures returned 200 in every measured sample.
- Focused protected endpoint smoke — both affected admin GET routes returned the expected 403 for a guest.
- Exact public response parity — passed for both available live fixtures.
- Targeted ESLint on the three modified handlers — the protected ranking and certificate handlers are clean; the public route retains four pre-existing `no-explicit-any` errors outside the batching change.
- No targeted automated test/spec file exists beside the affected handlers.

Existing build warnings about `themeColor` metadata and browserslist age were not changed.

## Regression risk and limitations

Risk is low:

- The batch result query returns more rows in one response, but total result rows and API payloads are unchanged.
- Very large group/user-ID lists could eventually approach PostgREST URL limits; current observed group counts and the requested 50-member example are small.
- Public runtime parity was verified against current data, but fixtures did not prove every theoretical edge case such as equal certificate upload timestamps.
- Protected response parity and certificate mapping could not be runtime-compared without an admin session. Their transformations and contracts were statically checked, and authorization behavior was smoke-tested.
- The admin overview's one-browser-request-per-circuit pattern remains. Removing that fan-out would require a separate API contract/change and is outside this conservative batching step.
- No direct PostgreSQL spans or production Vercel percentiles were available.

## Rollback

No database or deployment rollback is required. To revert PF-02:

1. Restore each ranking handler's per-group `.eq("ranking_group_id", group.id)` query inside its group loop.
2. Remove `ranking_group_id` from the internal result projections and remove the partition maps.
3. Restore the pending-membership `Promise.all` and per-row latest-certificate query.
4. Remove this document if PF-02 is abandoned entirely.

The rollback does not require schema, migration, environment, dependency, UI or authentication changes.
