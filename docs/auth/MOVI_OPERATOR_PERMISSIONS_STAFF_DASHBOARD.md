# MOVI Operator Permissions — Staff Dashboard

## Information architecture

`/staff` is the operational landing page for every active operator. It resolves the operator from the current server session, reads current database grants and renders only usable modules. It never renders raw permission keys or internal identifiers.

The Scanner workflow remains separate:

- `/staff/operations` — membership lookup, points crediting and reward delivery;
- `/staff/scanner` — camera-based QR scanning;
- `/staff/rewards` — reward request queue.

Legacy `/staff?code=...` and `/staff?reward=...` links are forwarded to `/staff/operations` after the `scanner.manage` server guard succeeds.

## Module mapping

The shared `OPERATOR_PERMISSIONS` catalogue is the source for dashboard labels, descriptions and destinations.

| Permission | Module | Destination |
| --- | --- | --- |
| `scanner.manage` | Scanner / QR | `/staff/operations` |
| `tournaments.manage` | Tornei | `/admin/tournaments` |
| `circuits.manage` | Circuiti | `/admin/circuits` |
| `players.manage` | Giocatori | `/admin/players` |
| `requests.manage` | Richieste Gioca / Allenati | `/admin/requests` |
| `padelleria.manage` | Padelleria / Social | `/admin/padelleria` |
| `communications.manage` | Comunicazioni | `/admin/comunicazioni` |
| `moviback.manage` | MoviBack | `/admin/moviback` |
| `partners.manage` | Partner | `/admin/partners` |
| `store.manage` | Store | `/admin/store/products` |
| `monday_league.manage` | Monday League | `/admin/monday-league` |

Scanner and MoviBack remain independent modules. One grant never implies the other.

## Effective permissions

`getEffectiveOperatorPermissions(operator)` is a UI/navigation helper:

- Admin receives every permission in the V1 catalogue without permission rows;
- Staff receives only current, known grants from `staff_permissions`.

Page and API guards remain authoritative. Because the helper reads the database on each server request, a grant or revocation appears after refresh without another login.

## Navigation filtering

The Staff header links back to `/staff` and lists only the operator's modules. A Staff operator inside a delegated `/admin/*` page receives the same filtered operational menu and never receives Admin-only entries.

Admin sees all operational entries plus the separately declared Admin-only navigation group. The Admin-only group includes Staff management, identity review and access-problem handling. Sensitive certificate, point-adjustment, Store economics, system, upload, cron and diagnostic functions remain absent from Staff navigation and retain their Phase 2 server guards.

An active Staff operator with no grants stays on `/staff` and sees “Nessuna area operativa assegnata”, with a neutral instruction to contact an Admin. There is no redirect loop.

## Phase 4

Permission assignment, role editing, last-Admin protection UI and operator management remain Phase 4 work. Phase 3 adds no mutation UI, mutation API or schema change.
