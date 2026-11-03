# Notification Foundation V1 — pre-release compatibility gate

> Historical pre-decision assessment. Superseded by [LEGACY_PUSH_CUTOVER_SAFETY.md](LEGACY_PUSH_CUTOVER_SAFETY.md): the user subsequently authorized intentional legacy deactivation and explicit canonical re-enrollment. The preserved-active-row statements and BLOCKED conclusion below describe the earlier candidate, not the current migration.

2026-11-03. Local implementation and verification only. No production connection, mutation, deployment, real push, Telegram or email. No stage, commit or push.

## Finding and decision

**Initial answer: YES.** The non-sending adapter and blanket legacy row deactivation would remove all existing Admin push behavior. That was a release blocker, not a compatible foundation rollout.

**Corrected code: no blanket disable. Functional compatibility passes locally. Release remains BLOCKED.** Restoring the existing ownerless pool also retains its inherited recipient-authorization risk: for an endpoint never explicitly re-enrolled, current staff role, employment status, account switch and logout cannot be verified. There is no safe ownership inference. This supersedes the previous foundation report's zero-blocker/READY assessment; one release security blocker remains. Do not deploy this candidate on the strength of passing mocks.

## Call graph

Production behavior below is established from the repository baseline and the user's stated live behavior, not a production observation. Every producer remains unchanged relative to HEAD (line endings normalized in the regression test).

