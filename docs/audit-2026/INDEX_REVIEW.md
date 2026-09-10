# MOVIPadel Targeted Index Review — Phase 2B

## Review standard

This review starts from actual predicates in the Next.js route handlers and compares them with `03_indexes.csv`. It does not claim that an index must be created. With only 3,483 estimated public rows, PostgreSQL may correctly prefer sequential scans for many queries. Every candidate must be validated with production-safe plans and representative parameters before implementation.

No migration SQL is provided.

## Existing indexes that already align with important queries

| Access pattern | Existing relevant index | Assessment |
|---|---|---|
| Tournament registrations by tournament/reserve ordered by position | `tr_tournament_reserve_idx (tournament_id, is_reserve, position)` | Strong alignment; Phase 2A row-update cost is round-trip/algorithmic, not an evident lookup-index issue. |
| Tournament registrations by tournament | `tr_tournament_idx (tournament_id)` | Supports public counts and participant lists. |
| Run turns by run and order | unique `(run_id, turn_number)` plus `run_id` index | Strong alignment. |
| Baraonda matches by turn | `turn_id` and unique `(turn_id, match_number)` | Strong alignment for nested turn/match reads. |
| Fixed-pair graph by run/group | run indexes on pairs/groups/matches; group indexes on assignments | Core filters are supported. |
| Circuit groups by circuit | `circuit_ranking_groups_circuit_id_idx` and unique `(circuit_id, category, level)` | Strong alignment, including category/level order within circuit. |
| Circuit results by group | `circuit_results_ranking_group_id_idx` and unique group/tournament/player key | Supports group filtering and result replacement. N+1 remains an application architecture issue. |
| Circuit lookup by slug/status | unique slug and status indexes | Supported; table currently has two rows. |
| Product ordering by category | `(category_id, sort_order, created_at)` | Strong alignment. |
| Product variants by product | product indexes on colors and sizes | Supported. |
| Exact stock variant | unique `(product_id, color_id, size_id)` plus product index | Supports checkout lookup; does not make read-then-write atomic. |
| Orders/items | orders by created time/status/user; items by order | Supports common list/nested relation predicates. |
| Communication state | unique `(user_id, communication_id)` plus individual indexes | Strong alignment. |
| Active communications | `(is_active, starts_at, ends_at)`, target and tournament indexes | Relevant coverage exists; OR end-date predicate still needs a plan if volume grows. |
| Membership QR/code | unique membership code | Strong alignment for staff scan. |
| Reward QR | partial unique QR token | Strong alignment for token lookup. |

## Proposed index concepts for later consideration

