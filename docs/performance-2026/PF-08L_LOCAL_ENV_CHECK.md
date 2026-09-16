# PF-08L Local Staging Environment Check

## Status

PF-08L inspection is complete. Local Supabase staging is currently **NOT READY**. Node.js, npm, and Git are available, but Docker, the Supabase CLI, repository Supabase configuration, a schema baseline, migrations, and a seed strategy are missing.

This task did not install or start software, initialize Supabase, read environment values, connect to any Supabase project, execute SQL, or modify production.

## A. Local tool availability

| Tool | Result | Classification |
|---|---|---|
| Docker CLI | `docker` command not found on PATH | **MISSING** |
| Docker Compose | Unavailable because the Docker CLI is missing | **MISSING** |
| Docker Desktop / engine | Standard Docker Desktop executable, bundled CLI path, and `com.docker.service` were not found. No engine status request was possible. | **MISSING** |
| Supabase CLI | `supabase` command not found on PATH; no project-local `supabase` npm package is installed | **MISSING** |
| Node.js | Installed: `v24.13.0` | **READY** |
| npm | Installed: `11.6.2` | **READY** |
| Git | Installed: `2.53.0.windows.1` | **READY** |

No installation, update, application start, service start, container operation, or remote command was attempted.

## B. Repository Supabase setup

| Item | Evidence | Classification |
|---|---|---|
| `supabase/` | Directory absent | **MISSING** |
| `supabase/config.toml` | Absent | **MISSING** |
| Versioned migrations | No Supabase migration directory or migration SQL found | **MISSING** |
| `seed.sql` | Absent | **MISSING** |
| Local Supabase scripts | No start/stop/status/reset/seed scripts found | **MISSING** |
| Schema baseline | No executable schema baseline found. `docs/performance-2026/PF-08A_SQL_CHECKS.sql` is SELECT-only audit material, not a schema baseline. | **MISSING** |
| Generated database types | No generated Supabase `Database` type file or generation command found | **MISSING** |
| Supabase CLI npm scripts | `package.json` contains only `dev`, `build`, `start`, and `lint` | **MISSING** |
| Docker/local database configuration | No Dockerfile, Compose file, or local database script found | **MISSING** |
| Package manager | `package-lock.json` is present | Available, but it contains no project-local Supabase CLI dependency |

Relevant existing paths:

- `package.json`
- `package-lock.json`
- `.env.example`
- `.env.local`
- `src/lib/supabaseClient.ts`
- `src/lib/supabaseServer.ts`
- `src/lib/supabaseAdmin.ts`
- `README.md`
- `scripts/test-baraonda.ts`
- `scripts/test-fixed-pair-six-bracket.mts`

The two scripts are application logic tests, not local database lifecycle or seed tooling.

## C. Environment references

Local environment files found:

| File | Status |
|---|---|
| `.env.example` | Present |
| `.env.local` | Present and ignored by Git |
| `.env` | Not found in the inspected root |
| Staging/local-specific env file | Not found |

Environment variable names present in the inspected `.env*` files are:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_COOKIE_NAME`
- `ADMIN_COOKIE_SECRET`
- `ADMIN_PASSWORD`
- `USER_COOKIE_NAME`
- `USER_COOKIE_SECRET`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `RESEND_API_KEY`
- `STORE_ECONOMICS_ADMIN_EMAILS`
- `STORE_ORDERS_EMAIL`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

`SUPABASE_URL` is referenced by server code but was not found among the inspected environment-file variable names. `supabaseAdmin()` falls back from `SUPABASE_URL` to `NEXT_PUBLIC_SUPABASE_URL`; `supabaseServer` requires `SUPABASE_URL` directly.

The variables are generic and can technically target production, local Supabase, or another project. No environment-name convention, project-reference assertion, or committed local-only example proves separation. The presence of `.env.local` alone does not establish that it is safe; its values were intentionally not inspected.

Local environment isolation: **INSTALLED BUT NOT READY**. The application supports environment-supplied endpoints, but there is no documented local profile or guard preventing a local development process from using production credentials.

## D. Hardcoded Supabase target check

Classification: **NO HARDCODED TARGET**.

The three inspected Supabase initialization helpers obtain the URL and keys from environment variables. No Supabase URL, project reference, host, or project ID is hardcoded in those files.

The repository does contain hardcoded production web-domain redirect documentation/configuration, but that is not a Supabase target. It does not change this classification.

## E. Local staging feasibility

| Requirement | Status | Reason |
|---|---|---|
| Docker | **MISSING** | No command, standard Desktop installation, CLI file, or service found. |
| Supabase CLI | **MISSING** | No global command or local package found. |
| Repository Supabase config | **MISSING** | No `supabase/` or `config.toml`. |
| Schema baseline | **MISSING** | No reproducible schema replay source. |
| Migrations | **MISSING** | No versioned migration history. |
| Seed strategy | **MISSING** | PF-08 documents describe fixture requirements, but no executable local seed strategy exists. |
| Local env isolation | **INSTALLED BUT NOT READY** | `.env.local` exists and endpoints are configurable, but local/production separation is not evidenced or guarded. |

Overall local Supabase staging readiness: **NOT READY**.

The environment is feasible in principle: the application already reads Supabase connection data from environment variables, and Node/npm/Git are ready. The blocking work is local infrastructure and a trustworthy schema/fixture workflow, not an application rewrite.

## F. Shortest safe next steps

### Owner action

1. Install Docker Desktop for Windows using the official installer, then start it manually and confirm the engine is running.
2. Install the Supabase CLI using an official supported Windows method; verify only its version initially.
3. Ask Codex to prepare the repository-local Supabase configuration and reviewed schema-baseline plan. Do not initialize or link to a cloud project independently if the target is unclear.
4. After the local stack exists, create a local-only ignored environment file using local Supabase output. Configure these names with local values only:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - staging/local-only cookie secrets
5. Confirm notification provider variables are absent for PF-08 tests.
6. Before starting the application or tests, verify the resolved Supabase host is local and that no remote project is linked.

Do not paste credentials, keys, environment values, or access tokens into chat.

### Codex action later

After Docker and Supabase CLI are installed and the owner explicitly authorizes the next setup phase, Codex can prepare for review:

1. `supabase/config.toml` and a local-only workflow without remote linking;
2. a reviewed production-equivalent schema baseline and versioned migration structure;
3. synthetic PF-08 seed data with no production PII;
4. local environment guardrails and production-project rejection checks;
5. local start/status/reset instructions;
6. schema verification, concurrency, idempotency, notification-isolation, and rollback-rehearsal tests.

No item in this section was executed during PF-08L.

## G. Production safety confirmation

No command in this task connected to Supabase or any database. In particular, this task did not run `supabase link`, `supabase db pull`, `supabase db push`, remote migration commands, SQL, HTTP database requests, or provider API calls.

Only local executable/version discovery, local filesystem inspection, package metadata inspection, and Git working-tree inspection were performed. Production was neither contacted nor modified.

