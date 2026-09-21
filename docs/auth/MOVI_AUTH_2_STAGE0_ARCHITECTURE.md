# MOVI AUTH 2.0 — Stage 0 architecture audit

Date: 2026-09-21. Repository: `D:\PROGETTI-APP\tornei-app`. Branch: `main`. Audited HEAD: `b841eb71dac6c221743874de2874ec1e588bcaf7`.

**Status: repository architecture audit complete; production identity adjudication is pending evidence. This document is a design, not an implementation or authorization to migrate.** No database connection, Auth operation, email, merge, commit, push or deployment was performed. Only this document is created. Existing local changes to `supabase/config.toml` and `supabase/tests/fixtures/home_sections_visual.local.sql` are preserved.

Evidence labels used below: **observed** means repository code/migrations; **supplied** means the task's production report; **proposed** means future behavior; **unknown** means not established. The supplied 210 production users and named duplicate groups were not independently queried. Repository migrations include timestamps later than this audit date; their presence is not evidence that they have been deployed. No AGENTS.md was found in the repository or checked parent directories.

## 1. Executive summary

The current public-user login is a profile upsert, not proof of identity. A caller supplies a phone, arbitrary name/email and consent booleans; the server upserts on the phone and signs the resulting UUID. Knowledge of an existing phone is sufficient to obtain that identity and overwrite its profile. Email ownership is never checked. This is the principal security finding, beyond duplicate data quality.

Adopt Supabase Auth for verified email and passwords while retaining independent `public.users.id` values. Add a nullable unique `auth_user_id` referencing `auth.users.id`, canonical/merged status, restricted identity mapping, activation state and a merge journal. Preserve operational authorization in server routes. Do not switch the whole app to direct browser database access.

Email verification is necessary but **not sufficient by itself** to claim every legacy row with that email: legacy email can be edited without verification, shared, mistyped or maliciously planted. Automatic claim/merge needs a reviewed eligible candidate set and no identity, privilege, membership or transactional conflict. No named group is currently approved for automatic merge.

Keep merged source rows as inactive tombstones to preserve historical FKs. An ID alias resolves identity references; it must not upgrade a weak legacy cookie into unrestricted access to the canonical person's data or captain rights. Require fresh verified authentication for migrated identities and sensitive operations. Preserve unaffected legacy sessions temporarily; do not promise uninterrupted privileged access through a merge.

## 2. Current architecture and identity entry points

### 2.1 Login and registration trace

Observed chain:

`src/components/UserLoginDialog.tsx` → `POST /api/user/login` → `public.users.upsert(..., onConflict: phone)` → `createUserSessionToken(data.id)` → `USER_COOKIE_NAME` → `GET /api/user/me` → `.eq('id', uid).single()`.

The dialog is titled “I miei dati”; its action is “Salva”. It collects name, phone, email, M/F, privacy/terms/age acceptance and optional marketing. Browser email validation does not provide server-side ownership verification. Opening the dialog resets consent checkboxes, including marketing, to false.

`src/app/api/user/login/route.ts:11` removes whitespace from phone, trims email without lowercasing it, uppercases gender and checks nonempty name/phone/email. It does not validate phone format, verify email, authenticate a prior session or compare the supplied name/email to existing values. Consent fields use Boolean coercion, not strict boolean validation. The upsert at line 80 creates a new random UUID on a new exact phone, or overwrites the existing row's name, email, gender, consent timestamps and marketing fields. Every successful submission issues a new 30-day token. There is no separate public signup/password flow.

`supabase/migrations/20260916143214_production_public_baseline.sql:754` defines `users`; phone is NOT NULL and UNIQUE (line 972), email nullable and not unique. No `auth_user_id` exists in the inspected schema. Application-created public users are created by this login route. The other direct profile writer found is admin MoviBack PATCH, which updates an existing user through its membership (no public-user delete route found). Test/fixture SQL also inserts synthetic users; these are not live registration entry points.

### 2.2 Route coverage

Paths below are under `/api`; their source is `src/app/api/<path>/route.ts`. Groups enumerate identity-sensitive entry points, including indirect membership, order, player and historical references. The appendix contains a mechanically derived file inventory to support future review.

| Routes / components | Current identity use / migration requirement |
| --- | --- |
| `user/login`, `user/me`, `user/logout` | Create/update, read profile, clear HMAC cookie respectively. Replace login semantics only in later stages. |
| `user/communications`, `user/communications/state` | Cookie UID, profile phone, membership audience, recipient UID and per-user read/dismiss state. State writes must also check audience authorization. |
| `moviback/me`, `request-membership`, `certificate/replace`, `reactivate`, `leave`, `comunicazioni`, `rewards`, `rewards/redeem`, `redemptions` | HMAC identity → membership/user/certificate/ledger/reward relations. Preserve canonical ownership, membership IDs and authorization checks. |
| `store/orders` | Cookie UID required; loads profile and copies customer name/phone/email; membership for points payment. Existing route performs application-side writes; transactional checkout SQL also exists. Do not assume all Store traffic uses that RPC. |
| `tournaments/[id]/registrations` | Reads cookie optionally, loads user if available, uses body player data; can register without authenticated profile. Stores nullable `user_id`. No new `users` row. |
| `registrations/search`, `registrations/[id]` | Phone-only unauthenticated search / cancellation; not secured by changing the session helper alone. |
| `tournaments/[id]/circuit-player-suggestions` | Name search and historical phone/player keys; no account ownership proof. |
| `monday-league/teams/[slug]` | Optional viewer UID passed to captain read-model RPCs. |
| `monday-league/teams/[slug]/roster`, `/profile`, `/media`; `monday-league/matches/[matchId]/lineups`, `/result`, `/contest` | User identity passed to protected captain operations; profile/media also support staff identity. Do not accept actor UID from client as authority. |
| `admin/monday-league/users/search`, `/teams`, `/teams/[id]`, `/lineups`, `/results` | Search profiles, assign roster/captain UID, staff overrides, display contest actors. Authenticated staff context stays separate. |
| `admin/moviback/users`, `/users/[id]`, `/requests`, `/dashboard`, `/redemptions` | Membership/profile joins and administration. `[id]` is membership ID, not a public-user ID. PATCH profile phone/email currently only trims them. |
| `admin/moviback/users/[id]/adjust-points`, `/promo`; certificate/request approval and redemption transitions | Indirect ownership through membership/certificate/redemption; preserve membership and business-event identity. |
| `staff/lookup-membership`, `/earn-points`, `/reward-delivery` | Staff session → membership code or QR/redemption → MOVI user; amounts and staff authorship must survive merge. |
| `reward-redemptions/[token]` | Public bearer-QR lookup joins redemption → membership → users; exposes name/phone. Token is a separate capability, not an account claim credential. |
| `admin/tournaments/[id]/registrations`, `/registrations.csv`, `/run/start`, `/run/lock`, `/run/close` and run read/generate/reset/reopen | Historical phone data and participant UUIDs. `/run/lock` references `registrations`, absent from baseline; see unresolved schema drift. |
| `admin/circuits/[id]/rankings`, `/merge-player-keys` | Phone-derived ranking identity and an existing separate player-key repair operation. Never invoke as a side effect of account merge. |
| Admin Store order, fulfillment, cancellation, economics, special-order and batch routes | Indirect user ownership through orders/redemptions; copied customer data and staff actors. Keep order IDs, ledger effects, inventory and delivery states stable. |
| Admin communication routes and `cron/monday-league-notifications` | Audience/recipient and outbox delivery; pending events need canonical-aware deduplication and authorization recheck. |
| `admin/users`, `admin/login`, `staff/login`, staff/admin me/logout | Separate `staff_users`, password RPC and staff JWT, **not** public-user creation/identity. Do not merge on equal email across these namespaces. |

`src/lib/userAuth.ts` is the shared HMAC reader, but phone-only endpoints and privileged SQL functions require separate treatment. `src/lib/monday-league/public-read-model.ts` passes viewer identity to `league_get_captain_context` and `league_get_captain_result_context`. SQL RPCs use explicit user/actor parameters; those parameters remain server-controlled.

