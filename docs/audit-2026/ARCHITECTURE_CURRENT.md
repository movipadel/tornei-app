# MOVIPadel current architecture

## Executive architecture

MOVIPadel is a single Next.js 16 application deployed as a server-rendered/client-rendered PWA. It is a modular monolith: public UI, authenticated user UI, staff UI, administrator UI, server API, and tournament domain engines live in one repository and one Next.js deployment. Supabase supplies PostgreSQL and object storage, but the application does not use Supabase Auth. Nearly all data access occurs in Next.js route handlers using a service-role Supabase client.

```text
Browser / installed PWA
  ├─ public and user React pages
  ├─ staff React pages + camera QR scanner
  └─ admin React pages
          │ same-origin fetch / cookies
          ▼
Next.js middleware + App Router route handlers
  ├─ user HMAC cookie verification
  ├─ staff/admin JWT cookie verification
  ├─ request validation and business rules
  ├─ Baraonda/fixed-pair engines
  └─ notification and rendering helpers
          │ service-role Supabase client
          ▼
Supabase PostgreSQL + Storage
          │
          ├─ Telegram Bot API
          ├─ Resend email API
          └─ Web Push endpoints (VAPID)
```

## Technology stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5, some JavaScript configuration |
| Web framework | Next.js 16.1.5, App Router, React Server Components where unspecified |
| UI runtime | React/React DOM 19.2.3; 63 of 78 TSX files are explicitly client components |
| Styling/design | Tailwind CSS 4/PostCSS, extensive inline CSS, Radix primitives, shadcn-style local components, CVA, `clsx`, `tailwind-merge`, `tailwindcss-animate` |
| UI/interaction | Lucide, React Icons, Sonner, Framer Motion, dnd-kit |
| Database/storage | Supabase JS 2.93.1 targeting hosted PostgreSQL and Storage |
| Sessions/crypto | `jose` HS256 JWT for staff/admin; Node `crypto` HMAC for users |
| Tournament engines | In-repository legacy Baraonda engine and structured `baraonda-v2` engine |
| QR | `qrcode.react` generation; `@yudiel/react-qr-scanner` camera scanning |
| Poster generation | Satori + `@resvg/resvg-js`, server-side Node runtime |
| Notifications | Telegram Bot API, Web Push/VAPID, Resend email |
| Dates | Native `Intl` with `Europe/Rome`; `date-fns` present |
| PWA | `@ducanh2912/next-pwa`, manifest, install prompt, generated Workbox worker |
| Build/deploy | npm, Next build forced through Webpack; documented Vercel production deployment |

## Frontend architecture

The App Router is divided by persona rather than by independently packaged feature. Public pages and most admin/staff pages are large client components that fetch JSON from same-origin API handlers. There is no client state framework: state is local React state/effects, component props, URL parameters, and `localStorage` for the PWA install-prompt dismissal.

Shared frontend elements are limited to:

- `src/components/tournaments/*` for tournament cards and dialogs;
- `src/components/ui/*` for local Radix/shadcn-style controls;
- `src/components/base44/*` for a small responsive-dialog/player-name layer;
- `PublicNav`, login dialogs, logout button, and install prompt;
- `formatPlayerName` and general class-name utilities.

The root layout supplies Geist, global CSS, Sonner notifications, PWA metadata, and the install prompt. Admin and staff have their own visual layouts, while access enforcement is performed by middleware and API guards, not by the layouts themselves.

Important frontend coupling:

- The home page is an aggregation shell coupled to tournaments, circuits, MoviBack, authentication, app settings, and communications.
- The tournament admin UI directly orchestrates many operational API endpoints.
- The store and rewards UIs share product/variant concepts through database-linked reward records.
- Fixed-pair tournament setup and execution are split between a large generation wizard and a large run client.

## Backend/server-side architecture

There is no separate backend service. Next.js route handlers under `src/app/api` are the API, validation, business-service, and persistence layers. Ninety-seven source files import `supabaseAdmin`; 63 import the admin guard. The typical handler does all of the following inline:

1. verifies a cookie/role when required;
2. parses and validates request data;
3. reads rows with the service-role client;
4. applies business rules in TypeScript;
5. performs one or more independent writes;
6. optionally sends best-effort notifications.

This design keeps browser access away from direct table writes, but it makes route correctness and cookie guards the primary security boundary. Multi-step workflows generally use compensating deletes/updates rather than a visible database transaction/RPC.

### Server-only libraries

- `supabaseAdmin.ts`: creates a new service-role client on demand with no persisted auth session.
- `supabaseServer.ts`: second service-role singleton; apparently unused.
- `supabaseClient.ts`: browser anon client; apparently unused.
- `staffSession.ts`, `staffGuard.ts`, `adminGuard.ts`: active staff/admin auth path.
- `userAuth.ts`: active user cookie path.
- `adminSession.ts`, `adminAuth.ts`: older admin-only cookie implementation; no active imports were found.
- `storeEconomicsAccess.ts`: admin role plus environment-configured email allowlist.
- `telegram.ts`, `email.ts`, `adminPush.ts`: outbound integrations.
- `posters/*`: tournament poster data and raster rendering.
- `baraonda-v2/*`: current schedule generation and validation.
- `baraonda/*`: legacy engine and compatibility switch.

