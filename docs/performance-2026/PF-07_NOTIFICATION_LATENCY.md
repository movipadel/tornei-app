# PF-07 — Notification latency

## Status and scope

PF-07 is implemented on `performance/foundation-2026`. The targeted audit found five request paths that waited for external notification providers after their business mutations. All discovered notifications are informational, best-effort post-commit side effects. They now run through Next.js `after()` and no longer delay the HTTP response.

The work does not change schema, migrations, dependencies, authentication, authorization, recipients, message bodies, transaction rules, points, stock, order creation, tournament rules, or response bodies/statuses. No checkout, redemption, registration, cancellation, membership mutation, email, Telegram message, or web push was executed during validation.

## Synchronous paths discovered

The scan was limited to notification helpers and their API callers, as required. `sendStoreOrderEmail`, `sendTelegramMessage`, and `sendAdminPushNotification` have no other callers under `src`.

| Endpoint | Business operation and notification eligibility point | Providers previously awaited | Previous provider-failure semantics | Classification |
|---|---|---|---|---|
| `POST /api/store/orders` | After Store order/item writes, optional points write and stock-update attempts | Resend email, Telegram, admin web push | Email failure logged separately; Telegram/push failure ignored, but a thrown Telegram failure suppressed push; HTTP still succeeded | B — post-commit side effect |
| `POST /api/moviback/rewards/redeem` | Only on the Store-order branch, after redemption/ledger/stock work and successful Store order creation; Store item failure was already warning-only | Telegram, admin web push | Shared catch; a thrown Telegram failure suppressed push; HTTP still succeeded | B — post-commit side effect |
| `POST /api/tournaments/[id]/registrations` | After successful `tournament_registrations` insert | Telegram, admin web push | Separate catches; neither failure changed the `201` response | B — post-commit side effect |
| `DELETE /api/registrations/[id]` | After deletion, optional reserve promotion, position renumbering attempt, and the notification-only current-count read | Telegram cancellation plus optional promotion; push cancellation plus optional promotion | Provider groups had separate catches; notification failure did not reverse deletion/promotion or change HTTP success | B — post-commit side effect |
| `POST /api/moviback/request-membership` | New request: after certificate upload, membership insert and certificate insert. Resubmission: after certificate upload, membership update and certificate insert | Telegram, admin web push | Shared catch; a thrown Telegram failure suppressed push; HTTP still succeeded | B — post-commit side effect |

“Post-commit” describes the notification boundary, not a database transaction guarantee. These handlers use multiple independent Supabase operations and compensating deletes rather than one committed SQL transaction. PF-07 did not alter that pre-existing design.

No category-A notification was found: no response, order, redemption, registration, cancellation, or membership outcome depended on provider success. No category-C path remained after tracing the existing catches and response construction. The staff points-accreditation endpoint does not call an external notification provider and was deliberately left unchanged.

## Exact implementation

`src/lib/postCommitNotifications.ts` provides one narrow scheduling boundary:

1. `schedulePostCommitNotifications()` registers one `after(async () => ...)` callback while the Route Handler request context is active.
2. The callback owns and awaits every provider promise. There are no untracked promises or bare fire-and-forget calls.
3. Independent provider lanes run concurrently with `Promise.all`.
4. Every lane catches and logs its own failure, so a Telegram outage cannot suppress email or push and one rejected lane cannot create an unhandled rejection.
5. Multiple messages to the same provider remain ordered: cancellation precedes promotion within the Telegram lane and within the push lane.

Each route calls the scheduler only after the same successful mutation boundary that previously preceded its notification awaits. Triggering conditions are unchanged: redemption notifications still require successful Store order creation, promotion notifications still require an actual promotion, and membership resubmission/new-request messages remain distinct.

Provider recipient selection and content remain in the existing helpers/call sites. The admin-push helper still loads active subscriptions, sends to them concurrently, and deactivates subscriptions returning `404`/`410`. No retries were added.

## Before and after latency stages

These are static architectural stages, not live provider measurements.

| Flow | Before | After |
|---|---|---|
| Store checkout | business/DB → email → Telegram → push → response | business/DB → response; tracked `after()` callback runs email ∥ Telegram ∥ push |
| Store-backed redemption | business/DB → Telegram → push → response | business/DB → response; tracked callback runs Telegram ∥ push |
| Tournament registration | business/DB → Telegram → push → response | business/DB → response; tracked callback runs Telegram ∥ push |
| Cancellation/promotion | business/DB → notification count read → Telegram lane → push lane → response | business/DB → notification count read → response; tracked callback runs Telegram lane ∥ push lane |
| Membership request/resubmission | upload/business/DB → Telegram → push → response | upload/business/DB → response; tracked callback runs Telegram ∥ push |

The main expected reduction is the entire external-provider critical path. Checkout previously paid email latency plus Telegram latency plus push latency serially. Other shared-catch paths paid Telegram plus push serially. Cancellation/promotion preserves ordering inside each provider but removes both provider lanes from response latency.

The cancellation count read remains before the response. This deliberately preserves the current post-renumber snapshot used in Telegram content and avoids moving database work into a notification-only callback during this narrowly scoped PF.

## Instrumentation

PF-06's `createRuntimePerf()` now has additive support for:

- `business_ms`, covering the complete handler operation including auth, parsing, Supabase/storage waits, transformations and response construction;
- named `external` spans for `email`, `telegram`, `push`, and `other`;
- `external_breakdown_ms` and `external_operations`.

Existing PF-06 callers remain source-compatible. Their new additive fields are zero unless they use the new span types.

Each modified endpoint emits, only when `PERF_INSTRUMENTATION=1`:

