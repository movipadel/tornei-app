# PF-08S Environment Guardrails

## Purpose

PF-08 staging must make it difficult for a test deployment, migration rehearsal, or concurrency harness to reach production Supabase or real notification recipients. These are recommendations for a later reviewed implementation; none are implemented by this document.

## Required guardrails before PF-08B

| Guardrail | Recommended behavior | Why |
|---|---|---|
| Explicit application environment | Introduce `APP_ENV` with an explicit `staging` value for staging and a separate production value. Never infer staging from `NODE_ENV`. | Both environments may run optimized production builds. |
| Expected project reference | Introduce `EXPECTED_SUPABASE_PROJECT_REF`; validate the resolved Supabase URL against it at application start. | Prevents a copied/misbound variable from directing staging to production. |
| Resolved URL validation | Validate the final URL used by browser, server, and admin Supabase helpers. Fail closed outside approved production when it is absent, malformed, or points to the wrong project. | Current helpers use `NEXT_PUBLIC_SUPABASE_URL`, mandatory `SUPABASE_URL`, and a server fallback differently. |
| Server/public URL consistency | In staging, require `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` to identify the same staging project. | Prevents server writes and browser reads from splitting across environments. |
| Service-key pairing | Validate that the service-role key is configured only in the server environment and belongs to the expected staging project through a safe startup/health check that reveals no key material. | A service-role key bypasses RLS. |
| Notification kill switch | Introduce `NOTIFICATIONS_ENABLED=false` by default in staging; all email, Telegram, and push paths must no-op safely and record only non-PII test intent. | Current integrations have no single audited switch. |
| Provider allowlist | When notification tests are explicitly enabled, require test-only recipient/chat/domain/subscription allowlists. | Avoid accidental real delivery. |
| Fault-injection restriction | Introduce `PF08_FAULT_INJECTION_ENABLED`; permit it only when `APP_ENV=staging` and the expected project reference matches staging. | Failure injection must never be reachable in production. |
| Staging visual marker | Persistent page badge/title label driven by `STAGING_VISUAL_LABEL`. | Reduces operator error during manual tests. |
| Structured log label | Include `app_env`, non-secret project label, deployment identifier, and request/test correlation ID in logs. | Makes cross-environment mistakes visible during races and rollback rehearsal. |
| Cookie isolation | Use different `USER_COOKIE_SECRET`, `ADMIN_COOKIE_SECRET`/`STAFF_COOKIE_SECRET`, and preferably cookie names for staging. | Prevents cross-environment session acceptance. |
| Deployment protection | Protect the staging deployment with provider access controls where practical, while retaining access for the test team. | Limits accidental public test use. |

## Environment variable policy

### Existing names that require staging-only values or absence

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- User/staff security: `USER_COOKIE_SECRET`, `USER_COOKIE_NAME`, `ADMIN_COOKIE_SECRET`, `ADMIN_COOKIE_NAME`, `STAFF_COOKIE_SECRET`, `STAFF_COOKIE_NAME`, `ADMIN_PASSWORD`.
- Email: `RESEND_API_KEY`, `STORE_ORDERS_EMAIL`, `STORE_ECONOMICS_ADMIN_EMAILS`.
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Web push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

### Proposed names for later implementation

- `APP_ENV`
- `EXPECTED_SUPABASE_PROJECT_REF`
- `NOTIFICATIONS_ENABLED`
- `PF08_FAULT_INJECTION_ENABLED`
- `STAGING_VISUAL_LABEL`

No secret belongs in client-exposed `NEXT_PUBLIC_*` variables except the intended Supabase anonymous key and public VAPID key. The Supabase service-role key, cookie secrets, provider keys, and fault-injection control must remain server-only.

## Deployment rules

1. Production deployment may use only the production project reference and production provider policy.
2. Staging deployment may use only the staging project reference and must start with notifications disabled.
3. Preview deployment must either use the staging project with the same guards or be blocked from transactional routes; it must never inherit production service-role credentials.
4. A deployment mismatch must fail closed before handling a mutation request. It must not silently fall back from `SUPABASE_URL` to a production public URL.
5. Project identifiers and environment labels may be logged only in approved non-secret form; keys, cookie signatures, tokens, recipient PII, cart contents, and idempotency hashes must not be logged.

## Notification safety controls

Initial PF-08 staging mode should have all outbound providers disabled. A later reviewed test mode may enable a test adapter only when all of the following hold:

- `APP_ENV` is staging;
- expected staging project validation passed;
- the dedicated notification test flag is enabled;
- every destination is on a test allowlist;
- the event is labelled as synthetic;
- provider responses are captured without secret values or customer data.

If any condition fails, suppress delivery and record a bounded diagnostic event. This control must not alter the database transaction outcome.

## Verification checklist for a future implementation task

- [ ] A staging build fails when `APP_ENV=staging` resolves a production Supabase project.
- [ ] A staging build fails when `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` disagree.
- [ ] Browser bundles do not contain server-only keys or cookie/provider secrets.
- [ ] Service-role operations work only through server code against staging.
- [ ] All notification paths no-op under staging default settings.
- [ ] Fault injection cannot be activated outside staging.
- [ ] Staging pages, logs, and test output are visibly labelled.
- [ ] Preview deployment behavior is documented and tested.
- [ ] A test checkout/redemption cannot write to production when staging credentials are deliberately misconfigured; it fails before mutation.

## Current gaps this guardrail design addresses

- No committed staging-specific environment selection or project reference is present.
- `NODE_ENV` alone cannot distinguish staging from production.
- Supabase helper URL selection is not entirely uniform.
- Current Resend, Telegram, and web-push integration points lack one common kill switch.
- Current Vercel configuration contains a production-host redirect but no committed preview/staging binding.

These gaps are design inputs for a future approved implementation task, not authorization to make changes now.

