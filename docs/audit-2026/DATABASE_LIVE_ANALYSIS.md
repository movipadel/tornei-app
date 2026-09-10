# MOVIPadel Live Database Analysis — Phase 2B

## Evidence and limitations

This analysis correlates the application source, Phase 1/2A documentation, and the read-only metadata snapshot in `docs/audit-2026/live-db/`. No production connection or SQL execution was performed.

The CSV contents were validated before use:

| Export | Validated header | Rows |
|---|---|---:|
| `01_tables.csv` | `schemaname, table_name, estimated_rows, total_size` | 79 |
| `02_columns.csv` | schema/table/ordinal/name/type/nullability/default | 905 |
| `03_indexes.csv` | schema/table/index name/definition | 240 |
| `04_constraints.csv` | schema/table/constraint/type/column/FK target | 788 |
| `05_policies.csv` | schema/table/policy/roles/command/expressions | 6 |
| `06_vies.csv` | schema/view/definition | 6 |
| `07_rls.csv` | schema/table/RLS enabled/forced | 44 |
| `08_functions.csv` | schema/function/arguments/result/definition | 2 |

`06_vies.csv` is the view export despite the filename. There is no `09_triggers.csv`; the supplied public-schema trigger query returned zero rows. Row counts are PostgreSQL estimates, not guaranteed exact counts. `total_size` is a relation-level total and can include indexes/TOAST. The snapshot does not include grants, extensions, table statistics freshness, query plans, execution telemetry, storage policies, or historical growth.

## Current production scale

The public application schema contains **44 tables**, approximately **3,483 estimated rows in total**, and approximately **3.81 MiB total relation storage**. This is a very small operational database. The sum is useful for scale, but not for proving the latency of any individual query.

### Largest tables by estimated rows

| Table | Estimated rows | Total size | Character |
|---|---:|---:|---|
| `loyalty_transactions` | 489 | 168 kB | Append-style points ledger; expected to grow continuously |
| `store_product_stock` | 418 | 264 kB | Catalog variant stock matrix |
| `circuit_results` | 300 | 232 kB | Per-player/per-stage history |
| `tournament_registrations` | 283 | 168 kB | Registration history |
| `tournament_run_matches` | 232 | 168 kB | Baraonda score history |
| `tournament_run_matches_fp` | 219 | 176 kB | Fixed-pair score history |
| `users` | 203 | 120 kB | User master |
| `tournament_run_turns` | 202 | 136 kB | Baraonda turns |
| `tournament_run_participants` | 140 | 88 kB | Run participant snapshots |
| `store_product_sizes` | 139 | 112 kB | Product variants |

### Largest tables by storage

| Table | Total size | Estimated rows |
|---|---:|---:|
| `store_product_stock` | 264 kB | 418 |
| `circuit_results` | 232 kB | 300 |
| `tournament_run_matches_fp` | 176 kB | 219 |
| `loyalty_transactions` | 168 kB | 489 |
| `store_orders` | 168 kB | 15 |
| `tournament_run_matches` | 168 kB | 232 |
| `tournament_registrations` | 168 kB | 283 |

The comparatively high total size of `store_orders` at only 15 rows is not evidence of a performance problem: fixed page/index overhead and wide nullable columns can dominate tiny relations.

## Complete public-table inventory

Every public table has a primary key and RLS enabled. Index counts include primary and unique indexes. “Checks” excludes metadata rows that represent generated not-null checks.

