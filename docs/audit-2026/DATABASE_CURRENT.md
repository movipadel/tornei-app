# MOVIPadel database and Supabase architecture (current)

## Evidence boundary

The repository contains no SQL migrations, schema dump, Supabase CLI configuration, seed data, generated database types, policy definitions, triggers, or database-function source. The following model is reconstructed from every `.from(...)`, `.select(...)`, insert/update payload, relationship selection, and `.rpc(...)` call found in the application.

Forty-two table/view names and two RPC names are referenced. Whether `tournament_run_standings` is a table or view cannot be established from this repository. Exact data types, defaults, indexes, constraints, foreign-key actions, RLS policies, grants, and triggers remain authoritative only in the live Supabase project.

## Supabase client model

- `supabaseAdmin()` uses `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`; it is used throughout API handlers and bypasses RLS.
- `supabaseServer` is another service-role client but has no detected consumer.
- `supabase` in `supabaseClient.ts` uses the public URL/anon key but has no detected consumer.
- Browser components call Next.js APIs rather than querying Supabase directly.

## Domain model

### Identity, staff, and settings

| Relation | Observed purpose and columns |
|---|---|
| `users` | End-user identity/profile. Observed: `id`, `full_name`, `phone`, `email`, `gender`, privacy/terms/age/marketing acceptance timestamps/flags, `updated_at`. Login upserts on `phone`. |
| `staff_users` | Staff/admin credentials and roles. Observed: `id`, `full_name`, `email`, `password_hash`, `role`, `is_active`, `last_login_at`, `created_at`. Password verification/set is delegated to RPCs. |
| `app_settings` | Public application settings returned by `/api/app-settings`; exact complete shape is not known because the handler selects all columns. |
| `admin_push_subscriptions` | Web Push endpoints. Observed: `id`, `endpoint`, `p256dh`, `auth`, `is_active`, `updated_at`. |

### Tournaments and registration

| Relation | Observed purpose and columns |
|---|---|
| `tournaments` | Tournament master. Observed: `id`, `name`, `type`, `category`, `level`, `location`, `date`, `time`, `max_participants`, `registrations_open`, `notes`, `image_url`, `show_participants`, `circuit_id`, `created_at`, `updated_at`. Types are currently `Baraonda` or `Coppie fisse`; categories include `Maschile`, `Femminile`, `Misto`, `Libero`. |
| `tournament_registrations` | Current registration source. Observed: `id`, `tournament_id`, `user_id`, `is_reserve`, `position`, player 1/2 name, phone, and gender, plus timestamps. One row is one player for Baraonda or one pair for fixed pairs. |
| `registrations` | Legacy registration source used only by the legacy run-lock endpoint. Observed: `tournament_id`, `user_id`, `name`, `phone`, `sex`, `status`. Relationship to the current table is not defined in the repository. |

Registration capacity and reserve position are calculated in route code. Mixed Baraonda capacity is split by gender. Circuit events create normalized phone-derived player keys and prevent duplicate phone keys within a tournament in application code.

### Tournament run snapshots and scores

| Relation | Observed purpose and columns |
|---|---|
| `tournament_runs` | Execution snapshot. Observed: `id`, `tournament_id`, `mode`, `category`, `status`, JSON-like `rules`, `locked_at`, `started_at`, `created_at`. Statuses used include `locked`, `running`, `completed`; modes include `baraonda`, `fixed_pairs`. |
| `tournament_run_participants` | Baraonda participant snapshot: `id`, `run_id`, optional `user_id`, `name`, `phone`, `sex`. |
| `tournament_run_turns` | Baraonda turns: `id`, `run_id`, `turn_number`; upsert expects uniqueness on `(run_id, turn_number)`. |
| `tournament_run_matches` | Baraonda matches: `id`, `turn_id`, `match_number`, `p1_id`…`p4_id`, `team1_games`, `team2_games`, `completed_at`; upsert expects uniqueness on `(turn_id, match_number)`. |
| `tournament_run_standings` | Read by the public registration-live endpoint; observed as a standings projection associated with a run. Its implementation and columns are not available. |
| `tournament_run_pairs` | Fixed-pair snapshot: `id`, `run_id`, `registration_id`, `name`, `created_at`. |
| `tournament_run_groups` | Fixed-pair groups: `id`, `run_id`, `name`, `position`. |
| `tournament_run_group_pairs` | Group membership join: `group_id`, `pair_id`. |
| `tournament_run_matches_fp` | Fixed-pair group/bracket match. Observed: `id`, `run_id`, `stage`, `group_id`, `round_label`, home/away pair IDs, court/start time, aggregate games/sets, three per-set home/away scores, completion timestamp, and bracket progression references/metadata selected through `*`. |

