# PF-08 release manifest

## Release identity

- Branch: `performance/foundation-2026`.
- Reviewed implementation/cutover head before this B2C9 documentation: `c3d7fb2` (`Finalize MoviBack cutover checklist`).
- Package status: READY FOR MANUAL PRODUCTION GO/NO-GO REVIEW; not deployed or approved.
- Feature flag: `MOVIBACK_SMART_REDEMPTION_ENABLED`.
- Production activation value: explicit `true`; safe deploy/rollback value: explicit `false`.

## Required database migrations

Apply/verify in this exact order. All files are committed under `supabase/migrations`.

| Order | PF phase | Exact filename | Introduction commit | Purpose |
|---:|---|---|---|---|
| 1 | PF-08B0 | `20260916170000_pf08_idempotency.sql` | `c31af77` | Shared durable operation idempotency registry |
| 2 | PF-08B1 | `20260916180000_pf08_transactional_store_checkout.sql` | `b4f40db` | Atomic Store checkout RPC |
| 3 | PF-08B2R2 | `20260916190000_pf08_smart_redemption.sql` | `f28465d` | Atomic classified MoviBack redemption and fulfillment |
| 4 | PF-08B2L | `20260916200000_pf08_redemption_lifecycle.sql` | `5656cb2` | Idempotent processing/ready/delivery/cancel/reject lifecycle |
| 5 | PF-08B2R3 | `20260918120000_pf08_store_variant_inventory_semantics.sql` | `cfad6f4` | Variantless, single-identity, and finite-inventory semantics |

Package completeness: **COMPLETE IN REPOSITORY**. Production application state remains unknown until the approved operator inventories `supabase_migrations.schema_migrations`. No migration may be assumed applied merely because the file exists locally.

The migrations have no packaged general down sequence. Classification rollback is separate and narrowly bounded.

## Classification and production SQL artifacts

| Role | Artifact | Packaging decision |
|---|---|---|
| Final SELECT-only preflight | `docs/performance-2026/PF-08B2C4_PREFLIGHT.sql` | Manual production SQL Editor execution |
| Exact 26-row classification | `docs/performance-2026/PF-08B2C4_REWARD_CLASSIFICATION_ROLLOUT.sql` | Reviewed manual artifact; intentionally outside automatic migrations |
| SELECT-only postflight | `docs/performance-2026/PF-08B2C4_POSTFLIGHT.sql` | Run immediately after classification |
| Classification rollback | `docs/performance-2026/PF-08B2C4_ROLLBACK.sql` | Manual emergency artifact usable only inside the pre-traffic semantic boundary |

## Relevant commit chain

### Database foundation and behavior

| Commit | Subject | Release relevance |
|---|---|---|
| `c31af77` | Add PF-08 idempotency infrastructure | B0 migration and regression evidence |
| `b4f40db` | Add transactional Store checkout RPC | B1 migration and tests |
| `f28465d` | Add smart transactional MoviBack redemption | B2R2 migration and tests |
| `5656cb2` | Add MoviBack redemption lifecycle commands | B2L migration and tests |
| `cfad6f4` | Support variantless Store redemptions | B2R3 migration and tests |

### Classification, application integration, and acceptance

| Commit | Subject | Release relevance |
|---|---|---|
| `a00b1ce` | Audit MoviBack reward fulfillment classification | Classification evidence |
| `e182e3b` | Add reward classification validation harness | Repeatable classification validation |
| `8f7cb9e` | Complete reward classification validation | Production-shaped validation evidence |
| `4a6b6bd` | Prepare reward classification rollout | Preflight/rollout/postflight/rollback and governance artifacts |
| `0cd049c` | Integrate smart MoviBack redemption flow | Feature-gated route, QR, admin validation, staff notification integration |
| `44f7347` | Add MoviBack staff reward queue | Richieste premio UI and queue contract |
| `2675be1` | Validate MoviBack local acceptance | 30 PASS / 0 FAIL technical acceptance and safe notification evidence |
| `c3d7fb2` | Finalize MoviBack cutover checklist | Deferred visual gate and controlled cutover checklist |

Design-only and local-staging commits earlier in the branch remain historical evidence, not separate production payloads. The exact deploy must be reviewed from the branch diff against the current production commit.

## Application routes and pages

### Customer pages

- `/moviback`
- `/moviback/premi`
- `/riscatto-premio/[token]`
- `/store`

### Staff/admin pages

- `/staff/rewards`
- `/admin/moviback/redemptions`
- `/admin/moviback/catalog`

The authoritative work queue is **Richieste premio**. Telegram is an alert channel only.

### Critical APIs

- `GET /api/moviback/rewards`
- `POST /api/moviback/rewards/redeem`
- `GET /api/moviback/me`
- `GET /api/moviback/redemptions`
- `GET /api/admin/moviback/redemptions`
- `POST /api/admin/moviback/redemptions/[id]/transition`
- `GET /api/reward-redemptions/[token]`
- `POST /api/reward-redemptions/[token]/validate`

## Critical release contracts

- Production defaults to legacy mode if the smart flag is absent/invalid, but deployment must set explicit `false` until controlled activation.
- Smart RPC failure never falls back to legacy writes.
- Only a newly committed, non-replayed redemption schedules the post-commit staff alert.
- Telegram failure cannot roll back a committed redemption.
- Physical QR is hidden until ready; delivered/cancelled/rejected is unusable.
- Asciugamano requires an authoritative Grigio or Lime plus UNICA identity.
- Tubo Palline requires no customer selector and no fabricated stock row.
- Classification must yield exactly 13 SERVICE and 13 STORE_PRODUCT rewards.

## Critical smoke targets

1. Flag OFF: home/login, MoviBack reads, Store, staff/admin authorization, queue reads, and QR regression.
2. Flag ON controlled visual: Asciugamano selector; Tubo no-selector; rendered queue; QR state presentation.
3. Flag ON controlled functional: one low-risk SERVICE, same-key replay, one physical reward, lifecycle, QR delivery, exact debit/order/stock, and one non-duplicate Telegram attempt.

## Explicit exclusions

This manifest contains no Padelleria identity, MOVI home redesign, brand palette, rebranding copy, or unrelated UX/feature rollout. Those require a later release.
