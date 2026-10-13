# MoviBack Corporate Conventions — C6 Reporting and Reconciliation

## Scope

C6 adds operational reporting, membership convention history, structured points traceability, and convention-aware identity merge checks. It preserves the certified C1–C5 earning, activation, reservation, approval, and lifecycle rules.

The implementation does not add notifications, public company pages, HR imports, external analytics, or advanced BI.

## Authoritative sources

All metrics are calculated at read time from:

- `moviback_agreements`
- `moviback_agreement_code_batches`
- `moviback_agreement_codes`
- `moviback_agreement_entitlements`
- `moviback_agreement_audit_events`
- the structured C2 fields on `loyalty_transactions`

No mutable reporting counters are stored. Legacy ledger rows are not backfilled or inferred from free-form notes.

## Agreement metrics

Code totals use the persisted lifecycle statuses: `available`, `reserved`, `claimed`, `used`, `closed`, `revoked`, and `expired`.

Entitlement totals use: `pending`, `scheduled`, `active`, `not_activated`, `revoked`, and `expired`. `active` is a historical status count. `current_active` additionally requires the current database time to fall inside the entitlement effective interval and before any revocation boundary.

Membership metrics distinguish unique memberships ever involved from memberships with an entitlement effective now. Activation, Admin assignment, and code activation counts come from entitlement timestamps and `activation_source`.

Inactive agreements remain reportable; historical data is never hidden because an agreement is draft, suspended, expired, or revoked.

## Points and bonus attribution

Only structured `earn` transactions whose `incentive_source` is `agreement` and whose `agreement_id` points to the agreement contribute to agreement points totals.

The formula is:

```text
agreement bonus = credited_points - base_points
```

`base_points` already includes the membership base rule, including the FITP factor. The agreement multiplier does not multiply raw euros in reporting.

When a promo wins, including the deterministic promo-wins-ties rule, `agreement_id` is null and the transaction contributes zero agreement bonus. C6 does not inspect notes to invent attribution. Legacy rows with no `earning_rule_version` are shown separately as unclassified for involved memberships.

## Batch, member, and transaction reporting

The Admin agreement detail shows compact KPIs followed by bounded tables for batches, membership history, and the latest 200 agreement-attributed earns.

Batch reporting includes its reference, generation time and actor, declared quantity, and per-status code totals. Full codes and code hashes are never returned. Only an already persisted suffix may appear.

Membership history includes agreement, status, activation source, optional code suffix, lifecycle timestamps and reasons, plus its attributed earn count and point totals. The public Customer Hub receives only the authenticated membership's own history.

Transaction traceability includes transaction and membership references, date, club, euro amount, base points, multiplier, credited points, bonus, agreement and entitlement references, rule version, and source event reference. Internal idempotency keys are omitted.

## API and authorization

`GET /api/admin/moviback/agreements/[id]/report` requires `moviback.manage`. There is no public aggregate reporting endpoint. The underlying report RPCs are executable only by `service_role`; the application performs the operator or authenticated-user scope check before calling them.

## Identity merge reconciliation

The reviewed merge preview now fingerprints convention entitlements, claimed codes, and structured agreement/entitlement ledger references. Any change makes the preview stale before mutation.

If both source and canonical memberships have an active or scheduled entitlement, the merge is blocked for review. A collision between any two current records (`pending`, `scheduled`, or `active`) is also blocked so the single-current database invariant cannot fail mid-merge. No entitlement is silently selected, stacked, or discarded.

Historical `not_activated`, `revoked`, and `expired` entitlements move by updating their membership reference. Pending records move only when they do not collide with another current record. Reserved or used code ownership moves to the canonical membership without duplicating the code. Entitlement identifiers remain stable, so existing audit and ledger references remain valid. Each moved entitlement receives an append-only `membership_reconciled` audit event; the identity merge journal retains the domain reconciliation evidence.

Post-merge verification checks:

- source profile merged and canonical profile active;
- active alias and ownership transfer;
- MoviBack ledger balance preserved;
- no entitlement or claimed code remains on the removed source membership;
- no membership violates the single-current-entitlement invariant;
- structured ledger agreement and entitlement references remain valid;
- existing Store, tournament, communication, consent, and journal checks still pass.

Regression coverage compares agreement code, entitlement, and points totals before and after a merge. Unique membership identity may consolidate from two membership IDs to one, which is the expected identity change; points and bonus totals cannot change.

## Privacy and performance

Admin reporting uses only the member display name and membership reference needed for operations. It excludes email, phone, tax code, certificate data, full codes, hashes, credentials, and unrelated profile data.

Reporting indexes cover agreement/status/batch code lookup, agreement/status/membership entitlement lookup, agreement and entitlement ledger traces, and recent audit events. Aggregations run in SQL to avoid API-side N+1 loading. Large activity and membership tables are bounded and use internal horizontal scrolling on narrow screens.

## Deferred work

C7/C8 or later work may add convention notifications, public company pages, HR imports, external analytics, and advanced BI. None is part of C6.
