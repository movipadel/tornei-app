# MoviBack corporate conventions — C8 release readiness

Local certification date: 2026-10-13. Baseline: `main` at `93310bad42600f065b7317c12879f8f52ee5a972`. This document records the certified C1–C8 implementation after the controlled commits listed below; this release-readiness record is the remaining Commit 9. It does not authorize a push or deployment, apply a production migration, create a company agreement, or start a real pilot.

## Authoritative architecture

The subsystem stores agreements in `moviback_agreements`, one-time hash-only codes in `moviback_agreement_codes`, batch metadata in `moviback_agreement_code_batches`, membership benefits in `moviback_agreement_entitlements`, append-only history in `moviback_agreement_audit_events`, and enrollment replay records in `moviback_membership_enrollment_requests`. Commercial earns add structured attribution columns to `loyalty_transactions`; balance remains the sum of ledger deltas. Transactional email uses the shared `notification_events` and `notification_deliveries` outbox. Generic operation replay remains in `business_operation_idempotency`.

The server-side operations are:

- `credit_moviback_points(text,numeric,text,uuid,text,text,uuid)`
- `create_moviback_agreement(text,text,text,numeric,timestamptz,timestamptz,uuid)`
- `update_moviback_agreement(uuid,text,text,text,numeric,timestamptz,timestamptz,uuid)`
- `generate_moviback_agreement_code_batch(uuid,uuid,jsonb,timestamptz,timestamptz,uuid)`
- `revoke_moviback_agreement_code(uuid,text,uuid)`
- `assign_moviback_agreement(uuid,uuid,timestamptz,timestamptz,uuid)`
- `revoke_moviback_agreement_entitlement(uuid,text,uuid)`
- `claim_moviback_agreement_code(uuid,text)`
- `submit_moviback_membership_request_c5(uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,date,text)`
- `review_moviback_membership_c5(uuid,text,text,date,uuid)`
- `get_moviback_agreement_report(uuid)`
- `get_moviback_membership_agreement_history(uuid)`
- hardened merge preview, execution, and verification functions
- `enqueue_moviback_agreement_user_notification()`

All mutating and reporting RPCs are `SECURITY DEFINER` with a fixed `pg_catalog, public` search path (credit also includes `extensions`). They use schema-qualified objects, parameterized inputs, no dynamic SQL, and service-role-only grants. Public activation and enrollment accept no membership, agreement, entitlement, or actor identifier from the browser; the server resolves the authenticated canonical user.

The API surface comprises Admin agreement list/create/detail/update, code list/generate/revoke, manual assignment, entitlement revoke, report; public code activation; enrollment through the existing membership request endpoint; Admin membership review; `/api/moviback/me`; staff earn; and the shared email worker. UI surfaces are Admin agreement list/detail/report, Customer Hub convention status, `/moviback` activation and status, and membership enrollment.

## State machines

Agreement states are `draft → active → suspended|expired|revoked`; Admin update can reactivate a suspended agreement when dates remain valid. Expired and revoked are retained for history. All create/update changes emit agreement audit events.

Code states are `available → claimed → used` for existing approved members and `available → reserved → used` for new-member approval. A failed C5 activation ends as `expired`, `revoked`, or `closed` according to the authoritative reason. Admin may revoke only `available` or `reserved` codes with a reason. Rejection does not silently release a reservation. There is no automatic release operation in C1–C7.

Entitlement states are:

| State | Meaning | Effective |
|---|---|---|
| `pending` | C5 code reserved while membership awaits review | no |
| `scheduled` | retained schema state for a future effective start | no |
| `active` | benefit may win future eligible earns | yes within `[effective_from,effective_until)` |
| `not_activated` | membership approved but reservation/agreement invalid at approval | no, terminal |
| `revoked` | ended explicitly with actor and reason | no from `revoked_at` |
| `expired` | retained historical entitlement past its interval | no |

Only one `pending|scheduled|active` entitlement without revocation can exist per membership. DB checks reject active rows without activation/effective timestamps, pending rows with activation timestamps, malformed validity intervals, invalid code ownership shapes, non-positive multipliers, and structured earns whose delta differs from credited points.

Material audit events cover agreement create/update, batch creation, code reserve/claim/use/revoke/close/expire, entitlement pending/activation/not-activated/assignment/revoke, and reconciliation. The audit trigger rejects UPDATE and DELETE for normal server operations; a database superuser remains able to bypass PostgreSQL protections and is outside the application threat model.

Notifications are emitted only from authoritative audit transitions for activated, not-activated, and revoked. Pending, scheduled, reports, code generation, invalid attempts, and replay-only paths produce no customer email. Event idempotency and the delivery outbox enforce one logical delivery; preference-off is skipped; provider failure cannot roll back business state.

