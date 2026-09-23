# MOVI Auth 2.0 — final pre-release audit

Date: 2026-09-23
Branch: `main`
Base commit: `7132d0830155de02be79efa0d412972490e6c380`
Scope: Stages 0–5B, H-01, M-01, M-02 and M-03
Verdict: **GO FOR CONTROLLED PROGRESSIVE PRODUCTION ROLLOUT**

## Audit boundary

All database, Auth, HTTP and concurrency checks ran against the unlinked local stack:

- API `http://127.0.0.1:55021`
- database `postgresql://postgres:postgres@127.0.0.1:55022/postgres`
- Studio `http://127.0.0.1:55023`
- Mailpit `http://127.0.0.1:55024`

The application server and build received explicit local environment overrides. `.env.local` was not trusted as a target selector. No hosted project was read or changed. No commit, push, deploy, project link or remote database command was performed. The pre-existing protected changes in `supabase/config.toml` and `supabase/tests/fixtures/home_sections_visual.local.sql` were not edited, reverted or staged.

## Architecture and identity

`public.users.id` remains the application identity and all business domains keep referencing it. Supabase Auth supplies credentials through the nullable one-to-one `public.users.auth_user_id` link. Auth is authoritative when present. The legacy cookie is limited to eligible unlinked profiles; aliases never authorize access.

Normalization, activation, signup, password reset, logout, duplicate review, merge, consent handling and the linked/review/conflict/merged policies remain fail-closed. Stage 5B remains lookup-only and cannot create a legacy profile. Stage 6 is outside this release and is not authorized.

## Closed findings

### H-01 — CLOSED — personal API cache

`next.config.ts` emits a `NetworkOnly` runtime rule for every GET `/api/**` request. The custom activation worker deletes the historical `apis` cache. A production build generated 139 routes and the emitted worker was inspected: `/api/**` uses `NetworkOnly`, imports the custom worker and the compiled worker calls `caches.delete("apis")`. Generated worker artifacts were restored after inspection.

### M-01 — CLOSED — immutable audit evidence

Migration `20261002100000_movi_auth2_audit_truncate_hardening.sql` revokes `TRUNCATE` from `service_role` on all six immutable evidence tables. A clean local replay and an effective-privilege query returned false for every table:

- `user_auth_link_events`
- `user_auth_migration_events`
- `user_duplicate_review_decisions`
- `user_legacy_login_events`
- `user_merge_journal`
- `user_moviback_reconciliation_evidence`

Existing insert/read behavior and immutable row guards passed the Stage 1–5B SQL suites.

### M-02 — CLOSED — duplicate dashboard request fan-out

The old dashboard issued 12 count requests per candidate user. With 210 candidates its worst-case path was about 2,531 database/PostgREST requests including the surrounding reads.

Migration `20261003100000_movi_auth2_final_remediation.sql` adds the service-role-only `duplicate_user_reference_counts(uuid[])` RPC. It aggregates all 12 business counters in one set-based query and returns one complete JSON count object per requested user. The remaining detail reads use UUID batches of 100, preventing overlong PostgREST URLs without reintroducing per-user queries.

The scale acceptance created 210 profiles and exercised the bounded 500-group queue. The dashboard returned 200 in 114.2 ms with a 1,207,448-byte response and 19 database requests for that high-group fixture. Direct SQL verified 210 result rows and exact parity for communications, Monday League, MoviBack, medical, Store and tournament counters.

### M-03 — CLOSED — durable legacy-login throttling

The compatibility login now consumes an atomic database rate-limit attempt before field validation and before identity lookup. The policy uses fixed 15-minute windows with:

- 8 attempts per client plus normalized identity;
- 30 attempts per client;
- every attempt, including success, consuming quota;
- `429` and `Retry-After` when blocked;
- `503` fail-closed behavior if the limiter is unavailable.

Bucket keys are server-side HMAC-SHA256 values. The table contains no raw IP, email, phone, password, cookie or token and is inaccessible even to direct `service_role` table queries. Only the security-definer consume RPC is executable by `service_role`. Transaction advisory locks serialize threshold races. Vercel forwarding headers are trusted only when `VERCEL=1`; another proxy must explicitly set `LEGACY_RATE_LIMIT_TRUST_PROXY_HEADERS=true`. A dedicated `LEGACY_RATE_LIMIT_SECRET` is documented, with `USER_COOKIE_SECRET` as the compatibility fallback.