## Authentication and authorization

### End users

User sign-in is registration-like rather than password-based. `POST /api/user/login` accepts name, phone, email, gender, legal acceptances, and marketing preference; it upserts `users` on phone and issues a 30-day `user_session`-style token. The token is a base64url payload containing user ID and timestamps plus an HMAC-SHA256 signature. It is stored in an HttpOnly, SameSite=Lax cookie and Secure in production.

There is no Supabase Auth identity, password, email/phone verification, refresh mechanism, device/session table, revocation list, or server-side session record visible in the repository. Possession of the signed cookie is the user identity.

Some tournament registration and phone-search/cancellation flows remain usable without a user session; cancellation uses knowledge of registration identity/phone-based lookup logic rather than the authenticated user relationship.

### Staff and administrators

Admin and staff authenticate with email/password through the database RPC `verify_staff_login`. The returned `staff_users` record supplies role and identity. The application issues a 180-day HS256 JWT in the configurable staff cookie. Admin login accepts only `role=admin`; staff login accepts both `admin` and `staff`.

`middleware.ts` protects `/admin/**` and `/staff/**`, excluding their login pages. It validates the JWT signature and role, redirects unauthenticated users, and redirects staff away from admin pages. API routes independently use `guardAdmin` or `guardStaff`. Store economics adds an admin-email allowlist.

The active admin login also uses the staff cookie path. The older seven-day `admin_session` implementation remains in source but appears disconnected.

### Authorization and Supabase

The repository README states that RLS is enabled and anon/authenticated access is revoked, but no SQL, policy, or Supabase project configuration is present to verify this. Because route handlers use `SUPABASE_SERVICE_ROLE_KEY`, database RLS is bypassed for normal application calls. Effective authorization therefore depends on route visibility, guard placement, object ownership checks, and input validation in TypeScript.

## Tournament execution architecture

### Baraonda

The active start path reads non-reserve `tournament_registrations`, validates 4–20 participants, enforces equal M/F counts for mixed events, selects a formula and number of courts, creates a `tournament_runs` snapshot, snapshots participants, generates turns/matches with Baraonda V2, moves the run from `locked` to `running`, and closes registrations.

`baraonda-v2` separates domain types/math/formats, pair and match planning, turn packing, presets, validations (structure, schedule, rest, partner, equity), audit helpers, and public adapters. A large legacy generator remains, as do compatibility and legacy `run/lock`/`run/generate` endpoints. The legacy lock endpoint reads a separate `registrations` table, while current flows use `tournament_registrations`.

Scores are patched into `tournament_run_matches`; live/admin endpoints calculate standings from match rows. Closing validates completeness, computes placement, optionally materializes circuit result rows, and marks the run completed.

### Fixed pairs

The fixed-pair wizard supports `group_only`, `bracket_only`, and `groups_and_bracket`, one-set or best-of-three scoring, seeds, courts, optional two-leg round robin, qualifiers, BYEs, and non-power-of-two play-ins. Start creates run-pair snapshots, group/group-pair records, and fixed-pair match rows. The bracket endpoint computes group standings and materializes the knockout bracket. Match updates advance bracket participants. Closing maps attained stages to circuit point rules.

## Deployment/build architecture

- `npm run dev`: Next development server.
- `npm run build`: `next build --webpack`.
- `npm run start`: Next production server.
- `npm run lint`: ESLint.
- `next.config.ts` declares Resvg native packages as server externals and wraps the app with next-pwa.
- A permanent host redirect sends `tornei-app.vercel.app` to `tornei.movipadel.it`.
- README documents GitHub-to-Vercel automatic deployment and Hostinger DNS; no CI/CD or Vercel project configuration is committed.
- Root metadata uses `https://app.movipadel.it`, creating a current-domain discrepancy with the redirect and README.

## PWA/mobile/native architecture

This is a responsive PWA, not a native application. The manifest specifies standalone portrait display, app icons, theme colors, and sports/lifestyle/shopping categories. A client install prompt handles `beforeinstallprompt` and iOS manual instructions. Generated Workbox code precaches application assets and applies runtime caching to pages, RSC payloads, GET APIs, assets, and cross-origin requests.

Admin push uses a separate `admin-push-sw.js` worker and Web Push subscriptions. The staff scanner uses the browser camera. No Capacitor, Cordova, React Native, Expo, native iOS/Android projects, or app-store build pipeline was found.

## Architectural risks to validate, not Phase 1 changes

- Service-role access makes every server route a high-trust boundary; missing ownership checks or guards can expose broad data.
- Long-lived staff JWTs have no repository-visible revocation/session-state check after issuance.
- User “login” upserts identity by phone without a verification challenge.
- Checkout, reward redemption, membership approval, stock decrement, balance computation, run closure, and circuit materialization are multi-statement operations without a repository-visible transaction.
- `public/sw.js` is tracked generated output and may become stale relative to source/build.
- Active V2 and legacy tournament paths coexist.
- Large client and route files concentrate business rules and make regression testing difficult.
