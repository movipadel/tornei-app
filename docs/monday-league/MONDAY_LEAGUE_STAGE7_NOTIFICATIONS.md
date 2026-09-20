# Monday League — Stage 7 Notifications

## 1. Scope

Stage 7 adds idempotent Monday League reminders and transactional sporting notifications. It does not generate Phase 2, change result finality, deploy cron configuration, or send email/Telegram/web-push messages.

## 2. Reused notification infrastructure

Captain messages are delivered to the existing `communications` table as `target='user'`. The existing `/api/user/communications` read model, read/dismiss state and home notification UI therefore remain authoritative. The existing `communications_event_key_unique` index is the final in-app deduplication guard.

The app has only staff-wide `admin_push_subscriptions`; it has no user push subscription model. `notification_logs` and a general-purpose durable scheduler were not present. Stage 7 adds only the missing Monday League outbox capability.

## 3. Idempotency model

`league_notification_events.idempotency_key` is globally unique and includes season, entity, event, recipient and channel; scheduled reminders also include `schedule_version`. The in-app `communications.event_key` receives the same key. Enqueue, scan, retry and delivery replays consequently create at most one event and one in-app communication per logical recipient/channel.

## 4. Lineup reminder

The scan creates one reminder per current linked captain/team at `scheduled_at - 3 hours`, which is two hours before the lineup deadline. It requires a scheduled match, active season/team, future lineup deadline and missing current lineup. Cancelled, postponed, suspended, already submitted and stale reminders are skipped. Copy contains no opponent lineup data.

## 5. Match reminder

Both current captains receive the reminder three hours before a scheduled match. It includes opponent, home/away role, venue and Europe/Rome date/time. The delivery guard rejects stale schedule versions and non-scheduled matches.

## 6. Result reminder

The current home captain alone is reminded two hours after scheduled start when neither a standard result nor a special outcome exists. Stage 7 sends a single reminder and scans only the recent 14-day window.

## 7. Result-submitted event

The `captain_result_submitted` audit insert transactionally enqueues an away-captain event. It shows the submitted set score, calls it provisional and formats the exact `submitted_at + 48 hours` contest deadline. A command retry cannot insert a second result or event.

## 8. Contest-opened event

The `result_contested` audit insert enqueues one home-captain event in the same transaction. The public notification says only that the result is under review; the contest reason is never copied to the outbox or communication.

## 9. Contest-resolved event

`contest_rejected` and `contest_corrected` audit events enqueue both captains. Rejection states that the result was confirmed; correction shows the final corrected score. Private resolution notes and correction reasons are excluded.

## 10. Reschedule event

An `AFTER UPDATE` match trigger detects a change from one scheduled instant/venue to another. It enqueues both current captains once per new `schedule_version`, including old time, new time and new venue. Old unsent scheduled reminders retain their audit history but are marked `skipped` when their schedule version no longer matches.

## 11. Lineup-reopen event

The existing `lineups_reopened` audit event transactionally enqueues both current captains. The message displays the new deadline (`scheduled_at - 1 hour`) in Europe/Rome.

## 12. Phase 2 event foundation

`league_enqueue_phase2_ready(season_id, phase_id)` is a service-role-only, idempotent hook for a future Serie A/Serie B command. Stage 7 never invokes it. Stage 8 must call it only after its Phase 2 transaction has successfully generated the target phase.

## 13. Scheduler model

`POST /api/cron/monday-league-notifications` runs a bounded due scan, claims up to 50 rows and delivers them. Claiming uses `FOR UPDATE SKIP LOCKED`, a worker UUID and a five-minute stale lease. The scan limit is 100, the accepted database limit is 1–500, and missing-result history is bounded.

Stage 6 effective finality and standings remain independent of this endpoint; scheduler failure loses timeliness only, not domain correctness.

## 14. Timezone

Timestamps remain `timestamptz`. `league_format_rome_timestamp` uses the named `Europe/Rome` zone. Tests cover winter CET (`UTC+1`) and summer CEST (`UTC+2`) without fixed-offset application logic.

## 15. Push behavior

No captain push is enabled because the current application stores staff subscriptions only. Adding captain push later requires a user-scoped subscription table and a channel-specific delivery record. In-app success must remain committed if such a future push attempt fails, and push retry must never recreate the in-app row.

## 16. Telegram behavior

Telegram is not used for routine captain messages. Contest-opened staff Telegram was deliberately omitted: the helper is external-config driven and has no local-safe destination abstraction. No new bot or secret was introduced, and local acceptance sends nothing externally.

## 17. Email decision

Resend is currently specific to Store operational emails. It is not a natural captain-notification mirror, so Stage 7 adds no email and produces no Mailpit traffic.

## 18. Failure and retry behavior

Pending events are claimed atomically. A failed delivery returns to `pending` until five attempts, then becomes `failed`; a stale processing lease is reclaimable after five minutes. Successful in-app insertion and outbox `delivered` status occur in one database transaction. The unique communication event key makes delivery replay safe.

## 19. Security

The cron route accepts POST only and requires a timing-safe `Authorization: Bearer <CRON_SECRET>` comparison. It derives recipients in database functions and accepts no client recipient ID. Outbox RLS is enabled, anon/authenticated privileges are revoked, and scanner/claim/delivery/Phase 2 functions are service-role only.

## 20. Local acceptance

Acceptance uses only API `127.0.0.1:55021` and DB `127.0.0.1:55022`. SQL tests roll back fixtures; the concurrency test uses exact local fixture IDs and cleanup. No actual push, Telegram or email adapter is invoked. The protected HTTP route is contract-tested without dispatching notifications.

## 21. Production rollout requirements

Before any future deployment: review/apply the additive migration, configure a strong `CRON_SECRET`, configure an authenticated scheduler POST frequency, verify local/staging communication rendering, monitor pending/failed counts, and confirm environment targets. Stage 7 itself performs no deployment and changes no production environment.

## 22. Stage 8 prerequisites

Stage 8 must preserve the service-only Phase 2 hook, invoke it inside the successful generation transaction, supply a real Serie A/Serie B phase ID, retain deterministic recipient keys, and add Phase 2 generation/replay/concurrency tests. It must not make generation correctness depend on notification delivery.