| Table | Rows est. | Total size | Indexes | FK | Unique | Checks | RLS |
|---|---:|---:|---:|---:|---:|---:|---|
| `admin_push_subscriptions` | 4 | 48 kB | 2 | 0 | 1 | 0 | enabled |
| `app_settings` | 1 | 32 kB | 1 | 0 | 0 | 0 | enabled |
| `circuit_points_rules` | 39 | 112 kB | 4 | 1 | 0 | 5 | enabled |
| `circuit_ranking_groups` | 5 | 64 kB | 3 | 1 | 1 | 2 | enabled |
| `circuit_results` | 300 | 232 kB | 5 | 2 | 1 | 1 | enabled |
| `circuits` | 2 | 64 kB | 3 | 0 | 1 | 2 | enabled |
| `communication_user_states` | 0 | 72 kB | 4 | 2 | 1 | 0 | enabled |
| `communications` | 1 | 80 kB | 4 | 1 | 0 | 1 | enabled |
| `loyalty_global_promos` | 0 | 24 kB | 2 | 0 | 0 | 3 | enabled |
| `loyalty_memberships` | 93 | 80 kB | 2 | 1 | 1 | 3 | enabled |
| `loyalty_transactions` | 489 | 168 kB | 1 | 1 | 0 | 2 | enabled |
| `loyalty_user_promos` | 0 | 32 kB | 3 | 1 | 0 | 0 | enabled |
| `medical_certificates` | 105 | 72 kB | 1 | 1 | 0 | 1 | enabled |
| `reward_categories` | 5 | 48 kB | 2 | 0 | 1 | 0 | enabled |
| `reward_point_ranges` | 5 | 32 kB | 1 | 0 | 0 | 1 | enabled |
| `reward_redemptions` | 51 | 96 kB | 3 | 2 | 0 | 1 | enabled |
| `rewards_catalog` | 27 | 48 kB | 2 | 1 | 0 | 1 | enabled |
| `staff_users` | 8 | 48 kB | 2 | 0 | 1 | 1 | enabled |
| `store_categories` | 5 | 64 kB | 3 | 0 | 2 | 0 | enabled |
| `store_lines` | 2 | 64 kB | 3 | 0 | 2 | 0 | enabled |
| `store_order_economics` | 0 | 24 kB | 2 | 1 | 1 | 1 | enabled |
| `store_order_items` | 15 | 48 kB | 2 | 4 | 0 | 1 | enabled |
| `store_orders` | 15 | 168 kB | 7 | 2 | 0 | 5 | enabled |
| `store_product_colors` | 90 | 96 kB | 2 | 1 | 0 | 0 | enabled |
| `store_product_costs` | 31 | 48 kB | 2 | 1 | 1 | 0 | enabled |
| `store_product_sizes` | 139 | 112 kB | 3 | 1 | 1 | 0 | enabled |
| `store_product_stock` | 418 | 264 kB | 3 | 3 | 1 | 0 | enabled |
| `store_products` | 31 | 128 kB | 5 | 2 | 0 | 0 | enabled |
| `store_promos` | 0 | 24 kB | 2 | 0 | 0 | 1 | enabled |
| `store_special_orders` | 0 | 16 kB | 1 | 0 | 0 | 1 | enabled |
| `store_supplier_batch_orders` | 0 | 32 kB | 4 | 2 | 1 | 0 | enabled |
| `store_supplier_batches` | 0 | 24 kB | 2 | 0 | 1 | 1 | enabled |
| `tournament_registrations` | 283 | 168 kB | 4 | 2 | 0 | 2 | enabled |
| `tournament_run_bracket_slots` | 0 | 56 kB | 3 | 2 | 1 | 1 | enabled |
| `tournament_run_group_pairs` | 109 | 112 kB | 4 | 2 | 1 | 0 | enabled |
| `tournament_run_groups` | 31 | 96 kB | 4 | 1 | 2 | 0 | enabled |
| `tournament_run_matches` | 232 | 168 kB | 3 | 5 | 1 | 0 | enabled |
| `tournament_run_matches_fp` | 219 | 176 kB | 6 | 4 | 0 | 12 | enabled |
| `tournament_run_pairs` | 109 | 88 kB | 2 | 1 | 0 | 0 | enabled |
| `tournament_run_participants` | 140 | 88 kB | 2 | 1 | 0 | 1 | enabled |
| `tournament_run_turns` | 202 | 136 kB | 3 | 1 | 1 | 1 | enabled |
| `tournament_runs` | 32 | 136 kB | 2 | 1 | 0 | 3 | enabled |
| `tournaments` | 42 | 96 kB | 3 | 1 | 0 | 3 | enabled |
| `users` | 203 | 120 kB | 3 | 0 | 1 | 1 | enabled |