## Security findings

Codes contain 20 symbols from a 32-character non-ambiguous alphabet, yielding exactly 100 bits of entropy. Generation uses Node `crypto.randomInt`; there is no sequential or employee-derived material. Normalization removes separators and casing before SHA-256 lookup. Only the hash and six-character informational suffix persist. The suffix is never an authorization key.

Activation and coded enrollment consume the existing durable 15-minute login limiter before code lookup. It enforces 8 attempts for the client+identity bucket and 30 for the client bucket. Keys are HMAC-derived from a server secret, scope, normalized client address, and canonical user ID. Missing secrets or limiter failures fail closed. Sessions and casing/separator changes do not avoid the identity/client buckets. Empty, whitespace, malformed, Unicode-lookalike, and normalized inputs over 64 characters are rejected before lookup. The assessed online brute-force risk is **LOW**.

Batch generation rejects zero, negative, fractional, and values above 500 in both route and RPC. The idempotency key is unique per agreement; concurrent replay returns metadata without reconstructing plaintext. Plaintext exists only in the first in-memory response and optional client-side CSV. No recovery endpoint, DB plaintext column, log, or audit payload exists.

The C8 correction neutralizes spreadsheet formula prefixes in the agreement-name CSV cell before quoting it. React renders names and reasons as text; email HTML escapes all dynamic content. No `dangerouslySetInnerHTML` occurs in convention UI. Query builders and RPC calls are parameterized. Slugs, UUIDs, status, dates, quantities, reasons, code length, file type, and upload size are validated.

Admin APIs uniformly require `moviback.manage`. Admins and delegated staff with that permission can manage and report; staff without it, scanner-only staff, authenticated public users, and anonymous callers are denied. Public users can self-activate or enroll only for their server-resolved identity. Point credit remains a staff route and the RPC independently validates an active operator, membership, club, amount, identity, and certificate state. Clients cannot submit a multiplier, credited points, or winning agreement.

All new tables have RLS enabled. Direct access for anon/authenticated is revoked, code hashes cannot be enumerated, and self-service RPC EXECUTE is revoked from browser roles. Reads are bounded: codes 500, batches 100, entitlements/report sections 200, recent audit 50, and public history 10–20 depending on the surface.

Convention data does not duplicate employee number, HR data, corporate email, phone, or plaintext code. Reports use canonical member identity only inside the existing authorized Admin boundary.

## Consistency and concurrency

The common lock order starts with membership, then entitlement/code where applicable, then agreement shared state. Agreement updates lock affected memberships in UUID order before the agreement. Identity merge uses deterministic advisory locks for user IDs, then both memberships and convention rows. No tested path produced a deadlock.

Certified concurrent cases cover duplicate earn, earn versus redemption, assignment versus earn, revoke versus earn, agreement update versus earn, simultaneous code claims, reservation/approval races, and merge/earn coordination. Results preserve one current entitlement, one idempotent earn, owned codes, and a coherent ledger snapshot.

Membership cardinality is checked before self activation, enrollment reuse, credit, and reconciliation. Ambiguity fails closed. Reporting is derived from raw tables and uses distinct membership counts. Merge preview fingerprints convention rows and blocks two-current-entitlement conflicts before mutation; merge moves code ownership and historical entitlements together.

Non-earning operations leave historical balance unchanged. Approval activation starts at database approval time; not-activated produces no effective timestamp or points; no operation recalculates prior earns. Incentive selection is max-of-one among individual promo, global promo, and agreement. Ties deterministically retain promo. Multipliers are never multiplied together.

Agreement, code, entitlement, and revocation validity uses authoritative database time and half-open intervals `[start,end)`. `credit_moviback_points` first locks the membership and validates membership eligibility, then captures one authoritative `v_event_at` with `clock_timestamp()`. The same post-lock instant is used for promo validity, agreement validity, entitlement effective intervals, `revoked_at` comparisons, ledger `created_at`, and returned `event_at`. Existing C1–C7 tests cover exact start/end and revocation boundaries.

### Post-lock credit-time hotfix

The approval-versus-earn race previously allowed a credit transaction that started before approval, waited on the membership lock, and resumed after approval to evaluate the new entitlement against its stale transaction-start timestamp. Commit `0fd04ea653ca119610964eaa950fe8ecc424f49b` (`fix: use post-lock time for MoviBack credit eligibility`) introduced forward migration `20261029100000_moviback_credit_post_lock_event_time.sql` and the post-lock timestamp rule above. Certification ran 100 isolated race iterations, observed only `{0,30}`, eliminated the x1 outcome, and reproduced the complete 56/56 migration chain.