| Table | Motivating query/access pattern | Existing relevant index | Proposed index concept | Expected benefit | Write/storage cost | Confidence | EXPLAIN before implementation |
|---|---|---|---|---|---|---|---|
| `loyalty_transactions` | Frequent `membership_id = ?`; recent list ordered `created_at DESC`; full balance sum | Primary key only | Composite membership + descending creation time; evaluate covering `points_delta` only if plans justify it | Faster member-history lookup and scalable recent-first reads; membership prefix also supports balance filter | Medium on the fastest-growing table; every earn/redeem writes it | **HIGH** structural, **MEDIUM** current benefit | **YES** |
| `loyalty_memberships` | Repeated `user_id = ?` with `.maybeSingle()` in home, checkout, rewards and communications | PK; unique `membership_code` | User-ID index; make it unique only after confirming the one-membership invariant and cleaning duplicates | Faster identity-to-membership resolution; uniqueness could enforce code assumptions | Low; membership writes are infrequent | **HIGH** pattern, **LOW–MEDIUM** current speed | **YES**, plus duplicate check |
| `medical_certificates` | Latest certificate per user: user filter, uploaded time descending, limit one; repeated in admin N+1 | Primary key only | Composite user + descending upload timestamp | Efficient latest-certificate lookup and batched per-user selection | Low–medium; certificate history is append/update | **HIGH** | **YES** |
| `reward_redemptions` | Member history ordered by request time and limited | PK; status; partial unique QR token | Composite membership + descending request time | Scalable member redemption history | Low–medium | **HIGH** pattern, **LOW** current benefit | **YES** |
| `loyalty_memberships` | Admin pending queue filters status and orders by creation time | No status/date index | Composite status + creation time | Faster review queue as membership volume grows | Low | **MEDIUM** | **YES** |
| `tournament_runs` | Live lookup filters tournament, status list, newest creation, limit one | `tournament_id` only | Composite tournament + status + descending creation time, or a design aligned to the exact active-status invariant | Avoid filtering/sorting historical runs per tournament | Low | **MEDIUM**; only 32 rows now | **YES** |
| `tournaments` | Public future list uses `date >= ? ORDER BY date,time` | `start_at`; `circuit_id` | Either align source query to `start_at` or consider date + time; do not maintain both without evidence | Avoid future sort/range scan as tournament history grows | Low now; every tournament write updates it | **MEDIUM** query mismatch, **LOW** current benefit | **YES** |
| `tournaments` | Circuit detail filters circuit and future date, orders date/time | `circuit_id` and `start_at` separately | Composite circuit + date + time, only if source continues using separate date/time fields | Scalable future-stage retrieval | Low | **MEDIUM–LOW** | **YES** |
| `circuit_results` | Public ranking group filter ordered by tournament date then creation | Ranking-group index; unique `(ranking_group_id, source_tournament_id, player_key)` | Composite ranking group + descending tournament date + creation time | Avoid per-group sort at larger history volume | Medium on event-history writes | **MEDIUM** | **YES** |
| `circuit_results` | Player-key merge filters ranking group + player key | Separate group and player-key indexes; unique group/source/player | Composite ranking group + player key only if merge/search becomes common | Faster merge candidate lookup | Medium and potentially redundant | **LOW–MEDIUM** | **YES** |
| `tournament_run_matches_fp` | Live view filters run and orders stage, starts time, creation | Separate run, stage, starts indexes | Composite run + stage + starts time + creation time | Avoid sorting full fixed-pair match history per run | Medium; score rows update frequently | **MEDIUM–LOW** at 219 rows | **YES** |
| `tournament_registrations` | Wildcard phone lookup on player 1 or player 2 | Tournament/user indexes only | Normalized phone-search columns and/or appropriate expression/trigram search indexes; exact design depends on normalization and extension availability | Scalable phone lookup and less broad filtering | Medium–high: two searchable fields and write normalization | **MEDIUM** future, **LOW** current | **YES**, required |
| `staff_users` | Login compares `lower(email)` and limits one | Unique case-sensitive email | Unique case-folded email concept if case-insensitive uniqueness is intended | Supports lookup and enforces intended uniqueness semantics | Negligible at eight rows | **LOW** performance; possible correctness value | **YES** and business-rule check |

## Why these are not current “missing-index” conclusions

- The largest application table has 489 estimated rows. Sequential scanning a few hundred in-memory rows is commonly cheaper than index traversal.
- An endpoint can be slow even when each query is fast because every PostgREST call adds network, authentication, parsing, and serialization latency.
- Existing single-column indexes may be chosen adequately at current scale; composite indexes can increase write cost and storage without measurable benefit.
- Estimated cardinalities can be stale, and no `EXPLAIN`/`pg_stat_statements` samples were supplied.
- Query plans for nested PostgREST relationships are not present.

## Indexes not currently justified

- Additional indexes for `app_settings`, circuits, categories, lines, global/user promos, communications, push subscriptions, or store orders based solely on current row counts.
- More fixed-pair/Baraonda child indexes merely because those endpoints poll. Existing run/turn/group indexes cover the principal filters; request frequency and full-state computation are the dominant concern.
- An index intended to solve circuit ranking N+1. The ranking-group filter already has an index; consolidating requests is the higher-value architectural target.
- An index intended to solve checkout latency. Exact stock/product lookups are already supported; sequential orchestration, external calls, and read-modify-write races dominate.
- An index intended to solve row-by-row registration reorder. The existing composite registration index is appropriate; set-based/transactional writes are the relevant future option.
- New order-report indexes before the report applies a selective period predicate and runtime plans establish a need.

## View-specific considerations

`tournament_run_standings` joins each participant against four player-ID columns using OR predicates. The match table has no indexes on those player columns, but only 232 rows exist. Four added indexes could impose disproportionate write cost and still produce a complex plan. If this view becomes hot at scale, first capture its plan; a normalized match-participation shape or run-scoped aggregation may be more appropriate than blindly indexing every player slot.

`tournament_run_group_standings` filters fixed-pair matches by stage/group/completion. Current separate indexes may suffice at 219 rows. A future composite must be based on actual view plans and run-scoped usage.

## Recommended validation sequence

1. Capture plans for ledger membership/recent-history/balance queries.
2. Capture the latest-certificate and member-to-membership plans.
3. Capture public live run and child graph plans.
4. Capture circuit ranking and future-tournament plans.
5. Capture phone search with realistic normalized and malformed inputs.
6. Only then compare candidate index cost/benefit with `EXPLAIN`, table write rate, and index usage statistics.

