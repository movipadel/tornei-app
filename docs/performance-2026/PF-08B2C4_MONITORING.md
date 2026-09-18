# PF-08B2C4 — Rollout monitoring

## Before execution

- Establish baselines for API 4xx/5xx rates, redemption attempts/successes, Store checkout failures, RPC latency/errors, points balances, duplicate redemptions/orders, and notification failures.
- Prepare queries/dashboards for `PF08_*` errors, reward/Store stock deltas, the **Richieste premio** queue, and Telegram/push delivery failures.
- Assign one operator with authority to stop rollout and one reviewer for database evidence.

## During classification

- Watch database locks, blocked sessions, transaction duration, lock/statement timeouts, connection saturation, and application error rates.
- Confirm only 26 target reward rows are updated.
- Do not deploy routes concurrently.

## After classification

- Compare post-flight output and fingerprints with pre-flight.
- Monitor legacy redemption failures, Asciugamano variant selection/order creation, Tubo handling, Store checkout, QR validation/delivery, and admin catalog edits.
- Check for negative/unexpected stock, duplicate orders/redemptions, missing or duplicate point debits/refunds, orphan fulfillment rows, queue anomalies, and Telegram notification failures.
- Group and alert on all `PF08_*` codes, especially classification, invalid product/variant, ambiguity, stock, points, idempotency, and transition failures.

## Immediate STOP / rollback-review signals

- Migration guard, timeout, or partial/uncertain completion.
- Any post-flight invariant or fingerprint mismatch.
- Active reward count/type differs from 13/13.
- Missing/inactive Store product or unexpected flag/link.
- Palline Nucleon gains a stock row unexpectedly or Asciugamano loses either valid identity.
- Duplicate redemption/order/debit, negative stock, points inconsistency, or orphan fulfillment.
- Material increase in redemption, Store checkout, QR, or admin errors.
- Smart RPC invoked unexpectedly before route deployment.

Telegram transport failure alone does not roll back a committed redemption, but sustained failures are an operational stop signal for subsequent rollout phases.