- a normal endpoint `PERF` record with `business_ms`, `total_ms`, status, and no personal/request content;
- a separate record whose constant endpoint ends in `#notifications`, with total callback time, merged external wall time, per-provider time, and provider-operation count.

Parallel spans are merged for `external_ms`; the breakdown preserves provider-specific durations. The post-commit record starts when the `after` callback starts, so it does not pretend to be response latency. The main endpoint record ends after the response object is created and does not include provider waits.

No runtime before/after provider measurements are reported. Real provider calls and production-like mutations were prohibited, and there is no safe fixture/mocked endpoint suite in the repository. Runtime operators can collect bounded staging evidence by enabling `PERF_INSTRUMENTATION=1` and comparing endpoint and `#notifications` distributions by constant route template. Performance logs contain only constant route templates, a random instrumentation ID, status, durations, counts and approximate response metadata; they do not log user/order/redemption/tournament IDs or notification content. The two records have independent random instrumentation IDs and should not be treated as directly correlated request pairs.

## Serverless lifecycle conclusion

The repository uses Next.js `16.1.5`. Next.js documents `after()` as stable since 15.1 and states that it schedules work after the response. For serverless platforms, Next.js obtains a `waitUntil` primitive that extends the invocation until registered promises settle. Vercel likewise recommends Next.js `after()` for Next.js 15.1+ rather than an unawaited promise.

References:

- [Next.js `after` API](https://nextjs.org/docs/app/api-reference/functions/after)
- [Vercel Functions API — Next.js `after`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#usage-with-next.js)

This is lifecycle-safe post-response execution, not durable job delivery. The callback remains bounded by the function's configured/default maximum duration. A platform crash, deployment interruption, or timeout can still prevent completion, and `after()` supplies neither persistence nor retry. PF-07 therefore improves response latency without claiming exactly-once or guaranteed delivery.

## Error and duplicate semantics

- Provider failure still cannot turn a successful business mutation into an HTTP error, matching existing user-visible behavior.
- The response now necessarily precedes knowledge of delivery success; this is safe because every notification was already best-effort and warning/error-only.
- A failure in one provider no longer prevents an independent provider from being attempted. This is the only deliberate failure-path refinement and better preserves the intended notification set.
- Telegram's helper resolves with `{ ok: false }` on provider-level rejection and logs internally; it does not throw. PF-07 retains that behavior.
- No retry was introduced. Duplicate HTTP requests retain the application's existing mutation/duplicate-prevention behavior; PF-07 schedules once per handler execution and does not add another duplication source.
- Multiple messages for cancellation/promotion remain sequential per provider, preventing promotion from overtaking cancellation within that provider.

## Paths deliberately unchanged

- All Supabase/storage mutations, compensation, query order, order/stock/points rules and tournament logic.
- Authentication and phone-based cancellation authorization.
- Provider helpers, credentials, recipients, subscriptions, templates and message content.
- The cancellation notification-count database read.
- Staff points accreditation, because it has no external notification wait.
- All API routes outside the five discovered callers.

## Validation

- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed on Next.js 16.1.5; existing Browserslist-age and `themeColor` metadata warnings remain.
- Targeted ESLint: the new helper and instrumentation utility are clean. Legacy handler files still report their pre-existing `no-explicit-any` errors and two pre-existing unused-variable warnings; no PF-07 line introduced a new diagnostic.
- Targeted static caller scan: only the five documented handlers call the three provider helpers.
- Optimized-server rejection smoke: checkout, redemption and membership returned their existing unauthenticated `401` responses; cancellation returned its existing missing-phone `400`; the all-zero tournament registration probe returned `404` when its read failed in the restricted local environment. Every route emitted the expected privacy-safe endpoint `PERF` record. No mutation reached its write boundary and no notification callback/provider ran.
- Success-path mutation/provider smoke: deliberately not executed, because the repository has no mocked mutation/provider harness and real notifications or business writes were prohibited.
- Build-generated service-worker and TypeScript build-info changes were removed after validation.

## Reliability risks and deferred durable design

Residual risk is moderate for notification delivery and low for business behavior. `after()` is tracked by the runtime, but notification delivery is still best-effort and constrained by invocation duration. There is no durable record of pending delivery, retry schedule, idempotency key per provider, dead-letter state, or operator reconciliation view.

A later, separately authorized PF should evaluate a transactional outbox design: insert a notification intent in the same database transaction as the business mutation, process it with a durable worker/queue, use a stable event/provider idempotency key, record attempts and terminal state, apply bounded backoff, and expose dead-letter/replay observability. That work requires schema and operational decisions and is intentionally excluded here.

## Files changed

- `src/lib/postCommitNotifications.ts`
- `src/lib/runtimePerf.ts`
- `src/app/api/store/orders/route.ts`
- `src/app/api/moviback/rewards/redeem/route.ts`
- `src/app/api/tournaments/[id]/registrations/route.ts`
- `src/app/api/registrations/[id]/route.ts`
- `src/app/api/moviback/request-membership/route.ts`
- `docs/performance-2026/PF-07_NOTIFICATION_LATENCY.md`

No schema, migration, dependency, configuration, lockfile, provider-helper, PWA, or unrelated file is changed.

## Rollback

1. Restore the five handlers' direct notification awaits and original catch boundaries.
2. Delete `src/lib/postCommitNotifications.ts`.
3. Restore `src/lib/runtimePerf.ts` to the PF-06 field/method set.
4. Remove this document if PF-07 is abandoned entirely.

Rollback requires no database, migration, dependency, environment, provider, or deployment change.
