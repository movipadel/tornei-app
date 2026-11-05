# Staff Push Routing V1

Local implementation; no production migration, configuration or transport activation has been performed.

## Configuration

Admin → Operatori → Notifiche Staff (`/admin/users/notifiche`). Each operator has event-level checkboxes grouped into Gioca, Allenati, MoviBack, Store and Tornei. Multiple operators can receive an event. Readiness is a boolean; no endpoint or key is exposed. An inactive operator with enabled rules is shown only for cleanup.

The existing `staff_notification_responsibilities` table evolves from `responsibility_key` to `event_key`, retaining its composite primary key, timestamps, activation state, FK and restricted ACL/RLS. The migration refuses nonempty category assignments rather than guessing event subscriptions. No assignments are seeded. Categories are derived from `staffPushCatalog.ts`.

Permissions and routing are independent. Active Admin/Staff accounts with explicit enabled rules are eligible; Admin has no implicit notification subscription. Existing application page permissions still govern access after opening a push.

`GET /api/admin/staff-notifications` returns configuration/readiness to Admin only. `PUT` replaces one operator's enabled rules transactionally, validates UUID/event keys, checks Origin and resolves the actor from the server session. The SQL RPC rechecks active Admin and recipient eligibility. Removing rules sets them inactive; history rows remain. Concurrent updates to the same operator serialize, with the last save winning.

## Event catalog and producer cutover

| Key | Authoritative producer | Destination |
| --- | --- | --- |
| requests.gioca.received | successful insert in `/api/user/requests` | `/admin/requests` |
| requests.allenati.received | same insert, Allenati type | `/admin/requests` |
| moviback.membership.requested | successful non-replayed membership RPC/readback | `/admin/moviback/requests` |
| moviback.reward.requested | existing reward notification gates, both redemption paths | `/admin/moviback` |
| store.order.received | existing post-commit valid/readiness gated order path | `/admin/store-orders` |
| tournament.registration.created | successful nonreserve registration insert | `/admin/tournaments` |
| tournament.reserve.created | successful reserve insert | `/admin/tournaments` |
| tournament.registration.cancelled | existing successful cancellation flow | `/admin/tournaments` |
| tournament.reserve.promoted | existing successful promotion transition | `/admin/tournaments` |

All seven former direct legacy push call sites now call `enqueueStaffPushEvent`. Gioca/Allenati add a separate post-commit push task. Telegram calls, messages, recipient selection and scheduling remain unchanged. Customer email and customer push producers are unchanged. Assigned-master notification is out of scope.

## Delivery and safety

Shared catalog templates provide titles and same-origin existing destinations. The body is deliberately generic and contains no personal or business-sensitive details. Business callers supply neither recipient IDs nor push display content.

The shared enqueue RPC resolves rules on the server and atomically creates an event per recipient plus a `push` delivery. Idempotency is `staff-push:<event>:<aggregate>:<recipient>`; promotion identity includes the cancellation and promoted registration IDs. Replays never create a second delivery. No recipients means no events. No active device yields a terminal skipped delivery with `no_active_subscription`.

The Foundation worker creates per-device targets and rechecks current active routing/ownership before sending. Accepted devices are not retried. Revoked devices, disabled accounts and disabled rules are ineligible. Existing stale-endpoint and retry limits remain in effect. No new transport or service worker is introduced.

Enqueue runs in isolated post-commit notification callbacks: failures are logged and do not fail committed business operations. This retains the existing best-effort post-commit scheduling limitation: a process crash before enqueue can lose the alert; this release does not introduce transactional business outboxes or retroactive replay.

## Observability

Events identify event key, aggregate and staff recipient. Delivery status distinguishes pending/skipped/failed/accepted; device targets retain provider acceptance and error states. A missing event with no matching rules is expected. Provider acceptance does not prove human receipt. No click tracking is added.

## Pilot rollout

1. Run the SELECT-only production precheck in a read-only transaction. Require Foundation present, no category assignments, no active ownerless legacy rows and acceptable locks.
2. Review and separately authorize migration/deployment; no production operations are part of this task.
3. Admin configures selected recipients. Verify their operational permissions and device enrollment.
4. Separately authorize canonical worker configuration (`PUSH_BUSINESS_TRANSPORT=canonical`, `PUSH_DELIVERY_ENABLED=true`, `PUSH_TRANSPORT=web-push`) and its authenticated scheduling. No environment configuration is changed here.
5. Observe one controlled event and delivery targets. Keep Telegram parallel. Disable routing/transport to pause the pilot; never reactivate legacy subscriptions.

Local validation uses rollback-only synthetic fixtures and mocked transports; no real push, Telegram or email is sent.
