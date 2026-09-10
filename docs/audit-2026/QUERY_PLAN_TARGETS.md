# MOVIPadel Query Plan Targets — Phase 2C

## Status and execution safety

No query plan was executed: direct SQL access to production is not authorized. The following is the minimum high-value plan set prepared for an authorized operator.

Use opaque representative UUIDs. Never export row values or PII. Run plain `EXPLAIN` first. `EXPLAIN (ANALYZE, BUFFERS)` executes the SELECT and should be used only when the operator confirms bounded load. Set a short local statement timeout and a read-only transaction. Do not use these templates for mutations.

Suggested safety wrapper:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
-- one EXPLAIN target here
ROLLBACK;
```

Placeholders such as `<membership_uuid>` must be replaced by privacy-safe representative IDs inside the authorized environment.

## QP-01 — MoviBack recent ledger and balance aggregate

- Feature/endpoints: member summary, staff lookup/accreditation, checkout, redemption.
- Source: `src/app/api/moviback/me/route.ts:50-70`; `src/app/api/store/orders/route.ts:20-24`; `src/app/api/staff/lookup-membership/route.ts:56-59`.
- Table: `loyalty_transactions`.
- Current cardinality: approximately 489 rows.
- Current indexes: primary key only.
- Need: determine scan/sort behavior and compare full-row transfer with server-side aggregation. This is the strongest growth-oriented index target.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, type, source, euro_amount, points_delta, notes, created_at
FROM public.loyalty_transactions
WHERE membership_id = '<membership_uuid>'::uuid
ORDER BY created_at DESC
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT COALESCE(SUM(points_delta), 0) AS balance
FROM public.loyalty_transactions
WHERE membership_id = '<membership_uuid>'::uuid;
```

Capture small/median/largest member histories, planning/execution time, actual versus estimated rows, buffers, scan type and sort method.

## QP-02 — Member resolution and latest certificate

- Feature/endpoints: Home/MoviBack, checkout/reward, staff lookup, pending requests.
- Source: `src/app/api/moviback/me/route.ts:33-39,116-122`; `src/app/api/staff/lookup-membership/route.ts:70-76`; `src/app/api/admin/moviback/requests/route.ts:42-48`.
- Tables: `loyalty_memberships`, `medical_certificates`.
- Cardinality: approximately 93 memberships, 105 certificates.
- Current indexes: memberships PK + unique membership code; certificates PK only.
- Need: establish current negligible/meaningful cost and validate proposed user/date indexes before any migration.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, status, membership_code, membership_type
FROM public.loyalty_memberships
WHERE user_id = '<user_uuid>'::uuid;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, status, expiry_date, file_path, uploaded_at
FROM public.medical_certificates
WHERE user_id = '<user_uuid>'::uuid
ORDER BY uploaded_at DESC
LIMIT 1;
```

Also run a privacy-safe duplicate count for membership-per-user before considering uniqueness; do not export user IDs.

## QP-03 — Public circuit group results

- Feature: public/admin circuit rankings.
- Source: `src/app/api/circuits/[slug]/route.ts:108-116`; `src/app/api/admin/circuits/[id]/rankings/route.ts:83-99`.
- Table: `circuit_results`.
- Cardinality: approximately 300 rows across five groups.
- Current indexes: PK, circuit, player key, ranking group, and unique `(ranking_group_id, source_tournament_id, player_key)`.
- Need: verify whether result execution is already negligible and isolate network round-trip/app aggregation as dominant; assess public date sort.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT source_tournament_id, tournament_name, tournament_type,
       tournament_date, player_key, player_name, player_phone,
       points, placement, created_at
FROM public.circuit_results
WHERE ranking_group_id = '<ranking_group_uuid>'::uuid
ORDER BY tournament_date DESC NULLS LAST, created_at ASC;
```

Use both the one-group and largest current group. The measured endpoint difference already supports batching; a new index is not assumed.

## QP-04 — Live run resolution and fixed-pair state

- Feature: five-second live polling.
- Source: `src/app/api/tournaments/[id]/live/route.ts:109-116,163-216`.
- Tables: `tournament_runs`, `tournament_run_matches_fp`.
- Cardinality: approximately 32 runs and 219 fixed-pair matches globally.
- Current indexes: runs by tournament; fixed matches separately by run, group, stage, completion and start time.
- Need: confirm whether sort/filter execution is negligible now and whether any future composite is justified. The primary expected bottleneck remains call frequency.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, status, created_at, mode, rules
FROM public.tournament_runs
WHERE tournament_id = '<tournament_uuid>'::uuid
  AND status IN ('running', 'finished')
ORDER BY created_at DESC
LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT *
FROM public.tournament_run_matches_fp
WHERE run_id = '<run_uuid>'::uuid
ORDER BY stage ASC, starts_at ASC, created_at ASC;
```

Run only against an existing completed/active run in a quiet window. Do not expose rules or match rows in the report.

## QP-05 — Home tournament list

- Feature: Home and tournament 15-second polling.
- Source: `src/app/api/tournaments/route.ts:23-48,58-80`.
- Tables: `tournaments`, `tournament_runs`, `tournament_registrations`.
- Cardinality: approximately 42 tournaments, 32 runs, 283 registrations; measured response currently has seven upcoming tournaments.
- Current indexes: tournaments `start_at` and circuit ID; runs tournament ID; registrations tournament ID and `(tournament_id,is_reserve,position)`.
- Need: prove database execution is small compared with three remote calls and decide whether aggregation/caching, rather than indexing, is the correct target.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, type, category, level, circuit_id, date, time,
       location, max_participants, registrations_open, image_url,
       notes, show_participants, created_at, updated_at
FROM public.tournaments
WHERE date >= CURRENT_DATE
ORDER BY date ASC, time ASC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT tournament_id, is_reserve, p1_gender, p2_gender
FROM public.tournament_registrations
WHERE tournament_id = ANY(ARRAY['<tournament_uuid_1>'::uuid, '<tournament_uuid_2>'::uuid]);
```

The current `start_at` index does not directly match the date/time query, but 42 rows make a new index unproven.

## Explicit non-targets

- Exact checkout product/variant/stock lookups: PK/composite indexes exist and tables are tiny; latency comes from orchestration/atomicity.
- Store economics: only 15 orders exist; first measure payload/server time as it grows.
- Promotions, app settings, communications and push subscriptions: zero to four rows; query plans will not guide current optimization.
- Additional fixed-pair player-slot indexes: view/normalization design should be assessed only after a real live plan.

## Required plan report fields

For each target record: PostgreSQL version, sanitized parameter class, planning/execution time, actual/estimated rows, loops, scan/index names, buffer hits/reads, sort method/memory/temp spill, returned row count, and table statistics timestamp. Do not include actual sensitive row data.