Tables reported as zero estimated rows may contain a few rows if planner statistics are stale. They are nevertheless too small for scan cost alone to explain material application latency.

## Constraints and relationship integrity

The snapshot confirms primary keys on all 44 tables and 52 foreign-key relationships, including the principal tournament, circuit, MoviBack, reward, store, communication, and run graphs. It also confirms application-relevant uniqueness such as:

- `users(phone)` and `loyalty_memberships(membership_code)`;
- `circuits(slug)` and `(circuit_id, category, level)` ranking groups;
- `(ranking_group_id, source_tournament_id, player_key)` circuit results;
- `(user_id, communication_id)` communication state;
- `(run_id, turn_number)`, `(turn_id, match_number)`, run/group names and positions;
- `(group_id, pair_id)` assignments;
- product size and product/color/size stock keys;
- order economics per order and order membership in supplier batches;
- partial unique redemption QR token.

Important gaps or ambiguities from the metadata:

- `loyalty_memberships.user_id` is a foreign key but not unique/indexed, while code frequently uses `.maybeSingle()` and assumes one membership per user.
- `store_product_stock(product_id, color_id, size_id)` is unique, but the index definition does not use `NULLS NOT DISTINCT`. PostgreSQL normally permits multiple rows when `size_id` is null; the no-size variant lookup uses `.maybeSingle()`.
- No check constraint name indicates a non-negative stock rule on `store_product_stock`; stock is nullable.
- Multi-statement checkout, redemption, run lifecycle, and position maintenance are not made atomic by a public trigger.

These are correctness/concurrency observations as well as performance design constraints. They require data-quality checks before any future uniqueness or transaction change.

## Views, functions, and triggers

Three public views are confirmed:

- `tournament_run_standings`: aggregates Baraonda match values per participant using a join across the four player-ID columns.
- `tournament_run_group_standings`: aggregates completed fixed-pair group matches.
- `tournament_run_matches_fp_view`: joins fixed-pair matches to pair and group names.

The views are not materialized. Their performance depends on underlying indexes and query pushdown. At the present match counts, their raw scan cost is unlikely to dominate; runtime plans remain required for future growth.

Two public RPCs are confirmed:

- `verify_staff_login(email, password)`: `SECURITY DEFINER`, fixed `search_path`, case-folded email predicate, active check, bcrypt verification, limit one.
- `set_staff_password(staff_id, password)`: `SECURITY DEFINER`, fixed `search_path`, primary-key update with bcrypt hashing.

The function definitions use an explicit `search_path`, which avoids one common security-definer risk. Execute grants are not included in the snapshot and still require review. The unique `staff_users(email)` B-tree does not directly support `lower(email)`, but eight rows make table scan cost immaterial now; password hashing should dominate login database CPU.

The public trigger inventory is empty. Therefore no public-schema trigger currently maintains balances, stock, registration positions, standings, or audit history.

## RLS and policy correlation

All 44 public tables have RLS enabled and none has `FORCE ROW LEVEL SECURITY`. Only six policies are exported:

- owner-select policies on memberships, transactions, certificates, and redemptions;
- public reward-catalog SELECT;
- anon/authenticated tournament-registration SELECT.

Most application tables therefore have RLS enabled but no exported policy. The browser-side anon client has no detected consumer, while Next.js handlers use the service-role key. Service-role requests bypass RLS, so the live policy setup generally does **not** add row-policy filtering cost to current application queries. Effective authorization and query shaping remain in Next.js handlers.

