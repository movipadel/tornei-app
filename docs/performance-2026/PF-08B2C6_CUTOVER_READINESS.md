# PF-08B2C6 — Cutover readiness

## Decision

**B — NOT READY for controlled production cutover review.**

The staff operational UI and deterministic acceptance harness are implemented, but this phase does not manufacture production approval. The authenticated browser matrix and safe non-production Telegram delivery/failure exercise still require recorded execution. PF-08B2C4 production preflight, backup/recovery, classification postflight, monitoring, second-operator review, and owner approval also remain open.

## Completed in PF-08B2C6

- One shared staff/admin Richieste premio queue with direct navigation.
- Active-first server filters, 100-row pages, manual refresh, and no polling.
- Customer/reward/status/timestamps, fulfillment context, Store snapshots, QR readiness, and legacy warnings.
- Backend-authoritative lifecycle actions with reason capture, double-click guard, stable retry UUID, friendly errors, and authoritative reload.
- Explicit service/physical delivery language and stockless presentation.
- Existing guardStaff authorization reused for reads and writes.
- Feature-flag decision isolated in a testable function; explicit ON/OFF and safe defaults covered.
- Focused queue contract tests and a deterministic local browser checklist.
- Existing reward-admin classification enforcement reviewed as sufficient for immediate rollout protection.

## Evidence still required

1. Run all 16 browser cases in the acceptance plan using local/staging cookies and fixtures, including both feature-flag modes.
2. Record an end-to-end Asciugamano Grigio and Lime flow, Tubo stockless flow, SERVICE flow, QR visibility changes, scan delivery, and repeat scan.
3. Prove customer/no-session denial at both staff endpoints in the browser/network log.
4. Exercise Telegram with an approved non-production stub or channel: exactly one new alert, none on replay, and committed redemption despite simulated delivery failure.
5. Complete PF-08B2C4’s production-only governance gates without deploying from this task.

## Rollback and compatibility

Deploying this UI alone must not enable smart redemption. With the server flag false, it reads existing records and restricts unclassified history to manual review. A later flag rollback stops new smart creation but does not reverse committed rows; existing smart requests remain governed by lifecycle RPCs. Never retry a smart failure through legacy writes or directly patch redemption, ledger, stock, or Store order state.

## Risk assessment

Code-level regression risk is **medium-low**: changes are additive except for bounded filtering/pagination on the queue API and extraction of the unchanged feature-flag decision. Operational risk remains **high until acceptance evidence exists**, because reward delivery spans points, inventory, QR handling, staff roles, and a post-commit alert channel.

## Cutover-review gate

Change this decision to **READY FOR CONTROLLED PRODUCTION CUTOVER REVIEW** only after the browser and Telegram evidence above passes and PF-08B2C4’s independent production gates are signed. Review readiness is not deployment authorization.