## 3. Root cause of duplicates

Only the exact whitespace-stripped phone selects an existing user. `3471286908`, `+393471286908` and `00393471286908` are three different keys. A one-digit typo creates another key. The same email can be inserted repeatedly, and email case is retained. Changing phone in the “I miei dati” form creates/selects a different row; it is not an authenticated update of the old UUID. Admin editing uses another normalization rule. There is no canonical identity resolution, verified-email link or account deduplication workflow.

The supplied duplicate groups are consistent with these mechanisms, but the repository cannot prove which mechanism produced each person's rows. Same name/email is a candidate signal, never proof that two people are one.

## 4. Session lifecycle and likely logout causes

`src/lib/userAuth.ts:18-63` signs base64url JSON `{uid,iat,exp}` with HMAC-SHA256. Lifetime is 30 days from issue. Verification checks signature, uid/exp presence and expiry; it does not renew tokens, check a user row, maintain a revocation list or resolve aliases. Signature comparison uses ordinary string inequality; future hardening should use strict payload validation and constant-time comparison while supported.

Cookie options: HttpOnly, SameSite=Lax, Secure in production, path `/`, Max-Age 30 days, no Domain (host-only). `POST /api/user/logout` clears that cookie with Max-Age=0. It cannot revoke a copied token on another client. `middleware.ts` protects staff/admin pages only, with a separate 180-day staff token; it does not refresh public-user sessions.

| Observed condition | Result and confidence |
| --- | --- |
| More than 30 days after last successful login | Deterministic expiration, including active users: no sliding refresh. |
| `/user/logout` | Explicit cookie removal; home also sets local user state to null. |
| Invalid signature, absent secret, changed cookie name, missing cookie | Reader returns null. Secret/name changes would explain mass loss, but no evidence they occurred. |
| Profile UUID deleted | `/user/me` `.single()` produces error/HTTP 500, not a clean anonymous response. Other routes may still accept decoded UID until their own lookup/FK check. |
| `/user/me` returns 500 or non-user JSON | Home (`src/app/page.tsx:156`) and tournament page (`src/app/tornei/page.tsx:74`) assign `json.user ?? null` without checking this response's HTTP status. A server error can therefore look like logout while the cookie remains. |
| Network/parallel bootstrap failure | May prevent initial user hydration or leave prior state; not evidence of cookie deletion. Catch behavior differs from the explicit null assignment above. |
| Host change | Cookie cannot cross hosts. `next.config.ts` redirects `tornei-app.vercel.app` to `tornei.movipadel.it`; old-host cookies will not accompany the new host. Actual complaint attribution needs host evidence. |
| Browser/PWA restart | Persistent cookie should survive within its storage context and lifetime. The code does not deliberately log out on restart. Separate browser/installed-PWA stores, private browsing or cleared site data are environmental possibilities, not established incidents. |

PWA uses `@ducanh2912/next-pwa` with default configuration; no custom auth cache exclusion is declared. Browser fetches use `cache: 'no-store'`, which alone is not proof of service-worker behavior. Test the built worker and offline resume. Do not conclude that PWA caching caused complaints without reproduction. Proposed telemetry distinguishes expired, absent, invalid, missing profile and service error without recording cookies or personal data. Preserve an error state instead of treating every failure as anonymous.

## 5. Dependency map and table-specific merge policy

### A. Real foreign keys to `public.users.id`

Thirteen direct FK columns are present across the baseline and later migrations. This is the repository graph, not a live catalog certification. “Reassign” below always means after identity adjudication and inside the protected transaction, with a recorded before-image.

| Table.column | Delete behavior / important constraint | Proposed conflict policy |
| --- | --- | --- |
| `business_operation_idempotency.user_id` | NO ACTION; UNIQUE(operation,user_id,idempotency_key) | Preserve original identity scope and immutable request hash/result. Add canonical-aware replay lookup; collisions with different hashes/results block merge. Equivalent replay records need explicit provenance, not blind deletion. See §12. |
| `communication_user_states.user_id` | CASCADE; UNIQUE(user_id,communication_id) | Reassign if distinct; combine collisions retaining earliest nonnull read_at, nonnull dismissal (earliest evidence), earliest created_at. Preserve original states in journal. Do not revive dismissed items. |
| `communications.recipient_user_id` | CASCADE; added by `20260919120000_physical_fulfillment_commands.sql` | Reassign personal recipient; keep event_key/content/time unchanged. Existing delivered messages are not resent; merge read states separately. |
| `league_audit_events.actor_user_id` | RESTRICT | Preserve original actor, before_data and after_data. Resolve canonical identity only for authorized display/search. |
| `league_lineups.submitted_by_user_id` | RESTRICT | Preserve historical submitter and revision. Do not collapse lineups or player slots. |
| `league_notification_events.recipient_user_id` | CASCADE; unique text idempotency_key | Pending events require canonical recipient and semantic deduplication; delivered rows remain delivery evidence. Preserve event keys/payload; do not string-replace embedded UUIDs. See §15. |
| `league_result_contests.opened_by_user_id` | RESTRICT | Preserve original actor; update ownership comparisons to consider reviewed identity mappings. Never reopen or duplicate contest because actor UUID differs. |
| `league_result_submissions.submitted_by_user_id` | RESTRICT | Preserve original submitter, score, status and revision; canonical identity is a separate read interpretation. |
| `league_team_players.user_id` | RESTRICT; partial UNIQUE(team_id,user_id) | Reassign only without collision or incompatible captain/season assignment. Same-team collision requires explicit roster adjudication preserving player IDs, captain_player_id and lineup references. Otherwise block automatic merge. |
| `loyalty_memberships.user_id` | CASCADE; membership_code unique, no user_id unique constraint found | Zero/one membership can be reassigned; two memberships require full ledger/redemption/promo reconciliation and review. Current `.maybeSingle()` consumers require one effective membership. |
| `medical_certificates.user_id` | CASCADE; multiple certificates allowed | Reassign owner, retain all files, timestamps, review outcomes and expiry dates. Resolve the effective valid certificate explicitly; do not choose merely the latest file or upgrade a rejected document. |
| `store_orders.user_id` | SET NULL | Reassign owner without changing order IDs, totals, status, lines, customer snapshots, related_redemption_id or economics. Cross-check membership/redemption ownership. |
| `tournament_registrations.user_id` | SET NULL | Reassign account link; never collapse tournament entries merely because UID matches. Different players/partners, positions, reserves and payments require separate business review. |

Baseline FKs: `20260916143214_production_public_baseline.sql:1105-1186`. Added references: `20260916170000_pf08_idempotency.sql`, `20260919120000_physical_fulfillment_commands.sql`, `20260920090000_monday_league_stage1_foundation.sql`, Stage 3 results, Stage 5 lineups, Stage 6 contests and Stage 7 notifications migrations.

### B. UUID references without an FK / embedded identity

`tournament_run_participants.user_id` is nullable with no user FK in the inspected migrations. Reassign its nonnull account link after validation; retain participant IDs, match relations, name/phone/sex snapshots. Null does not authorize a phone-based bulk backfill. `/run/start` builds participants from phone/name without user_id; `/run/lock` copies user_id from a legacy `registrations` table not found in the schema. That table is an unresolved code/schema reference, not a confirmed production table.

Legacy cookie uid is a signed external reference. Medical file paths begin with `${uid}/...`; do not move storage objects as part of an SQL merge. Idempotency result JSON, league notification payload/keys, audit JSON and previously emitted messages may embed UUIDs. Preserve immutable payloads and add semantic resolution where needed. Generic `created_by`, staff `actor_id`, approved/reviewed_by, staff push subscriptions and staff IDs are not public-user identities just because they are UUIDs; retain them untouched.

### C. Phone-only references