Security and performance are coupled in a future redesign: switching queries to a browser/authenticated Supabase client would activate RLS and require Supabase-compatible identities, policy plans, and policy-supporting indexes. The current custom user cookie does not itself populate `auth.uid()`. The broad tournament-registration SELECT policy could permit direct row reads if table grants allow it; grants were not exported, so exposure is not concluded here.

## Source-to-live reconciliation

- Phase 1 inferred 42 literal `.from()` relation names. All but `registrations` exist as a live table or view.
- The legacy run-lock path references `registrations`, which is absent from the live public metadata. That legacy route is not supported by the current live schema and would require runtime/usage confirmation before any performance work.
- `tournament_run_standings`, previously uncertain, is confirmed as a normal view.
- Four live tables are not directly referenced through a literal `.from()` call: `tournament_run_bracket_slots`, `store_supplier_batches`, `store_supplier_batch_orders`, and `store_order_economics`. Some are reached through nested PostgREST relationships or may represent inactive/externally managed paths.

## Query/index support conclusions

### Plausibly supported by existing indexes

- Registration list/reorder predicates on `(tournament_id, is_reserve, position)`.
- Run child reads on participants/turns/pairs/groups by `run_id`, and matches by `turn_id`.
- Fixed-pair reads by `run_id`; group-pair reads by `group_id`.
- Circuit lookup by slug/status; group lookup by circuit; result lookup by ranking group.
- Circuit result replacement/deduplication beginning with ranking group and source tournament.
- Store product/category ordering, product colors/sizes, exact product/color/size stock lookup, order items by order, and orders by user/status/created time.
- Communication state by user/communication and communication active/target/tournament filtering.
- Membership code lookup and redemption QR-token lookup.

“Supported” means a relevant index exists, not that PostgreSQL will or should use it on tiny tables.

### Predicates without a close matching index

- `loyalty_transactions WHERE membership_id = ... [ORDER BY created_at DESC]` — only the primary key exists.
- `loyalty_memberships WHERE user_id = ...` — no user index/unique constraint.
- `medical_certificates WHERE user_id = ... ORDER BY uploaded_at DESC LIMIT 1` — only the primary key exists.
- `reward_redemptions WHERE membership_id = ... ORDER BY requested_at DESC` — membership/date index absent.
- pending memberships by `status, created_at` — no matching index.
- tournament live run lookup by `tournament_id`, status and newest `created_at` — only tournament ID is indexed.
- future tournaments queried by `date, time` — live index is on `start_at`, which this query does not use.
- wildcard phone search across registration player phone fields — ordinary registration indexes do not support a leading-wildcard `ILIKE` pattern.
- public circuit results ordered by tournament date/creation after ranking-group filtering — ranking group is indexed, ordering columns are not part of it.

At current cardinalities, these gaps are **not sufficient to explain broad MOVIPadel slowness**. The strongest future-growth candidate is the loyalty ledger because it is already the largest application table, is append-style, and is scanned repeatedly.

## Current problem versus future scalability

### Current performance problem

The metadata supports the conclusion that raw relation size is not a major current bottleneck. Even full scans involve hundreds, not millions, of rows. Current latency is more plausibly dominated by browser polling, multiple HTTP hops, sequential Supabase/PostgREST round trips, repeated small reads, server transforms, uncached assets, and external services.

### Future scalability risk

The following are natural growth tables and will change the performance profile first:

- `loyalty_transactions` — lifetime ledger and repeated balance scans;
- `circuit_results` — players × stages × circuits;
- `tournament_registrations` — long-term registrations and phone search;
- run matches/turns/participants — every tournament execution;
- `reward_redemptions` and store orders/items — transactional history;
- certificates — version/history per user;
- communication user state — users × communications.

Indexes, aggregation strategy, retention, pagination, and transactional boundaries should be planned before these tables become large, but complex materialization is not justified by current size alone.

