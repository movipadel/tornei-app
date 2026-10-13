# MoviBack corporate conventions — C1 foundation + C2 credit RPC

## Scope and source of truth

This foundation implements only the schema/invariants and the centralized commercial point-credit operation derived from the approved MoviBack architecture audit. It does not add public code activation, Admin agreement management, a real company agreement, membership-card badges, reporting, or convention notifications.

The points balance remains the sum of `loyalty_transactions.points_delta` for a membership. No balance column or cache exists. Historical ledger rows are not rewritten or assigned a reconstructed multiplier.

## C1 schema

- `moviback_agreements` stores reusable agreements, a `NUMERIC` multiplier, lifecycle status and `[valid_from, valid_until)` validity.
- `moviback_agreement_codes` stores only a unique hash and a short support suffix. Plaintext codes are never stored. The lifecycle supports available, reserved, claimed, used, revoked and expired codes.
- `moviback_agreement_entitlements` attaches an agreement to `loyalty_memberships.id`. A partial unique index permits one active entitlement per membership while retaining expired and revoked history. `code_id` is optional for future Admin assignment.
- `moviback_agreement_audit_events` is append-only and records staff/user actors, before/after state and reason without introducing an employee/HR identity model.

The convention boundary is the membership, not merely the public user. Agreements and entitlements are historical records; the design does not depend on physical deletion.

## Ledger evolution

New nullable fields on `loyalty_transactions` preserve the calculation for centralized commercial earning: base points, effective incentive multiplier, credited points, winning incentive source, agreement/entitlement identity, rule version, source-event identity, idempotency key and metadata. Legacy rows remain valid with these fields `NULL`.

Rows written by the new rule carry `earning_rule_version = moviback-credit-v1`. Their invariant requires `earn / club_payment`, non-negative base and credited points, a positive multiplier, and `points_delta = credited_points`.

Ledger immutability remains application-enforced rather than physically protected from service-role update/delete. That previously known debt is unchanged.

## C2 authoritative credit operation

`public.credit_moviback_points(text, numeric, text, uuid, text, text, uuid)` accepts membership code, euro amount, club, idempotency key, source-event type/id and operator identity. It does not accept calculated points, multipliers, promo identity or a forced agreement.

Within one transaction it:

1. identifies and locks the membership row;
2. checks one membership for the account and preserves account, membership, tax-code and medical-certificate eligibility;
3. claims `business_operation_idempotency` under `moviback_credit`;
4. fixes the authoritative event time with PostgreSQL transaction time;
5. resolves the membership factor, existing promo and effective agreement entitlement;
6. writes exactly one structured `earn / club_payment` ledger row;
7. returns the balance calculated from the ledger sum.

Sequential or concurrent reuse of the same operation key returns the committed result and cannot create a second structured earn row. Different keys represent different request-level operations. Until a real POS/payment reference exists, the staff scanner uses the request UUID as both idempotency identity and source-event ID; it is not described as a receipt.

The route `POST /api/staff/earn-points` retains `scanner.manage` authorization and response compatibility, but delegates all authoritative calculation and insertion to the RPC.

## Formula and incentive resolution

The membership base factor is unchanged:

- FITP: `1.2`
- otherwise: `1`

The calculation uses PostgreSQL `NUMERIC`:

```text
base_points = floor(euro_amount × membership_type_factor)
credited_points = floor(base_points × max(valid_promo_multiplier, valid_agreement_multiplier, 1))
```

Existing promo precedence remains: an applicable individual promo wins over global promos; otherwise the latest applicable global promo is used. Promo and agreement never multiply. The larger valid multiplier wins. On an equal multiplier, the promo wins deterministically to preserve the established promo identity.

Agreement and entitlement periods are half-open: `event_at >= start` and `event_at < end`. Revocation is effective when `event_at >= revoked_at`. The agreement itself must also be active and valid. No browser clock participates.

The multiplier applies only to new commercial `earn / club_payment` rows. It does not affect existing balances, redemption, refund, positive/negative adjustment, membership fee, Store debit, cancellation compensation or manual correction.

## Identity merge integration

Reviewed identity reconciliation locks both memberships and their entitlements. Codes and entitlements follow the canonical membership, and an append-only reconciliation event preserves the prior/new membership IDs. If both memberships have an active corporate entitlement, reconciliation raises a deterministic conflict and the existing merge workflow rolls back into `needs_review`. Code claims and audit history remain attached.

## Security

All four tables use RLS and expose no direct access to `anon` or `authenticated`. Service role receives only the table capabilities required for future server-side management. The credit RPC is executable only by service role and remains behind the existing staff permission check.

## Deferred C3–C8 scope

Deferred work includes public convention-code entry and claim, Admin agreement/batch/assignment interfaces, a real agreement and multiplier activation, membership-card presentation, reporting, transactional convention email, and operational rollout.

## Existing debt intentionally unchanged

- membership-fee concurrency;
- voluntary-leave/redemption cancellation behavior;
- Store HTTP non-atomic checkout path;
- legacy reward non-atomic path;
- missing database uniqueness on `loyalty_memberships.user_id`;
- Admin adjustment idempotency;
- physical service-role protection of ledger rows.

No real company, employee or customer data is included in this foundation or its fixtures.
