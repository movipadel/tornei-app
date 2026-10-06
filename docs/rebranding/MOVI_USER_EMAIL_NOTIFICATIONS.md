# MOVI user email notifications — V1

## Scope

V1 delivers transactional user notifications by email only. Supabase Auth continues to own signup verification, activation, resend and password recovery email; these security messages ignore the transactional preference. `users.marketing_accepted` remains the separate marketing consent and is not read or changed by this system. Telegram user delivery is explicitly deferred.

## Preference

`user_notification_preferences` stores one private row per `users` row with optimistic `version`. Existing and new users default to `transactional_email_enabled=true` because these messages report actions and service states initiated by the user. The Profile API reads and updates only the current authenticated user's row through the server service client. Turning email off leaves Auth security email, in-app notifications, business actions and staff operational notifications unchanged.

## Durable event and delivery model

`notification_events` is the channel-neutral event ledger. Its deterministic `idempotency_key` makes repeated domain triggers converge on one event. `notification_deliveries` records one row per event/channel and V1 constrains the channel to `email`. A disabled preference creates a `skipped/preferences_disabled` delivery so the audit trail explains why nothing was sent.

Gioca/Allenati request insert and meaningful status transitions enqueue through a database trigger. Tournament registration, reserve placement, promotion and cancellation do the same when the registration has a reliable `user_id`. Store order state transitions enqueue through the same outbox when `store_orders.user_id` identifies a canonical account. The trigger and business row mutation share one database transaction. Delivery happens later, so provider failure never rolls back the request, registration or Store fulfillment action.

The catalogue checkout currently writes the Store order before its item rows. Its received delivery is held in a non-sendable setup state until at least one item has been persisted, then released according to the user's current preference. If checkout cleanup deletes the incomplete order, that setup event is removed before it can be delivered. This preserves the existing checkout and staff notification behavior without sending a receipt for a failed order.

## Worker, retry and privacy

`POST /api/cron/user-email-notifications` requires `CRON_SECRET`, atomically claims at most 25 due deliveries with `FOR UPDATE SKIP LOCKED`, and recovers locks older than 15 minutes. Attempts are capped at five. Retryable failures use 5, 30, 120 and 360 minute backoff; permanent destination, template or configuration errors fail immediately. Logs store a keyed destination fingerprint and safe error codes rather than an email address or provider response body. Events and deliveries have RLS enabled and no browser-role grants.

The authoritative destination is the normalized `public.users.email` of an active user. Request payloads can never override it.

## Transport and templates

`USER_EMAIL_TRANSPORT=local` provides a synthetic, network-free receipt only when Supabase is the certified loopback instance. It rejects a real Resend credential in that environment. Production delivery requires the explicit `resend` transport, `RESEND_API_KEY` and `USER_EMAIL_FROM`. The existing Store staff email and `STORE_ORDERS_EMAIL` path remain unchanged and are never governed by the user preference.

All implemented events use one responsive MOVI HTML layout plus plain text. Copy is transactional, contains only useful domain information and excludes internal IDs, staff notes and generic marketing content.

## Implemented domains

- Gioca/Allenati: received, searching, found, completed and cancelled.
- Tournaments: confirmed registration, reserve placement, promotion and cancellation for authenticated registrations.
- Store: order received (`pending` creation), ready, delivered and cancelled for orders linked to a user account. `confirmed` and `ordered_to_supplier` remain authoritative workflow states but do not produce a V1 user email. User templates include only the order reference, item summary, customer-facing total and pickup club. Supplier costs, margins, staff notes, internal payment flags and contact snapshots are excluded.

## Deferred rollout

- MoviBack status/reward email is deferred until its command/RPC events are mapped without notifying on internal edits.
- Monday League retains its certified `league_notification_events` in-app outbox. Email mirroring is deferred to a separate integration that preserves its current idempotency keys and scanner behavior.

No Padelleria, Partner, promotion or other marketing/editorial event enters this outbox. No Telegram column, token, webhook, preference or delivery code exists in V1.

## Migrations

- `20261021100000_user_email_notifications.sql`
- `20261022100000_store_user_email_notifications.sql`
