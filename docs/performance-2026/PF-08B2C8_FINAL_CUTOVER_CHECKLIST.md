# PF-08B2C8 — Final cutover checklist

## Current decision

**LOCAL TECHNICAL ACCEPTANCE COMPLETE.**

**ONE CONTROLLED-PRODUCTION VISUAL GATE IS DEFERRED.**

The overall status is **READY FOR CONTROLLED PRODUCTION CUTOVER REVIEW** and **NOT READY FOR UNATTENDED PRODUCTION ACTIVATION**. This task does not authorize deployment. Production governance items below still require explicit recorded PASS before cutover execution.

## Local technical gates

| Gate | Status | Evidence / required action |
|---|---|---|
| Feature flag OFF | PASS | PF-08B2C7 OFF-01 through OFF-03 |
| Feature flag ON | PASS | PF-08B2C7 ON suite |
| Customer Asciugamano technical flow | PASS | Variant contract, smart RPC, Store stock, idempotency, lifecycle, QR: PF-08B2C7 |
| Customer Tubo Palline technical flow | PASS | Variantless stockless fulfillment: PF-08B2C7 ON-07 |
| Staff queue technical flow | PASS | Queue/lifecycle/auth: PF-08B2C7 QUEUE and AUTH cases |
| QR lifecycle | PASS | PF-08B2C7 QR-01 through QR-04 |
| Authorization | PASS | PF-08B2C7 AUTH-01 through AUTH-03 |
| Local regression suite | PASS | C7 B2C5/B2C6, B2L, B2R3, TypeScript, build, targeted lint |

## Local visual gate

| Controlled-smoke item | Status | Activation condition |
|---|---|---|
| Asciugamano selector: Grigio/Lime/UNICA and required-selection feedback | DEFERRED TO CONTROLLED PRODUCTION SMOKE | Verify immediately after controlled smart-flag ON with a test account |
| Tubo Palline: no selector and no misleading stock warning | DEFERRED TO CONTROLLED PRODUCTION SMOKE | Verify in the same controlled smoke |
| Staff queue rendered page: filters, Italian labels, variant snapshot, legacy warning | DEFERRED TO CONTROLLED PRODUCTION SMOKE | Verify with designated staff/admin operator |
| QR rendered states: requested/processing hidden, ready clear, delivered unusable | DEFERRED TO CONTROLLED PRODUCTION SMOKE | Verify with designated customer/staff test accounts |

Reason for deferral: local customer onboarding requires a medical-certificate Supabase Storage bucket that is absent locally. The owner explicitly chose not to create local Storage infrastructure only for this check.

## Production governance gates

| Gate | Status |
|---|---|
| Production backup / restore point confirmed | PENDING |
| Final preflight SELECT reviewed | PENDING |
| Migration dependency order confirmed | PENDING: B0 → B1 → B2R2 → B2L → B2R3 |
| B0/B1/B2R2/B2L/B2R3 rollout package reviewed | PENDING |
| B2C4 classification artifact reviewed | PENDING second-operator review |
| Postflight SQL ready | READY, NOT EXECUTED against production |
| Rollback boundary understood | PENDING explicit operator review |

## Operations gates

| Gate | Status |
|---|---|
| Monitoring owner assigned | PENDING |
| Telegram monitoring owner assigned | PENDING |
| Second-operator review complete | PENDING |
| Smoke-test operator assigned | PENDING |
| Rollback operator assigned | PENDING |
| Explicit owner approval recorded | PENDING |

## Required cutover order

1. Confirm production backup/recovery point.
2. Run and review production preflight SELECTs.
3. Apply/verify supporting database migrations in dependency order.
4. Execute reviewed reward classification rollout.
5. Run postflight SQL and compare results.
6. Deploy application with smart flag OFF.
7. Perform general smoke.
8. Deliberately enable the smart flag for controlled test traffic.
9. Immediately run the deferred visual smoke with the designated test account(s).
10. Verify Asciugamano Grigio/Lime selector, Tubo Palline no-selector behavior, staff queue, and QR readiness.
11. If any visual issue appears, set smart flag OFF immediately; if all pass, proceed to monitored activation.

The deferred visual gate prevents normal smart-flow traffic until it passes. Any FAIL, PENDING, or uncertain required production gate is NO-GO. The production GO/NO-GO artifact remains authoritative: [PF-08B2C4_GO_NO_GO.md](PF-08B2C4_GO_NO_GO.md).

## Local safety confirmation

Only the unlinked local database was used. No production system, remote SQL, production environment, Telegram channel, deployment, or commit was touched.