`tournament_registrations.p1_phone/p2_phone`, `tournament_run_participants.phone`, `circuit_results.player_phone` and phone-derived `player_key` are independent player/history identifiers. Search, cancellation and tournament communication targeting currently use them. Retain snapshots; replace account authorization with explicit verified ownership relations, not broad phone equivalence. Retired phone variants may aid reviewed historical discovery, never grant rights after phone reuse.

### D. Email-only references

`users.email` is currently unverified profile/contact data, not a unique login credential. Store email snapshots and outbound emails are contact history. `staff_users.email` is a separate administrative login namespace. No other email-only public-user ownership join was found in the inspected application. Never infer a user link from an order contact email.

### E. Historical copied customer data and indirect graph

Retain `store_orders.customer_name/customer_phone/customer_email`, `store_special_orders.customer_name/customer_contact`, tournament/player names/phones and prior communications as recorded. Do not rewrite a financial or delivery snapshot to a newly edited profile.

Indirect graph: users → memberships → loyalty_transactions, loyalty_user_promos, reward_redemptions → related Store orders/items/economics/fulfillment. Users → league_team_players → captain_player_id, lineup players and competition history. Users → registration/participants → run pairs/matches → circuit results. Member, player, order, redemption and participant IDs should remain stable. An account merge is not a merge of every object owned by the account.

## 6. Target Supabase Auth architecture

Observed packages: Next 16.1.5, `@supabase/supabase-js` 2.93.1 in lockfile; no `@supabase/ssr`. `supabaseAdmin.ts` and `supabaseServer.ts` use service role with persistSession=false. `supabaseClient.ts` is a plain anon client. No Supabase Auth calls were found in application code. These helpers do not currently provide SSR user sessions.

Local `supabase/config.toml`: Auth enabled, JWT expiry 3600 seconds, refresh rotation enabled with reuse interval 10, signup enabled, email confirmation **disabled**, minimum password length 6, secure password change false, double email-change confirmation true. Local site URL is `http://127.0.0.1:3000`; additional redirect is HTTPS localhost; SMTP is commented out and local email testing enabled. These settings are not evidence of hosted configuration and must not be copied unreviewed to production.

