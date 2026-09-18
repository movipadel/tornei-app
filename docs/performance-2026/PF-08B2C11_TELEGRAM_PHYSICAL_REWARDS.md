# PF-08B2C11 — Physical reward Telegram notifications

## Status

Local implementation and acceptance are complete. No production system was contacted, no real Telegram message was sent, and no deployment, database change, or commit was performed.

## Root cause

The smart redemption route did not encode the physical-preparation rule. It delegated notification eligibility to the generic RPC field `should_notify_staff`, and the existing route contract explicitly expected a notification for a `service` redemption. Consequently, the application contract neither restricted preparation alerts to `store_product` nor directly protected the physical reward workflow.

The corrected route now derives preparation-notification eligibility from the authoritative RPC result context:

- the redemption is newly created;
- the result is not an idempotent replay;
- notification context is present; and
- `notification.fulfillment_type` is `store_product`.

The generic `should_notify_staff` hint no longer gates this physical Telegram business rule. It continues to govern the existing admin-push behavior, which remains unchanged. No `ready` status condition is involved.

## Business rule and timing

| Redemption outcome | Physical-preparation Telegram |
| --- | --- |
| New committed `service` redemption | None |
| New committed `store_product` redemption | Exactly one scheduled message |
| Same idempotency-key replay | None |
| Failed or rolled-back redemption | None |
| Later `requested → processing → ready → delivered` transition | None |

Scheduling remains in the redemption route after the transactional RPC returns successfully. It uses the existing PF-07 `after()` mechanism, so Telegram is a post-commit operational side effect and not part of the transaction.

## Message contract

The physical work request uses the heading **Nuova richiesta premio** and includes:

- customer name and phone when available;
- reward and Store product names;
- points cost;
- selected variant when present;
- the operational status **Da preparare**;
- the redemption UUID as a safe staff reference; and
- an instruction to process the authoritative **Richieste premio** queue.

Variantless products omit the variant line. The message never receives or renders `qr_token`, `manual_code`, or raw secrets.

## Idempotency and lifecycle isolation

Only `created=true` and `replayed=false` results are eligible. A replay therefore schedules zero additional notifications even if notification context is retained in a future RPC response. Lifecycle routes do not call the preparation-message scheduler, so processing, readiness, delivery, or cancellation cannot resend the original alert.

## Failure safety

PF-07 registers provider work with Next.js `after()`. Provider execution is caught and logged inside the deferred task. A Telegram transport failure therefore cannot:

- change the successful redemption response;
- roll back or repeat the points debit;
- roll back stock reservation or Store order creation; or
- mutate the redemption lifecycle.

Telegram remains an alert channel; the application queue remains authoritative.

## Local acceptance

The environment boundary was verified before database tests: Supabase reported loopback-only endpoints and no linked project. Focused contracts cover SERVICE suppression, variant and variantless STORE_PRODUCT scheduling, replay suppression, safe content, credential non-disclosure, and PF-07 failure isolation.

Local regression evidence:

- PF-08B2R3 functional SQL: PASS;
- PF-08B2R3 concurrency: PASS;
- PF-08B2L lifecycle SQL: PASS;
- PF-08B2L concurrency: PASS;
- PF-08B2C10 manual-code/service-ready/delivery SQL: PASS;
- route and notification contracts: PASS.

These checks preserve the existing points, stock, Store order, Asciugamano variant, Tubo Palline variantless, SERVICE readiness, QR, and manual-code behavior. No migration or RPC change is part of PF-08B2C11.

## Controlled production smoke plan

Production remains untouched by this task. During an authorized rollout window:

1. deploy the reviewed application change without changing database objects;
2. use an approved test account to redeem one physical reward with a variant;
3. confirm exactly one Telegram work request and verify customer, reward, points, variant, **Da preparare**, and safe reference content;
4. replay the same idempotency key and confirm no second message;
5. redeem one variantless physical reward and confirm one message without a variant line;
6. redeem one SERVICE reward and confirm no preparation Telegram;
7. advance a physical request through lifecycle states and confirm no resend;
8. confirm **Richieste premio**, stock, order, points, QR, and manual-code state remain authoritative.

A failed smoke requires rollback of the application release or disabling the affected smart-flow entry point according to the existing cutover runbook. Do not diagnose by sending ad hoc production Telegram messages.
