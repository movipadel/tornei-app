# MOVIPadel repository map (current state)

Audit date: 2026-09-09  
Branch inspected: `audit/rebranding-2026`  
Scope: Phase 1, read/analysis first. Application behavior was not changed.

## Inventory method and scale

The inventory used `git ls-files`, recursive directory/file enumeration, route/page discovery, import searches, Supabase query searches, environment-name extraction, and targeted reads of the main pages, route handlers, guards, service helpers, tournament engines, and configuration files. Generated and vendored trees were not read as application source.

| Measure | Result |
|---|---:|
| Git-tracked files inventoried | 274 |
| Relevant source files searched/inspected | 235 |
| Tracked files under `src/` | 229 |
| Existing files under `src/` | 235 |
| Next.js pages (`page.tsx`) | 35 |
| Next.js API route handlers (`route.ts`) | 101 |
| Component files under `src/components` | 26 |
| Library files under `src/lib` | 52 |
| Public files | 29 |
| Tracked repository size | about 13.7 MiB |
| `src/` size | about 2.0 MiB |
| Approximate application source LOC (`src/**/*.{ts,tsx,css}`) | 67,900 |
| Approximate configuration/script LOC | 300 |

Six files in `src/lib/baraonda-v2/dev/` exist locally but are ignored by Git. They are test/diagnostic programs rather than shipped application routes. The tracked test surface is one script, `scripts/test-baraonda.ts`; no unit-test framework configuration or conventional `*.test.*`/`*.spec.*` suite was found.

### Excluded generated/vendor content

| Directory/files | Approximate files excluded | Reason |
|---|---:|---|
| `node_modules/` | 41,767 | Installed third-party packages |
| `.next/` | 5,674 | Next.js build/cache output |
| `public/sw.js` and `public/workbox-f1770938.js` | 2 tracked generated artifacts | Generated PWA/Workbox output; only behavior/header was checked |
| Binary fonts/images/icons | 21 | Inventoried by name/type; not treated as source |

Total vendor/generated files excluded from source inspection: approximately 47,441, plus generated PWA artifacts and binary assets as noted above.

## Top-level structure

