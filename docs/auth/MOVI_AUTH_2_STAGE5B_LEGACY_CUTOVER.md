# MOVI Auth 2.0 — Stage 5B controlled legacy cutover

Date: 2026-09-21. Scope: controlled coexistence for normal MOVI users. Stage 5B keeps legacy HMAC support and existing valid sessions, but makes verified Supabase Auth the only registration path. It does not change admin/staff authentication, merge users, deploy, or access production.

## 1. Scope

New users and Auth-linked users use Auth 2.0. Existing unlinked users retain temporary lookup-only access. Legacy access never creates, links, merges, aliases, or transfers a profile. Stage 6 retirement is outside this stage.

## 2. New-user policy

`/registrati` and the Stage 2 verified-email signup are the only way to create a normal user. `/api/user/login` contains no insert, upsert, identity update, or fallback registration. An unknown person receives “Profilo non trovato. Registrati con il nuovo accesso MOVI.” and a fixed `/registrati` destination.

## 3. Legacy lookup-only behavior

The server normalizes both submitted phone and email. They must identify the same unique existing row, and both normalized values must be unique among active profiles. Name and gender are not authentication factors. Login never changes email, phone, name, gender, `auth_user_id`, migration state, or business data.

## 4. Login state matrix

| State | New legacy cookie | Response |
|---|---:|---|
| `legacy` | Yes, exact unique phone + email only | Activation remains available |
| `activation_pending` | Yes, exact unique phone + email only | Activation CTA remains |
| `linked` | No | Auth email/password required |
| `review_required` | No | Manual verification message |
| `conflict` | No | Assistance message; no Auth claim |
| `merged` | No | Auth/canonical guidance without privilege transfer |

Unknown, mismatched, invalid, or ambiguous inputs produce no cookie. Alias rows are never consulted for authorization.

## 5. UI changes

`/accedi` emphasizes email and password. “Hai ancora il vecchio accesso?” links to `/accesso-precedente`, which states that it is temporary and cannot register a user. Embedded access dialogs present Auth first and legacy access second. Every registration CTA points to `/registrati`.

## 6. Existing cookie behavior

Existing HMAC cookies are not globally invalidated. An unlinked `legacy`, `activation_pending`, or already-issued `review_required` session can still resolve its exact active profile. A profile that becomes `linked`, `merged`, or `conflict` no longer resolves from a lone legacy cookie. Valid Auth remains authoritative; an Auth/legacy mismatch fails closed.

## 7. Migration metrics

The admin migration dashboard shows remaining eligible legacy people, activation pending, linked, review required, conflict, merged, active person profiles, Auth-linked percentage among those profiles, and successful legacy logins in the last 30 days. The eligible legacy count and percentage exclude reserved `.invalid` fixtures and profiles without valid normalized email/mobile; admin and staff identities live outside `public.users`.

## 8. Security hardening

The lookup RPC takes fixed advisory locks shared with verified email linking and locks the selected row. Exact phone/email consistency, active uniqueness, direct profile ownership, migration state, and Auth linkage are checked before the application issues a cookie. The route re-reads the row after the decision. Subsequent authorization independently rejects stale linked legacy sessions.

## 9. Monday League

Legacy unlinked captains continue temporarily through the same `public.users.id`. Migrated captains resolve through Auth to that ID. Cutover does not reassign players, captains, teams, or match history.

## 10. MoviBack

Membership, ledger, balance, redemptions, and certificate ownership remain on the same public user ID. Lookup-only access cannot create a second membership or user.

## 11. Store

Order ownership and historical customer snapshots do not move. Legacy access cannot create a duplicate profile during checkout.

## 12. Tournaments

Registrations keep their existing user ID. Stage 5B performs no player-key, ranking, registration, or circuit merge.

## 13. Telemetry

`user_legacy_login_events` stores only outcome type, optional internal public user ID, timestamp, and an empty bounded metadata object. Outcomes are success, not found, Auth required, review required, and conflict. Submitted phone, email, password, cookies, and tokens are never stored. The table is immutable, RLS-enabled, and service-role only.

## 14. Rollout flag and configuration

`AUTH2_LEGACY_REGISTRATION_DISABLED=true` is the explicit production setting. Absence defaults to the safe lookup-only behavior. Setting it to `false` fails closed with `503`; it does not restore legacy registration. A code rollback is required to restore earlier behavior, preventing a hidden account-creation fallback.

All Auth acceptance operations must use an explicitly supplied `http://127.0.0.1:55021` target and assert that exact value before creating or deleting an Auth identity. Tests must never derive an Auth target from `.env.local`.

## 15. Rollback

Application rollback can restore the Stage 5A interface while leaving the additive event table and lookup function dormant. Database rollback, if separately approved, drops only the Stage 5B function/table and restores the prior summary function. Existing Auth links, HMAC cookies, profiles, business ownership, and Stage 1–5A evidence must remain untouched.

## 16. Stage 6 prerequisites

Before legacy retirement, measure activation and 30-day legacy usage, resolve review/conflict queues, define support and account recovery, verify final HMAC expiry behavior, complete admin/staff session separation, exercise rollback, and approve user communication. Stage 6 must remain a separate reviewed change.
