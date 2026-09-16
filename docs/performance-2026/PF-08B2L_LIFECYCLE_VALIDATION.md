# PF-08B2L — Lifecycle validation

## Safety verification

All database execution targeted the unlinked local Supabase project only:

- CLI status: `linked_project: null`;
- external database boundary: `127.0.0.1:54322/postgres`;
- direct identity: PostgreSQL 17.6, database/user `postgres`, expected local container endpoint;
- no production credentials, endpoints, links, pulls, pushes, remote migrations, or deployments were used.

No application source, route, UI, PF-07/Telegram code, environment/configuration, seed, baseline, PF-08B0, PF-08B1, or PF-08B2 smart-redemption migration was modified.

## Test artifacts

- Transactional/functional suite: `supabase/tests/pf08b2l_lifecycle.sql`
- Independent-session concurrency suite: `supabase/tests/pf08b2l_concurrency.ps1`

## Functional results

The SQL suite runs inside one outer transaction with savepoints and returns to the seed baseline. Passed cases:

| Area | Passed behavior |
|---|---|
| Processing | Requested→processing, timestamp/actor, replay, no points/stock change |
| Processing guards | Ready service and invalid backward/terminal transitions rejected |
| Ready | Processing→ready, linked order synchronization, stable timestamp, no second debit/decrement |
| Service ready | Already-ready command resolves with `applied=false` and unchanged timestamp |
| Delivery | Ready→delivered, linked order delivery, QR disabled, no economic mutation, replay safe |
| Delivery guards | Requested/processing physical delivery rejected |
| Cancel requested | Full refund, both finite reservations restored, pending order cancelled, markers/reason written |
| Cancel processing | Partner processing cancellation refunds/releases exactly once |
| Cancel ready | Immediately-ready service cancellation safely refunds/releases |
| Reject | Requested custom fulfillment rejected with one refund/release and order cancellation |
| Supplier boundary | Ready physical cancel/reject returns `PF08_SUPPLIER_COMMITMENT_REQUIRES_ADMIN` with zero reversal |
| Idempotency conflict | Same cancellation key with a different normalized reason returns `PF08_IDEMPOTENCY_CONFLICT` |
| Historical | Orderless requested legacy can process; reversal requires admin; delivered history remains terminal |
| ACL | All five RPCs denied to public/anon/authenticated and executable by service role |

Every lifecycle result and replay returned `should_notify_staff=false`; SQL sent no notification.

## Refund and release assertions

Tests prove:

- original debit remains present;
- exactly one positive refund equals the redemption point cost;
- the refund uses `refund` / `reward_redemption` and the same redemption ID;
- finite reward stock returns to the pre-request quantity;
- finite exact Store stock returns to the pre-request quantity;
- unlimited/unreserved inventory is not changed;
- refund/release timestamps are written with the terminal transition;
- repeated calls do not refund or restore again;
- physical order/item history remains and order status becomes cancelled only at the safe boundary.

## Concurrency results

The PowerShell harness revalidates unlinked/local status and direct database identity before launching independent `psql` sessions.

Passed races:

1. **Two concurrent same-key cancellations:** one creator and one replay; one refund and one release.
2. **Cancel versus deliver:** row locking permits exactly one terminal winner; cancelled has one refund, delivered has none.
3. **Ready versus cancel:** one coherent redemption/order pair—both ready with no refund, or both cancelled with one refund.
4. **Repeated same-key delivery/QR semantic:** one delivery and one replay; delivered timestamp/effects occur once.
5. **Different keys racing the same cancellation:** one result reports `applied=true`, the other `applied=false`; two valid action claims but only one refund/release.

No race produced duplicate refund, duplicate inventory restoration, split order/redemption state, or a second delivery effect.

## Forced rollback results

### Cancellation failure

A temporary trigger failed reward-stock restoration after the refund insert. The entire statement rolled back:

- no refund remained;
- stock remained at its post-request reserved quantity;
- redemption stayed ready;
- no cancellation idempotency result remained.

### Delivery synchronization failure

A temporary trigger failed the linked Store-order delivery update. The entire statement rolled back:

- redemption remained ready;
- order remained ready;
- no delivery idempotency result remained.

## Historical compatibility results

- Seeded requested/no-order redemption remains structurally valid.
- It can be taken in charge without inventing fulfillment.
- Automatic reversal is blocked with `PF08_LEGACY_REVERSAL_REQUIRES_ADMIN` because reservation evidence is absent.
- Seeded delivered Store redemption remains delivered and resolves repeat delivery without mutation.
- Legacy `approved` remains accepted by the schema but outside lifecycle transitions.

## Reproducibility

Local reset applies, in order:

1. production baseline;
2. PF-08B0 idempotency;
3. PF-08B1 Store checkout;
4. PF-08B2 smart redemption;
5. PF-08B2L lifecycle;
6. deterministic seed.

The final reset must restore 2 redemptions, 4 ledger rows, 1 Store order/item, original fixture balances/stocks/states, and zero idempotency rows. Concurrency fixtures and lifecycle mutations must be absent.

## Regression risk

| Risk | Level | Required control |
|---|---|---|
| Existing routes still mutate states directly | High before integration | Route cutover must call only lifecycle RPCs |
| QR route does not yet enforce ready through delivery RPC | High before integration | Integrate token lookup with `deliver_moviback_redemption` |
| Staff UI/generic Store controls can diverge reward orders | High before integration | Route reward-order actions through lifecycle commands |
| Supplier-committed cancel/reject has no exception workflow | Expected | Keep stable admin-required error until separate design is implemented |
| Historical rows lack reservation evidence | Expected | Do not auto-refund/restock; use controlled reconciliation |
| Actor authorization is server responsibility | High | Validate authenticated staff/admin before passing actor ID |
| No lifecycle Telegram notifications | Intentional | New-redemption PF-07 alert remains the only approved alert |

## Conclusion

PF-08B2L passes local functional, security, idempotency, concurrency, rollback, supplier-boundary, QR-state, and historical-compatibility validation. It is ready for database-artifact review, but application/QR/staff integration and supplier-exception behavior remain explicit future gates.

