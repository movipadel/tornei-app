# MOVI Notification Foundation V1

> Current release policy: [authorized legacy cutover](LEGACY_PUSH_CUTOVER_SAFETY.md). The unreleased migration now deactivates every active legacy row without deleting or assigning ownership. Explicit owned re-enrollment is required; business push remains disabled pending a later pilot. Earlier compatibility discussion and flags below are retained as historical evidence and superseded by that report.

2026-11-03 — local implementation only. No deployment, production mutation, Web Push, Telegram or email send. No new business push event is enabled. Telegram producers and transport are unchanged.

## Scope and architecture

The legacy enrollment API returns an authenticated `410 PUSH_REENROLL_REQUIRED`. The deprecated sender preserves existing legacy business pushes in the default production legacy mode; the migration preserves existing row state without assigning ownership. New enrollments use only the owned table. **The subsequent [compatibility gate](NOTIFICATION_FOUNDATION_V1_COMPATIBILITY_GATE.md) supersedes the original READY assessment: release is BLOCKED by the unresolved ownerless legacy recipient risk.**

```text
Existing customer business transitions
  -> notification_events
  -> notification_deliveries(email) -> existing email consumer, email-only claim
  -> NO automatically created push delivery

Future explicitly enabled, reviewed event recipient
  -> enqueue_push_delivery(event_id, enabled=true)
  -> notification_deliveries(push)
  -> protected, disabled-by-default consumer
  -> active recipient + preference/responsibility/permission checks
  -> push_delivery_targets (one per owned endpoint)
  -> validated VAPID transport -> /sw.js custom push handler -> safe relative CTA
```

Customer recipients use `public.users.id`; staff recipients use `public.staff_users.id`. `notification_events` now permits exactly one of `recipient_user_id` and `recipient_staff_user_id`. Existing customer event creation remains unchanged. There is no new Gioca, Allenati, Tournament, Store, MoviBack or Monday League producer and no new cron schedule.

## Migration and local target

Forward migration: `supabase/migrations/20261103201543_notification_foundation_v1.sql`, generated with Supabase CLI. Historical migrations were not edited.

Before DB operations, the connection was pinned to `127.0.0.1:55422`, and Docker mapping confirmed `supabase_db_tornei-app` exposes local port 55422 to its internal PostgreSQL port 5432. The returned server address is the container address, not a production host. No `.env.audit.local` was loaded. Local tests/build use a filtered environment; the build harness bypasses repository env files entirely.

The migration was applied to the current local database with psql to exercise upgrade. Fresh-chain verification used a separate local `notification_foundation_clean` database: only schema definitions were copied to establish Supabase-managed prerequisites, the application `public` schema was removed in that isolated database, then all **64 forward migrations** were applied in order, followed by synthetic tests with rollback. Managed schema owners/ACLs must be preserved; omitting them initially caused bootstrap/Storage permission errors, resolved in the local harness. No current local database reset or production migration was performed. The isolated database is retained for inspection.

## Owned subscriptions and API security

`push_subscriptions`: UUID PK; unique endpoint; p256dh/auth; nullable public_user_id/staff_user_id FKs with `num_nonnulls(...)=1`; is_active, revoked_at, last_seen_at, user_agent, created_at, updated_at. The owner constraint applies to revoked rows too. No speculative device/platform/key-version fields were added.

RLS is enabled, all PUBLIC/anon/authenticated privileges revoked, and service_role granted the server-required CRUD access. Privileged functions have explicit execute revocations/grants. No browser can directly insert a subscription or choose an owner. The existing service-role helper is called only from server-only foundation modules/routes.

Both APIs accept same-origin JSON POST with `action=subscribe|status|revoke`:

- `/api/user/push`: resolve current canonical customer identity; reject conflicting sessions.
- `/api/staff/push`: resolve current active Staff/Admin account through the DB-authoritative operator resolver.

Client owner IDs, roles and unknown top-level fields are rejected. Strict Origin is required. Content-Type must be application/json. Both declared length and streamed body are bounded at 4096 bytes. Endpoint length is capped at 2048; HTTPS, no credentials, no custom port, no fragment and a nonempty provider path are required.

