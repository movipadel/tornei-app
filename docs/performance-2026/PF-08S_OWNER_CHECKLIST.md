# PF-08S Owner Checklist

This checklist is intentionally practical and does not require you to paste passwords, keys, project references, or environment values into chat.

## Owner must do manually

### Create and isolate the environment

- [ ] Create a separate Supabase project named clearly as staging/test, never production.
- [ ] Confirm its billing/ownership/access is appropriate for test work.
- [ ] Create a dedicated Vercel staging deployment or staging project with a clearly different hostname.
- [ ] In Vercel, set staging deployment environment variables to the staging Supabase project only.
- [ ] Confirm no Preview or staging deployment inherits production Supabase credentials.
- [ ] Keep production and staging project references visible in the provider dashboards so they cannot be confused.

### Protect customers and providers

- [ ] Do not copy production users, auth accounts, sessions, orders, redemptions, push subscriptions, contact details, or provider credentials.
- [ ] Leave Resend, Telegram, and web-push provider variables absent from staging until a reviewed test adapter exists.
- [ ] Confirm there are no real email addresses, Telegram chats, or browser-push subscriptions in staging.
- [ ] Use only synthetic test users and a controlled test mailbox if notification testing is later approved.
- [ ] Use distinct user/staff/admin cookie signing secrets in staging.

### Establish schema confidence

- [ ] Decide who owns the authoritative production schema baseline.
- [ ] Approve a versioned migration/schema-replay process; do not rely on manually re-created tables.
- [ ] Apply the approved baseline to staging.
- [ ] Ask for/read the schema comparison report proving staging contains required tables, functions, indexes, constraints, RLS policies, and grants.
- [ ] Keep a backup/recovery plan and an approved migration window before any production consideration.

### Prepare test operation

- [ ] Approve the meaning of missing stock, `NULL` stock, nullable-size variants, membership uniqueness, debit reversal, and fulfillment repair/replacement.
- [ ] Confirm the PF-08 synthetic fixture list is acceptable.
- [ ] Name a release owner and a second reviewer for staging tests and production gates.
- [ ] Confirm a staging hostname, banner, and environment label will visibly say `STAGING`.
- [ ] Approve a forward-only rollback rehearsal before production consideration.

## Codex can prepare

Only after the owner has created the isolated project and provided non-secret confirmation of its purpose and environment boundary, Codex can prepare the following in a separate approved task:

- [ ] A proposed versioned Supabase migration baseline/workflow, without applying it.
- [ ] Read-only schema-drift, grants, index, RLS, and function metadata checks.
- [ ] Synthetic fixture specification and a staging-only seed plan for review.
- [ ] A safe concurrency/idempotency/failure-injection test harness design and tests.
- [ ] A reviewed staging environment assertion, visual staging badge, environment logging label, and notification kill switch/test adapter.
- [ ] PF-08B migration/RPC drafts after the readiness gate is met.
- [ ] A forward rollback runbook and reconciliation queries.

## Do not do yet

- [ ] Do not create PF-08 migrations, RPCs, triggers, or constraints in production.
- [ ] Do not point a preview/staging application at production Supabase.
- [ ] Do not paste any key, secret, service-role credential, cookie secret, provider token, or project access token into chat.
- [ ] Do not clone production data into staging by default.
- [ ] Do not test checkout/redemption concurrency against production.
- [ ] Do not enable real Resend, Telegram, or web-push delivery for PF-08 testing.
- [ ] Do not treat Vercel Preview alone as sufficient evidence of a safe test environment.
- [ ] Do not begin PF-08B until all readiness requirements are marked complete.

## Short confirmation record for the owner

When the manual work is complete, retain this information in your internal release record (not in chat):

- staging Supabase project created and access owner identified;
- staging Vercel deployment created and hostname recorded;
- proof that staging variables reference only staging Supabase;
- proof that notification credentials/recipients are absent or test-only;
- schema baseline/replay method and comparison result;
- fixture owner and reset method;
- rollback rehearsal owner and planned date.

At that point, ask Codex to perform a **read-only PF-08S readiness review**. Do not send secrets.