| Source | Business event | Existing production behavior | Initial foundation | Corrected pre-cutover behavior |
|---|---|---|---|---|
| `src/app/api/tournaments/[id]/registrations/route.ts:301` | Main/reserve registration | Admin push, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/registrations/[id]/route.ts:261` | Cancellation | Admin push, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/registrations/[id]/route.ts:268` | Reserve promotion | Admin push when promoted, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/moviback/request-membership/route.ts:156` | New membership request | Admin push for non-replayed request, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/moviback/rewards/redeem/route.ts:130` | RPC reward redemption | Admin push under existing created/not-replayed/notify guards, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/moviback/rewards/redeem/route.ts:516` | Legacy reward branch | Admin push, parallel Telegram | No push | Existing payload through legacy sender |
| `src/app/api/store/orders/route.ts:415` | Store order received | Admin push, parallel Telegram | No push | Existing payload through legacy sender |

All seven calls reach `src/lib/adminPush.ts`; no replacement business producer enqueues a canonical push delivery. Source assertions preserve producer guards; executable tests extract the actual payload expressions and pass them through the helper with a simulated transport. These are not end-to-end provider delivery tests.

## Transition mechanics

- The undeployed forward migration preserves existing legacy active/inactive state. It neither copies subscriptions nor assigns staff ownership. A fresh-chain synthetic active ownerless row remains active and ownerless; the canonical table remains empty.
- Default production `PUSH_BUSINESS_TRANSPORT=legacy` (including unset) preserves legacy sending. `PUSH_TRANSPORT=disabled` disables sends. Local DB/runtime tests cannot send. Legacy VAPID variable names and the old subject fallback are retained; keys are never regenerated.
- Canonical transport requires `PUSH_BUSINESS_TRANSPORT=canonical`, `PUSH_DELIVERY_ENABLED=true`, and `PUSH_TRANSPORT=web-push`. The cron returns before claiming in legacy mode. Both send functions recheck their exclusive mode. No new automatic business enqueue exists.
- Existing legacy endpoints are deduplicated per call. If an endpoint has explicitly acquired canonical ownership, inactive/revoked/customer-owned/non-Admin/disabled staff state suppresses legacy fallback. No new canonical endpoint is added to the legacy audience. 404/410 deactivates the exact legacy row and checks the update result.
- New subscription requests write only `public.push_subscriptions`; old enrollment returns authenticated 410. Staff/Admin sees the shared explicit enrollment/repair card. A newly enrolled endpoint absent from the legacy pool will not receive old business broadcasts until a separately implemented cutover. Browser enrollment is not evidence that a canonical business pilot is active.
- Transport validates provider, keys and public DNS addresses, pinning the selected address. The production endpoint/configuration population has not been inspected. Invalid or unreviewed endpoints fail closed; therefore complete live device coverage cannot be certified here.
- `/admin-push-sw.js` remains an import-only alias to `/sw.js` for already registered clients. An exact proxy exception makes this static update URL public; Admin pages and APIs remain protected. No code registers the legacy URL again. Both URLs use the canonical handlers, accepting legacy title/body/url/icon/badge and rejecting unsafe URLs. A real browser update/delivery pilot is still deferred.

The exclusive global mode prevents concurrent legacy/canonical routing in the current release. A future per-event pilot requires explicit event routing, coverage verification and a quiesced/drained cutover across deployed versions; merely flipping the global switch today would disable unmigrated legacy business events. No such cutover is authorized or implemented. This is not an exactly-once guarantee against crashes or repeated producer invocation.

## Unchanged channels

Telegram producer routes, Telegram helpers and post-commit scheduling remain baseline-identical. Customer enqueue/inbox and Monday League paths remain unchanged. The pre-existing email cron/renderer working-tree changes were retained and are outside this gate. The foundation's email claim explicitly filters email; push claims explicitly filter push. Both SQL fixtures and source contracts verify isolation. No new canonical business push events: **0**.

## Precheck and verification

[PRODUCTION_NOTIFICATION_FOUNDATION_V1_PRECHECK.sql](PRODUCTION_NOTIFICATION_FOUNDATION_V1_PRECHECK.sql) contains SELECT statements only, returning aggregates/catalog metadata without endpoints, keys or customer details. It checks counts, duplicate risks, object/column/function/trigger conflicts, FK/constraint compatibility, channels, lock exposure and VAPID configuration assumptions. It cannot inspect environment secrets or establish endpoint ownership. It was executed only against the isolated local database immediately before the target migration; production execution is deferred.

- Full authoritative Node suite: **581/581 PASS**, zero failures/skips.
- Targeted foundation + compatibility suite: **17/17 PASS** (7 compatibility tests).
- TypeScript noEmit and relevant ESLint: PASS.
- Complete fresh local chain: **64 migrations PASS**, SQL rollback assertions PASS. Local `notification_compatibility_clean` retained; active ownerless fixture count 1, canonical subscriptions count 0.
- Local DB lint: historical `public.player_identity_command` ambiguous `phone` reference only; no new function error. New RLS/ACL assertions pass.
- Production build: PASS, canonical custom worker compiled; existing metadata themeColor warnings. Filtered local environment, external transports disabled, generated worker files and prior next-env bytes restored by harness.
- `git diff --check`: PASS.

Reproduce with `node scripts/notification-foundation-local.mjs tests|build|advisors` (one mode at a time), `node --test tests/notification-compatibility.test.mjs tests/notification-foundation.test.mjs`, and TypeScript/ESLint. `fresh-compatibility` refuses to overwrite its retained database. Logs are ignored local artifacts in `.artifacts/notification-foundation/`.

## Final flags

```text
WOULD_FOUNDATION_DEPLOY_DISABLE_EXISTING_ADMIN_PUSH = NO
LEGACY_ADMIN_PUSH_COMPATIBILITY = PASS
UNIFIED_WORKER_ACCEPTS_LEGACY_PAYLOAD = PASS
NEW_SUBSCRIPTIONS_USE_CANONICAL_TABLE = YES
LEGACY_SUBSCRIPTIONS_AUTO_MIGRATED = NO
NEW_BUSINESS_PUSH_EVENTS_ENABLED = 0
DUPLICATE_PUSH_RISK = PASS
TELEGRAM_BEHAVIOR_CHANGED = NO
EMAIL_BEHAVIOR_CHANGED = NO
CUSTOMER_COMMUNICATIONS_BEHAVIOR_CHANGED = NO
PRODUCTION_PRECHECK_SQL_READY = YES
FULL_TEST_SUITE = PASS
TYPECHECK = PASS
RELEVANT_LINT = PASS
PRODUCTION_BUILD = PASS
GIT_DIFF_CHECK = PASS
NEW_RELEASE_SECURITY_BLOCKERS = 1
MOVI NOTIFICATION FOUNDATION V1 PRE-RELEASE COMPATIBILITY = BLOCKED
```

NO refers to removal of the initial blanket disable in the corrected candidate; PASS refers to local functional evidence, not certification of production recipients or provider coverage. The blocker is the inherited ownerless pool retained by compatibility. Resolve through an explicitly authorized, verified ownership/device cutover; do not silently deactivate it or infer ownership. Production precheck and a controlled-device pilot remain prerequisites for any later release decision.
