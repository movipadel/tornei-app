# MOVI operator permissions — Phase 2 domain enforcement

## Security model

The signed `staff_session` identifies an operator by `sid`. Every page and API decision reloads the current `staff_users` row. An inactive or missing operator is denied. An active Admin bypasses all delegated permission checks; an active Staff operator needs an exact `staff_permissions` grant. JWT role claims, client state, links, and navigation visibility are never authorization sources.

Delegated page subtrees have server layouts. Delegated APIs independently call `guardOperatorPermission`, `requireOperatorPermission`, or the editorial wrapper that calls the same shared guard. Authentication failures return 401 from APIs; authenticated permission failures return 403. Unauthorized pages redirect to `/operator-access-denied` without rendering protected content.

## Coverage map

| Classification | Domain | Page prefixes | API or server surfaces | Permission / rule |
|---|---|---|---|---|
| D | Scanner operations | `/staff`, `/staff/scanner`, `/staff/rewards` | `/api/staff/lookup-membership`, `earn-points`, `reward-delivery`; redemption queue/transition | `scanner.manage`; redemption queue also accepts `moviback.manage` |
| A | Tournaments | `/admin/tournaments/**` | `/api/admin/tournaments/**`, `/api/admin/registrations/**` | `tournaments.manage` |
| A | Circuits | `/admin/circuits/**` | `/api/admin/circuits/**`, except merge | `circuits.manage` |
| A | Players | `/admin/players/**` | player list/matching/customer hub and profile read/write | `players.manage` |
| A | Requests | `/admin/requests/**` | request list/detail/status/suggestions/Telegram retry | `requests.manage` |
| A | Padelleria | `/admin/padelleria/**` | content CRUD, lifecycle and content-owned media | `padelleria.manage` |
| A | Communications | `/admin/comunicazioni/**` | communication CRUD and image upload | `communications.manage` |
| A | MoviBack | `/admin/moviback/**` | dashboard, catalogue, categories, bands, promotions, membership reads and normal redemptions | `moviback.manage` |
| A | Partners | `/admin/partners/**` | CRUD, status and partner-owned media | `partners.manage` |
| A | Store | `/admin/store/products/**`, `/admin/store-orders/**` | catalogue, inventory, normal orders and operational fulfillment | `store.manage` |
| A | Monday League | `/admin/monday-league/**` | all normal league management routes and RPC commands | `monday_league.manage` |
| B | Operator/security | `/admin/users/**` | users, access problems, duplicates | active Admin only |
| B | Identity reconciliation | no delegated page | player identity command, circuit player-key merge | active Admin only |
| B | Sensitive MoviBack | certificate review/file access, manual balance adjustment | corresponding APIs | active Admin only |
| B | Store finance | economics pages/APIs, paid toggle, supplier/accounting export | corresponding APIs/helpers | active Admin plus existing email allow-list where present |
| B | Platform | Admin push subscription, generic upload | corresponding APIs | active Admin only |
| C | System | cron cleanup and infrastructure jobs | cron APIs | existing system-secret checks only |

`A` is a delegated permission domain, `B` is Admin-only, `C` is system-only, and `D` is the existing Scanner operational surface.

Tournament editors need circuit choices, so the circuit-list GET accepts either `circuits.manage` or `tournaments.manage`; circuit mutations still require `circuits.manage`. Communications need tournament targeting, so tournament-list GET accepts either `tournaments.manage` or `communications.manage`; tournament mutations still require `tournaments.manage`.

## Proxy strategy

The proxy remains a coarse identity and route-family gate. It resolves current role and active state from the database. Active Staff may reach only the delegated `/admin` prefixes listed in `operatorRouteAccess.ts`; every such prefix has a server layout guard. All other `/admin` pages still require a current Admin role at the proxy. The proxy does not hold the permission matrix and is never authoritative for permission grants.

## Upload treatment

`/api/admin/upload` remains Admin-only because it accepts a broad bucket/purpose input. Delegated domains use their existing scoped endpoints: circuit Home image, communication image, tournament image workflow, Padelleria-owned media, partner-owned media, Store product image, and MoviBack reward image. Each scoped endpoint enforces its domain permission and retains its bucket/path validation.

## Specialized helpers and RPCs

- `editorialOperator` replaces the former global Admin wrapper for Requests, Padelleria and Partners while retaining same-origin mutation checks and response shapes.
- Store fulfillment uses `store.manage`; Store economics retains Admin and email restrictions.
- `getMondayLeagueAdminActorId` retains its historical name for compatibility but resolves an operator through `monday_league.manage`.
- The migration introduces DB-private `operator_has_permission` and changes the historically named `league_assert_admin` implementation to accept active Admin or `monday_league.manage`. Every existing league RPC that calls it retains its transaction and audit protections.
- Normal profile edits use the new `player_profile_write_operator` RPC with `players.manage`. `player_identity_admin` and identity merge/reconciliation RPCs remain unchanged and Admin-only.

## Acceptance matrix

Local HTTP acceptance exercises all 11 permissions with Admin, exact-permission Staff, no-permission Staff, inactive Staff, and anonymous sessions for a representative page, read API, and mutation API. It also tests all-permissions Staff against Admin-only endpoints, same-session grant/revoke for Tournaments and Padelleria, and stale JWT Admin-to-Staff and Staff-to-Admin transitions. SQL acceptance verifies DB helper, Monday League and player-profile enforcement in a rolled-back transaction.

## Deferred work

Phase 3 will add polished permission-aware Staff navigation. Phase 4 will add the Admin operator editor, role transitions, permission checkboxes, last-Admin protection and audit writes. This phase intentionally adds neither UI.

## Future production rollout

1. Back up production.
2. Apply the Phase 1 permission migration.
3. Verify Staff `scanner.manage` backfill and Admin rows.
4. Apply the Phase 2 RPC migration and deploy foundation plus enforcement code as one controlled release.
5. Smoke-test Admin-only routes and normal Admin workflows.
6. Smoke-test existing Staff Scanner workflows.
7. Assign additional Staff grants only through the later approved operator editor.

No production step was executed during Phase 2 implementation.