HTTP acceptance allowed attempts 1–8, blocked attempt 9 with `429` and a positive `Retry-After`, and allowed a distinct client. The concurrency test primed seven attempts and raced two workers; exactly one was accepted. A separate client remained available.

## Business-domain recheck

- **MoviBack:** ownership, ledger evidence, redemption state, delivery state and reconciliation invariants remain intact.
- **Monday League:** captain identity remains the application UUID; roster collisions and historical evidence retain existing safeguards.
- **Store:** order ownership counters include open and total orders without altering snapshots, inventory, payment or fulfillment.
- **Tournaments:** registration and run-participant counters preserve existing collision policy and history.
- **Communications:** per-user state is counted without emitting or mutating communications.
- **Consents:** merge rules remain conservative and cannot manufacture marketing consent.
- **Admin/staff:** privileged authentication still uses the separate signed staff-session model and is unchanged by Auth 2.0.

## Verification evidence

- clean local replay applied 28 migrations through `20261003100000_movi_auth2_final_remediation.sql`;
- 26 autonomous SQL suites passed with the normal local seed;
- 5 Auth concurrency suites passed;
- Stage 5B HTTP acceptance passed for eligible, unknown, linked, review, conflict and stale-cookie states;
- final remediation HTTP scale and rate-limit acceptance passed;
- TypeScript passed;
- targeted ESLint passed;
- 175 Node tests passed after updating the Stage 4 source contract for the set-based counter implementation;
- production build passed and generated 139 routes;
- generated service worker inspection passed;
- `git diff --check` passed, apart from the existing protected-file line-ending notice where applicable.

The production build continues to report the pre-existing `themeColor` metadata notices and stale Browserslist data. Five historical PF08 harnesses still encode the old local port 54322; their autonomous SQL coverage passed through the current local container. These are LOW maintenance items and do not alter Auth correctness.

## Production prerequisites

1. Freeze the approved commit and migration checksums.
2. Verify backup/PITR retention and a recent restore drill.
3. Run the approved read-only inventory and duplicate classification against production.
4. Configure the canonical HTTPS Site URL and exact callback allow-list.
5. Require verified email and configure production SMTP, SPF, DKIM, DMARC and bounce ownership.
6. Set matching public/server Supabase URLs and keys; keep the service-role key server-only.
7. Set strong independent `USER_COOKIE_SECRET`, `STAFF_COOKIE_SECRET` or `ADMIN_COOKIE_SECRET`, and `LEGACY_RATE_LIMIT_SECRET`.
8. Set `AUTH2_LEGACY_REGISTRATION_DISABLED=true` explicitly.
9. Confirm the real proxy path used for the client rate-limit key. Do not enable the generic trust flag unless the application is behind a controlled proxy that overwrites forwarding headers.
10. Verify secure cookies, callback, signup, login, reset, logout and service-worker replacement on the final HTTPS origin.
11. Keep all new registration Auth-only and keep Stage 6 closed.
12. Assign owners for recovery, SMTP incidents, review-required profiles, conflicts, merge review and rollback.

## Controlled rollout

Apply only the reviewed additive migrations, verify effective grants and counts, deploy the frozen application, and smoke-test Auth plus the legacy eligible path. Migrate one controlled user and verify the same `public.users.id` across MoviBack, Store, tournaments, Monday League and communications. Open a small voluntary cohort, monitor login/rate-limit outcomes and queue latency, then expand progressively. Duplicate merges remain individually reviewed, fingerprinted and verified. Stop new activation, scans or merges on anomalies; preserve evidence and prefer an application rollback or reviewed forward database correction over destructive reversal.

## Final verdict

All HIGH and MEDIUM findings from the pre-release audit are closed by tested local changes. The release is **GO FOR CONTROLLED PROGRESSIVE PRODUCTION ROLLOUT**, subject to the prerequisites above and an approved production change window. This verdict does not authorize Stage 6, automatic merges, remote execution, deployment or any destructive production action.