```text
tornei-app/
├─ src/
│  ├─ app/                    Next.js App Router pages, layouts, and API handlers
│  │  ├─ admin/              Administrator UI
│  │  ├─ api/                Server-side HTTP boundary (101 route files)
│  │  ├─ circuiti/[slug]/    Public circuit/ranking UI
│  │  ├─ moviback/           Loyalty membership and reward UI
│  │  ├─ riscatto-premio/    QR reward redemption landing page
│  │  ├─ staff/              Staff lookup, points, and scanner UI
│  │  ├─ store/              Public store/catalog/checkout UI
│  │  ├─ tornei/             Public tournaments UI
│  │  └─ ...                 Home, booking, contacts, legal pages, manifest
│  ├─ components/
│  │  ├─ tournaments/        Cards, registration/participant/live dialogs
│  │  ├─ ui/                 Radix/shadcn-style primitives
│  │  └─ base44/             Small internal presentation abstractions
│  ├─ lib/
│  │  ├─ baraonda/           Legacy tournament schedule engine
│  │  ├─ baraonda-v2/        Current domain engine, presets, validation, audit helpers
│  │  ├─ posters/            Satori/Resvg poster rendering
│  │  ├─ *Auth/*Session      Cookie session and route-guard helpers
│  │  └─ supabase*, email, telegram, adminPush, utilities
│  └─ types/
├─ public/                    Images, fonts, icons, PWA and push service workers
├─ scripts/                   Manual Baraonda test program
├─ middleware.ts             `/admin` and `/staff` cookie/role gate
├─ next.config.ts            PWA wrapper, native package declaration, host redirect
├─ package.json              Runtime/build dependency manifest
├─ package-lock.json         npm lockfile
├─ tsconfig.json             Strict TypeScript and `@/*` alias
├─ tailwind.config.js        Tailwind content/safelist
├─ postcss.config.js         Tailwind/PostCSS/Autoprefixer
├─ eslint.config.mjs         Next.js ESLint configuration
├─ components.json           shadcn/Radix component metadata
├─ .env.example              Tracked environment-name template
└─ .env.local                Ignored local environment file (names inspected only)
```

No `supabase/`, migration, SQL schema, ORM schema, Docker, `vercel.json`, or GitHub Actions workflow was found.

## Application page map

### Public/user pages

- `/`: consolidated MOVI home/dashboard; loads tournaments, circuits, app settings, user state, MoviBack state, and user communications.
- `/tornei`: tournament listing, registration search/cancellation, entry dialogs, participant lists, and live results.
- `/circuiti/[slug]`: circuit landing page with ranking groups, cumulative rankings, played stages, and upcoming stages.
- `/moviback`: user profile/membership request, medical certificate lifecycle, balance, transaction history, QR membership display, and suspension/reactivation/leave flows.
- `/moviback/premi`: rewards catalog, category/point filters, store variants, and redemption.
- `/moviback/regolamento`: loyalty rules content.
- `/store`: product catalog, variants, cart, points/euro/mixed checkout, pickup club.
- `/riscatto-premio/[token]`: public token detail plus staff/admin delivery confirmation.
- `/prenota`: static club cards with Google Maps and Wansport booking links.
- `/contatti`: club contact, telephone, WhatsApp, and email links.
- `/privacy`, `/cookie`, `/termini`: legal content.

### Staff pages

- `/staff/login`: staff/admin credential form.
- `/staff`: membership lookup and points accreditation.
- `/staff/scanner`: camera QR scanning; accepts membership/redemption URLs and routes to operational flows.

### Administrator pages

- `/admin`: dashboard/navigation and web-push subscription entry point.
- `/admin/tournaments`: tournament CRUD, registration operations, run setup/reset/reopen/close, poster and CSV actions.
- `/admin/tournaments/[id]/registrations`: dedicated registration management.
- `/admin/tournaments/[id]/run`: live score console for Baraonda and fixed-pair modes.
- `/admin/circuits`, `/admin/circuits/[id]`: circuit configuration, ranking groups, points rules, rankings, and player-key merge.
- `/admin/moviback`: program dashboard.
- `/admin/moviback/requests`: membership/certificate review.
- `/admin/moviback/users`, `/admin/moviback/users/[id]`: member search/detail/edit, point adjustments and user promos.
- `/admin/moviback/catalog`: rewards, reward categories, ranges, stock, store linkage.
- `/admin/moviback/promos`: global points promotions.
- `/admin/store/products`: categories, lines, products, colors, sizes, stock, store promotions, sorting, image upload.
- `/admin/store-orders`: order workflow, paid state, supplier summaries.
- `/admin/store/economica` and `/admin/store-economics`: economics/cost/reporting views with additional email allowlist authorization.
- `/admin/comunicazioni`: targeted communication publishing and image upload.
- `/admin/users`: staff/admin account creation and listing.
- `/admin/login`: shared admin/staff entry UI.

## API surface by area

| Area | Route files | Responsibility |
|---|---:|---|
| `/api/admin/**` | 68 | All privileged CRUD and operational functions |
| `/api/moviback/**` | 9 | Authenticated member self-service and rewards |
| `/api/tournaments/**` | 6 | Public catalog, registration, participant/live data |
| `/api/user/**` | 5 | User identity/session and communication state |
| `/api/staff/**` | 4 | Staff login, lookup, and point earning |
| `/api/circuits/**` | 2 | Public circuit list/detail/rankings |
| `/api/registrations/**` | 2 | Phone-based search and cancellation |
| `/api/reward-redemptions/**` | 2 | QR token detail and staff/admin validation |
| `/api/store/**` | 2 | Public catalog and authenticated checkout |
| `/api/app-settings` | 1 | Public settings retrieval |

## Environment variables (names only)

Names referenced by source/configuration:

- `ADMIN_COOKIE_NAME`
- `ADMIN_COOKIE_SECRET`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `NODE_ENV`
- `RESEND_API_KEY`
- `STAFF_COOKIE_NAME`
- `STAFF_COOKIE_SECRET`
- `STORE_ECONOMICS_ADMIN_EMAILS`
- `STORE_ORDERS_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `USER_COOKIE_NAME`
- `USER_COOKIE_SECRET`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The tracked `.env.example` contains only a subset. The ignored `.env.local` was inspected by variable name only and also contains only a subset. No secret value is reproduced in this audit. A tracked-file pattern scan found no committed private-key block, JWT-like token, or obvious literal API credential; the service-role assignment in `README.md` is a placeholder, not a detected credential.

## Notable concentration and complexity

The codebase is a modular monolith at deployment level but has several large client/controller files. The largest areas are the legacy and V2 Baraonda schedulers, MoviBack page, home page, store administration, tournament administration, public circuit page, store page, live tournament dialog, fixed-pair wizard, and score console. Business rules are primarily embedded directly in route handlers and large client components rather than a shared domain/service layer.
