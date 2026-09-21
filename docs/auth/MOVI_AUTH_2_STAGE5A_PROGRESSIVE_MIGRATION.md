# MOVI Auth 2.0 — Stage 5A progressive migration

Date: 2026-09-21. Scope: existing normal MOVI users only. This stage keeps legacy HMAC login and the Stage 2 Auth signup active, creates no Auth users in bulk, performs no automatic duplicate merge, and does not change admin or staff authentication.

## 1. Migration states

`public.users.auth_migration_state` is an additive operational state independent from the Stage 3 `identity_status` authorization invariant:

- `legacy`: active profile without an Auth link;
- `activation_pending`: the legacy user selected the activation handoff;
- `linked`: the existing profile is linked to one verified Supabase Auth identity;
- `review_required`: verified email matched more than one active profile;
- `conflict`: a different Auth ownership relationship prevents linking;
- `merged`: the Stage 3 source profile is soft-merged.

The migration classifies existing rows from their current Auth and merge state. This creates no credentials and moves no business data. A trigger keeps future Auth links and Stage 3 merges synchronized with the state.

## 2. Legacy user behavior

An active, unlinked user continues through the existing phone-based legacy flow and receives the same 30-day HMAC session. The response contains only a safe activation availability message. `review_required` users may continue using the current legacy identity during Stage 5A; no Auth privilege is inferred from the pending review.

Legacy login remains a temporary possession-free flow with the security limitation documented in Stages 0–2. Stage 5A does not broaden it or make it authoritative over Auth.

## 3. Linked user behavior

When `auth_user_id` is present, the legacy route returns `AUTH_LOGIN_REQUIRED`, issues no new HMAC cookie, and directs the user to `/accedi`. It does not update the profile or relink the identity. Existing HMAC sessions retain the Stage 2 coexistence behavior; a valid Auth session remains authoritative.

## 4. Activation prompt

An unlinked legacy session sees “Nuovo accesso MOVI disponibile” and the CTA “Attiva il nuovo accesso”. The copy explains email/password and continuity of points, orders, tournaments, and Monday League without exposing UUIDs or merge mechanics.

The CTA invokes the server route `/api/user/activation/start`. That route derives the profile only from the signed legacy session, changes the state to `activation_pending`, writes one idempotent event, and returns the fixed `/attiva-account` destination. The prompt is non-blocking.

## 5. Verified-email handoff

The legacy session is not identity proof. `/attiva-account` still sends Supabase email verification, and completion still derives the Auth UUID from the server session and requires `email_confirmed_at`. The Stage 2 `resolve_and_link_verified_auth_user` command remains the linking boundary.

One active, unlinked normalized-email match is linked in place. The `public.users.id` is unchanged. The same Auth/profile pair is idempotent. A profile owned by another Auth identity returns `conflict` and is not relinked.

## 6. `review_required`

Multiple active normalized-email matches return `review_required`. Unlinked candidates receive that migration state, Stage 4 performs a deterministic review refresh, and the matching email group gets the private `activation_review_required` warning. No alias, merge, source selection, or canonical selection is performed.

The public response says only that manual verification is required. Candidate counts, UUIDs, history, and recommendation details remain admin-only.

## 7. Admin visibility

The existing duplicate/migration page shows totals for legacy, activation pending, linked, review required, conflict, and merged users. It provides a migration-state filter and a bounded safe list containing profile contact data already available to administrators, boolean Auth linkage, and operational state. It does not expose Auth UUIDs or provide password-setting controls.

The summary also counts unique activation-started, verification-completed, linked, review-required, and conflict events. Telemetry is immutable, protected by RLS, and service-role only.

## 8. Session precedence

The Stage 2 rule is unchanged:

1. a valid Auth session is authoritative;
2. without Auth, a valid HMAC session may resolve the exact active legacy profile;
3. Auth and HMAC resolving the same profile are safe;
4. different resolved profiles fail closed with `auth_legacy_profile_mismatch`;
5. an unlinked Auth session never falls back to the legacy identity.

Stage 5A does not read or mutate admin/staff cookies, guards, login routes, or proxy behavior.

## 9. Business continuity

Activation updates only `public.users.auth_user_id`, migration state, timestamps, onboarding, and audit telemetry. The profile UUID does not change, so Monday League captain/player identity, MoviBack membership and ledger, Store ownership and snapshots, tournament registration/history, and communications remain attached to the same row.

No email campaign, credential provisioning, domain reassignment, or merge is part of this stage.

## 10. Test evidence

`movi_auth2_stage5a_progressive_migration.sql` is rollback-only and covers legacy state, activation start idempotency, verified linking, replay, duplicate review integration, conflicting Auth ownership, immutable private telemetry, unchanged profile UUID, captain recognition, MoviBack, Store, and tournament ownership.

`movi_auth2_stage5a_contract.test.mjs` checks the application handoff, prompt copy, linked-user refusal, Auth precedence, safe admin projection, Stage 2 signup/password-reset continuity, absence of automatic merge and non-mutation of admin/staff auth.

The full Stage 1–4 SQL/contract suites, domain regressions, TypeScript, build, targeted lint, and diff checks remain release gates.

All Stage 5A database acceptance tests connect directly to the local database on `127.0.0.1:55022`, run in rollback transactions, and never load `.env.local` or call a hosted Auth Admin API. Any future end-to-end harness that creates Auth identities must fail before creation unless its resolved Auth host is exactly `127.0.0.1:55021`. A hosted `.env.local` target is not a valid local-test target.

## 11. Rollout prerequisites

Before production, review the additive migration, back up the database, validate hosted Auth URL/SMTP/password settings, measure duplicate candidates, train admins on `review_required`, confirm support ownership for conflicts, validate the prompt on final HTTPS/PWA environments, and define monitoring thresholds. Start with a small voluntary cohort. Do not create Auth accounts or send activation email in bulk.

The intermediate audit finding that admin and staff currently share `staff_session` remains unresolved and must be handled independently before certifying full three-domain simultaneous-session coexistence. Stage 5A does not modify that subsystem.

## 12. Stage 5B prerequisites

Stage 5B may consider gradual legacy restrictions only after activation adoption is measured, review/conflict queues have operational owners, recovery is proven, duplicate merges are audited, the admin/staff coexistence blocker is resolved, and rollback/incident procedures are exercised. It must separately decide already-issued HMAC-session expiry and must not infer authorization from aliases or email equality.
