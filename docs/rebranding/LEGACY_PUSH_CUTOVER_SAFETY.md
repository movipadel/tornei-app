# MOVI — authorized legacy push cutover

2026-11-03. Local implementation only. This supersedes the earlier compatibility gate's requirement to preserve active legacy sending. The user explicitly authorized deactivation and re-enrollment, accepting the interruption to business push. Production has not been accessed or changed.

## Implementation

The unreleased `20261103201543_notification_foundation_v1.sql` updates every active `admin_push_subscriptions` row to `is_active=false`, refreshing `updated_at`. It retains rows, endpoints, keys and existing `staff_id` values. It does not infer ownership, delete rows or populate the canonical subscription table. Older production migrations remain unchanged.

The legacy sender already queries only `is_active=true`; executable regression coverage now verifies inactive rows never reach its mocked transport, including after the same endpoint is canonically enrolled. Its signature and existing business calls remain unchanged. No new legacy enrollment is allowed by the application. Re-enrollment never reactivates the legacy row; legacy active recipients remain zero even after adoption.

Admin/Staff shows **Attiva notifiche push** when the current device needs enrollment or repair, including when browser permission is already granted. The card explains the re-enrollment and Telegram fallback. Status is checked against canonical persistence, not inferred from browser permission. Enrollment is explicit, never prompted automatically.

A browser subscription with matching VAPID key can be persisted under the authenticated current owner. Incompatible keys cause safe renewal; a canonical ownership conflict requires a new browser subscription and never rebinds the old endpoint. Current session resolution supplies customer/staff owner IDs server-side; client owner injection is rejected. No ownership is read from legacy rows. The canonical database RPC serializes endpoint ownership and refuses reassignment, including revoked endpoints.

Telegram producers and helpers remain unchanged. Email, communications inbox and Monday League remain unchanged by this task. Their existing tests pass. Re-enrollment prepares the device only: **Tournament, MoviBack and Store business push do not resume until a separately implemented canonical pilot.** There are no new automatic push deliveries. The exclusive transport mode and inactive legacy pool prevent simultaneous legacy/canonical business sending; this does not claim provider exactly-once semantics.

The canonical worker and public legacy URL alias remain as previously verified, preserving legacy payload parsing and same-origin deep links. No generated worker file is hand-edited.

## Production procedure and expectations (not executed)

1. Run the prepared SELECT-only [precheck](PRODUCTION_NOTIFICATION_FOUNDATION_V1_PRECHECK.sql) under separately authorized read access. It reports aggregate active/inactive/total legacy counts, populated staff reference count, canonical object conflicts and optional endpoint overlap, schema/permissions, constraints and lock exposure. No endpoints, secrets or customer data are returned. Any pre-existing canonical table is a migration conflict to resolve, not permission to overwrite it.
2. Quiesce legacy producers/enrollment and drain in-flight sends before the migration transaction and application cutover. A query made before deactivation could already have captured active endpoints; database updates cannot recall sends already accepted by a provider. Do not run old application instances or enrollment writers after cutover.
3. Apply the forward migration and deploy the application only through a separately authorized release. Verify legacy row count unchanged, active count zero, and canonical count initially zero. Never reactivate legacy rows on rollback.
4. Current users explicitly enroll through authenticated canonical APIs. Keep business push disabled; Telegram remains the operational fallback. A later controlled-device pilot must verify actual delivery before enabling canonical business events.

Expected post-migration database state is demonstrated locally, not asserted as an observed production result. The previous preserved-active `notification_compatibility_clean` database is historical test evidence only; the new cutover verification uses `notification_cutover_clean`.

## Verification

- Targeted push/security/service-worker/browser mocks: 18/18 PASS.
- Full authoritative suite: 582/582 PASS, zero failures/skips.
- Typecheck: PASS.
- Relevant lint and production build: PASS. Existing metadata themeColor warnings only. Generated PWA files restored.
- Fresh local chain: all 64 migrations PASS in `notification_cutover_clean`; legacy synthetic row retained inactive with null staff_id, zero active legacy rows, zero canonical rows. Foundation SQL rollback tests PASS. Precheck executed locally both before migration and with an existing canonical table.
- `git diff --check`: PASS.
- Local DB advisors: only the known historical `player_identity_command.phone` ambiguity; separate from this change. Foundation SQL tests cover RLS/ACL, owner conflict, channels and retry behavior.

No production mutation, real push, Telegram, email, deployment, staging, commit or push was performed. The build harness uses a filtered local environment and restores generated assets and the pre-existing next-env change. Unrelated working-tree changes remain intact.

## Final gate

```text
LEGACY_OWNERLESS_ROWS_PRESERVED = YES
LEGACY_ACTIVE_ROWS_DEACTIVATED = YES
LEGACY_OWNERSHIP_INFERRED = NO
OWNERLESS_LEGACY_PUSH_AFTER_CUTOVER = 0
LEGACY_SENDER_SKIPS_INACTIVE = PASS
CANONICAL_REENROLLMENT_REQUIRED = YES
PERMISSION_GRANTED_REPAIR_FLOW = PASS
CANONICAL_OWNER_BINDING = PASS
TELEGRAM_COVERAGE_PRESERVED = YES
NEW_BUSINESS_PUSH_EVENTS_ENABLED = 0
DUPLICATE_PUSH_RISK = PASS
PRODUCTION_PRECHECK_SQL_READY = YES
NEW_RELEASE_SECURITY_BLOCKERS = 0
FULL_TEST_SUITE = PASS (582/582)
TYPECHECK = PASS
RELEVANT_LINT = PASS
PRODUCTION_BUILD = PASS
GIT_DIFF_CHECK = PASS
MOVI LEGACY PUSH CUTOVER SAFETY = READY
```

READY is the local implementation gate under the authorized cutover policy, not a claim of production migration or real-device delivery. The historical DB lint issue remains separate. No permission to execute production changes is implied.
