# MOVIPadel functional feature map

This map records confirmed code paths. “Authorization” describes application checks visible in this repository; database RLS is not verifiable here.

## Tournaments and registration

| Concern | Current implementation |
|---|---|
| Entry UI | `/`, `/tornei`; `TournamentCard`, `RegistrationDialog`, `TournamentParticipantsDialog`, `TournamentLiveDialog`, `MyRegistrations` |
| Admin UI | `/admin/tournaments`, dedicated registration page, tournament form/dialog |
| Public APIs | tournament list, participants, live run, registration-live standings, registration create, circuit player suggestions, registration search/cancel |
| Admin APIs | tournament CRUD, registration CRUD/bulk delete, reserve promotion, CSV export, poster generation |
| Data | `tournaments`, `tournament_registrations`; `users` linkage is optional |
| Authorization | Viewing/registering is public; an authenticated user ID is attached when present. Admin mutations use `guardAdmin`. Cancellation/search include unauthenticated phone-based paths. |
| Dependencies/coupling | Circuits validate type/category/level; notifications fire on registration/cancellation/promotion; runs snapshot main registrations; public communications can target registered players. |

Flow: UI fetches `/api/tournaments` → registration dialog posts player data → handler validates tournament/category/session/circuit uniqueness/capacity → inserts main or reserve row → sends Telegram and admin push best effort. A main cancellation reorders positions and may promote the first reserve.

## Tournament management and run lifecycle

| Concern | Current implementation |
|---|---|
| Entry UI | `/admin/tournaments`; `/admin/tournaments/[id]/run` |
| Controllers | admin tournament `ui.tsx`, `RunClient`, `RunScoreClient`, fixed-pair run clients |
| APIs | `run/start`, `run`, match patch, `run/close`, reset, reopen; legacy lock/generate; fixed start/reset/match; bracket materialization |
| Data | `tournament_runs` and mode-specific snapshot/match relations |
| Authorization | Every active run API is admin-guarded. Middleware protects admin pages. |
| Coupling | Run start closes registration; close publishes circuit results; reset/reopen removes snapshots; live endpoint exposes in-progress data publicly. |

The run is a durable snapshot with embedded JSON rules. Admin pages poll/refetch run data and patch scores. Completion is blocked while required matches are incomplete.

## Baraonda engine

| Concern | Current implementation |
|---|---|
| Current engine | `src/lib/baraonda-v2`: domain, match plan, pair plan, packing, presets, validation, audit, and public adapters |
| Legacy engine | `src/lib/baraonda/generateSchedule.ts` plus options and switch adapter |
| Supported active bounds | 4–20 players; mixed requires even total and equal M/F split |
| Formula/court selection | V2 UI options choose formula and max courts; rules stored on run |
| Output | turn rows and four-player match rows |
| Standings | calculated from team games, wins/ties, games won/lost/difference; circuit close uses placement |
| Testing | one tracked manual script and six ignored local V2 diagnostic programs; no automated test runner configured |

Both engines remain reachable in source: active `run/start` uses V2, while `run/generate` and the compatibility default can use legacy. The legacy `run/lock` reads the old `registrations` relation.

## Fixed-pair tournaments

| Concern | Current implementation |
|---|---|
| Entry UI | `FixedPairsGenerateWizard`; fixed-pair run client(s) on `/admin/tournaments/[id]/run` |
| Formats | `group_only`, `bracket_only`, `groups_and_bracket` |
| Options | one set/best of three, courts, one/two round-robin legs, qualifiers, seeds, BYEs/play-ins |
| Data | pair snapshots, groups, group-pair join, fixed-pair match rows, JSON rules/bracket draw |
| APIs | fixed start, match patch, fixed reset, shared run read, bracket generation, close |
| Authorization | Admin only |
| Coupling | registrations provide pairs; bracket generation depends on completed groups; close maps attained stage to circuit rules; store/MoviBack are independent. |

## Circuits, ranking groups, stages, and rankings

| Concern | Current implementation |
|---|---|
| Public UI | `/circuiti/[slug]` |
| Admin UI | `/admin/circuits`, `/admin/circuits/[id]`, circuit form dialog |
| APIs | public circuit list/detail; admin CRUD, ranking read, merge player keys |
| Data | `circuits`, `circuit_ranking_groups`, `circuit_points_rules`, `circuit_results`, linked tournaments |
| Authorization | Public reads use server service role without cookie; all management is admin-guarded. |
| Rules | Baraonda maps final placement; fixed pairs map winner/finalist/semifinalist/quarterfinalist/others stage; rules vary by admissions range. |
| Coupling | Tournament create/update checks circuit type and matching category/level group. Tournament registration enforces normalized phone identity for circuit players. Tournament close replaces result rows. |

“Stages” exist in two meanings: circuit event stages (played/upcoming tournaments) and fixed-pair knockout attainment stages. Rankings are dynamically aggregated from materialized per-event player rows.

## Player management

There is no standalone canonical player domain table beyond `users`, registration player snapshots, run snapshots, and circuit result identities. A tournament registration can exist without a user. Circuit identity is based on a normalized phone-derived `player_key`; admin can merge keys. Name formatting is a presentation helper, not identity management.

