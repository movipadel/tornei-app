# PF-08B2C5 — Rollout dependencies and cutover

## Hard dependency order

1. PF-08B0 idempotency infrastructure.
2. PF-08B1 transactional Store checkout.
3. PF-08B2R2 smart redemption schema/RPC.
4. PF-08B2L lifecycle schema/RPCs.
5. PF-08B2R3 Store variant/inventory semantics.
6. PF-08B2C4 preflight, approved backup/recovery point, and exact reward classification.
7. PF-08B2C4 postflight with 13 SERVICE / 13 STORE_PRODUCT and zero mismatches.
8. Deploy the PF-08B2C5 application with smart redemption disabled in production.
9. Smoke-test catalog reads, staff queue reads, authentication, and QR/history reads.
10. Set `MOVIBACK_SMART_REDEMPTION_ENABLED=true` in an approved environment change and deliberately restart/redeploy the application.
11. Observe redemption, lifecycle, Store fulfillment, points, and notification monitoring.

No step was executed against production in PF-08B2C5.

## Feature-flag decision

`MOVIBACK_SMART_REDEMPTION_ENABLED` is a server-only cutover flag:

- explicit `true`: smart RPC route;
- explicit `false`: isolated retained legacy route;
- absent in development: smart route, enabling local validation;
- absent in production: legacy route, preventing accidental activation merely by deploying code.

The flag does not cause fallback. Once a request enters the smart branch, any RPC failure returns a stable error and performs no legacy writes. No environment file was created or modified.

## Compatibility window

The application code requires the PF-08B2R2 columns for catalog/admin reads and PF-08B2L/R3 functions for lifecycle actions, so it must not be deployed before database infrastructure. With infrastructure present but before classification, keep smart redemption disabled; active NULL-classified rewards would correctly fail smart redemption and new admin validation can reject incoherent activation.

After classification, the old route remains technically callable while the flag is false, but PF-08B2C4 already established that this is not behavior-neutral: Asciugamano follows its legacy Store path and Tubo still depends on legacy heuristics. Keep this window short and monitored.

## Activation checks

Before enabling smart redemption, require explicit PASS for:

- PF-08B2C4 GO checklist and owner approval;
- all five infrastructure migrations verified in production;
- exact classification postflight;
- reward catalog returns classification and authoritative variant IDs;
- service and physical QR readiness behavior accepted;
- staff queue/lifecycle endpoints authenticated and reachable;
- Telegram/push post-commit monitoring ready;
- legacy route remains available only as deliberate flag rollback, not automatic fallback.

## Rollback boundaries

- Before any smart redemption: switch the server flag to false if application behavior is unacceptable; do not undo classification without the PF-08B2C4 semantic review.
- After smart redemptions exist: the database transactions remain authoritative. Disabling the flag stops new smart requests but does not reverse committed redemptions or lifecycle state.
- Never run the legacy route as an automatic retry for a failed smart request.
- Do not expose requested/processing physical QR tokens during a flag rollback; QR readiness is a separate safety contract.
- Use lifecycle RPCs or explicit administrative repair for committed rows; never directly patch status, points, stock, or Store orders.

## Monitoring and stop signals

Monitor structured `PF08_*` codes, API 4xx/5xx, redemption/replay ratios, point balances, reward/Store stock, duplicate orders/debits, queue aging, QR delivery failures, lifecycle transitions, and Telegram/push failures. Stop activation on any partial-state suspicion, duplicate notification/order/debit, premature QR exposure, unexplained stock/points change, or material error-rate increase.

## Remaining deployment blockers

Production remains NO-GO until PF-08B2C4’s backup, preflight/postflight, monitoring, second-operator review, and owner approval are complete. The unified queue server contract is ready, but its dedicated staff UI is a follow-up. A browser-authenticated staging/local smoke test remains required before release approval.