The reviewed provider allowlist is `fcm.googleapis.com`, `web.push.apple.com`, `updates.push.services.mozilla.com`, and a single subdomain of `notify.windows.com`. This intentionally rejects arbitrary HTTPS URLs, IP literals, localhost/private targets and lookalike domains. Supporting another push provider requires a reviewed allowlist change; standards compatibility does not justify an arbitrary outbound relay. At send time DNS addresses are checked again and the selected address is pinned in the HTTPS agent to prevent a second lookup/rebinding. IPv4 private/link-local/loopback/shared/multicast ranges and non-global IPv6 are rejected. p256dh must decode to a valid uncompressed 65-byte P-256 point; auth must decode to 16 bytes with canonical base64url encoding.

`manage_push_subscription` serializes owner and endpoint updates. Another account cannot replace even a revoked endpoint. This is a 409 ownership conflict, not a rebind. Re-enrollment explicitly unsubscribes the old browser capability and asks the browser for a fresh endpoint; it never moves the existing row to the new account. If a browser reuses the conflicting endpoint, the server continues to reject it. The old row is never guessed or silently attached to the current session.

## Lifecycle, logout, merge and multi-device

Multiple endpoints may belong to the same identity; endpoint uniqueness is global. Status checks reconcile actual browser subscription with server state and refresh the current-device HttpOnly cookie from the atomically returned subscription ID.

Explicit logout revokes the cookie-identified device **only when it matches the currently authenticated owner**, before clearing the account session. An update failure is checked and prevents a false successful logout; the Home/Admin logout controls show a retry message instead. No cookie means no reliable current-device association, so no account-wide revocation is attempted. Expired or already invalid identity cannot be used to authorize arbitrary revocation; dispatch independently excludes inactive identities. Browser permission can remain granted: it is never treated as ownership. A subsequent account sees mismatch/inactive state and can re-enroll.

Customer canonical merge integration is an AFTER trigger on the existing merge engine's authoritative users identity transition. It transfers source-owned subscriptions inside the same transaction, locks/checks the active canonical user, preserves revoked state and keys, and leaves staff subscriptions alone. Global endpoint uniqueness makes duplicate endpoint rows impossible; conflict insertion is tested. No historical push event is replayed or re-addressed by merge. A pending event addressed to the now-merged source becomes ineligible rather than being accidentally resent.

404/410 outcomes atomically deactivate the exact subscription and mark its target failed. The update result is checked. Other transient provider failures receive bounded target retries; terminal endpoints are never retried. Re-enrollment can reactivate only an endpoint owned by the same account. No unreliable background pushsubscriptionchange handler was added; reconciliation occurs during explicit enrollment/status repair.

## One canonical service worker

`worker/index.ts` is the authoritative custom worker consumed by next-pwa. Its existing activation cache cleanup is preserved. It handles push and notificationclick. The old `/admin-push-sw.js` URL remains a public compatibility alias importing `/sw.js`; no manual competing registration remains. Generated files were not hand-edited; the local build harness restores their original bytes after verification. Build output confirms custom worker bundling under root `/sw.js`, scope `/`.

The enrollment flow waits for `navigator.serviceWorker.ready`, then requires an active `/sw.js` registration at root scope. It does not create a second registration. A bounded wait produces repair guidance instead of hanging indefinitely; normal development mode still has PWA disabled by the existing configuration, so full worker enrollment requires the built PWA. Existing legacy worker clients must load the updated application and let the canonical registration activate; UI reports repair until that happens.

Deep links accept root-relative same-origin URLs only. Absolute URLs (even same-origin), protocol-relative URLs, backslashes and whitespace/control-character forms fall back to `/`. Notification click prefers an exact matching window, otherwise awaits navigation and focus of an application window, and opens a new window only when needed. Navigation failures have a fallback. Push display supports safe relative legacy icon/badge fields with application defaults, bounded title/body and a safe generic message. The existing communications/read-state center is unchanged; no second customer inbox was created.

## Delivery model and retry semantics

General deliveries now allow email and push. The existing email claim RPC retains its name/signature and five-attempt policy, adding an explicit `channel='email'` predicate. `claim_push_deliveries` explicitly selects push. Existing email enqueue/preference/readiness/certificate logic was not replaced.

