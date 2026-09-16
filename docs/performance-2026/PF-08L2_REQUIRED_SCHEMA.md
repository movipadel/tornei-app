# PF-08L2 — Required schema specification

## Scope and evidence labels

This is a design specification, not DDL. It covers the minimum current schema needed by Store checkout and MoviBack redemption. Column types/nullability/defaults, indexes, FK endpoints, RLS flags and listed policies come from the committed live metadata export. Exact named CHECK expressions and FK actions are not present in that export and are marked **VERIFY**.

All 13 tables below have UUID primary keys using `gen_random_uuid()`. The RLS export records RLS enabled and not forced for 12 of them; `store_lines` is absent from that export and therefore remains **VERIFY**, not inferred.

## Dependency graph

```text
users
  ├─ loyalty_memberships
  │    ├─ loyalty_transactions
  │    └─ reward_redemptions ── rewards_catalog ── store_products
  └─ store_orders ── reward_redemptions (nullable fulfillment link)

store_categories ── store_products ── store_product_colors
store_lines ────────┘       ├─────── store_product_sizes
                            └─────── store_product_stock

store_orders ── store_order_items ── product/color/size snapshots + nullable FKs
```

`loyalty_transactions.related_redemption_id` is a nullable application-level relationship but has no FK in the exported constraint metadata.

## Identity, membership and ledger

### `users`

- PK: `id uuid DEFAULT gen_random_uuid()`.
- PF-08 columns: `full_name text NOT NULL`, `phone text NOT NULL`, `email text NULL`.
- Other production columns to preserve: `gender text NOT NULL`; `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`; consent/marketing/age fields with exported nullability/defaults.
- Unique/index: `UNIQUE(phone)` plus a separate `users_phone_idx`; PK.
- CHECK: named `users_gender_check`; exact values **VERIFY**.
- FK dependencies: none exported; no relation to `auth.users` exported.
- RLS/policies: RLS on, not forced; no `users` policy in the policy export.

### `loyalty_memberships`

- PK: UUID with generated default.
- PF-08 columns: `user_id uuid NOT NULL`, `status text NOT NULL DEFAULT 'pending_review'`, `membership_code text NOT NULL`, `tax_code text NOT NULL`.
- Relevant lifecycle columns/defaults: approval/suspension/rejection timestamps/reasons; `membership_type`; `fee_points integer NOT NULL DEFAULT 0`; `fee_paid boolean NOT NULL DEFAULT false`; `has_existing_membership boolean NOT NULL DEFAULT false`; existing-membership and health-consent fields; timestamps.
- FK: `user_id → users.id`; actions/deferrability **VERIFY**.
- Unique/index: `UNIQUE(membership_code)` and PK. No exported index or uniqueness on `user_id`.
- CHECK: `loyalty_status_check`, `membership_type_check`, `existing_membership_type_check`; exact expressions **VERIFY**.
- Nullable/business semantics: current routes call `maybeSingle()` by `user_id`; production data was checked clean, but strict all-state membership uniqueness is not yet justified.
- RLS/policy: owner SELECT where `auth.uid() = user_id`; no exported write policy.

### `loyalty_transactions`