Proposed minimum architecture: separate per-request user Auth client and server-only service-role business client. Add `@supabase/ssr` with compatible pinned version after a local integration test. In Next 16, design one `proxy.ts` refresh boundary, carefully incorporating existing staff/admin middleware rather than introducing two competing entry files. Refresh writes must be propagated to both request context and response cookies; route handlers still authorize every operation. Server components alone cannot persist refreshed cookies. Follow [Supabase SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Server identity resolver returns `{authUserId, canonicalUserId, originalLegacyUserId, assurance, activationState}`. Validate Auth server-side, map auth UUID through unique auth_user_id, require active/link-complete profile and then perform business checks. Do not trust getSession's user object or client metadata as authority. Use verified claims for ordinary identity and fresh Auth user checks for link/merge and sensitive operations; maintain MOVI suspension/revocation state for prompt fail-closed behavior. Signed JWT validity alone does not prove current session/account status; see [advanced SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Access token refresh and rotated refresh tokens replace the fixed HMAC lifetime. On transient refresh failure show retry, not destructive profile/session reset; on definitive invalid/revoked credentials require login. Cookie persistence does not guarantee shared PWA/browser storage. Exclude Auth callbacks, `/api/user/*`, private business responses and Set-Cookie responses from service-worker/CDN caches; use private/no-store server responses. Test refresh races across tabs. The SSR browser-client pattern does not inherit the current custom cookie's HttpOnly properties automatically: use SDK-supported cookie behavior, CSP/XSS controls and never expose the service key. See [session lifecycle](https://supabase.com/docs/guides/auth/sessions).

Routine login: `signInWithPassword({email,password})`. Recovery: generic `resetPasswordForEmail` response, allowlisted recovery callback, validate recovery session then `updateUser({password})`; return to normal login and offer/revoke other sessions according to policy. Signup-with-password via `signUp` plus confirmation is supported but collects password before verification, contrary to preferred UX. Use the activation ordering in §10 instead. Logout signs out the intended Auth scope, clears HMAC and client private state; define current-device versus all-devices explicitly. Reference: [password authentication](https://supabase.com/docs/guides/auth/passwords).

## 7. Canonical identity model

Keep `public.users.id` independent. Setting it equal to auth.users.id would require rewriting all direct, indirect and external references, add rollback risk and conflate credentials with a durable business person record.

Proposed additive fields: nullable `auth_user_id UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT`, identity status (`legacy`, `active`, `merged`, `review`, `blocked`), canonical merge target/metadata, normalized contact fields and legacy-auth cutoff/revocation metadata. Deleting Auth credentials must never cascade business rows. A controlled unlink blocks profile access and records evidence; it must not reopen legacy phone claim.

Only canonical active rows hold auth_user_id; merged sources have none. Exactly one effective profile per Auth principal is enforced by database constraints plus a transaction. Auth user's editable metadata cannot assign canonical IDs or roles. Prefer an already established valid Auth link when selecting canonical; if two different linked Auth identities occur, stop for account-recovery review. Otherwise prefer the adjudicated operational profile (captain/membership continuity), then a deterministic oldest-created/id tie-break only after identity agreement. Reference counts are continuity signals, not proof of ownership.

No auto-profile trigger on bare Auth-user creation: it would create extra MOVI rows before verification/candidate reconciliation. Track activation separately until finalization succeeds.

## 8. Phone normalization

All **12 definitions named normalizePhone** found in source:

| Behavior | Files |
| --- | --- |
| Trim/remove whitespace only | `src/app/api/user/login/route.ts`; `src/app/api/registrations/search/route.ts`; `src/app/api/user/communications/route.ts`; `src/components/tournaments/RegistrationDialog.tsx`; `src/app/admin/tournaments/[id]/registrations/RegistrationForm.tsx`; `src/app/api/admin/tournaments/[id]/registrations.csv/route.ts`; `src/app/page.tsx`; `src/app/tornei/page.tsx` |
| Also remove parentheses, dots and hyphens | `src/app/api/tournaments/[id]/registrations/route.ts`; `src/app/api/registrations/[id]/route.ts`; `src/app/api/tournaments/[id]/circuit-player-suggestions/route.ts`; `src/app/api/admin/tournaments/[id]/run/close/route.ts` |

Additional identity normalization: admin MoviBack profile PATCH trims only. `buildPlayerKey` in tournament registration/run-close additionally strips leading +39/0039 and all nondigits; this is a ranking key, not an E.164 account phone. Historical ranking repair inputs are trimmed. Search uses substring `ilike`, cancellation uses symmetric `includes`, communications uses exact normalized phone equality. These comparisons disagree even when displayed values look alike.

| Input | Current login key | Proposed Italian mobile canonical |
| --- | --- | --- |
| `3471286908` | `3471286908` | `+393471286908` |
| `+393471286908` | `+393471286908` | `+393471286908` |
| `00393471286908` | `00393471286908` | `+393471286908` |
| `347 128 6908` | `3471286908` | `+393471286908` |
| `+39 347 128 6908` | `+393471286908` | `+393471286908` |

Use one maintained numbering parser with explicit default IT for national person-mobile input, convert international 00 to +, validate country/number/type and emit E.164. Do not mechanically prepend +39 to arbitrary values or “correct” one digit. Explicit foreign numbers keep their country; technical/non-person/invalid legacy records enter review, retain raw values and get no invented canonical phone.

UI provides formatting/preview. Every server writer (signup, self-service, admin, import) uses the same authoritative contract. Database enforces normalized format, identity status and unique canonical phone for eligible active person profiles after reconciliation; raw legacy/tombstone values remain preserved. A server-only canonical setter or DB normalization trigger must prevent bypass; do not allow arbitrary normalized values from a browser. A partial unique index excluding merged/technical records needs a protected account-type/status field, not client-selectable exceptions. Race handling uses database uniqueness and locks. A collision creates a recovery/review case, not automatic account takeover. Phone is a contact/anti-duplicate signal, not an authentication credential; phone reuse requires reassignment history and review.

## 9. Email identity and normalization

Use trim + lowercase consistently for MOVI login/matching. Do not remove plus tags or dots or fold provider aliases; that can combine distinct mailboxes. Validate syntax server-side; verification establishes current mailbox control. Auth's verified email is authoritative for login; legacy `users.email` is a candidate/contact field until reconciled. Profile email changes must use Auth's verified email-change flow, then synchronized business contact update, not direct admin PATCH silently changing login ownership.

Add auth_user_id uniqueness first. Do **not** add UNIQUE(lower(trim(email))) on the current dataset. It would fail on known duplicates and reject legitimate shared contact emails. Preferred eventual uniqueness is on verified login identity/canonical active-person rows if the product adopts one mailbox per account, while allowing retained shared contact/history on legacy and technical rows. If separate people legitimately share an inbox, one email/password identity cannot safely stand for several independent people under this model: provide separate login emails or design an explicit managed/delegated-profile feature in a later project. Do not merge their medical/loyalty/captain data.

Unverified legacy changes can plant a matching email before migration. Freeze/record eligible legacy candidates at the cutover and restrict legacy contact/claim mutations; require staff review or independent trusted membership evidence where provenance is insufficient. Verification of the planted address alone is insufficient.

## 10. Existing-user activation flow

Proposed UX: “Attiva il nuovo accesso MOVI”.

1. Enter email, normalized on server. Return generic “Se l'indirizzo è utilizzabile, riceverai un codice” with rate limits; reveal neither account existence nor matched profiles.
2. Send Supabase email OTP for activation. OTP keeps verification in the initiating browser/PWA; bounded retries, expiry, resend cooldown and CAPTCHA escalation. `signInWithOtp` may create an Auth identity before verification; this is acceptable as an **unlinked pending identity**, never as a MOVI account claim. Use explicit shouldCreateUser policy. A bare Auth creation never merges or creates MOVI business data. [Supabase email OTP semantics](https://supabase.com/docs/guides/auth/auth-email-passwordless).
3. `verifyOtp` creates a verified Auth session; the server rechecks Auth user/email confirmation and server-owned activation attempt. This session is restricted to activation until profile finalization. Do not pretend that no Auth session exists until the last screen.
4. Server finds the frozen eligible normalized-email candidates. For an already linked identity, use normal login/recovery; do not let activation overwrite another link. For an unambiguous reviewed person, show minimal safe summary (masked contact, no medical data/balance/roster detail). Ambiguity displays “Serve una verifica con lo staff” without listing other people's profiles.
5. Set password using the verified Auth session, record password step completion server-side; never store passwords in public tables or logs. For zero legacy candidates, continue signup; for ambiguous candidates, do not create a second profile to bypass the conflict.
6. Finalize in one public-database transaction: revalidate reviewed evidence, lock candidates/identity keys, select canonical, apply approved merge policy, insert alias/journal/consent evidence, link auth_user_id and mark activation complete. Merge only **after** verified Auth identity exists and password setting succeeds.
7. Clear this client's legacy cookie and begin normal MOVI access with the Auth session. Other old sessions for affected profiles must step up, not silently inherit the merged account.

Auth API work and public-table merge are not one cross-service transaction. Use a retryable activation state machine: requested → verified → password_ready → review_required or finalizing → complete. Bind attempt to auth UUID, verified email, expiry and server-issued nonce; consume once. A concurrent completion returns the same result. SDK calls made directly from the browser must never bypass server finalization checks.

## 11. New-user signup flow

Collect name, phone, email, gender and required consents; marketing optional/unchecked. Validate/normalize server-side and keep a bounded pending draft with versioned consent evidence, not an active public profile. Verify email via OTP, set password, then finalize exactly one linked profile transactionally.

Finalization locks normalized email/phone keys and checks existing legacy, active and review-reserved identities. Same verified email redirects to activation/login/recovery; same normalized phone with a different identity gives “Questo numero richiede una verifica: accedi al tuo account o contatta lo staff”. Do not show the existing person's name, full email or business data, and do not accept editing the email/phone after verification without restarting the relevant check. Reused/shared phone requires staff adjudication, not a second account or a forced merge. Technical accounts are outside person signup. Concurrent signups rely on uniqueness and idempotent finalization, not a prior SELECT alone.

## 12. Duplicate merge architecture

Design `merge_user(source_id, canonical_id)` as a restricted server command wrapping one database transaction, not a chain of PostgREST updates. Public/anon/authenticated callers must not execute the merge RPC. Service role does not replace explicit review/authorization. Record merge actor, evidence version, reason, operation UUID, source/canonical IDs and per-table before/after images in access-controlled audit storage.

Preflight dry-run outputs candidate/provenance decisions, all references, unique collisions, membership balances, pending redemptions/orders, captain roles, consent conflicts and affected cookies. Reject self-merge, missing rows, blocked/technical profiles, two different auth links, ambiguous identity, unexpected new dependencies and unsupported table conflicts.

Transaction algorithm:

1. Lock normalized email/phone/activation keys and source/canonical user rows in deterministic UUID order; resolve and flatten any existing identity mappings.
2. Acquire locks on memberships, ledger/reward operations, roster and affected outbox rows in a documented common order. All concurrent business writers must check merged status and participate in the same locking/resolution protocol. User row locks alone do not stop current arbitrary child-table inserts.
3. Revalidate preflight version and counts after locks. Retry serialization/deadlock failures with the same operation ID; never continue a partially validated plan.
4. Apply each table policy in §5 and domain policies below. Unknown collision aborts the entire transaction. No generic UPDATE-every-user_id loop.
5. Store source profile and consent evidence, write alias, mark source inactive/merged, maintain exactly one canonical Auth link and invalidate affected weak-session access. Preserve raw snapshots and historical actors.
6. Assert FK integrity, unique ownership, no financial delta caused by merge, no duplicated reward/notification effects and correct captain mappings; commit the journal and state together.
7. External delivery/storage work occurs only after commit via deduplicated outbox; a merge must not itself send prior notifications, spend/refund points, fulfill rewards or move files.

Idempotency needs special treatment: keep old `(operation,user_id,idempotency_key)` scope and immutable request_hash/result. A future command first locks the canonical operation scope, searches reviewed aliases for the same original replay and compares normalized request semantics. Equal UUID keys with different business payloads/results produce a conflict and require review; never reuse one user's result for another request. A new deduplication/replay mapping can associate original records with canonical ownership without rewriting embedded JSON. Update **all** RPC and route replay readers before merging; until then merges involving idempotency rows remain blocked. Preserve original row IDs and namespace to support rollback. Outstanding processing records block merge until resolved.

Source rows retain history; canonical profile fields follow confirmed user input or reviewed authoritative evidence, not arbitrary latest updated_at. Existing login overwrites timestamps, so latest is not proof of accuracy. Name/gender/phone discrepancies require review; canonical phone changes must pass normalization/reuse checks. Link decisions and field decisions are separately auditable.

## 13. Alias bridge and legacy-cookie security

Proposed `user_id_aliases`: old_user_id PK, canonical_user_id FK RESTRICT, created_at, merged_at, reason, merge_operation_id, actor/evidence metadata. Retain source-row FK while tombstones are mandatory. Unique old ID, old != canonical, immutable target except reviewed canonical consolidation, and a transaction-enforced requirement that target is active and not itself an alias. Reject cycles and prohibit a canonical target being re-aliased without flattening all dependents under locks. One lookup is sufficient; unexpected chains/cycles fail closed, never recurse indefinitely.

Separate identity-history lifetime from legacy authentication acceptance. Do not expire historical alias records merely because 30-day cookies expire. Use a global last-legacy-issuance cutoff and per-profile cutoff/revocation state for authentication; history can remain indefinitely under retention policy. If eventual deletion is desired, first migrate archival actor references deliberately and account for RESTRICT/CASCADE and external references; it is not part of the initial rollout.

**Choose A: soft-merged inactive source rows.** Option B (delete after alias insertion) is unsafe: aliases do not satisfy existing user FKs, RESTRICT prevents deletion and CASCADE/SET NULL loses data. Soft merge also needs every writer/search to exclude merged identities and legacy login to stop upserting them.

Session precedence: valid completed Auth identity wins. If Auth credentials are present but invalid, revoked, pending or blocked, do not fall back to an old HMAC cookie. With no Auth credentials, accept legacy only if signature/lifetime/cutoff and profile state pass; unmigrated accounts can retain bounded existing access. An old source UID may be resolved to an activation destination, but it must not expose the canonical account's private profile/history or captain capabilities. Migrated/merged/blocked identities require fresh verified Auth. Logout clears both mechanisms. This avoids account-switch confusion and stale-cookie privilege expansion.

Retirement window: at least 30 days after the **last** permitted legacy token issue, plus a small explicitly chosen clock/deployment margin (proposed 48 hours); verify no node still issues tokens. Previously linked/merged profiles can require verification sooner. Do not renew weak cookies to extend the bridge. Retain historical aliases after removing HMAC authentication code.

## 14. Consent merge policy

Preserve every source value, timestamp, source profile ID and any available policy version/channel in an append-only restricted consent evidence log before changing effective fields. Current schema lacks policy version and reliable historical revocation evidence; document the gap rather than inventing evidence. Current login rewrites privacy/terms/age timestamps each submission and sets marketing false/null if unchecked.

Privacy/terms/age: retain all known acceptance evidence, expose the applicable valid evidence for current policy and obtain fresh acceptance where version/provenance is missing. Do not manufacture an acceptance timestamp, assume the oldest is current-policy approval or replace missing evidence with the other person's evidence before identity resolution. Keep original and new activation acceptance distinct.

Marketing: never OR booleans or pick an opt-in merely because it has a timestamp. Conflicting, missing or unreliable history gives effective opted-out. Only a later explicit, versioned, verified-person opt-in can supersede it. Preserve opt-out events even when legacy has no timestamp. Apply the same conservative approach to `loyalty_memberships.health_data_consent_at`; medical consent is separate from general marketing. These are engineering preservation rules, not a declaration that historical consent evidence is legally sufficient.

## 15. Monday League and communications compatibility

Captain identity is not simply any team player: `league_teams.captain_player_id` selects a `league_team_players` row whose `user_id` equals the authenticated MOVI UUID and `is_active` is true. `league_is_captain` in Stage 5 implements this. Proposed chain: verified Auth → users.auth_user_id → canonical users.id → linked active captain player. Keep captain_player_id and player UUID stable where possible.

Same-team user collision violates `(team_id,user_id)` even for inactive player rows because the partial index filters only null user_id. Do not delete a duplicate player row blindly: lineups/history may reference it. Staff must decide which roster identity survives and preserve historical slots through explicit mapping or a separately approved roster repair. Cross-team/season conflicting captain assignments require review; retaining two roles without checking league invariants is not safe.

Preserved contest actors need canonical-aware historical ownership checks: Stage 6 result context compares opened_by_user_id to current p_user_id, so leaving actors unchanged without updating that read model can hide an existing submission. Result, lineup and audit revisions remain unchanged. Weak legacy cookies must never be promoted into captain rights; require verified Auth for sensitive captain actions during coexistence, keeping unaffected legacy read/navigation usable.

Communication state collision policy is in §5. Pending league outbox events require delivery-time current-captain validation. Event keys embed recipient UUID and can create semantic duplicates after merge even without violating text uniqueness. Deduplicate using event type, match/result/contest/phase/team, schedule version and canonical recipient; preserve old keys as delivered evidence. Coordinate worker locks so a merge cannot race delivery. Delivered notifications are not re-enqueued. Personal communications may move recipient; tournament audience must transition from phone comparisons to reviewed ownership links while historical phones remain untouched.

## 16. MoviBack compatibility

Observed membership consumers often use `.eq('user_id', uid).maybeSingle()`; baseline enforces unique membership_code, **not one membership per user**. Multiple reassigned memberships could break reads even without a DB uniqueness error. Points derive from `loyalty_transactions.points_delta`, not a balance on users. Staff lookup, reward redemption, Store points and cancellation/refund commands share this graph.

If exactly one membership exists, move its user link, retaining membership ID/code, tax code, approval/suspension, fee status, certificate and health-consent evidence. If both users have memberships, automatic merge is blocked pending finance/domain reconciliation. Target one effective membership; archive the retired one using an explicit supported status/mapping, not an invented current enum value. Retain original membership-code lookup through a restricted alias if approved; never print a second redeemable identity.

Reconcile ledger by business event IDs (redemption, order, original transaction and idempotency evidence), not equal amount/date. Preserve all legitimate distinct credits/debits. Do not sum cached balances or replay earning/redemption functions. A duplicate credit is corrected only with an explicit approved compensating ledger event; keep original evidence. Preserve redemption IDs, QR tokens, fulfillment statuses, cancellation/refund history and related order links. Each committed redemption/refund occurs once. Resolve overlapping promos explicitly; do not multiply incentives twice. Suspended/rejected/fee-unpaid status cannot become approved/paid merely by choosing the other row.

Acceptance invariants: sum of unique legitimate ledger events before equals after unless a separately reviewed correction is recorded; reward counts/status and order/redemption links unchanged; no duplicate fee debit, reward, refund or QR capability; old membership code policy tested at staff lookup. Move ledger membership_id only in the reviewed membership-reconciliation transaction with before-images and all dependent consumers ready. Medical paths and files stay in place; future downloads authorize by the certificate row's effective owner, not just path prefix.

## 17. Store compatibility

`src/app/api/store/orders/route.ts` loads current user and stores customer_name/phone/email alongside user_id. Reassign only account ownership. Preserve snapshots, order number, items, totals, economic margin/cost snapshots, stock, supplier batch, status, pickup/payment and notification history. Do not resend order email to a new address during merge.

PF-08 and physical fulfillment/cancellation SQL use user-scoped idempotency and membership ownership. Cancellation verifies linked redemption ownership against order.user_id. Reassigning an order without corresponding approved membership ownership can break that invariant; keep changes atomic or defer the merge. Preserve related_redemption_id uniqueness and ledger pointers. Special-order customer_contact is free text, not a safe email/phone account join. Test both currently routed application-side writes and RPC workflows; migration presence does not prove runtime use.

## 18. Tournament and ranking compatibility

Keep tournament registrations and run participants as separate competition records. Account merge updates explicit user links only; p1/p2 phones, names, gender, pair composition, reserve/main status, position, run participant IDs and results stay historical. Partner phone is not account ownership proof. Participants with null user_id require separate reviewed linking; never infer it solely from normalized phone.

Current registration search uses `%phone%`; cancellation normalizes punctuation and permits `a.includes(b) || b.includes(a)` with only a nonempty check. This is insufficient ownership verification and can allow very short matches. Auth migration must explicitly replace this access path with verified owner/staff checks (or a scoped invitation/cancellation capability for an unregistered partner). Changing getUserIdFromCookie alone leaves the vulnerability intact. Public registration currently tolerates missing cookie; a UI login requirement is not a server security boundary.

`buildPlayerKey` strips Italian prefix and nondigits in registration/run-close. `circuit_results` is unique by `(ranking_group_id,source_tournament_id,player_key)`. Changing phones globally or invoking the existing `admin/circuits/[id]/merge-player-keys` operation can change rankings or collide results. Account merge must not do either. Ranking correction needs its own reviewed plan and before/after totals.

## 19. Security model and RLS

| Threat / observed exposure | Required boundary |
| --- | --- |
| Known phone permits login and overwrites email/name | Retire unverified claim; immediately protect migrated identities from legacy upsert and require step-up for sensitive operations. |
| Email planting, typo, shared inbox | Verification plus frozen/reviewed evidence; no claim based solely on current users.email. |
| Wrong duplicate/captain claimed | Staff adjudication of conflicting roles/memberships, unique Auth link, fresh verified identity; no caller-selected canonical UUID. |
| Phone reuse / format collision | Canonical normalization plus reviewed reassignment; historical phone never grants rights. |
| Alias poisoning/cycles | Server-only write, FK/status invariants, one-hop resolver, locks, immutable journal. |
| Stale HMAC and mixed Auth/HMAC identities | Auth precedence, fail closed on invalid/pending Auth, per-profile cutoff and no privilege expansion. |
| IDOR | Every server route checks effective owner or staff; service role bypasses RLS and does not authorize the request. |
| OTP/reset enumeration/abuse | Generic responses, per-address/IP rate limiting, expiry, replay resistance, allowlisted redirects, no tokens/passwords in logs. |
| CSRF and session fixation | Origin/CSRF checks on mutations, secure cookie policy, bound activation state, rotate/clear obsolete session state, explicit account switching. |
| Cached authenticated response / XSS | No private auth caching, CSP and output hygiene, no service key in browser; test PWA worker. |
| Direct Data API / RPC bypass | Test anon/authenticated grants with real roles before enabling Auth signup; restrict identity/merge tables and actor-parameter RPCs. |
| QR token disclosure | Keep tokens confidential and unchanged; QR access is narrowly scoped, never a profile-claim factor. |

Existing baseline RLS on medical_certificates, loyalty_memberships, reward_redemptions and loyalty_transactions compares auth.uid() to MOVI user_id (directly or via membership). This will not match independent UUIDs. Do not “fix” it by changing public primary keys. For the minimum server-only migration, keep those tables inaccessible to browser roles unless needed; validate grants and policies before exposing any new authenticated principal. If user-scoped RLS is later enabled, resolve `users.auth_user_id = auth.uid()` to canonical active profile inside a carefully secured helper, with no arbitrary ID argument or recursive policy leakage. Deny identity writes to users and keep service-role authorization explicit. Staff/admin authentication, approved_by and role assignment stay independent.

## 20. Staged rollout

Each stage is a separate reviewable implementation, with local tests before any future deployment. Stage 0 authorizes none of them.

| Stage | Deliverable and release gate | Rollback |
| --- | --- | --- |
| 1 — Additive identity foundation | Nullable Auth link/status, alias/journal/activation schema, canonical/assurance resolver behind flag, schema/grant tests, no user migration. Define writer locks and reviewed evidence workflow. | Disable new resolver; retain unused additive schema. No data rewrite. |
| 2 — Compatibility and containment | Retrofit all user readers/writers plus admin paths; legacy upsert blocked for protected identities, sensitive actions require step-up, phone-only authorization fixed, Auth/HMAC precedence tested. | Disable new enrollment/merge; keep protections for linked users, never revert them to phone takeover. |
| 3 — Auth activation and new signup | OTP/password/recovery/refresh/logout and pending-profile gate; production-like email confirmation/redirect config tested locally with mail capture. Canary on controlled accounts; no automatic duplicate merges. New signup Auth-only after gate. | Turn off enrollment; keep Auth login/recovery for existing linked users. |
| 4 — Merge engine and review tools | Dry-run/journal/table conflict policies, ledger and idempotency compatibility, staff approval, concurrency/rollback tests. No broad auto-merge. | Stop merge command; retain mappings for completed cases. |
| 5 — Existing-user migration | Reviewed candidate set, user verification, small cohorts; monitor link failures, roles, balances, orders, duplicate events and support load. | Pause activation/merges, preserve working Auth and legacy for eligible unmigrated users. |
| 6 — Legacy retirement | Stop issuance, wait 30 days + chosen margin, monitor remaining eligible users, remove HMAC auth. Retain historical aliases/tombstones. | Restore only bounded legacy access to never-migrated eligible users if necessary; never allow phone claim of migrated accounts. |

Operational phases correspond to A (additive schema/compatibility), B (activation canary), C (Auth-only new signup), D (legacy issuance disabled), E (legacy auth removed). Compatibility/containment must precede merges, not follow them. Do not deploy a merge engine while unchanged readers still assume raw uid or `.maybeSingle()` across multiple memberships. New signup gate does not stop recovery for existing accounts.

## 21. Failure recovery and rollback

| Failure | Recovery |
| --- | --- |
| Auth identity exists but profile link fails | Keep pending identity with no business access; retry same activation operation after fresh identity validation. Do not create another profile or automatically delete an Auth identity that may already be linked. |
| Password succeeds, public transaction fails | Resume finalization from password_ready; no need to store or recover password. |
| Merge fails halfway | PostgreSQL transaction rolls back all public-table mutations/journal state; external effects were not started. |
| Email delivery fails / expired OTP | Generic resend with cooldown; keep bounded draft, no business changes. Use local captured mail in tests only. |
| User abandons activation | Expire draft/claim reservation; reconcile orphan unlinked Auth identities under retention policy. Never delete blindly by age alone. |
| Password reset / lost device | Auth recovery on verified email; no name/phone knowledge bypass. Profile UUID and business links unchanged. |
| Duplicate discovered after activation | New reviewed merge request bound to current identities; two Auth principals require recovery review, not automatic credential consolidation. |
| Wrong accounts merged | Block affected access, revoke relevant sessions, stop delivery/financial writes, inspect journal and post-merge activity. Reverse exact row-level assignments only if versions/preconditions still match. Split subsequent shared activity manually; never promise automatic unmerge. |
| Rollback Auth rollout | Disable new activation/merge, retain schema/aliases and Auth login for linked profiles. Do not drop link columns or restore unsafe legacy login over migrated users. |

Keep a verified pre-merge backup and row-level operation journal with restricted access/retention. Whole-database restore is disaster recovery, not routine unmerge: it would discard unrelated concurrent transactions. Rolling back application code cannot undo an Auth API action; state-machine reconciliation must handle both systems. Define rollback flags and owners before a production canary.

## 22. Test strategy

No application test/build or DB-changing test was run for this documentation-only audit. The future suite must use isolated local DB/Auth with captured emails, synthetic users and deterministic operation IDs; never production recipients.

| Scenario | Required assertion |
| --- | --- |
| Existing canonical activation | Same public UUID, one verified Auth link; no profile duplication. |
| Reviewed duplicate activation | One canonical link, exact approved reassignment, tombstones/aliases and unchanged historical evidence. |
| Ambiguous/shared/technical identity | No merge/link/business data disclosure; review state. Antonio excluded, Ameno non-person review. |
| Wrong/unverified email, planted legacy email | No claim; verification mandatory and provenance eligibility independently enforced. |
| Reused phone / different verified email | Conflict/recovery flow; no rights transfer and no second active normalized phone. |
| Five +39/0039/space examples; foreign/invalid phone | Same E.164 for five valid examples, foreign retained, invalid/technical review, no one-digit repair. |
| Email casing/whitespace/plus tags | Trim/lowercase matching; plus tags/dots not collapsed; shared contact does not merge people. |
| Password/reset | Password step cannot be forged; recovery expiry/replay/redirect validation; public UUID stable. |
| Session refresh / concurrent tabs | Rotated cookies retained on response/redirect; no accidental fallback to HMAC; recover transient failures. |
| Browser/PWA close/restart/offline/cache | Within-lifetime persistence per context; no leaked cached identity; recover online without nulling user on server error. |
| Captain recognition and stale cookie | Active captain_player_id chain preserved; source HMAC cannot gain canonical captain rights. Same-team collision blocks. |
| MoviBack | Ledger conservation, one effective membership, stable QR/status/fee/refund/promo and medical file access. |
| Store | Stable snapshots/totals/stock/order IDs; cancellation/redemption ownership works; no resent email or duplicate refund. |
| Tournament | Registration/participant ownership correct, partner/reserve/match/standings unchanged; partial-phone deletion rejected. |
| Alias | Self/cycle/chain/missing/inactive target rejected; one-hop success; historical aliases retained after auth cutoff. |
| 30-day cookie | Test exp-1, exp, exp+1 and cookie Max-Age; current code rejects only now > exp. Test issuance cutoff and 48-hour margin separately. |
| Merge conflict / injected failure | Abort every step with zero partial reassignment and no outbox side effects. |
| Concurrent activation / signup | Same verified principal and same phone yield exactly one profile; loser receives safe retry/conflict. |
| Concurrent merge vs spend/redeem/registration/outbox | No orphan source writes, duplicate financial operation, stale recipient delivery or deadlock without bounded retry. |
| Idempotency collision | Same original request returns same result once; conflicting hash/result blocks, old namespace preserved. |
| Logout / account switching | Clear Auth and HMAC; local/all-session scope explicit; no silent resurrection via other cookie. |
| Deleted/revoked/banned Auth identity | Fail closed, no legacy fallback; business profile retained; revocation behavior tested beyond JWT signature validity. |
| Admin mutation / API roles | Admin cannot bypass normalized uniqueness or verified email ownership; anon/authenticated cannot call merge or forge RPC actor UID. |
| Rollback drill | Pause migration, retain login for linked users, restore reviewed untouched row assignments; post-merge writes force manual split. |

Required release evidence includes catalog/FK comparison, transaction invariant checks, browser/PWA tests on supported mobile platforms and canary metrics with no secrets/PII in logs. Unit tests alone cannot establish safe refresh delivery or cross-route business preservation.

## 23. Existing duplicate classification

Only names and the general existence of same-email/different-phone groups were supplied. No UUIDs, actual email/phone values, per-row timestamps, membership balances or dependency counts were supplied or found in the searched docs/fixtures. Therefore a likely canonical UUID and duplicate UUID list **cannot be responsibly assigned**. All “unknown” cells below are deliberate evidence gaps, not zero references.

| Known group | Current category | Canonical / duplicate IDs; references | Retain / confidence / confirmation |
| --- | --- | --- | --- |
| Alessandra Occelli | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | All profile/consent/history; medium confidence of duplicate candidate from supplied report, low confidence of merge safety; confirmation required. |
| Carola Mandrile | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same preservation rule; candidate reported, safety unverified; confirmation required. |
| Daniele Ambrassa | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; confirm phone typo vs distinct/reused phone and membership/roles. |
| Federica Manocchi | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; no guessed canonical; confirmation required. |
| Sabrina Ghio | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; no guessed canonical; confirmation required. |
| Stefano Cavazzuti | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; no guessed canonical; confirmation required. |
| Tiziana Mellano | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; no guessed canonical; confirmation required. |
| Massimiliano Rinaudo | MANUAL REVIEW; potential safe candidate after evidence | Unknown / unknown; counts unknown | Same; user/task-author name is not account ownership evidence; confirmation required. |
| Antonio Carvone | DO NOT MERGE automatically | Unknown / unknown; counts unknown | Explicit exclusion; only separately adjudicated manual process may reconsider. |
| Ameno | DO NOT MERGE into person accounts | Unknown / unknown; counts unknown | Treat as technical/legacy/non-person review until purpose is established. |

**SAFE AUTO-MERGE CANDIDATE: none established by available evidence.** Future eligibility requires verified mailbox, trusted reviewed legacy ownership, non-shared/non-technical identity, compatible canonical phone and personal data, no conflicting Auth links/roles/memberships/idempotency, and dry-run invariants passing. Prefix-only phone equivalence raises confidence but does not itself prove the person owns both profiles. A one-digit difference demands review.

## 24. Unresolved questions and production read-only gate

Do not query production for this Stage 0. The architecture is supportable from source; specific canonical selection and live completeness remain unverified. Before any subsequent production read-only check, present the exact selected query and obtain the separately authorized execution context. The queries below are **proposals only, not executed**; never read password hashes, secrets or tokens.

1. **Live schema drift and FK/index inventory.** Exact catalog queries:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT conrelid::regclass AS dependent_table, conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.users'::regclass
ORDER BY 1, 2;

SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ~ '(^|_)(user_id|phone|email)$'
       OR column_name IN ('player_key','customer_contact','created_by','actor_id'))
ORDER BY 1, 2, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexdef ILIKE '%user_id%' OR tablename IN
       ('users','loyalty_memberships','communication_user_states',
        'league_team_players','business_operation_idempotency'))
ORDER BY tablename, indexname;
SELECT to_regclass('public.registrations') AS legacy_registration_relation;
ROLLBACK;
```

2. **Candidate identities.** A reviewed minimal extract should establish UUIDs and fields before selecting references. This query covers all normalized-email duplicate groups and the explicit names, without assuming exact name matching catches every variant:

```sql
BEGIN TRANSACTION READ ONLY;
WITH duplicate_emails AS (
  SELECT lower(btrim(email)) AS email_key
  FROM public.users
  WHERE nullif(btrim(email), '') IS NOT NULL
  GROUP BY lower(btrim(email)) HAVING count(*) > 1
)
SELECT id, full_name, phone, email, gender, created_at, updated_at,
       privacy_accepted_at, terms_accepted_at, age_confirmed_at,
       marketing_accepted, marketing_accepted_at
FROM public.users
WHERE lower(btrim(email)) IN (SELECT email_key FROM duplicate_emails)
   OR lower(btrim(full_name)) IN (
     'alessandra occelli','carola mandrile','daniele ambrassa',
     'federica manocchi','sabrina ghio','stefano cavazzuti',
     'tiziana mellano','massimiliano rinaudo','antonio carvone','ameno')
ORDER BY lower(btrim(email)), created_at, id;
ROLLBACK;
```

3. **Per-ID dependencies.** After query 1/2, explicitly bind a reviewed UUID array to `$1` (do not infer from names). Catalog discrepancies must be resolved before executing this repository-derived query:

```sql
WITH refs AS (
 SELECT 'business_operation_idempotency' AS relation, user_id AS uid FROM public.business_operation_idempotency
 UNION ALL SELECT 'communication_user_states', user_id FROM public.communication_user_states
 UNION ALL SELECT 'communications', recipient_user_id FROM public.communications
 UNION ALL SELECT 'league_audit_events', actor_user_id FROM public.league_audit_events
 UNION ALL SELECT 'league_lineups', submitted_by_user_id FROM public.league_lineups
 UNION ALL SELECT 'league_notification_events', recipient_user_id FROM public.league_notification_events
 UNION ALL SELECT 'league_result_contests', opened_by_user_id FROM public.league_result_contests
 UNION ALL SELECT 'league_result_submissions', submitted_by_user_id FROM public.league_result_submissions
 UNION ALL SELECT 'league_team_players', user_id FROM public.league_team_players
 UNION ALL SELECT 'loyalty_memberships', user_id FROM public.loyalty_memberships
 UNION ALL SELECT 'medical_certificates', user_id FROM public.medical_certificates
 UNION ALL SELECT 'store_orders', user_id FROM public.store_orders
 UNION ALL SELECT 'tournament_registrations', user_id FROM public.tournament_registrations
 UNION ALL SELECT 'tournament_run_participants', user_id FROM public.tournament_run_participants
)
SELECT relation, uid, count(*) FROM refs
WHERE uid = ANY($1::uuid[]) GROUP BY relation, uid ORDER BY relation, uid;
```

Counts alone are insufficient: a subsequent separately reviewed conflict extract needs membership IDs/status/codes and ledger/redemption links, team/captain/player IDs, same-communication states, tournament entries and idempotency scopes. Do not run an unspecific “inspect everything” query. Until those exact UUID-scoped queries are prepared from known IDs, named merges stay blocked.

Other unresolved rollout gates: deployed migration versions; hosted Auth signup/confirmation/SMTP/rate-limit/redirect/password settings; custom domain and PWA contexts involved in logout reports; whether shared-email/phone family accounts are legitimate; Ameno's purpose; prior independent ownership evidence; technical account classification; safe effective-membership reconciliation policy; unsupported legacy `registrations` route; private storage access policies; actual use of transactional versus legacy Store paths; operator/recovery staffing; consent retention and policy versions. Source review cannot certify these live facts.

## 25. Recommended Stage 1

Implement only an additive identity foundation in a separately authorized task: schema design for nullable unique auth_user_id and identity state, restricted aliases/journal/activation records, canonical resolver with explicit assurance, dry-run reference inventory and local schema/grant/alias tests. Preserve UUIDs, legacy data and staff auth. Include a concrete compatibility checklist for every route in §2 and the appendix, plus containment decisions needed before any Auth activation is enabled.

Do not include production signup, email delivery, duplicate reconciliation, global phone/email backfill or a new unique email constraint in Stage 1. First establish reviewed candidate evidence and a concurrency/replay contract that makes a later merge safe. Stage 0 ends with this document only.

### Audit verification

Initial working tree: modified `supabase/config.toml`; untracked `supabase/tests/fixtures/home_sections_visual.local.sql`. Expected final addition: this document alone. Final checks: `git status --short`, `git diff --check`, document whitespace and existing-file SHA-256 preservation. No application code or schema changes are part of the audit.

Preserved file SHA-256:

- `supabase/config.toml`: `AB6710F151948EA93C719A150549B8315B564187B444802BACE9FEFFEB9C6F1B`
- `supabase/tests/fixtures/home_sections_visual.local.sql`: `60EAFA253BBAE7C78D2EDE7C65FDBE5C91E2FEC85809931D451953C3E85579B2`

## Appendix A. Route inventory from source

Generated from route source references to session helpers, user/actor IDs, phone/player keys, dependent tables and related domain RPCs. This lexical inventory supplements the traced behaviors above; a guard label records an explicit helper present in source, not a complete security certification. Indirect consumers must also preserve their parent object IDs. Staff-only account management is listed separately because it must not be merged with public users.

| Route | Exported methods | Explicit identity/guard helpers found |
| --- | --- | --- |
| /api/admin/circuits/[id]/merge-player-keys | POST | guardAdmin |
| /api/admin/circuits/[id]/rankings | GET | guardAdmin |
| /api/admin/comunicazioni/[id] | PATCH, DELETE | guardAdmin |
| /api/admin/comunicazioni | GET, POST | guardAdmin |
| /api/admin/login | POST | No listed helper; inspect local/token/cron checks |
| /api/admin/me | GET | getStaffSessionFromCookie |
| /api/admin/monday-league/lineups | GET, POST | guardAdmin, getMondayLeagueAdminActorId |
| /api/admin/monday-league/overview | GET | guardAdmin |
| /api/admin/monday-league/results | GET, POST | guardAdmin, getMondayLeagueAdminActorId |
| /api/admin/monday-league/teams/[id] | PUT, PATCH, DELETE | guardAdmin, getMondayLeagueAdminActorId |
| /api/admin/monday-league/teams | GET, POST | guardAdmin, getMondayLeagueAdminActorId |
| /api/admin/monday-league/users/search | GET | guardAdmin |
| /api/admin/moviback/certificate-url | POST | guardAdmin |
| /api/admin/moviback/dashboard | GET | guardAdmin |
| /api/admin/moviback/redemptions/[id]/transition | POST | guardStaff |
| /api/admin/moviback/redemptions | GET | guardStaff |
| /api/admin/moviback/requests | GET, POST | guardAdmin |
| /api/admin/moviback/users/[id]/adjust-points | POST | guardAdmin |
| /api/admin/moviback/users/[id]/promo | POST, DELETE | guardAdmin |
| /api/admin/moviback/users/[id] | GET, PATCH | guardAdmin |
| /api/admin/moviback/users | GET | guardAdmin |
| /api/admin/registrations/[regId] | PATCH, DELETE | guardAdmin |
| /api/admin/store-economics | GET | guardAdmin |
| /api/admin/store-economics/supplier-payment | POST | guardAdmin |
| /api/admin/store-orders | GET | guardAdmin |
| /api/admin/store-orders/toggle-paid | POST | guardAdmin |
| /api/admin/store/economics | GET | No listed helper; inspect local/token/cron checks |
| /api/admin/tournaments/[id]/fixed/run/start | POST | guardAdmin |
| /api/admin/tournaments/[id]/promote-first-reserve | POST | guardAdmin |
| /api/admin/tournaments/[id]/registrations.csv | GET | guardAdmin |
| /api/admin/tournaments/[id]/registrations/[regId] | PATCH, DELETE | guardAdmin |
| /api/admin/tournaments/[id]/registrations | GET, DELETE | guardAdmin |
| /api/admin/tournaments/[id] | GET, PATCH, DELETE | guardAdmin |
| /api/admin/tournaments/[id]/run/close | POST | guardAdmin |
| /api/admin/tournaments/[id]/run/generate | POST | guardAdmin |
| /api/admin/tournaments/[id]/run/lock | POST | guardAdmin |
| /api/admin/tournaments/[id]/run/reopen | POST | guardAdmin |
| /api/admin/tournaments/[id]/run/reset | POST | guardAdmin |
| /api/admin/tournaments/[id]/run | GET | guardAdmin |
| /api/admin/tournaments/[id]/run/start | POST | guardAdmin |
| /api/admin/tournaments | GET, POST | guardAdmin |
| /api/admin/users | GET, POST | guardAdmin |
| /api/cron/monday-league-notifications | POST | No listed helper; inspect local/token/cron checks |
| /api/monday-league/matches/[matchId]/contest | POST | getUserIdFromCookie |
| /api/monday-league/matches/[matchId]/lineups | POST | getUserIdFromCookie |
| /api/monday-league/matches/[matchId]/result | POST | getUserIdFromCookie |
| /api/monday-league/teams/[slug]/media | POST | getUserIdFromCookie, getMondayLeagueAdminActorId |
| /api/monday-league/teams/[slug]/profile | PATCH | getUserIdFromCookie, getMondayLeagueAdminActorId |
| /api/monday-league/teams/[slug]/roster | PUT | getUserIdFromCookie |
| /api/monday-league/teams/[slug] | GET | getUserIdFromCookie |
| /api/moviback/certificate/replace | POST | getUserIdFromCookie |
| /api/moviback/comunicazioni | GET | getUserIdFromCookie |
| /api/moviback/leave | POST | getUserIdFromCookie |
| /api/moviback/me | GET | getUserIdFromCookie |
| /api/moviback/reactivate | POST | getUserIdFromCookie |
| /api/moviback/redemptions | GET | getUserIdFromCookie |
| /api/moviback/request-membership | POST | getUserIdFromCookie |
| /api/moviback/rewards/redeem | POST | getUserIdFromCookie |
| /api/moviback/rewards | GET | getUserIdFromCookie |
| /api/registrations/[id] | DELETE | No listed helper; inspect local/token/cron checks |
| /api/registrations/search | POST | No listed helper; inspect local/token/cron checks |
| /api/reward-redemptions/[token] | GET | No listed helper; inspect local/token/cron checks |
| /api/reward-redemptions/[token]/validate | POST | guardAdmin, guardStaff |
| /api/staff/earn-points | POST | No listed helper; inspect local/token/cron checks |
| /api/staff/login | POST | No listed helper; inspect local/token/cron checks |
| /api/staff/lookup-membership | POST | guardStaff |
| /api/staff/me | GET | getStaffSessionFromCookie |
| /api/staff/reward-delivery | POST | guardStaff |
| /api/store/orders | POST | getUserIdFromCookie |
| /api/tournaments/[id]/circuit-player-suggestions | GET | No listed helper; inspect local/token/cron checks |
| /api/tournaments/[id]/live | GET | No listed helper; inspect local/token/cron checks |
| /api/tournaments/[id]/participants | GET | No listed helper; inspect local/token/cron checks |
| /api/tournaments/[id]/registrations/live | GET | No listed helper; inspect local/token/cron checks |
| /api/tournaments/[id]/registrations | POST | getUserIdFromCookie |
| /api/tournaments | GET | No listed helper; inspect local/token/cron checks |
| /api/user/communications | GET | getUserIdFromCookie |
| /api/user/communications/state | POST | getUserIdFromCookie |
| /api/user/login | POST | No listed helper; inspect local/token/cron checks |
| /api/user/logout | POST | No listed helper; inspect local/token/cron checks |
| /api/user/me | GET | getUserIdFromCookie |
