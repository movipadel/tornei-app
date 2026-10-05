# MOVI operator permissions foundation

## Scope

Phase 1 introduced the authorization foundation only. The final local platform subsequently completed Phase 2 domain enforcement, Phase 3 Staff navigation and Phase 4 Admin operator editing without changing public-user authentication.

## Database model

`public.staff_users` remains the operator identity store. `public.staff_permissions` contains explicit Staff grants, keyed by `(staff_user_id, permission_key)`. An active Admin has an implicit full-access bypass and needs no permission rows. An active Staff operator receives only explicitly stored grants.

Both `staff_permissions` and `operator_access_audit_events` have RLS enabled and no `anon` or `authenticated` policies. Application access uses the service role only after operator authorization. Access audit events are append-only at the database layer.

Deleting an operator cascades its permission rows. A deleted grant actor becomes `NULL`. An operator referenced as an audit target cannot be deleted, preserving the evidence chain.

## V1 catalogue

The code source of truth is `src/lib/operatorPermissions.ts`.

- Scanner / QR — `scanner.manage`
- Tornei — `tournaments.manage`
- Circuiti — `circuits.manage`
- Giocatori — `players.manage`
- Richieste Gioca / Allenati — `requests.manage`
- Padelleria / Social — `padelleria.manage`
- Comunicazioni — `communications.manage`
- MoviBack — `moviback.manage`
- Partner — `partners.manage`
- Store — `store.manage`
- Monday League — `monday_league.manage`

The database rejects permission keys outside this catalogue.

## Session and authorization authority

The signed `staff_session` JWT remains unchanged and continues to identify the operator through `sid`. Its `role`, `name`, and `email` claims are display hints only. They are not authorization claims.

Every protected operator request resolves `sid` against the current `staff_users` row. Missing and inactive operators are denied. The current database role wins immediately over a stale JWT role. `requireOperatorPermission` then applies the Admin bypass or checks the exact Staff grant. Unknown keys fail closed.

No cross-request authorization cache is used. This gives immediate role, status, grant, and revocation behavior. Duplicate lookups inside one request can be optimized later with request-scoped memoization only.

## Compatibility

The migration grants `scanner.manage` to every pre-existing Staff operator and creates no Admin grants. Phase 1 keeps `guardStaff` role-compatible, so existing Scanner, points, and reward operations continue to work. Phase 2 then delegated the classified domain routes through explicit permission guards.

The proxy remains a coarse navigation gate, but it resolves the current DB operator before redirecting. API and server guards independently resolve the DB state and remain authoritative.

## Audit contract

`recordOperatorAccessAudit` validates permission keys and writes role, status, grant, and revoke evidence. Phase 1 introduced the contract; the completed Phase 4 operator editor records the corresponding mutation evidence through its atomic Admin RPCs.

## Completed follow-on phases

- Phase 2: domain API/page permission enforcement.
- Phase 3: permission-aware Staff dashboard modules.
- Phase 4: role/grant editor, role conversion, operator lifecycle controls and transactional last-active-Admin protection.

## Production rollout requirements

1. Review and approve the migration and security tests.
2. Back up and verify the current `staff_users` population.
3. Apply the migration before deploying code that queries `staff_permissions`.
4. Verify every existing Staff operator received `scanner.manage` and every Admin has zero required grant rows.
5. Deploy the application code.
6. Verify Admin and Staff login, immediate inactive denial, and Scanner operations.
7. Monitor authorization failures. Roll back application code before schema only if rollback is required; the additive tables can remain safely unused.
