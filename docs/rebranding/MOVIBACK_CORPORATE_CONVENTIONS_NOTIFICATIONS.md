# MoviBack corporate conventions — C7 user email notifications

## Scope

C7 adds transactional user email for three convention outcomes only:

- `moviback.agreement.activated`;
- `moviback.agreement.not_activated`;
- `moviback.agreement.revoked`.

It reuses the certified `notification_events` / `notification_deliveries` outbox, the shared MOVI renderer, the existing worker, preference resolution, retry policy and local synthetic transport. It adds no parallel delivery system.

Telegram, marketing, Partner offers, push, public company pages, automatic expiring/expired messages and scheduling cron jobs remain deferred.

## Authoritative producers

The producer is an `AFTER INSERT` trigger on the append-only convention audit log. Audit rows are inserted by the authoritative C3–C5 RPC in the same database transaction as the business transition. Creating the notification event is therefore atomic with the outcome, while email delivery remains asynchronous.

| Outcome | Authoritative audit transition | Notification |
| --- | --- | --- |
| Existing-member C4 code activation | `entitlement_activated` | activated |
| C5 approval with valid reservation | `entitlement_activated_on_membership_approval` | activated |
| C3 immediate Admin assignment | `entitlement_assigned`, active and effective | activated |
| C5 approval with invalid code/agreement | `entitlement_not_activated_on_membership_approval` | not activated |
| Admin revoke of an entitlement that was active and effective | `entitlement_revoked` | revoked |

Scheduled Admin assignments do not send an activation email. Pending or never-active entitlement closure does not send a termination email. Reads, reporting and UI rendering never produce notifications.

## Idempotency

The stable keys are:

- `moviback.agreement.activated:entitlement:<entitlement_id>`;
- `moviback.agreement.not_activated:entitlement:<entitlement_id>`;
- `moviback.agreement.revoked:entitlement:<entitlement_id>`.

The outbox uniqueness constraint and unique delivery per event/channel make RPC replay produce one event and one email delivery.

## Preference and failure isolation

`transactional_email_enabled=true` creates a pending email delivery. When disabled, the event is retained and its delivery is created as `skipped` with `preferences_disabled`. The business transaction still succeeds.

Provider work happens only in the shared asynchronous worker. A provider or template failure updates the delivery through the existing retry/failure policy and cannot roll back activation, revocation, membership approval or a `not_activated` outcome.

Security/Auth email and marketing consent are separate from this preference.

## Recipient and merge safety

The producer starts from the entitlement membership, resolves its linked user through `resolve_canonical_user_id`, and only targets an active canonical profile. It never uses a code, request email or agreement metadata as an address. A historical merged identity therefore resolves to one canonical user, event and delivery.

The worker uses the existing authoritative `public.users` email lookup immediately before delivery, so no address is copied into the event payload.

## Templates

All three templates use the shared responsive MOVI transactional layout and text fallback.

- **Activated:** agreement name, multiplier and real effective dates; explicitly states that only future eligible credits use the multiplier and existing points were not modified.
- **Not activated:** states that membership approval succeeded, the convention did not activate, no code multiplier is active and existing points were not changed.
- **Revoked:** states that membership remains active, prior points remain unchanged, future eligible credits stop using the agreement and another valid promotion may still apply.

Internal revocation and non-activation reasons are not exposed.

## Local safety

Acceptance uses synthetic `.invalid` identities and the existing local-only transport guard. No Resend call, real recipient or production data is used.

## Deferred

Expiring and automatic expired notifications require an explicit scheduling policy and remain deferred to C7.1 or a later phase. No cron producer is introduced in C7.
