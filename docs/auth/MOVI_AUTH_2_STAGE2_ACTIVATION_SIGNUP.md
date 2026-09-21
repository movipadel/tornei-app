# MOVI Auth 2.0 — Stage 2 activation and signup

Date: 2026-09-21. Sources of truth: Stage 0 architecture and Stage 1 identity foundation. This stage is implemented and accepted only against the unlinked local Supabase stack on API `127.0.0.1:55021`, database `127.0.0.1:55022`, Studio `127.0.0.1:55023`, and Mailpit `127.0.0.1:55024`.

## 1. Scope

Stage 2 adds Supabase email/password authentication, existing-profile activation, verified new signup, recovery, logout, SSR cookie refresh, and coexistence with the legacy HMAC session. It creates no merge engine, migrates no existing user automatically, changes no domain foreign key, and uses no identity alias for authorization.

## 2. Auth client and server architecture

The application uses `@supabase/ssr`. Browser code uses the publishable/anon key. Server and Route Handler code use a cookie adapter and validate the current identity through `auth.getUser()`. Next.js 16 `proxy.ts` refreshes expiring tokens while retaining the existing staff/admin checks. Privileged profile commands use the server-only service role; access and refresh tokens are never placed in the legacy cookie or returned by application DTOs.

## 3. Session precedence

`getCurrentMoviUser()` implements one rule: a valid Auth session is authoritative. It resolves only `users.auth_user_id`; it never follows `user_identity_aliases`. With no valid Auth session, a valid legacy HMAC cookie may resolve its exact `public.users.id`. If both resolve the same profile, Auth wins. If they resolve different profiles, the request fails closed with `auth_legacy_profile_mismatch`. A valid but unlinked Auth session does not fall back to a legacy profile.

Existing domain routes keep their public helper name, but the helper now returns the effective Stage 2 public user ID. This preserves Monday League, MoviBack, Store, tournament, and communication code while applying the precedence rule consistently.

## 4. Existing-user activation

`/attiva-account` accepts an email and invokes Supabase email OTP/magic-link delivery with a generic response. The fixed callback exchanges the PKCE code for a cookie session. Only after Supabase reports `email_confirmed_at` does the completion route accept a new password and invoke the linking command. The command derives email from `auth.users`; the client supplies neither Auth UUID nor public profile UUID.

## 5. Verified-email requirement

`resolve_and_link_verified_auth_user` locks the Auth row and returns `pending_verification` when `email_confirmed_at` is null. It normalizes the Auth email in the database. Names and phone numbers are never accepted as proof for activation.

## 6. Ambiguous duplicates

Zero normalized-email matches produce `no_profile`. One eligible match may link. More than one produces `review_required`, records the match count privately, and changes no profile. A link to the same Auth UUID is an idempotent replay. A profile linked to another Auth UUID, or an Auth UUID already linked elsewhere, produces `conflict`. No case creates an alias or merges/deletes profiles. Public responses expose states and counts, not UUIDs or business history.

## 7. New signup

`/registrati` collects name, mobile, email, gender, privacy, terms, age, optional marketing consent, and password. Supabase stores the password and sends the verification email. A private onboarding draft stores only profile/consent fields and the server-derived Auth UUID. After callback verification, `finalize_verified_auth_signup` creates exactly one linked `public.users` row or returns a controlled conflict/review state.

## 8. Phone and email canonicalization

Email uses `normalize_user_email`, equivalent to lowercased trimmed text. Mobile uses the Stage 1 `normalize_user_mobile_e164`; invalid personal-mobile input is rejected. Finalization serializes normalized email and phone keys and checks every existing profile by those same functions before insertion.

## 9. Identity linking

The Stage 2 migration adds private `user_auth_onboarding`, immutable `user_auth_link_events`, and three service-only commands. Row locks plus transaction-scoped advisory locks serialize email and phone decisions. The Stage 1 partial unique Auth-link index remains the final one-to-one constraint. The audit stream records outcomes without passwords or tokens.

