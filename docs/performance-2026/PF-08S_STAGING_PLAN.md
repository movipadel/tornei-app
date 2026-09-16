# PF-08S Staging Setup Plan

## Status

PF-08S design inspection is complete. PF-08 remains **CONDITIONAL GO**: the production-data checks are reported clean, but no isolated staging environment is evidenced in the repository. PF-08B should not start until the readiness gate at the end of this document is satisfied.

This plan is design-only. It creates no project, environment variable, migration, RPC, source change, or production change.

## Current deployment evidence

| Area | Evidence | Assessment |
|---|---|---|
| Hosting | README describes Vercel production hosting and `next.config.ts` redirects the exact host `tornei-app.vercel.app` to the production domain. | Production Vercel use is evidenced. |
| Preview deployment | No `vercel.json`, Vercel project metadata, CI workflow, or preview environment binding is committed. The redirect does not prove previews are configured. | **Not confirmed.** |
| Supabase initialization | `src/lib/supabaseClient.ts`, `supabaseServer.ts`, and `supabaseAdmin.ts` construct clients from environment variables. | Centralized in three helpers, with two URL-selection paths. |
| URL selection | Browser client uses `NEXT_PUBLIC_SUPABASE_URL`; server client requires `SUPABASE_URL`; admin client prefers `SUPABASE_URL` and falls back to `NEXT_PUBLIC_SUPABASE_URL`. | A missing/misaligned server URL can silently make admin work use the public URL value. |
| Staging configuration | No staging-named variable, separate project reference, Supabase config, seed, migration directory, or test database setup was found. | **Not found.** |
| Local database target | `.env.local` exists but repository files do not identify whether local development points to production or a separate project. Values were not inspected. | **Unknown; must be treated as production-risk until verified by the owner.** |
| Hard-coded production endpoint | The production domain and old Vercel host are hard-coded only in redirect/documentation evidence reviewed. Supabase project identity is environment-supplied rather than hard-coded in source. | Domain redirect needs staging-aware handling; database target remains environment-controlled. |

The configuration is partly centralized, but environment selection is not fully single-source: browser, server, and admin helpers use different URL fallbacks. The future guardrail must validate the resolved URL used by every helper, not only one variable name.

## Recommended topology

For PF-08, use a **second, dedicated Supabase staging project** and a **dedicated staging Vercel deployment**. This is preferable to relying solely on per-branch Vercel previews because migration rehearsal, fault injection, logs, and repeated concurrency runs need a stable, isolated endpoint.

```text
PF-08 branch
  -> dedicated staging Vercel deployment (for example, staging-only hostname)
  -> separate Supabase staging project
  -> synthetic fixtures only

Optional pull-request preview
  -> preview Vercel deployment
  -> same isolated staging project only after project-ID guards are active
```

Use previews for UI/route review after the guardrails exist. Do not let arbitrary previews inherit production Supabase variables, service-role credentials, or notification credentials. A production project must never be the default fallback for any non-production deployment.

The staging application should be unmistakable:

- a staging-only hostname, distinct browser title, and persistent `STAGING` banner;
- a visually different theme/accent or header ribbon;
- environment label in structured logs, error reports, test output, and test fixtures;
- a non-production favicon/app name where practical;
- synthetic names clearly labelled as test data.

## Environment variable plan

Values are intentionally not shown. The actual code currently reads the following names.

### Must differ from production

| Variable name | Reason |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser client must point only to staging Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Must belong to the staging project matching the browser URL. |
| `SUPABASE_URL` | Required by the server Supabase helper; must resolve to staging. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key must belong only to staging Supabase. |
| `USER_COOKIE_SECRET` | Prevents a production signed user session from being accepted in staging. |
| `ADMIN_COOKIE_SECRET` and/or `STAFF_COOKIE_SECRET` | Prevents cross-environment staff/admin session acceptance. |
| `ADMIN_PASSWORD` | If used, make it a staging-only test value. |
| `STORE_ECONOMICS_ADMIN_EMAILS` | Use only test recipients, or leave absent while notifications are disabled. |
| `STORE_ORDERS_EMAIL` | Must be a test mailbox only, or leave absent while notifications are disabled. |
| `RESEND_API_KEY` | Prefer absent while disabled; if email testing is approved, use a dedicated sandbox/test key only. |
| `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` | Prefer absent while disabled; if testing is approved, use a dedicated test bot and private test chat only. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Prefer absent while disabled; otherwise use a staging-only VAPID identity and test subscriptions only. |

### May remain operationally shared, but do not use as a staging selector

