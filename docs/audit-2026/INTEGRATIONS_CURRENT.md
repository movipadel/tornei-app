# MOVIPadel integrations (current)

## Supabase

Supabase is the primary persistence platform:

- PostgreSQL via `@supabase/supabase-js`;
- object storage for certificates and public images;
- database RPC for staff password verification and setting;
- service-role access from Next.js route handlers.

Relevant environment names: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

The public anon client exists but no consumer was found. No Supabase Auth, Realtime subscription, Edge Function invocation, CLI project folder, migration, or generated database type was found. “Supabase functions” in the current repository are limited to the two PostgreSQL RPC calls; no Supabase Edge Functions are present.

## Telegram Bot API

`sendTelegramMessage` performs direct HTTPS `sendMessage` calls. It is used for operational alerts including tournament registrations/cancellations/reserve promotion, MoviBack applications, store orders, and reward redemptions. Missing configuration causes a logged skip; delivery errors are logged and generally do not fail the core operation.

Environment names: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

No webhook receiver, message queue, retry worker, delivery audit table, or rate-limit handling was found.

## Resend

Resend sends an HTML email when a store order is created. The destination is configured and the current sender identity is hard-coded in the helper. Email failure is caught after order creation and does not fail checkout.

Environment names: `RESEND_API_KEY`, `STORE_ORDERS_EMAIL`.

No template service, delivery status webhook, retry queue, or email audit record was found.

## Web Push / VAPID

Admin browser subscriptions are stored in `admin_push_subscriptions`. Server code uses `web-push` with VAPID keys to notify all active subscriptions. HTTP 404/410 delivery failures deactivate subscriptions. A dedicated `public/admin-push-sw.js` displays notifications and navigates/focuses an admin URL on click.

Environment names: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

Subscription creation is admin-guarded. A test route directory exists in the repository structure, but it was not part of the route-method inventory because no tracked `route.ts` was present there.

## PWA / Workbox

`@ducanh2912/next-pwa` generates service-worker assets into `public`. PWA is disabled in development. The generated worker precaches build assets and runtime-caches pages, RSC responses, static assets, GET API responses, and cross-origin requests. `manifest.ts`, app icons, Apple metadata, and `InstallAppPrompt` provide installability.

This is browser/PWA architecture only; no native mobile wrapper exists.

## Poster rendering

Tournament poster API uses React/Satori to render SVG-like layout and `@resvg/resvg-js` to rasterize. Next config declares the Resvg packages as server externals. Templates and fonts are local under `public/posters` and `public/fonts`.

## QR generation/scanning

- `qrcode.react` renders membership and reward-redemption QR codes.
- `@yudiel/react-qr-scanner` accesses the camera in `/staff/scanner`.
- Reward QR tokens are cryptographically random and map to public token detail URLs; status mutation requires staff/admin.

No external QR service is used.

## Hosting, domain, DNS, source control

README documents:

- Vercel hosting;
- GitHub repository with automatic CI/CD;
- Hostinger DNS;
- production at `tornei.movipadel.it`.

`next.config.ts` redirects the Vercel default hostname to `tornei.movipadel.it`. Root application metadata and canonical/Open Graph URLs instead use `app.movipadel.it`. No Vercel project file, CI workflow, DNS configuration, or infrastructure-as-code is committed, so deployment linkage and the intended canonical domain require external verification.

## External navigation links

- Wansport venue booking links for five clubs;
- Google Maps query links for club locations;
- WhatsApp `wa.me`, telephone, and email contact links;
- Instagram and Facebook profiles.

These are static outbound links. There is no Wansport/Google/Meta API integration or data synchronization in the repository.

## Environment-variable coverage (names only)

| Integration/area | Names |
|---|---|
| Supabase | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Staff/admin cookies | `STAFF_COOKIE_NAME`, `STAFF_COOKIE_SECRET`, `ADMIN_COOKIE_NAME`, `ADMIN_COOKIE_SECRET` |
| User cookie | `USER_COOKIE_NAME`, `USER_COOKIE_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Resend | `RESEND_API_KEY`, `STORE_ORDERS_EMAIL` |
| Web Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Store economics | `STORE_ECONOMICS_ADMIN_EMAILS` |
| Runtime | `NODE_ENV` |

The tracked example does not enumerate all names used by source. No values are included here.

## Integration failure behavior

Telegram, email, and push are mostly invoked after database writes and are intentionally best effort. This protects user operations from notification outages, but there is no durable outbox or retry mechanism, so missed notifications are not recoverable from repository-visible infrastructure. Supabase failures are generally returned synchronously as HTTP errors; multi-write flows may attempt local compensation.