## 10. Password reset

`/password-dimenticata` always returns the same public message. Supabase sends recovery mail only when appropriate. `/reset-password` requires the recovery session and calls `auth.updateUser`; it never mutates `public.users`.

## 11. Logout

`POST /api/auth/logout` supports `auth`, `legacy`, and default `all` scopes. The established `/api/user/logout` is logout-all so existing UI clears both sessions. Supabase sign-out is local to the browser session; the legacy cookie is expired separately.

## 12. `/api/user/me` compatibility

The response remains `{ user: <existing profile shape> }` and exposes no Auth fields or tokens. Anonymous and unlinked sessions receive `{ user: null }`. A dual-session mismatch returns HTTP 409 with a conflict code, preventing either identity from being chosen silently.

## 13. Monday League

An Auth-linked user resolves to the unchanged `public.users.id`. Captain authorization continues to compare `league_team_players.user_id`; no FK points to `auth.users`. A conflicting or unlinked Auth session yields no captain identity.

## 14. MoviBack

The effective ID is the existing profile UUID, so `loyalty_memberships.user_id`, balances, certificates, rewards, and redemptions remain attached to the same row. Activation creates no second membership.

## 15. Store

`store_orders.user_id` continues to receive the canonical public profile UUID. Historical `customer_phone` and `customer_email` snapshots are not updated by activation or signup.

## 16. Tournaments

Existing registration ownership remains on `public.users.id`. Stage 2 does not alter `p1_phone`, `p2_phone`, `player_key`, run participants, or circuit ranking identity.

## 17. Security

Onboarding tables have RLS and no anon/authenticated grants. Linking functions are service-role only and independently inspect `auth.users`. The routes derive Auth UUID from the verified server session, use fixed redirect destinations, omit tokens from DTOs, never log passwords, and give generic pre-verification email responses. The legacy form remains available only for unlinked profiles; it refuses to issue a legacy cookie for an Auth-linked profile.

## 18. Concurrency

Activation locks the Auth/profile rows and an advisory key derived from normalized email. Signup locks normalized email and phone keys in a stable sequence. Replays are idempotent; two activations converge on the same link; competing Auth identities cannot steal it; signup collisions produce conflict/review; activation versus signup shares the email lock. Password recovery changes Auth credentials independently of the linking transaction.

## 19. Local Mailpit acceptance

Local configuration enables email confirmations, fixed callback redirects, and a higher local email limit. The acceptance test obtains credentials from `supabase status`, asserts the loopback API and Mailpit targets, requests signup verification, activation OTP, and password recovery emails, verifies all three recipients in Mailpit, and removes synthetic Auth users. No external SMTP service is used.

## 20. Production prerequisites

Before any hosted rollout, configure the exact production Site URL and callback allowlist, enable email confirmations, configure a production SMTP provider and sender/domain authentication, choose password policy and Auth rate limits, supply matching server/public Supabase URLs and keys, set `NEXT_PUBLIC_APP_URL`, and validate proxy cookies behind the final HTTPS origin. Review live duplicate candidates and operator handling for `review_required`. Apply the migration through the normal reviewed deployment path; this task changes no hosted setting.

## 21. Rollback

Before real links exist, disable the new routes, then use a reviewed forward migration to remove Stage 2 functions, trigger, tables, and sequence. Once links or audit evidence exist, retain both Stage 1 and Stage 2 data and roll back application traffic only; do not drop evidence or unlink users manually. Legacy unlinked profiles remain usable throughout.

## 22. Stage 3 prerequisites

Stage 3 may design staffed duplicate review and merge policy only after live candidate evidence, per-domain reassignment rules, consent reconciliation, financial/loyalty collision policy, soft-merged source behavior, recovery operations, and audit retention are approved. Stage 2 does not authorize auto-merge, production user migration, or legacy cutoff.
