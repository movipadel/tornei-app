# MOVI Auth 2.0 — access redesign

This change adds a separate, private work queue for assistance that starts before a Supabase Auth identity exists. `user_auth_onboarding` keeps its certified meaning and continues to represent only flows that already have an `auth.users.id`.

The user-facing access choice is login, activation of an existing MOVI profile, or creation of a genuinely new profile. Activation starts with exact normalized phone and conservative normalized name matching. The result is held in a short-lived HttpOnly signed cookie; the browser never submits a business profile UUID. The profile email is masked until ownership is proven and remains the final proof through Supabase email verification.

`public.user_access_help_requests` stores an opaque HMAC idempotency key, one of `email_inaccessible`, `name_mismatch`, or `multiple_profiles`, lifecycle status, optional server-derived profile/group references, and minimized normalized input only when no unique profile reference exists. It stores no Auth id, full email, password, token, or authorization decision. RLS is enabled; `anon` and `authenticated` have no table or function access; only `service_role` may use the table and its commands.

The admin “Problemi di accesso” view aggregates these requests with `user_auth_onboarding` conflict, review-required, and verified unlinked/resumable rows. Resolving or cancelling a help item changes only that item. Retry invokes the existing verified resolver. Cancellation of invalid onboarding first proves that no `public.users.auth_user_id` link exists, then deletes only the unlinked Auth identity; the onboarding row follows its existing cascade. Arbitrary linking and email replacement are deliberately absent.

The migration does not update `public.users`, `auth.users`, duplicate groups, aliases, merge history, or business tables. The signup preflight checks exact normalized phone or email before creating Auth and directs an existing customer to profile activation without revealing whose profile matched.