Runs deliberately snapshot names/phones/pairs so tournament execution does not depend entirely on later registration edits. Reset/reopen/delete paths explicitly delete child records in application order, suggesting foreign-key cascade behavior either is absent or intentionally not relied upon.

### Circuits, ranking groups, stages, and rankings

| Relation | Observed purpose and columns |
|---|---|
| `circuits` | Circuit configuration: `id`, `name`, `slug`, `tournament_type`, `status`, up to three hero logo URLs, subtitle, theme key, rules URL, timestamps. Statuses: `draft`, `active`, `closed`. |
| `circuit_ranking_groups` | Ranking partitions: `id`, `circuit_id`, `category`, `level`. Tournament association requires a compatible group. |
| `circuit_points_rules` | Circuit scoring rules: `id`, `circuit_id`, admission-size range, `rule_type`, placement or stage, and `points`. Rule types: `placement` or `stage`; stages: winner/finalist/semifinalist/quarterfinalist/others. |
| `circuit_results` | Materialized per-player result rows: circuit/group/source tournament identity and tournament snapshot fields, normalized `player_key`, display name/phone, placement, points, timestamps. |

Circuit rankings are not stored as an aggregate in repository-visible code. Public/admin APIs group `circuit_results` by player name/key, sum points, count events, sort totals, and group result rows into played stages. On tournament close, existing results for the source tournament are deleted and rebuilt. `merge-player-keys` rewrites result identity to combine duplicates.

### MoviBack membership and loyalty ledger

| Relation | Observed purpose and columns |
|---|---|
| `loyalty_memberships` | One membership per user is assumed. Observed: `id`, `user_id`, status, membership code/type, tax code, fee points/paid flag, existing-membership metadata, approval/suspension/rejection fields, timestamps. Statuses include `pending_review`, `approved`, `rejected`, `suspended`, and leave/reactivation-related state. |
| `medical_certificates` | User certificate metadata: `id`, `user_id`, `file_path`, `status`, upload/review/expiry timestamps, `notes`. Files live in private storage and admin gets short-lived signed URLs. |
| `loyalty_transactions` | Append-style points ledger: `id`, `membership_id`, `type`, `source`, `euro_amount`, signed `points_delta`, `created_by`, `club`, `related_redemption_id`, `notes`, `created_at`. Balance is repeatedly computed as `SUM` in application memory. |
| `loyalty_user_promos` | Time-bounded per-member multiplier: `id`, `membership_id`, multiplier, start/end, active flag, notes, timestamps. |
| `loyalty_global_promos` | Global multiplier rules selected by date plus schedule and target logic. Observed concepts: title, multiplier, active/start/end, schedule type, weekdays/time window, target type, age range, gender, new-member days. |

Membership codes are generated by application cryptography. FITP earning multiplier is 1.2 versus 1.0 for ASC. Individual promo wins over global promo. Global targeting can derive birthday, gender, and age from tax code; allowed clubs are fixed in source.

### Rewards and redemption

| Relation | Observed purpose and columns |
|---|---|
| `rewards_catalog` | Reward master: `id`, `name`, description, category, points cost, image path, active flag, stock quantity, reward type, optional `store_product_id`, `requires_store_variant`, timestamps. |
| `reward_categories` | Reward filter/category metadata: `id`, `name`, `sort_order`, `is_active`. |
| `reward_point_ranges` | Reward point filters: `id`, label, min/max points, sort order, active flag, creation time. |
| `reward_redemptions` | Redemption and QR lifecycle: `id`, `membership_id`, `reward_id`, points cost, status, random `qr_token`, requested/approved/delivered/cancelled timestamps, `handled_by`, `notes`. |

Redemption creates a requested row and a negative ledger transaction. Physical/store-like rewards can also create a store order/item. Staff/admin validation atomically narrows its update with `status=requested`, but the overall reward/points/stock/order workflow spans multiple statements.

### MoviBack Store