| Variable name | Guidance |
|---|---|
| `NODE_ENV` | Let Vercel control its standard production build behavior. It cannot distinguish the staging deployment from production. |
| `ADMIN_COOKIE_NAME`, `USER_COOKIE_NAME`, `STAFF_COOKIE_NAME` | Names may remain the same when hostnames are isolated, but using staging-specific names is a helpful additional barrier. |

### Recommended new guardrail names

These are proposed names for a later reviewed implementation, not current configuration requirements:

- `APP_ENV=staging`
- `EXPECTED_SUPABASE_PROJECT_REF`
- `NOTIFICATIONS_ENABLED=false`
- `PF08_FAULT_INJECTION_ENABLED=false`
- `STAGING_VISUAL_LABEL=STAGING`

`APP_ENV` must be independent of `NODE_ENV`; production builds can legitimately exist in both staging and production deployments.

## Supabase bootstrap options

| Option | Suitability | Recommendation |
|---|---|---|
| A. Versioned migration/schema replay | Reproducible, reviewable, supports schema drift checks and clean rehearsal. | **Preferred target state.** |
| B. Manual recreation of a reduced schema | Easy to drift from real constraints, RLS, grants, functions, and indexes. | **Do not use for PF-08.** |
| C. Production clone | Can provide fidelity but may transfer PII, auth material, storage, and historical activity. | **Do not clone data by default.** A schema-only approved baseline is safer. |
| D. Supabase CLI/local workflow | Valuable for fast schema iteration and isolated checks, but does not replace a real hosted staging project for Vercel, service-role, concurrency, and migration rehearsal. | Use as a complement after a versioned schema baseline exists. |

The safest practical path for MOVIPadel is:

1. establish a reviewed, versioned schema baseline that reproduces the production schema, functions, indexes, constraints, RLS policies, and grants;
2. apply that baseline to the new staging Supabase project;
3. compare staging metadata with production metadata using read-only checks before PF-08 changes;
4. add the PF-08 migration as a new versioned migration and rehearse it only on staging;
5. use a local/ephemeral CLI workflow for fast iteration where useful, then validate the exact migration on hosted staging.

The repository currently has no committed Supabase migration/seed workflow in the reviewed scope. The owner must establish this baseline before migration rehearsal; Codex can prepare the reviewed artifacts later, but must not invent or manually recreate a partial schema.

### Staging should contain

- production-equivalent schema objects needed by PF-08: tables, types, functions, triggers, constraints, indexes, RLS policies, and grants;
- the custom user/staff session-compatible application configuration, with staging-only signing secrets;
- required Store and MoviBack catalog/reference data in synthetic form;
- only the product/color/size, stock, reward, membership, ledger, order, redemption, and notification-subscription structures needed for test cases;
- PF-08 migration history and schema-drift evidence.

### Do not copy by default

- customer PII, contact details, tax codes, membership codes, customer notes, or historical purchase/redemption activity;
- production auth users, sessions, JWT/cookie secrets, service-role keys, or provider credentials;
- real notification recipients, Telegram chats, web-push subscriptions, or email recipient lists;
- production Storage objects, except optional explicitly licensed non-sensitive test images;
- historical operational logs and unrelated tournament data.

## Minimum PF-08 synthetic dataset

This defines data capabilities only. It is not a data-creation instruction.

| Fixture | Required state |
|---|---|
| Test user A | Synthetic user with one approved membership and deterministic positive ledger balance. |
| Test user B | Synthetic user with one approved membership and a separate known balance, suitable for contention. |
| Memberships | Approved records only for A/B; add one pending/suspended synthetic case for authorization rejection. |
| Points | Known opening balance and known ledger deltas; include a balance sufficient for one constrained spend but not two. |
| Product stock = 10 | Active finite Store variant for normal and multi-item checkout. |
| Product stock = 1 | Active finite Store variant for last-unit races. |
| Sized variant | Product, active color, active size, and exact tracked stock row. |
| Null-size variant | Product/color with `size_id IS NULL` and one finite stock row, if that supported business path remains approved. |
| Multi-item cart | At least two distinct variants plus a repeated line case for canonical aggregation. |
| Store-linked reward | Active reward requiring Store fulfillment and, where relevant, variant selection. |
| Non-Store reward | Active reward which must create redemption/debit without fulfillment order. |
| Pending redemption | Legitimate requested/pending record, separate from the fresh operation fixtures. |
| Completed redemption | One complete historical synthetic chain: redemption, debit, and expected fulfillment where applicable. |
| Idempotency cases | Fresh key, same-key/same-request retry, same-key/different-request conflict, and dropped-response-after-commit replay. |

