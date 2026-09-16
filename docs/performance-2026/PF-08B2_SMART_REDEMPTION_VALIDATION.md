# PF-08B2R2 — Smart redemption validation

## Safety boundary

All executable work targeted local Supabase only. Before SQL execution:

- `npx supabase status` reported `linked_project: null`;
- its database URL was `127.0.0.1:54322/postgres`;
- a direct connection through the required local URL reported database/user `postgres`, PostgreSQL 17.6, and the expected Docker-internal server endpoint;
- no Supabase link, pull, push, remote migration, deployment, production credential, or production endpoint was used.

Application source, routes, PF-07 notification code, configuration, environment files, baseline migration, PF-08B0, PF-08B1, and seed were not modified.

## Reproducible artifacts

- Migration: `supabase/migrations/20260916190000_pf08_smart_redemption.sql`
- Functional/transactional suite: `supabase/tests/pf08b2_smart_redemption.sql`
- Independent-session concurrency harness: `supabase/tests/pf08b2_smart_concurrency.ps1`

The old untracked transactional-redemption migration, tests, and documentation were replaced rather than layered with a correction migration.

## Migration/reset result

Local `npx supabase db reset` successfully applied, in order:

1. production public baseline;
2. PF-08B0 idempotency;
3. PF-08B1 transactional Store checkout;
4. PF-08B2R2 smart redemption;
5. deterministic synthetic seed.

No seed change was required.

## Functional and transactional coverage

`pf08b2_smart_redemption.sql` ran under an outer transaction and rolled back all test changes. Passed assertions include:

| Area | Verified behavior |
|---|---|
| Service | Immediate `ready`, `ready_at`, QR deliverable, debit, no Store order/item, no Store-stock mutation |
| Store product | Explicit classification, null-size exact variant, reward and Store reservations/decrements, one linked order/item, requested/non-deliverable initial state |
| Custom physical | Explicit type creates custom order/item without category keyword or Store-stock mutation |
| Partner | Store-like category text is ignored; reward debit/stock only, no Store order or Store-stock mutation |
| Notification result | Every new type returns `should_notify_staff=true` and operational context |
| Replay | Same redemption and QR; `should_notify_staff=false`, null notification, no duplicate mutation |
| Insufficient points | Stable error and zero durable claim/business mutation |
| Conflict | Same user/key with different intent returns `PF08_IDEMPOTENCY_CONFLICT` |
| Key scope | Same key is independent across users |
| Unclassified reward | `PF08_FULFILLMENT_UNCLASSIFIED`, zero durable claim/mutation |
| Forced failure | Store-item trigger failure rolls back claim, redemption, debit, both inventory layers, order, and item |
| Order uniqueness | Second reward order for one redemption is rejected; orderless history stays valid |
| ACL | Only postgres/service role can execute; actual anon invocation is denied |

The transactional suite finished with the seed baseline still visible: 2 redemptions, 4 ledger rows, 1 order, 1 item, and zero idempotency rows.

## Historical compatibility coverage

Passed checks prove:

- the seeded requested Store-less redemption remains valid with a null fulfillment snapshot and no order;
- the delivered Store-linked redemption and its existing order remain valid;
- legacy `approved` status remains insertable/readable under the compatibility constraint;
- no migration backfill assigns fulfillment types, variants, reservation evidence, or orders to historical rows;
- the unique order index does not require an order for a redemption.

## Concurrency coverage

The PowerShell harness independently re-verifies unlinked/local status and database identity before opening concurrent sessions.

Passed races:

1. **Same idempotency key:** a membership-row blocker forces overlap. Exactly one call creates the redemption and returns `should_notify_staff=true`; the waiter replays the same result with `should_notify_staff=false`. One debit and no duplicate order exist.
2. **Last finite reward unit:** two users and distinct keys compete for quantity one. Exactly one commits; the loser receives `PF08_REWARD_OUT_OF_STOCK`. Stock ends at zero, with one redemption, debit, and durable claim.
3. **Last exact Store-stock unit:** two explicitly Store-product rewards compete for the same null-size stock row. Exactly one commits; the loser receives `PF08_INSUFFICIENT_STORE_STOCK`. The winner has one redemption, debit, order, item, and durable claim; Store stock ends at zero.

No negative inventory or partial loser mutation was observed.

## Rollback behavior

The forced mid-transaction Store-item failure demonstrated PostgreSQL statement atomicity across:

- PF-08B0 claim;
- redemption and QR;
- ledger debit;
- reward-stock decrement;
- Store-stock decrement;
- Store order/item.

All returned to their pre-call values. Because no committed result exists, no post-commit Telegram payload can be acted upon.

## Final reset and cleanliness

After all tests, the project was rechecked as unlinked with the exact local database URL and reset again. The final deterministic baseline is:

| Object | Final count |
|---|---:|
| `reward_redemptions` | 2 |
| `loyalty_transactions` | 4 |
| `store_orders` | 1 |
| `store_order_items` | 1 |
| `business_operation_idempotency` | 0 |
| Seed rewards with non-null `fulfillment_type` | 0 |

The last value is intentional: the seed was not modified, and explicit reward classification is a route/deployment prerequisite rather than a migration inference.

## Regression risk

| Risk | Level | Control/gate |
|---|---|---|
| Active rewards are null-classified after migration | High before route cutover | Complete reviewed classification before integrating the RPC |
| Existing QR route does not yet enforce `ready` | High before route cutover | Do not integrate request RPC until QR enforcement is implemented |
| Generic Store endpoints can still mutate reward orders independently | Medium | Restrict/action-route them in the later unified workflow phase |
| Cancellation/refund/release commands do not yet exist | High for enabling new workflow | Keep route integration deferred until lifecycle phase is approved |
| Partial unique index meets unexpected historical duplicate | Deployment gate | Run the existing read-only duplicate-order verification before deployment |
| Telegram transport is not implemented here | Expected/deferred | PF-07 route integration must honor `should_notify_staff` after commit only |
| Reservation markers are future-facing and unreleased | Expected/deferred | No cancellation path may be enabled until the atomic release command exists |

## Validation conclusion

PF-08B2R2 is reproducible and passes the required local functional, rollback, security, replay, historical-compatibility, and concurrency checks. It is ready as a database implementation artifact for review, but not for route integration or production deployment until classification, QR gating, lifecycle/reversal commands, and PF-07 post-commit wiring are completed.