`push_delivery_targets` has delivery/subscription FKs, unique(delivery_id,subscription_id), pending/processing/retry/accepted/failed/skipped status, attempts 0–5, scheduling/lease fields, provider_accepted_at, sanitized error code/message and timestamps. The first claim fixes the current eligible device set; new devices are not added to an existing nonempty target set. Accepted devices are excluded from later claims. Ineligible or revoked recipients are skipped, including after their targets were initially materialized.

Targets retry after 5, 30, 120 and 360 minutes. Attempt five is terminal. 404/410 and other nontransient rejections fail without retry; 429, 5xx and transport failures are bounded retries. Processing leases can be reclaimed after 15 minutes, with worker ownership checked at finish. A crash after external acceptance but before DB acknowledgement can still cause an at-least-once duplicate: Web Push has no transactional exactly-once primitive. This limitation is distinct from the tested guarantee that a target already persisted as accepted is not resent because another device failed.

Parent aggregation: any pending/processing/retry target -> retry with earliest next due time; otherwise any failed target -> failed (even if other devices accepted); otherwise at least one accepted -> accepted; otherwise skipped. No targets -> skipped. The existing parent delivered_at is not populated for push acceptance. Per-target provider_accepted_at is the acceptance evidence; it is never named read/seen/human-delivered.

`POST /api/cron/push-notifications` requires timing-safe CRON_SECRET bearer authorization. It accepts no caller-selected recipient or arbitrary payload. It returns enabled:false without claiming anything unless a later rollout explicitly selects `PUSH_BUSINESS_TRANSPORT=canonical`, `PUSH_DELIVERY_ENABLED=true` and `PUSH_TRANSPORT=web-push`. Canonical mode excludes legacy sending. The transport additionally requires production runtime and rejects a local Supabase target. Local tests inject a mock sender; the route does not expose that injection mechanism. No real worker send occurred in this task.

Before any future business pilot, apply channel-neutral domain validity rules (e.g. Store complete-item readiness and current certificate milestones) and reviewed templates/CTAs. Foundation deliberately does not enroll every current event into push. `enqueue_push_delivery` defaults its explicit enable argument to false and is service-role-only.

## Preferences, staff responsibility and enrollment UX

Customer `transactional_push_enabled` is per public user and defaults **false** for this foundation. This is intentionally stricter than the optional true default: the pilot is not enabled and application opt-in stays distinct from browser permission and marketing consent. Profile can change email and push preferences using the existing optimistic version check. Existing callers that only update email do not reset push preference.

Staff can enroll/revoke their own devices; device is_active/revoked_at is the minimal staff transport opt-out. No account/category preference matrix is introduced. `staff_notification_responsibilities` stores staff FK, responsibility_key, is_active and timestamps; keys are requests_gioca, requests_allenati, moviback, store. **No rows are seeded from names or permissions.** Staff eligibility at dispatch requires active staff identity, a matching active responsibility and relevant operational permission; an explicitly admin-scoped future event requires current Admin role. Permissions are access constraints, not automatic notification ownership.

ALLENATI_ASSIGNED_MASTER_PUSH = OUT_OF_SCOPE_FOUNDATION_V1. A later phase needs an authoritative assignee, assignment transition, staff/master identity link and audit. No routing producer for any named person or business domain was added.

The same enrollment card is available on Profile, Admin and Staff. It shows unsupported, available, denied, active, repair and account-conflict states. It never prompts on mount. Granted browser permission does not hide repair when subscription/server state is missing. VAPID mismatch triggers safe browser renewal; ownership conflict requires explicit new enrollment rather than API rebinding. iOS/iPadOS non-standalone environments receive concise Home Screen installation guidance, without a modal or a promise of Safari-tab push. Real iOS/Android/macOS delivery remains a later controlled-device pilot; current tests use browser mocks and worker execution mocks, without provider subscription calls.

VAPID names remain NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. The transport has a server-only boundary. Preflight checks presence, library validation and that private/public P-256 keys match; errors do not include key values. It does not log secrets. The public key remains a client build-time setting and must match the server key at future rollout.

## Observability and deferred work

Delivery creation, target claims/attempts, accepted timestamps, retry deadlines, terminal failure and endpoint_404/endpoint_410 lifecycle outcomes are durable rows. Provider errors are sanitized, without endpoint/key/customer payload logging. Click tracking is DEFERRED; no claim of true device delivery is made. A future staff inbox needs staff recipient/read/action/acknowledgement state and domain-owned resolution; none is built here. Monday League and existing communications/read_at/dismissed_at/CTA remain unchanged.

