# PF-08B2C7 — Controlled cutover-review gate

## Classification

**READY FOR CONTROLLED PRODUCTION CUTOVER REVIEW.**

This is not production approval and does not authorize deployment, production SQL, classification, environment changes, or feature-flag activation.

## Basis

- Both explicit feature-flag modes ran through the local Next.js application.
- OFF proved the legacy branch, absence of smart idempotency state, customer compatibility, and manual-only legacy queue handling.
- ON proved SERVICE, both Asciugamano variants, invalid/missing variants, stockless Tubo, single-identity auto-resolution, insufficient points/stock, idempotent replay, and new intent behavior.
- Staff lifecycle, timestamps/actions, authoritative refresh payloads, customer QR gating, delivery, repeat delivery, cancellation, rejection, exact-once refunds, finite-stock restoration, Store fulfillment, and historical rows passed.
- Anonymous/customer denial and signed staff/admin access passed using normal login/session endpoints.
- Safe notification evidence showed one local post-commit attempt per new success, none for replay/failure, and committed state despite unavailable delivery.
- B2C5/B2C6 contract tests, B2L, B2R3, TypeScript, production build, and targeted lint are green.

## Qualified limitation

The browser-control runtime failed before a browser could be opened, so two visual-only checks are NOT EXECUTED. This does not invalidate the application acceptance: the allowed lightweight HTTP/session strategy exercised the running UI routes, actual login endpoints/cookies, API orchestration, and database state end to end. A human visual smoke test remains recommended as the first controlled-review activity.

## Review prerequisites before any production action

1. Complete the PF-08B2C4 production backup/recovery, preflight, classification postflight, monitoring, second-operator, and owner-approval gates.
2. Perform a human visual smoke test of `/moviback/premi`, `/staff/rewards`, and `/admin/moviback/redemptions` in an isolated environment.
3. If an approved non-production Telegram channel exists, validate message rendering there without copying production credentials.
4. Deploy with smart redemption disabled first; verify read/auth paths; only then consider an explicit approved flag activation.
5. Preserve rollback boundaries: disabling the flag stops new smart writes but never reverses committed redemption/lifecycle state.

## Safety confirmation

Production was never contacted. No remote SQL, deployment, production environment change, production Telegram use, project link, or commit occurred. All database writes targeted `127.0.0.1:54322/postgres` and were reset to the canonical local seed before final regression testing.