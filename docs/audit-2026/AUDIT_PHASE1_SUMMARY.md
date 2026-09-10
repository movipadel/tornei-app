# MOVIPadel Audit Phase 1 summary

## Status

Phase 1 architecture reconstruction is complete for the repository state on branch `audit/rebranding-2026`. The audit was read-first and made no application, schema, UI, configuration, dependency, deployment, or behavior changes. Only the six requested Markdown files under `docs/audit-2026/` were created.

## Technology stack

MOVIPadel is a TypeScript Next.js 16.1.5 / React 19.2.3 App Router application. It uses Tailwind CSS 4, Radix/shadcn-style components and substantial inline styling; Supabase PostgreSQL and Storage; custom HMAC/JWT cookie sessions; in-repository Baraonda and fixed-pair tournament engines; Satori/Resvg posters; QR generation and camera scanning; Telegram, Resend, and VAPID Web Push; and next-pwa/Workbox. Production is documented on Vercel with GitHub CI/CD and Hostinger DNS, though infrastructure configuration is external to the repository.

## Repository size and complexity

- 274 Git-tracked files inventoried.
- 235 existing source files under `src/`, of which 229 are tracked.
- 101 API route-handler files and 35 page files.
- Approximately 67,900 lines across `src` TypeScript/TSX/CSS, plus about 300 lines of configuration/scripts.
- About 13.7 MiB tracked overall and 2.0 MiB under `src`.
- Approximately 47,441 files in `node_modules` and `.next` excluded as vendor/generated content.
- 42 database table/view names, two RPCs, and five storage-bucket usages reconstructed from source.

Complexity is medium-high for a single deployment: broad business scope, many APIs, two tournament modes with multiple formats, 42 data relations, and several 1,000+ line client/domain files. Automated test coverage visible in the tracked repository is minimal.

## Architecture summary

The application is a modular monolith. Browser React pages call same-origin Next.js route handlers. Those handlers combine authorization, validation, domain logic, persistence, and outbound integration calls. Data access overwhelmingly uses a Supabase service-role client. The frontend is persona-separated into public/user, staff, and admin route trees; middleware and server guards enforce staff/admin boundaries.

The current tournament engine snapshots registrations into run-specific relations. Baraonda V2 builds and validates rotating schedules; fixed-pair logic supports groups, brackets, combined formats, seeds, BYEs/play-ins, and one-set or best-of-three scoring. Tournament close can materialize circuit points.

The application is a responsive installable PWA, not a native mobile app.

## Database summary

The inferred database covers:

- users, staff users, settings, and push subscriptions;
- tournaments, current and legacy registrations, run snapshots, turns, matches, groups, pairs, and standings;
- circuits, ranking groups, scoring rules, and per-event result rows;
- MoviBack memberships, medical certificates, points ledger, individual/global promotions;
- rewards, filters, QR redemptions;
- store categories, lines, products, colors, sizes, stock, orders, order items, costs, special orders, and promos;
- targeted communications and per-user state.

No schema/migrations/policies/triggers/functions source exists in the repository. The README states RLS is locked down, but this cannot be verified. Application calls use service role and therefore bypass RLS. The two observed database RPCs are `verify_staff_login` and `set_staff_password`.

## Major functional modules

1. Public MOVI home aggregation and navigation.
2. Tournament catalog, registration, participant list, live scoring, search/cancellation, reserves.
3. Administrator tournament CRUD, CSV export, poster generation, and operations.
4. Baraonda V2 and legacy scheduling.
5. Fixed-pair groups/brackets/scoring.
6. Circuits, ranking groups, stages, scoring rules, rankings, and player-key merge.
7. User profile/authentication and legal consent capture.
8. Staff/admin authentication, staff account management, and role gates.
9. MoviBack application, certificate review, membership lifecycle, balance and ledger.
10. Staff QR/membership lookup and points accreditation with promotions.
11. Rewards catalog, variants, QR redemption, and delivery validation.
12. MOVI Store catalog, variants, stock, checkout, orders, supplier/economic reporting.
13. In-app communications and user read/dismiss state.
14. Telegram, email, admin push, PWA installation, and static booking/contact links.

## Critical dependencies