| Relation | Observed purpose and columns |
|---|---|
| `store_categories` | Category: name, slug, sort order, active flag and identifiers/timestamps selected through `*`. |
| `store_lines` | Product line: name, slug, sort order, active flag and identifiers/timestamps selected through `*`. |
| `store_products` | Product master: identifiers, category/line relationships, name/description/image, euro/point base prices, payment-mode flags (`allow_euro`, `allow_points`, `allow_mixed`), sort order, active flag, timestamps. |
| `store_product_colors` | Product color variants: `id`, `product_id`, name, hex, image path, active flag, sort order. |
| `store_product_sizes` | Product size variants: `id`, `product_id`, label, active flag, sort order. |
| `store_product_stock` | Variant inventory: `id`, `product_id`, `color_id`, nullable `size_id`, `stock_qty`, active flag, updated time. Null quantity is treated as unlimited/untracked. |
| `store_orders` | Order header: user, status, pickup club, payment mode, euro/points totals, customer snapshot, notes/admin notes, paid and supplier-payment fields, order type, redemption relation, special-order title/notes, timestamps. |
| `store_order_items` | Order line snapshot: order/product/color/size IDs, product/variant text, custom product/variant, quantity, euro/point unit and totals, supplier notes. |
| `store_product_costs` | Product/variant supplier-cost data used by economics and export summary. Exact full schema is not available. |
| `store_special_orders` | Read by the economics endpoint via `select('*')`; no writer was found in this repository. |
| `store_promos` | Store promotional rules managed by admin. Current public pricing use was not clearly established from route code. |

Checkout reloads authoritative product, variant, price, payment permissions, and stock server-side; creates order and items; optionally inserts a negative loyalty transaction; then decrements stock. Email, Telegram, and push notification failures are best effort and do not roll back the order.

### Communications

| Relation | Observed purpose and columns |
|---|---|
| `communications` | Targeted message: `id`, target, optional tournament ID, title/body, image path, CTA label/URL, active flag, start/end, creation time. Targets used by admin include all and MoviBack segments; user delivery code also understands tournament targeting. |
| `communication_user_states` | Per-user read/dismiss state: `user_id`, `communication_id`, `read_at`, `dismissed_at`; upsert expects uniqueness on `(user_id, communication_id)`. |

## Relationships inferred from nested selects and filters

- `users` 1 → 0/1 `loyalty_memberships` (assumed by `maybeSingle`).
- `users` 1 → many `tournament_registrations`, medical certificates, and store orders.
- `loyalty_memberships` 1 → many transactions, redemptions, and user promos.
- `rewards_catalog` optionally → one `store_products`; reward redemptions → reward.
- `store_products` many → one category and line; one → many colors, sizes, stock, order items, costs.
- `store_orders` 1 → many order items; optionally → reward redemption.
- `circuits` 1 → many ranking groups, rules, tournaments, and result rows.
- `tournaments` 1 → many registrations, runs, and circuit result rows.
- `tournament_runs` 1 → Baraonda participant/turn snapshots or fixed-pair/group/match snapshots.
- `communications` 1 → many user-state rows.

These relationships must be confirmed against real foreign keys.

## Database functions/RPCs

| RPC | Application use | Definition available? |
|---|---|---|
| `verify_staff_login(p_email, p_password)` | Authenticates staff/admin and returns identity/role | No |
| `set_staff_password(p_staff_id, p_password)` | Sets initial password for an admin-created staff user | No |

Password hashing algorithm, search path, function security mode, grants, and audit behavior cannot be verified.

## Storage buckets

| Bucket | Use | Visibility inferred |
|---|---|---|
| `medical-certificates` | User PDF/JPG/PNG/WEBP upload; replacement; admin signed URL | Private is implied by signed URLs but not verifiable |
| `communication-images` | Admin upload, then public URL | Public URL expected |
| `reward-images` | Admin upload, then public URL | Public URL expected |
| `store-images` | Admin upload, then public URL | Public URL expected |
| `tournaments` (default) or request-selected bucket | Generic admin upload and public URL | Dynamic bucket selection; policy unknown |

## RLS, grants, policies, triggers, and constraints

No definitions are present. The README claim that RLS is enabled and anon/authenticated access revoked is documentation only and should not be treated as verified audit evidence. Because service-role calls bypass RLS, even correct RLS would protect direct anon access but would not mitigate an authorization error in a Next.js handler.

Likely constraints implied by code—but not proven—include uniqueness of user phone, membership per user, membership code, circuit slug, run/turn number, turn/match number, communication user-state pair, and variant stock coordinates. Phase 2 should export and inspect the live schema, indexes, policies, grants, storage policies, functions, and triggers.

## Data consistency/security-sensitive observations

- Capacity/position assignment, balance checks, reward stock, store stock, and result materialization can race under concurrent requests unless live database constraints/functions provide protection.
- Store and reward workflows use compensating deletes, but some child/ledger/stock changes may remain after an intermediate failure.
- Deleting and reinserting circuit results is idempotent in intent but not wrapped in a visible transaction.
- Balances and rankings are computed by reading all ledger/result rows into application memory.
- Personal and sensitive data include phone/email, gender, tax code, medical certificate paths/files, membership state, transactions, and purchase history.
- Dynamic generic upload bucket selection is admin-protected but should be checked against an explicit allowlist and storage policies in Phase 2.