Also include inactive/missing catalog cases, zero stock, unlimited `NULL` stock where the approved behavior supports it, and a multi-item cart that fails on one constrained line. Keep fixtures namespaced and reproducible. No fixture may use a real person or delivery destination.

## Notification safety

Current integration points are server-side:

- Resend email via `src/lib/email.ts`, used by Store order handling;
- Telegram via `src/lib/telegram.ts`, used by Store, registration, and MoviBack routes;
- web push via `src/lib/adminPush.ts`, used by Store, registration, and MoviBack routes and reading subscriptions through the service-role client.

Current code has no audited global notification kill switch. Telegram skips when its two variables are absent; Resend and web push report missing configuration as errors. PF-07 already treats these as post-commit side effects, so provider failure must not become a transaction correctness test.

**Safest first staging posture: disable all outbound providers.** Do not supply `RESEND_API_KEY`, `STORE_ORDERS_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, or `VAPID_SUBJECT` to the staging deployment. Ensure staging contains no copied push subscriptions.

For later notification-specific tests, add a reviewed application-level kill switch/test adapter before enabling any provider. The adapter must default to disabled outside explicitly approved test runs, record intent without recipient PII, and route only to controlled test destinations. Never reuse production Resend, Telegram, VAPID, or recipient configuration.

## PF-08 scope: Auth and Storage

| Area | Required for PF-08 | Optional for full-app staging |
|---|---|---|
| Supabase Auth | Not required for the core transactional tests. PF-08 actor identity comes from the MOVIPadel signed user cookie and server-derived user ID, not `auth.uid()`. | Required only if separate full authentication journeys are being tested. |
| Public application user rows | Required as synthetic rows because memberships, orders, and redemptions reference users. | Broader user profile scenarios. |
| User/staff cookie signing | Required, using staging-only cookie secrets and synthetic sessions. | Full login/reset/administration journeys. |
| Storage | Not required for checkout, redemption, stock, balance, locking, or idempotency testing. | Product/reward images and upload flows. |
| Certificates/custom domain | Not required if the secure staging Vercel hostname is used. | Required only for a branded staging domain. |
| Product images | Not required; synthetic catalog rows may omit images or use local/non-sensitive placeholders. | Visual Store/reward testing. |
| QR tokens | Required only as generated synthetic redemption values to test uniqueness/replay. No external scanner infrastructure is required. | Staff scanning end-to-end tests. |
| Real user accounts | Never required. | Never use them in staging. |

## Future PF-08 migration workflow

```text
Reviewed versioned migration file
  -> apply to isolated staging
  -> read-only schema / grant / metadata verification
  -> route and integration tests
  -> concurrency, idempotency, and fault-injection tests
  -> forward rollback rehearsal
  -> production review gate
```

Use new, monotonic versioned migration files. Never edit an already applied migration. Before application, compare the source baseline and staging schema metadata against the approved production baseline; after application, verify functions, indexes, constraints, RLS, ownership, and execute grants with read-only catalog queries.

Rollback preparation must be forward-only: preserve idempotency records and committed RPC results, disable new RPC starts through the future selector, and use a reviewed corrective/rollback migration only where safe. Do not revert to the original legacy mutation path for an ambiguous request that may already have committed.

Production consideration requires: clean staging test evidence, a rehearsed rollback, data-quality recheck immediately before constraints, security/grant review, compatibility approval, backups/recovery approval, and an explicit release owner.

## PF-08B readiness gate

| Requirement | Current status |
|---|---|
| Separate Supabase staging project | **NOT READY** — no repository evidence. |
| Staging app points only to staging database | **NOT READY** — guardrails/configuration not present. |
| Notifications cannot reach real users | **PARTIAL** — can be avoided operationally by omitting provider variables, but no global kill switch exists. |
| Synthetic dataset exists | **NOT READY** — design exists; no fixture implementation evidenced. |
| Required schema matches production | **NOT READY** — no versioned baseline/schema drift workflow evidenced. |
| Rollback can be rehearsed | **PARTIAL** — PF-08 rollout design exists; isolated environment does not. |
| Concurrency testing is safe | **NOT READY** — no isolated project/harness evidenced. |
| Idempotency design is finalized | **PARTIAL** — transactional design is complete; persistence/implementation contract still needs the approved PF-08B review. |

Overall PF-08B readiness: **NOT READY**. Reassess only after the owner checklist is complete and staging evidence is documented.