- Supabase service-role database/storage connectivity and the unseen live schema/policies/RPCs.
- Cookie secrets for all authenticated personas.
- `verify_staff_login` and `set_staff_password` database functions.
- Vercel Node runtime compatibility, especially native Resvg packages.
- PWA/Workbox generated output and browser service-worker behavior.
- Telegram, Resend, and VAPID configuration for operational notifications.
- Phone normalization as tournament/circuit player identity.
- Hard-coded club list and Rome timezone assumptions.
- JSON `tournament_runs.rules` compatibility across current and legacy code.

## Security-sensitive areas discovered

These are Phase 2 review subjects, not claims of confirmed exploitation:

- Service-role Supabase access means route guards and per-object checks are the effective database authorization boundary.
- User identity is created/upserted by phone and profile fields without an OTP, password, or verified email/phone challenge.
- Staff/admin JWTs last 180 days and have no repository-visible revocation or staff-active recheck after issuance.
- Public registration search/cancellation and public redemption-token detail should be threat-modeled for enumeration/ownership leakage.
- Medical certificates, tax codes, phone/email, purchase/points history, and QR tokens are sensitive data.
- Multi-step balance, stock, order, redemption, membership approval, and circuit-close operations are not visibly transactional and may race.
- The generic admin upload route accepts a requested bucket name; allowlisting and storage policies should be verified.
- No rate limiting, CSRF token mechanism, CAPTCHA/abuse control, security headers configuration, or audit-log subsystem was found in repository code.
- RLS, grants, storage policies, RPC security/`search_path`, triggers, constraints, backups, and retention cannot be verified.
- Tracked generated service-worker output may cache authenticated GET API responses; cache behavior should be reviewed for account/admin data separation.
- No obvious committed secret literal was detected in tracked files; `.env.local` is ignored and its values were not printed.

## Questions not answerable from this repository alone

1. What is the authoritative PostgreSQL schema, including exact columns/types/defaults, foreign keys, unique/check constraints, and indexes?
2. Which tables and storage buckets have RLS enabled, and what are the actual grants/policies?
3. What do the two staff password RPCs do, which roles can execute them, and are they `SECURITY DEFINER` with a safe search path?
4. Are there database triggers/functions that maintain balances, standings, timestamps, capacity, stock, or audit logs?
5. Is `tournament_run_standings` a view, materialized view, or table, and how is it maintained?
6. Are `registrations`, `run/lock`, and `run/generate` still used in production or residual legacy paths?
7. Which current production domain is canonical: `app.movipadel.it` or `tornei.movipadel.it`?
8. What Vercel project settings, environment scopes, build versions, deployment protections, and log retention are configured?
9. Are Supabase PITR/backups, storage retention, antivirus/content scanning, and data-deletion policies configured?
10. What is the intended user authentication assurance level, and is phone ownership verified elsewhere?
11. Are staff sessions revoked when accounts are disabled or passwords change?
12. Are external notifications required for operations, and how are missed deliveries reconciled?
13. Is `store_promos` applied outside this repository or unfinished?
14. How are supplier payments and `store_special_orders` created authoritatively?
15. Which analytics, observability, error tracking, uptime monitoring, and incident processes exist outside source control?

## Recommended subjects for Phase 2

1. Export and review the live Supabase schema, migrations/history, functions, triggers, extensions, indexes, grants, RLS and storage policies.
2. Build an endpoint-by-endpoint authorization and object-ownership matrix, including public phone/token flows and upload endpoints.
3. Threat-model user/staff/admin session issuance, rotation, revocation, cookie policy, CSRF, brute force and rate limiting.
4. Test concurrent registration capacity/reserve positions, ledger balance spending, reward redemption, stock decrement, and tournament close; identify transactional RPC candidates.
5. Establish data classification, retention/deletion, certificate privacy, log redaction, backup/recovery, and GDPR workflows.
6. Determine active versus legacy tournament endpoints/tables/engine paths using production telemetry before removal planning.
7. Add a characterization/regression test plan for Baraonda formulas, mixed equity, fixed-pair brackets, scoring, circuit points, and reset/reopen behavior.
8. Review PWA caches/service-worker update strategy, especially authenticated/admin GET responses and tracked generated files.
9. Reconcile canonical domains, metadata, redirects, environment documentation, and external deployment configuration.
10. Review outbound notification reliability and decide whether a durable outbox/retry/audit mechanism is required.
11. Profile large pages/routes and define module boundaries suitable for rebranding without changing behavior.
12. Produce a rebranding dependency inventory only after the current behavior/security baseline is accepted.

Phase 2 and rebranding implementation have not been started.