- PK: UUID with generated default.
- Required columns: `membership_id uuid NOT NULL`, `type text NOT NULL`, `source text NOT NULL`, `points_delta integer NOT NULL`, `euro_amount numeric NULL`, `notes text NULL`, `related_redemption_id uuid NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.
- Other production columns: `created_by uuid NULL`, `related_partner_id uuid NULL`, `club text NULL`.
- FK: `membership_id → loyalty_memberships.id`; actions/deferrability **VERIFY**. No exported FK for `related_redemption_id`.
- Unique/index: PK only in the export. No membership lookup index and no unique debit-per-redemption protection.
- CHECK: `loyalty_type_check` and `loyalty_source_check`; exact definitions **VERIFY**. PF-08A verified transaction types `earn`, `redeem`, `adjustment`, `refund`, `cancel`; the exact allowed source list still requires authoritative DDL.
- Nullable/business semantics: redemption links are nullable; balance is the sum of all `points_delta`; current redemption debits use `type='redeem'`, `source='reward_redemption'`.
- RLS/policy: owner SELECT through membership ownership; no exported write policy.

## Rewards and redemptions

### `rewards_catalog`

- PK: UUID with generated default.
- Required columns: `name text NOT NULL`, `description text NULL`, `category text NULL`, `points_cost integer NOT NULL`, `is_active boolean NOT NULL DEFAULT true`, `stock_qty integer NULL`, `reward_type text NOT NULL DEFAULT 'club'`, `store_product_id uuid NULL`, `requires_store_variant boolean NOT NULL DEFAULT false`.
- Other columns: `image_path text NULL`; created/updated `timestamptz NULL DEFAULT now()`.
- FK: `store_product_id → store_products.id`; actions/deferrability **VERIFY**.
- Indexes: PK and `rewards_catalog_store_product_idx`.
- CHECK: `reward_type_check`; exact values **VERIFY**. No exported non-negative stock CHECK.
- Nullable/business semantics: `stock_qty IS NULL` means unlimited; nullable `store_product_id` separates non-Store rewards; category text also affects current fulfillment behavior.
- RLS/policy: public SELECT (`qual=true`); no exported write policy.

### `reward_redemptions`

- PK: UUID with generated default.
- Required columns: `membership_id uuid NOT NULL`, `reward_id uuid NOT NULL`, `points_cost integer NOT NULL`, `status text NOT NULL DEFAULT 'requested'`, `qr_token text NULL`.
- Lifecycle columns: `requested_at timestamptz NULL DEFAULT now()`; approved/delivered/cancelled timestamps; `handled_by uuid NULL`; `notes text NULL`.
- FKs: membership and reward IDs to their parent tables; actions/deferrability **VERIFY**.
- Unique/indexes: PK; status index; partial unique index on `qr_token WHERE qr_token IS NOT NULL`.
- CHECK: `redemption_status_check`; exact values **VERIFY**.
- RLS/policy: owner SELECT through membership ownership; no exported write policy.

## Store reference and catalog tables

### `store_categories`

- PK: UUID with generated default.
- Columns: `name text NOT NULL`, `slug text NOT NULL`, `is_active boolean NOT NULL DEFAULT true`, `sort_order integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NULL`.
- Unique/indexes: unique `name`, unique `slug`, PK.
- Required because every Store product has a non-null `category_id` FK.
- RLS/policies: RLS on, not forced; no exported policy.

### `store_lines`

- PK: UUID with generated default.
- Columns/defaults: same exported shape as categories (`name`, `slug`, active/sort/timestamps).
- Unique/indexes: unique `name`, unique `slug`, PK.
- Dependency status: `store_products.line_id` is nullable, but this table is required for faithful schema/FK parity.
- RLS: the table was not listed among the 44 rows in the RLS export. Its exact RLS state must be confirmed from authoritative DDL rather than inferred.

### `store_products`

- PK: UUID with generated default.
- Required columns: `category_id uuid NOT NULL`, `line_id uuid NULL`, `name text NOT NULL`, `description text NULL`, `base_price_euro numeric NOT NULL DEFAULT 0`, `base_price_points integer NULL`, `allow_euro boolean NOT NULL DEFAULT true`, `allow_points boolean NOT NULL DEFAULT false`, `allow_mixed boolean NOT NULL DEFAULT false`, `is_active boolean NOT NULL DEFAULT true`.
- Other columns: `sort_order integer NOT NULL DEFAULT 0`; created/updated timestamps.
- FKs: category and nullable line; actions/deferrability **VERIFY**.
- Indexes: active, category, `(category_id, sort_order, created_at)`, line, PK.
- Nullable/business semantics: current checkout derives point price from euro price when `base_price_points` is null; the future RPC must preserve or explicitly change that rule.
- RLS/policies: RLS on, not forced; no exported policy.

### `store_product_colors`

- PK: UUID with generated default.
- Columns: `product_id uuid NOT NULL`, `color_name text NOT NULL`, `color_hex text NULL`, `image_path text NULL`, `is_active boolean NOT NULL DEFAULT true`, `sort_order integer NOT NULL DEFAULT 0`, timestamps.
- FK: product; actions/deferrability **VERIFY**.
- Indexes: product index and PK. No exported `(product_id, color_name)` uniqueness.
- RLS/policies: RLS on, not forced; no exported policy.

### `store_product_sizes`

- PK: UUID with generated default.
- Columns: `product_id uuid NOT NULL`, `size_label text NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`.
- FK: product; actions/deferrability **VERIFY**.
- Unique/indexes: `UNIQUE(product_id, size_label)`, product index, PK.
- RLS/policies: RLS on, not forced; no exported policy.

### `store_product_stock`

- PK: UUID with generated default.
- Columns: `product_id uuid NOT NULL`, `color_id uuid NOT NULL`, `size_id uuid NULL`, `stock_qty integer NULL`, `sku text NULL`, `is_active boolean NOT NULL DEFAULT true`, timestamps.
- FKs: product, color, nullable size; actions/deferrability **VERIFY**. Single-column FKs do not enforce same-product ownership.
- Unique/indexes: ordinary `UNIQUE(product_id, color_id, size_id)`, product index, PK.
- Critical nullable semantics: ordinary PostgreSQL uniqueness permits multiple otherwise-identical rows where `size_id IS NULL`; current handlers call `maybeSingle()` and assume one. PF-08A found no current duplicates, but the future null-safe constraint belongs in a later PF-08 migration.
- Stock semantics: `stock_qty IS NULL` means unlimited/untracked. No exported non-negative CHECK exists; PF-08A verified current finite values are non-negative.
- RLS/policies: RLS on, not forced; no exported policy.

## Store order tables

### `store_orders`

- PK: UUID with generated default.
- Required checkout columns: nullable `user_id`, status/pickup/payment, numeric euro and integer point totals, customer snapshots, notes and timestamps.
- Required redemption fulfillment columns: `order_type text NOT NULL DEFAULT 'catalog'`, `related_redemption_id uuid NULL`, `special_title text NULL`, `special_notes text NULL`.
- Other production fields to preserve: admin notes and order lifecycle timestamps; paid/supplier-paid fields and supplier-payment metadata.
- FKs: `user_id → users.id`, `related_redemption_id → reward_redemptions.id`; actions/deferrability **VERIFY**.
- CHECKs: status, payment mode, pickup club, order type, supplier-paid-by type; exact expressions **VERIFY**.
- Indexes: created-at descending, order type, related redemption, status, supplier paid tuple, user, PK.
- Uniqueness: `related_redemption_id` is indexed but not unique; one fulfillment order per redemption is not currently enforced.
- RLS/policies: RLS on, not forced; no exported policy.

### `store_order_items`

- PK: UUID with generated default.
- Required columns: `order_id uuid NOT NULL`; nullable product/color/size FKs; non-null product-name snapshot; nullable color/size snapshots; `quantity integer NOT NULL DEFAULT 1`; euro/point unit and total fields with zero defaults.
- Redemption/special-order columns: `custom_product_name`, `custom_variant`, `supplier_notes`, all nullable.
- FKs: order plus nullable product/color/size; actions/deferrability **VERIFY**. Single-column FKs do not enforce that variants belong to the item product.
- CHECK: `store_order_items_quantity_check`; exact expression **VERIFY**.
- Indexes: order index and PK.
- RLS/policies: RLS on, not forced; no exported policy.

## Existing RLS and server-call contract

The only exported policies on PF-08 tables are:

- owner SELECT on `loyalty_memberships` using `auth.uid() = user_id`;
- owner SELECT on `loyalty_transactions` via its membership;
- owner SELECT on `reward_redemptions` via its membership;
- public SELECT on `rewards_catalog`.

Current checkout/redemption routes use `supabaseAdmin()` with the service-role key and custom-cookie identity, so their database calls bypass RLS. A production-faithful baseline must preserve RLS and policies even though direct PF-08 mutation tests use the service role. Future RPC execute grants must be explicit and deny `PUBLIC`, `anon` and `authenticated` unless an independently reviewed design changes that boundary.

## Objects intentionally not part of the baseline

The following are future PF-08 objects, not current-schema evidence:

- idempotency registry;
- checkout RPC;
- redemption RPC;
- null-safe stock uniqueness;
- non-negative stock CHECKs;
- any membership, redemption-debit or fulfillment uniqueness/FK strengthening.

They must be added in later migrations only after the baseline matches production and their business semantics are approved.