## Legacy Admin push deprecation plan

1. Review and separately authorize production cutover; do not deploy this task automatically.
2. Preserve the old table and active state, retiring only new legacy enrollment. Never copy endpoints with guessed ownership. The deprecated sender remains functional pre-cutover. Resolve the ownerless recipient release blocker before deployment.
3. Deploy only after the gate is resolved; require explicit owned re-enrollment and verify device coverage. New canonical-only endpoints do not automatically join legacy business broadcasts.
4. Introduce a separately reviewed small pilot through canonical event/delivery hooks, validating business readiness, staff responsibilities and safe deep links. Run Telegram in parallel and observe failures/acknowledgements.
5. Remove old table/adapter only after the pilot and rollback window. Never maintain two active broadcasters. Rollback must not automatically reactivate ownerless endpoints; use Telegram until a safe owned path is restored.

Suggested next customer pilot: request_found, tournament_promoted, moviback.agreement.activated. Suggested staff pilot: Gioca/Allenati intake, membership request, Store order received; assignment-based Allenati and anomaly escalation remain separate work.

## Verification evidence

- Upgrade on the verified local database: PASS.
- Clean application schema + complete 64-migration chain on isolated local database: PASS.
- Synthetic SQL tests with rollback on both databases: ownership/XOR/FKs, endpoint conflict, event/delivery/target replay, channel isolation, single-device and multi-device accepted/retry isolation, 404/410 revocation, active responsibility/permission/staff eligibility, canonical merge, revoked preservation, global uniqueness, API-role ACL restrictions: PASS.
- Foundation Node tests: validation/size/owner injection/auth/origin, logout ownership, mock consumer outcomes including 404/410/transients, key mismatch, local-send block and preflight, executable worker click cases, customer/staff UI state and renewal mocks: PASS.
- Full repository Node suite (tests/*.test.mjs and supabase/tests/*.test.mjs), including existing email/notification and local DB concurrency/security tests: **574/574 PASS**, zero failures/skips. Ten foundation tests include executable browser/worker mocks.
- TypeScript noEmit: PASS. Relevant ESLint: PASS after correcting a test-local variable name. Production build: PASS; canonical PWA worker compiled, with existing metadata themeColor warnings only.
- DB lint: known historical `player_identity_command` ambiguous phone reference only; no new function lint error. RLS/ACL assertions for new objects pass.
- Generated PWA artifacts and pre-existing next-env.d.ts change are preserved by the final build harness; no source-controlled generated PWA edit is part of this change.
- Final compiled client assets contain no VAPID_PRIVATE_KEY or SUPABASE_SERVICE_ROLE_KEY reference. No private key value was read or printed.

Reproducible commands: `node scripts/notification-foundation-local.mjs tests`, `sql`, `build`, `advisors`. `fresh` deliberately refuses to overwrite an existing inspection database. Logs are local ignored artifacts under `.artifacts/notification-foundation/`. No staging, commit or push was performed.

## Exact task file list

Modified:

- `src/app/admin/page.tsx`
- `src/app/api/admin/logout/route.ts`
- `src/app/api/admin/push/subscribe/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/user/logout/route.ts`
- `src/app/api/user/notification-preferences/route.ts`
- `src/app/page.tsx`
- `src/app/profilo/page.tsx`
- `src/app/staff/page.tsx`
- `src/components/AdminLogoutButton.tsx`
- `src/components/NotificationPreferencesCard.tsx`
- `src/lib/adminPush.ts`
- `worker/index.ts`

Compatibility follow-up: `public/admin-push-sw.js` is a handwritten import alias; `src/proxy.ts` permits only that exact static URL before authentication.

Added:

- `docs/rebranding/NOTIFICATION_FOUNDATION_V1.md`
- `scripts/notification-foundation-local.mjs`
- `src/app/api/cron/push-notifications/route.ts`
- `src/app/api/staff/push/route.ts`
- `src/app/api/user/push/route.ts`
- `src/components/PushEnrollmentCard.tsx`
- `src/lib/pushApi.ts`
- `src/lib/pushClient.ts`
- `src/lib/pushDelivery.ts`
- `src/lib/pushTransport.ts`
- `src/lib/pushUrl.ts`
- `src/lib/pushValidation.ts`
- `supabase/migrations/20261103201543_notification_foundation_v1.sql`
- `supabase/tests/notification_foundation_v1.sql`
- `tests/notification-foundation.test.mjs`

Pre-existing changes in .gitignore, next-env.d.ts, the email cron/renderer and earlier untracked reports/SQL/tests are not part of this task and were retained.

## Final status

```text
LOCAL_DB_VERIFIED = YES
UNIFIED_SERVICE_WORKER = YES
LEGACY_ADMIN_WORKER_REGISTRATION_REMOVED = YES
SERVICE_WORKER_SCOPE_CONFLICT_FIXED = YES
DEEP_LINK_SAME_ORIGIN_ENFORCED = YES
OWNED_PUSH_SUBSCRIPTIONS_IMPLEMENTED = YES
PUSH_SUBSCRIPTION_TABLE = public.push_subscriptions
CUSTOMER_OWNERSHIP = PASS
STAFF_OWNERSHIP = PASS
MULTI_DEVICE_SUPPORT = PASS
LEGACY_OWNERLESS_SUBSCRIPTIONS_AUTO_ASSIGNED = NO
LEGACY_ADMIN_PUSH_DEPRECATION_PLAN = BLOCKED_PENDING_SAFE_CUTOVER
S1_OWNERLESS_BROADCAST_FIXED = CANONICAL_ONLY; LEGACY_UNRESOLVED
S2_ENDPOINT_VALIDATION_FIXED = PASS
NEW_PUSH_SECURITY_BLOCKERS = 1 (legacy compatibility reopens inherited ownerless risk)
CUSTOMER_SUBSCRIBE_FLOW = PASS
CUSTOMER_UNSUBSCRIBE_FLOW = PASS
STAFF_SUBSCRIBE_FLOW = PASS
STAFF_UNSUBSCRIBE_FLOW = PASS
ACCOUNT_SWITCH_SAFETY = PASS_FOR_OWNED_SUBSCRIPTIONS; OWNERLESS_LEGACY_UNRESOLVED
STALE_SUBSCRIPTION_HANDLING = PASS
MERGE_PUSH_HANDLING = PASS
VAPID_MISMATCH_RECOVERY = PASS
NOTIFICATION_DELIVERY_PUSH_CHANNEL = YES
EMAIL_CLAIM_CHANNEL_FILTER = PASS
PUSH_CLAIM_CHANNEL_FILTER = PASS
PUSH_DELIVERY_TARGETS_IMPLEMENTED = YES
MULTI_DEVICE_RETRY_ISOLATION = PASS
STAFF_RESPONSIBILITY_FOUNDATION = YES
ALLENATI_ASSIGNED_MASTER_PUSH = OUT_OF_SCOPE
CUSTOMER_NOTIFICATION_CENTER_REUSED = YES
NEW_CUSTOMER_INBOX_CREATED = NO
CUSTOMER_PUSH_PREFERENCE = YES
STAFF_PUSH_PREFERENCE = YES (per-device enrollment/revocation)
PUSH_SEND_OBSERVABILITY = PASS
PUSH_CLICK_TRACKING = DEFERRED
TRUE_DELIVERY_CLAIMED = NO
NEW_BUSINESS_PUSH_EVENTS_ENABLED = 0
TELEGRAM_CHANGED = NO
NEW_MIGRATIONS = 20261103201543_notification_foundation_v1.sql
FULL_TEST_SUITE = PASS (581/581 compatibility follow-up)
TYPECHECK = PASS
RELEVANT_LINT = PASS
PRODUCTION_BUILD = PASS
GIT_DIFF_CHECK = PASS
DB_ADVISORS = KNOWN_HISTORICAL_ONLY
PRODUCTION_CHANGE = NOT_EXECUTED
PUSH_SENT = NO
EMAIL_SENT = NO
TELEGRAM_SENT = NO
MOVI NOTIFICATION FOUNDATION V1 = BLOCKED (see compatibility gate)
```

The original local foundation verification is retained above as historical evidence. The compatibility gate is the current release assessment; passing mocks does not establish current authorization of ownerless production endpoints.