Admin MoviBack member pages provide the closest full player/customer management: user profile, membership, certificates, ledger, redemptions, promos, and edits.

## Authentication and sessions

| Persona | Entry | Mechanism | Lifetime/role |
|---|---|---|---|
| User | `UserLoginDialog`, `/api/user/login` | Phone-keyed profile upsert + signed HMAC cookie | 30 days; no role |
| Staff | `/staff/login` or shared admin login | `verify_staff_login` RPC + HS256 JWT cookie | 180 days; `staff` or `admin` |
| Admin | `/admin/login` | Same staff RPC/cookie, requires admin role | 180 days; `admin` |

Middleware protects page namespaces; route guards protect privileged APIs. Logout clears the respective cookie. There is no visible Supabase Auth usage or persistent session/revocation table.

## MoviBack membership

| Concern | Current implementation |
|---|---|
| User UI | `/moviback`, `/moviback/regolamento` |
| Admin UI | dashboard, requests, member list/detail |
| APIs | `me`, membership request, certificate replacement, leave/reactivate, admin approve/reject/edit/certificate signed URL |
| Data/storage | `users`, `loyalty_memberships`, `medical_certificates`; `medical-certificates` bucket |
| Authorization | User self-service requires user cookie and scopes queries by user ID. Reviews/edits require admin. |
| Workflow | User submits tax code, ASC/FITP state, medical certificate; admin reviews. FITP without existing membership can carry a 15-point fee; approval can insert fee ledger activity. |
| Coupling | Membership gates points/store/rewards and communication segments; staff lookup displays certificate status. |

Membership codes are application-generated random codes and are rendered as QR content in the user area.

## Staff functions, QR scanning, and points accreditation

| Concern | Current implementation |
|---|---|
| Entry UI | `/staff`, `/staff/scanner` |
| APIs | staff login/me, membership lookup, points earn, reward QR validation |
| QR | Browser camera scanner; membership and reward QR URLs/codes; reward delivery page |
| Data | membership/user/certificate lookup, loyalty ledger, global/user promos, reward redemption |
| Authorization | `guardStaff` permits `staff` and `admin`; reward delivery accepts either. |
| Points | Approved membership only; allowed clubs hard-coded; ASC ×1, FITP ×1.2; then one individual or eligible global promo multiplier; floor to integer points. |

## MoviBack rewards

| Concern | Current implementation |
|---|---|
| User UI | `/moviback/premi`; active redemption/QR also shown in MoviBack |
| Admin UI | `/admin/moviback/catalog`, user detail |
| APIs | reward list/redeem, redemption history/detail/validate; reward/category/range CRUD and image upload |
| Data | reward catalog/categories/ranges, redemptions, loyalty ledger |
| Authorization | Catalog/redeem requires user; management admin; token detail is public; delivery staff/admin. |
| Coupling | A reward can link to a store product and require color/size. Physical/store rewards create a store order and item. Redemption deducts points and decrements relevant stock. |

## MoviBack Store, products, and variants

| Concern | Current implementation |
|---|---|
| Public UI | `/store` |
| Admin UI | products, orders, economics pages |
| Catalog model | categories → lines/products → colors/sizes → stock combinations |
| Payment | euro, MoviBack points, or mixed; product flags gate modes; 10 points per euro conversion is used for fallback/mixed calculation |
| Checkout | Authenticated user required; approved membership required only when spending points; pickup at one of five hard-coded clubs |
| Order operations | Status, paid toggle, supplier-paid fields, CSV-style export summary, cost/economic reporting |
| Authorization | Catalog public; checkout user-authenticated; management admin; economics additionally restricted by configured admin email allowlist. |
| Coupling | Uses user/customer snapshots, loyalty ledger, Resend, Telegram, admin push, and reward-generated special orders. |

Store promotions are admin-managed, but direct application of `store_promos` in public catalog/checkout pricing was not identified; this needs confirmation.

## Notifications and communications

Two separate concepts exist:

- Operational notifications: Telegram, Resend order email, and VAPID admin web push. They are best effort after core writes.
- In-app communications: admin-authored rows targeted to all users, MoviBack segments, staff, or (in user-delivery code) tournament registrants. Per-user read/dismiss state is stored.

The admin communication target validation list does not include `tournament`, while user delivery code supports it. The admin UI loads tournament data, suggesting an incomplete or divergent target path worth validating in Phase 2.

## Posters, uploads, and content

Tournament posters are rendered server-side with Satori and Resvg using bundled template images and fonts. Admin can upload tournament images through a generic upload route, plus dedicated communication/reward/store image endpoints. Medical certificates use a separate private-style signed-URL flow.

## Booking, contacts, and public marketing

Booking and contacts are static code-defined club data. Booking links point to Wansport, directions to Google Maps, and contact actions to telephone, WhatsApp, and email. Home links to Instagram and Facebook. These are outbound links, not synchronized service integrations.

## Admin functionality summary

The admin persona can manage tournaments and scores, registrations/reserves, circuits/rankings, MoviBack applications/users/points/promos/rewards, store catalog/orders/economics, communications, staff accounts, assets, poster/CSV exports, and push subscriptions. These powers operate through the service-role client and therefore make admin cookie integrity and guard coverage critical.