## Pre-existing debt

The following debt predates conventions: membership-fee concurrency, voluntary-leave redemption cancellation, Store HTTP non-atomic path, legacy reward path, missing DB uniqueness on `loyalty_memberships.user_id`, Admin adjustment idempotency, and physical ledger immutability. Convention operations explicitly fail closed on membership ambiguity and use their own transactional/idempotent credit path. None is a blocker for a controlled conventions pilot; each remains release debt for its owning domain.

## Local certification

- Fresh isolated rebuild: 56/56 migrations applied, 56 unique versions; latest `20261029100000_moviback_credit_post_lock_event_time.sql`.
- Schema inventory: expected C1–C7 tables, indexes, triggers, RLS, function signatures, fixed search paths, and grants present after rebuild.
- SQL: C1/C2, C3, C4, C5, C6, C7, and C8 pass.
- Static/contract: 53/53 pass, including code generator, authorization, reporting, notifications, Store email, and C8 hardening.
- Concurrency: 4/4 suites pass.
- HTTP: C1/C2, C3, C4, C5, C6 and C7 pass against the isolated local app.
- Shared regressions: MoviBack eligibility 3/3, smart redemption, identity merge, user notification SQL with certified request fixture, and Store notification SQL on a separate clean rebuild pass.
- Local email: `USER_EMAIL_TRANSPORT=local`, `RESEND_API_KEY=re_local_disabled`; any external credential in local mode fails closed. All test recipients use reserved synthetic domains.
- One transient local container reset failure occurred before schema initialization; a single retry completed the migration chain. The later hotfix certification independently reproduced all 56 migrations. The transient failure did not expose an application or migration defect.

## First-company no-write rollout

1. Create the agreement in `draft`; do not distribute codes.
2. Have a second operator verify name, validity interval, multiplier, and contractual scope.
3. Change to `active` only after the operational owner accepts the review.
4. Generate a batch for 5–10 known/internal members.
5. Save the one-time CSV in the approved restricted business location; never paste codes into tickets or chat.
6. Assign or activate only the selected pilot members and record who owns support.
7. Perform one normal future club payment and verify base points, winning multiplier, credited points, and audit attribution.
8. Cross-check Admin report totals against the pilot actions.
9. Expand with a new batch only after the first report reconciles.
10. Handle lost/compromised unused codes through explicit Admin revoke with reason.
11. Monitor bonus totals, failed/skipped notification deliveries, and support reports.
12. Stop by setting the agreement to `suspended`; preserve all points, codes, entitlements, and audit history.

Five to ten known members is recommended for the first pilot. It exercises claim, reservation/approval, earning, reporting, email, and support while keeping reconciliation manual and observable. This is a technical recommendation, not an assumption about a real company or contract.

Rollback is operational, not destructive: suspend the agreement, stop distributing unused codes, revoke compromised individual codes when needed, and investigate. Suspension prevents future agreement wins; prior points and all evidence remain. Never delete the agreement, ledger, codes, entitlements, or audit history.

## Controlled commit status

The controlled sequence completed before this release-readiness record is:

1. `37b8ee738ff12bccf2ecd63e7f24bda16cba7882` — `fix: support legacy OTP verified activation`
2. `0431893442c3901d1bf109baf8bdd9623df86331` — `docs: document legacy OTP compatibility`
3. `3dbf87f7eccbe55f8e216c3737f6eaf787d5c14a` — `docs: add Monday League captain operations guide`
4. `b3cafbfd86a36b71db56e3db545ef2ae959c7575` — `feat: add MoviBack corporate convention lifecycle`
5. `ac25a8bd2b6b6917138024f8c6aa87cff8f62316` — `test: certify MoviBack convention foundation and administration`
6. `0fd04ea653ca119610964eaa950fe8ecc424f49b` — `fix: use post-lock time for MoviBack credit eligibility`
7. `6ffba1128510f6a000d77d18b98dd87abb4ca215` — `test: certify MoviBack convention user lifecycle and notifications`
8. `1e072fb7618ae323e14667b1e32bae3baeb5f8b2` — `test: harden MoviBack corporate conventions`
9. `41c64ffd3e6ea36b00885db96f994f10ce40e40a` — `docs: document MoviBack corporate convention lifecycle`

This document is the remaining controlled Commit 9 release-readiness record. Generated `next-env.d.ts` stays excluded.

`READY_FOR_CONTROLLED_COMMIT = YES`

`READY_FOR_FIRST_COMPANY_PILOT = YES`

These are readiness statements only. No push or deployment has been executed, no production migration has been applied, no real company agreement has been created, and no real pilot has started.
