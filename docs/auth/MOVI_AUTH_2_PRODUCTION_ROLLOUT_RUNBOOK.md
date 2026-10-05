# MOVI Auth 2.0 — production rollout runbook

Prepared: 2026-09-23\
Frozen release candidate: `6d230fd3902cd4825ac065f49307bb4f354b2f47`\
Production Supabase ref: `unhalrlrnqxgfatbybrc` (`eu-west-2`)\
Vercel project: `movipadels-projects/tornei-app`\
GitHub repository: `movipadel/tornei-app`\
Status: **PREPARATION COMPLETE; WRITE GATE IS STOPPED**

This document prepares a later approved production change. It does not authorize a migration, configuration change, push, deployment, Auth-user operation, merge or Stage 6.

## 1. Frozen SHA and release range

The local release is exactly `6d230fd3902cd4825ac065f49307bb4f354b2f47`. Production Git is represented by `origin/main` at `b841eb71dac6c221743874de2874ec1e588bcaf7`. The unpushed range is `b841eb7..6d230fd`, in this order:

1. `688d59f` Document MOVI Auth 2.0 architecture
2. `0b9f81e` Add MOVI Auth 2.0 identity foundation
3. `451a5c2` Add MOVI Auth 2.0 activation and signup
4. `5f76687` Add MOVI Auth 2.0 duplicate merge engine
5. `2262d1d` Add MOVI Auth 2.0 migration operations
6. `c683f88` Add MOVI Auth 2.0 progressive migration
7. `48ade52` Add MOVI Auth 2.0 controlled legacy cutover
8. `e901d3d` Remove generated TypeScript build artifact
9. `a5eb197` Prevent service worker caching of API responses
10. `7132d08` Harden immutable Auth audit tables
11. `6d230fd` Complete MOVI Auth 2.0 prerelease remediation

Before the change window, repeat:

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/main
git log --reverse --oneline origin/main..HEAD
```

Required result: the two local-only protected paths are the only dirty entries, HEAD is `6d230fd3902cd4825ac065f49307bb4f354b2f47`, and `origin/main` is still the explicitly approved pre-rollout commit. Stop if the range changed.

## 2. Production systems

| System | Production identity |
|---|---|
| Supabase | `unhalrlrnqxgfatbybrc`, `eu-west-2` |
| Vercel | `movipadels-projects/tornei-app` |
| Current deployment | `dpl_Ay542Epp4JfEcf2Ef8vKCegparD2`, Git SHA `b841eb71dac6c221743874de2874ec1e588bcaf7` |
| Primary application origin | `https://tornei.movipadel.it` |
| Additional aliases | `https://app.movipadel.it`, `https://tornei-app.vercel.app` |
| GitHub | `movipadel/tornei-app` |

The read-only precheck used the exact HTTPS Supabase host `unhalrlrnqxgfatbybrc.supabase.co`. The local Supabase project remains unlinked.

## 3. Production preflight

### 3.1 Schema and migration ledger

REST/OpenAPI shows no Auth 2.0 tables, functions or `public.users` Auth 2.0 columns. This supports a clean pre-Stage-1 state and found no exposed naming collision. REST cannot expose the private `supabase_migrations` schema, so a database operator must run this with a read-only connection before any write:

```sql
BEGIN READ ONLY;

SELECT EXISTS (
  SELECT 1 FROM pg_namespace WHERE nspname = 'supabase_migrations'
) AS migration_schema_exists;

SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('public','supabase_migrations')
  AND (table_name LIKE 'user_%'
       OR table_name = 'legacy_login_rate_limits'
       OR table_name = 'schema_migrations')
ORDER BY table_schema, table_name;

SELECT routine_schema, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE '%user%auth%'
       OR routine_name LIKE '%user%merge%'
       OR routine_name LIKE '%duplicate%'
       OR routine_name = 'consume_legacy_login_rate_limit')
ORDER BY routine_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='users'
  AND column_name IN ('auth_user_id','identity_status','merged_into_user_id','auth_migration_state')
ORDER BY column_name;

ROLLBACK;
```

If the ledger exists, export every row before deciding how to record the manually applied files. If any Auth 2.0 object or version exists unexpectedly, stop and reconcile its definition and checksum.

### 3.2 User and duplicate inventory

Read-only production findings on 2026-09-23:

- 211 `public.users` profiles;
- Auth link, identity status, migration state and soft-merge columns absent, as expected before Stage 1;
- no missing email or phone;
- no malformed email;
- 3 malformed/technical phone profiles, all classified as technical/non-person;
- 9 normalized-email duplicate groups and 1 normalized-phone group;
- 19 unique candidate profiles;
- group classification: 6 likely canonical candidates, 2 manual-review groups, 1 technical/non-person group and 1 unresolved same-event tournament conflict.

Anonymized review keys are hashes of normalized signals, not contact values:

| Key | Members | Preliminary classification | Material evidence |
|---|---:|---|---|
| `email:3e83a1ad6f15` | 3 | unresolved conflict | same-event tournament collision |
| `email:313c66316063` | 2 | likely canonical candidate | unequal history score, no collision detected |
| `email:73f4d7b23999` | 2 | likely canonical candidate | unequal history score, no collision detected |
| `email:c377ad3211c6` | 2 | manual review required | dual MoviBack membership |
| `email:a60f80896b86` | 2 | likely canonical candidate | unequal history score, no collision detected |
| `email:4865e6c625dd` | 2 | likely canonical candidate | unequal history score, no collision detected |
| `email:3acd72908c8f` | 2 | likely canonical candidate | unequal history score, no collision detected |
| `email:47ab580669a5` | 2 | manual review required | dual MoviBack membership |
| `email:29ddfd890063` | 2 | technical/non-person | invalid technical identity signal |
| `phone:c8c9c683d1a3` | 2 | likely canonical candidate | unequal history score, no collision detected |

These labels are planning classifications only. The Stage 4 scanner, saved decision, current fingerprint and human review remain authoritative. Do not merge from this table.

### 3.3 MoviBack

- 95 memberships total;
- 9 memberships attached to duplicate candidates;
- no individual candidate owns more than one membership;
- 2 duplicate groups contain memberships on both profiles;
- 580 ledger transactions and zero orphan membership references;
- candidate memberships have a net ledger sum of 1,633 points; this is an aggregate integrity reference, not an entitlement adjustment;
- 14 redemptions belong to candidate memberships;
- no tax-code, membership-type or membership-status incompatibility was detected within the two dual-membership groups.

Both dual-membership groups require the reviewed Stage 4 reconciliation path. No pre-rollout reconciliation is allowed.

### 3.4 Monday League

`Monday League 2026/27` exists, is `draft`, has `published_at` NULL and is therefore hidden. Phase 1 is `draft`, has no generation timestamp and has zero rounds. The season currently has zero teams, zero roster players and zero captains. No duplicate candidate has a league reference or same-team collision.

### 3.5 Store, tournaments and communications

- Store: 19 orders and 19 items; duplicate candidates own 3 orders; no duplicate group has orders on multiple member profiles.
- Tournaments: 290 registrations and 156 run participants; candidates own 43 registrations and zero run participants; one duplicate group has a same-event collision and must remain blocked.
- Communications: 1 user-state row; candidates own 1 state; no duplicate group has a same-communication collision.

Historical customer snapshots, player keys, ranking data and communication delivery must not be rewritten by preflight or rollout smoke tests.

## 4. Backup

Do not run these commands until the approved change window. Use PostgreSQL 17 client tools and the exact direct or session-pooler endpoint copied from the Supabase Dashboard. Do not place the password in source control or the manifest.

```powershell
$ErrorActionPreference = 'Stop'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = "D:\BACKUP-MOVIPADEL\AUTH2-PRE-ROLLOUT-$Timestamp"
$PgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
$PgRestore = 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$DbHost = '<EXACT_DIRECT_OR_SESSION_POOLER_HOST_FROM_SUPABASE_DASHBOARD>'
$DbPort = '<5432_OR_DASHBOARD_PORT>'
$DbUser = '<EXACT_DASHBOARD_DATABASE_USER>'
$DbName = 'postgres'
$env:PGPASSWORD = '<REDACTED_DATABASE_PASSWORD>'
$env:PGSSLMODE = 'require'

New-Item -ItemType Directory -Path $BackupRoot -ErrorAction Stop | Out-Null

& $PgDump --host $DbHost --port $DbPort --username $DbUser --dbname $DbName `
  --format custom --compress 9 --blobs `
  --schema public --schema auth `
  --file (Join-Path $BackupRoot 'auth2-pre-rollout.dump')
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }

& $PgRestore --list (Join-Path $BackupRoot 'auth2-pre-rollout.dump') |
  Set-Content -LiteralPath (Join-Path $BackupRoot 'pg_restore-list.txt')
if ($LASTEXITCODE -ne 0) { throw 'pg_restore --list failed' }

@'
BEGIN READ ONLY;
SELECT current_database(), current_user, version();
SELECT nspname FROM pg_namespace WHERE nspname IN ('public','auth','supabase_migrations') ORDER BY 1;
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger;
SELECT table_schema,table_name FROM information_schema.tables
 WHERE table_schema IN ('public','auth','supabase_migrations') ORDER BY 1,2;
SELECT routine_schema,routine_name FROM information_schema.routines
 WHERE routine_schema='public' ORDER BY 1,2;
ROLLBACK;
'@ | Set-Content -LiteralPath (Join-Path $BackupRoot 'inventory.sql')

& $Psql --host $DbHost --port $DbPort --username $DbUser --dbname $DbName `
  --set ON_ERROR_STOP=1 --file (Join-Path $BackupRoot 'inventory.sql') `
  | Set-Content -LiteralPath (Join-Path $BackupRoot 'inventory.txt')
if ($LASTEXITCODE -ne 0) { throw 'inventory failed' }

$Manifest = [ordered]@{
  created_at = (Get-Date).ToUniversalTime().ToString('o')
  release_sha = '6d230fd3902cd4825ac065f49307bb4f354b2f47'
  supabase_project_ref = 'unhalrlrnqxgfatbybrc'
  vercel_project = 'movipadels-projects/tornei-app'
  pre_rollout_deployment = 'dpl_Ay542Epp4JfEcf2Ef8vKCegparD2'
  pre_rollout_deployment_sha = 'b841eb71dac6c221743874de2874ec1e588bcaf7'
  dump = 'auth2-pre-rollout.dump'
  schemas = @('public','auth')
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $BackupRoot 'manifest.json')

Get-ChildItem -LiteralPath $BackupRoot -File |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path,Hash |
  ConvertTo-Json |
  Set-Content -LiteralPath (Join-Path $BackupRoot 'sha256.json')

Remove-Item Env:PGPASSWORD
Remove-Item Env:PGSSLMODE
```

The backup gate passes only if `pg_dump` exits zero, `pg_restore --list` exits zero and contains both `public` and `auth`, the inventory is complete, checksums are saved, and a named operator confirms the restore procedure. A recent managed PITR/backup status must also be recorded.

## 5. Hosted Auth configuration

The public read-only Auth settings show signup enabled, email provider enabled, phone provider disabled and email auto-confirm disabled. This matches verified-email signup intent.

The available API does not safely expose Site URL, redirect allow-list, password policy, email rate limits, SMTP host/sender, PKCE details or recovery allow-list. A Supabase Dashboard operator must capture screenshots or an approved configuration export showing:

- Site URL: `https://tornei.movipadel.it`;
- Redirect URL: `https://tornei.movipadel.it/auth/callback`;
- optional additional exact redirect `https://app.movipadel.it/auth/callback` only if that alias is intentionally allowed to originate Auth flows;
- no wildcard production origins;
- email confirmation required;
- minimum password length at least 8, consistent with application validation, plus the approved compromised-password and reauthentication policy;
- configured email/signup/recovery rate limits;
- production custom SMTP, authenticated sender, SPF, DKIM, DMARC, bounce monitoring and owner;
- authorization-code/PKCE callback compatibility;
- recovery email returns through `/auth/callback` and then the allow-listed internal `/reset-password` destination.

The application generates only one external Auth callback path: `/auth/callback`. Query-string `next` is restricted by code to `/registrati?verified=1`, `/attiva-account?verified=1` and `/reset-password`; `/accedi` is the safe fallback. The destination pages are application routes, not additional Supabase redirect allow-list entries.

## 6. Vercel environment

Read-only Production inventory:

| Requirement | Status | Action before deployment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT | verify it points to `unhalrlrnqxgfatbybrc` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PRESENT | verify project match without disclosing value |
| `SUPABASE_SERVICE_ROLE_KEY` | PRESENT | verify project match; keep server-only |
| `SUPABASE_URL` | MISSING, optional fallback | optional; current Auth clients fall back to public URL |
| `NEXT_PUBLIC_APP_URL` | **MISSING — BLOCKER** | set exactly `https://tornei.movipadel.it` |
| `AUTH2_LEGACY_REGISTRATION_DISABLED` | **MISSING — BLOCKER** | set exactly `true` |
| `LEGACY_RATE_LIMIT_SECRET` | **MISSING — BLOCKER** | create a strong independent secret |
| `USER_COOKIE_SECRET` | PRESENT | verify strength and rotation ownership |
| `USER_COOKIE_NAME` | PRESENT | preserve current cookie continuity |
| `STAFF_COOKIE_SECRET` | MISSING, fallback present | `ADMIN_COOKIE_SECRET` currently satisfies the implemented fallback |
| `ADMIN_COOKIE_SECRET` | PRESENT | verify strength; do not expose value |
| `RESEND_API_KEY` | PRESENT | verify sender/domain and delivery ownership |
| `CRON_SECRET` | PRESENT, unaffected | preserve exactly |

Vercel sets `VERCEL=1`; the limiter therefore uses `x-vercel-forwarded-for` and then `x-real-ip`. Do not set `LEGACY_RATE_LIMIT_TRUST_PROXY_HEADERS` in Production unless the deployment stops running behind Vercel and a controlled proxy overwrites those headers.

## 7. Migration order and checksums

Apply only these eight files, in order. Do not edit prior migrations and do not invoke scan, merge or Auth Admin commands.

| # | Migration | SHA-256 | Expected primary changes |
|---:|---|---|---|
| 1 | `20260926100000_movi_auth2_stage1_identity_foundation.sql` | `7528dcb940b663c4d42417bdae48ce6e95e2c7247275ba6d121b8f351b92654d` | 3 tables, 5 functions, 5 indexes, 2 triggers, 2 `users` alters |
| 2 | `20260927100000_movi_auth2_stage2_activation.sql` | `fd5946b3f15b6892121c7feca8b6ba1ab3ee7f0e4f9243b11061966a3a9231e3` | 2 tables, 4 functions, 1 trigger |
| 3 | `20260928100000_movi_auth2_stage3_merge_engine.sql` | `916f47d56dd2dafeb6f624de1e37eacb88a47e4f43c8efce3bce7bf2a7e57d75` | 2 tables, 7 functions, 2 indexes, 1 trigger, 1 `users` alter |
| 4 | `20260929100000_movi_auth2_stage4_review_ops.sql` | `7db7dee5a064ffb7baccc5cfbd7fdda1f3446d2eecc3b9759a34c59f6cc410c2` | 3 tables, 12 functions, 2 indexes, 2 triggers |
| 5 | `20260930100000_movi_auth2_stage5a_progressive_migration.sql` | `3845209dba6ac053ba0ea7d046c04d8a2b80ef9e1bc8308c84fbf9ad0c661a63` | 1 table, 5 functions, 2 indexes, 2 triggers, 1 `users` alter |
| 6 | `20261001100000_movi_auth2_stage5b_legacy_cutover.sql` | `26777ff7a2bc65c656f75c29ff88f2251e46140aa321fefa60d5b1e8b4eb73c9` | 1 table, 2 functions, 1 index, 1 trigger |
| 7 | `20261002100000_movi_auth2_audit_truncate_hardening.sql` | `88617188f1b5759642e05d059c8ccb38a2b1df2c4301f0c77820cff5b2a77ca7` | 6 effective `TRUNCATE` revocations |
| 8 | `20261003100000_movi_auth2_final_remediation.sql` | `dd92b98ad74968f40126b3d19e26f9804e585a14a9ab6cceafd58d5c242416cf` | 1 private table, 2 functions, 1 index |

Dependencies are linear: Stage 2 uses Stage 1 normalization/linkage; Stage 3 uses Stage 1 merge evidence; Stage 4 extends Stage 3 review/merge; Stage 5A replaces Stage 2 functions and adds migration state; Stage 5B uses Stage 1 normalization and Stage 5A state; hardening requires all six audit tables; final remediation requires Stage 4 domain objects and Stage 5B login.

## 8. Migration execution and post-verification

Because Monday League was previously applied manually, the ledger is currently unverified, and production exposes no Auth 2.0 objects, the recommended strategy is **A: manual `psql`, one reviewed file at a time, each in its own transaction**. Do not use `supabase db push` or link the local repository. If the direct ledger inspection proves a complete, exact and compatible CLI history, the change owner may reconsider tooling in a separate approval; otherwise retain strategy A and record file hashes in the restricted change record.

Template for the later approved write window:

```powershell
$ErrorActionPreference = 'Stop'
$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$DbHost = '<EXACT_APPROVED_HOST>'
$DbPort = '<EXACT_APPROVED_PORT>'
$DbUser = '<EXACT_APPROVED_USER>'
$DbName = 'postgres'
$env:PGPASSWORD = '<REDACTED_DATABASE_PASSWORD>'
$env:PGSSLMODE = 'require'
$MigrationRoot = 'D:\PROGETTI-APP\tornei-app\supabase\migrations'
$Files = @(
  '20260926100000_movi_auth2_stage1_identity_foundation.sql',
  '20260927100000_movi_auth2_stage2_activation.sql',
  '20260928100000_movi_auth2_stage3_merge_engine.sql',
  '20260929100000_movi_auth2_stage4_review_ops.sql',
  '20260930100000_movi_auth2_stage5a_progressive_migration.sql',
  '20261001100000_movi_auth2_stage5b_legacy_cutover.sql',
  '20261002100000_movi_auth2_audit_truncate_hardening.sql',
  '20261003100000_movi_auth2_final_remediation.sql'
)
foreach ($File in $Files) {
  & $Psql --host $DbHost --port $DbPort --username $DbUser --dbname $DbName `
    --set ON_ERROR_STOP=1 --single-transaction --file (Join-Path $MigrationRoot $File)
  if ($LASTEXITCODE -ne 0) { throw "STOP: migration failed: $File" }
}
Remove-Item Env:PGPASSWORD
Remove-Item Env:PGSSLMODE
```

After each file, run the matching read-only predicate and stop on any false result:

```sql
BEGIN READ ONLY;

-- V1, after Stage 1
SELECT to_regclass('public.user_merge_operations') IS NOT NULL
   AND to_regclass('public.user_identity_aliases') IS NOT NULL
   AND to_regclass('public.user_merge_journal') IS NOT NULL
   AND to_regprocedure('public.normalize_user_email(text)') IS NOT NULL
   AND to_regprocedure('public.normalize_user_mobile_e164(text)') IS NOT NULL
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='users' AND column_name='auth_user_id') AS stage1_ok;

-- V2, after Stage 2
SELECT to_regclass('public.user_auth_onboarding') IS NOT NULL
   AND to_regclass('public.user_auth_link_events') IS NOT NULL
   AND to_regprocedure('public.prepare_user_auth_signup(uuid,text,text,text,boolean,boolean,boolean,boolean)') IS NOT NULL
   AND to_regprocedure('public.resolve_and_link_verified_auth_user(uuid)') IS NOT NULL AS stage2_ok;

-- V3, after Stage 3
SELECT to_regclass('public.user_duplicate_review_groups') IS NOT NULL
   AND to_regclass('public.user_duplicate_review_members') IS NOT NULL
   AND to_regprocedure('public.preview_user_merge(uuid,uuid)') IS NOT NULL
   AND to_regprocedure('public.execute_user_merge(uuid,text,uuid)') IS NOT NULL
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='users' AND column_name='identity_status') AS stage3_ok;

-- V4, after Stage 4
SELECT to_regclass('public.user_duplicate_scan_runs') IS NOT NULL
   AND to_regclass('public.user_duplicate_review_decisions') IS NOT NULL
   AND to_regclass('public.user_moviback_reconciliation_evidence') IS NOT NULL
   AND to_regprocedure('public.run_user_duplicate_scan(uuid)') IS NOT NULL
   AND to_regprocedure('public.execute_reviewed_user_merge(uuid,text,uuid)') IS NOT NULL AS stage4_ok;

-- V5, after Stage 5A
SELECT to_regclass('public.user_auth_migration_events') IS NOT NULL
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='users' AND column_name='auth_migration_state')
   AND to_regprocedure('public.start_user_auth_migration(uuid)') IS NOT NULL AS stage5a_ok;

-- V6, after Stage 5B
SELECT to_regclass('public.user_legacy_login_events') IS NOT NULL
   AND to_regprocedure('public.legacy_user_login_lookup(text,text)') IS NOT NULL AS stage5b_ok;

-- V7, after immutable-audit hardening
SELECT bool_and(NOT has_table_privilege('service_role',format('public.%I',name),'TRUNCATE')) AS hardening_ok
FROM unnest(ARRAY['user_auth_link_events','user_auth_migration_events','user_duplicate_review_decisions',
  'user_legacy_login_events','user_merge_journal','user_moviback_reconciliation_evidence']) AS t(name);

-- V8, after final remediation
SELECT to_regclass('public.legacy_login_rate_limits') IS NOT NULL
   AND to_regprocedure('public.consume_legacy_login_rate_limit(text,text,timestamp with time zone)') IS NOT NULL
   AND to_regprocedure('public.duplicate_user_reference_counts(uuid[])') IS NOT NULL AS final_ok;

ROLLBACK;
```

Final verification must also confirm 211 profiles remain, no Auth link was populated, no scan group was created automatically, no legacy-login/rate-limit event exists from migration application, RLS is enabled on private tables, browser roles have no privileged execution, and all eight applied file hashes match this runbook.

## 9. Git push and deployment sequence

The database migrations are additive and the old application does not require the new objects. The new application does require new columns and RPCs. Therefore the safe order is:

1. re-freeze `6d230fd` and record `origin/main`;
2. complete the backup and direct DB preflight;
3. verify hosted Auth settings and exact callback URL;
4. add the three missing Vercel variables and verify existing secret ownership;
5. apply and verify the eight migrations while the old application remains live;
6. push the frozen commit range to GitHub;
7. deploy exactly `6d230fd` to Vercel Production;
8. verify deployment SHA and aliases before smoke tests.

Do not deploy code before the database because Auth signup, activation, legacy login and duplicate dashboard would call missing objects. Keep the migration-to-deploy interval short. Do not run a duplicate scan or merge during that interval.

## 10. Production smoke tests

Use controlled identities and avoid repeated real-user failures.

| Area | Required result |
|---|---|
| Public home | 200, no identity leak, principal navigation works |
| Store and tournaments | public reads work; no history mutation |
| Monday League | hidden draft remains hidden |
| Eligible legacy user | exact phone+email login succeeds and existing profile count stays constant |
| Unknown legacy identity | generic not-found/signup guidance; creates no `public.users` or Auth row |
| New user | Auth signup email, callback, verified finalization and Auth login succeed |
| Linked user | Auth login resolves the original `public.users.id`; legacy login returns Auth-required |
| Password reset | generic request, approved callback and password update succeed |
| MoviBack | membership, balance, redemptions and eligibility remain attached to the same public UUID |
| Store | order list/history remains attached; no inventory/payment mutation |
| Tournaments | registrations/history remain visible; player/ranking keys unchanged |
| Monday League identity | captain/roster continuity if the controlled account later has such a reference |
| Admin | privileged session still works; duplicate queue is initially empty until an approved scan |
| Staff | staff session and existing operations work independently from public Auth |
| PWA | GET `/api/**` is network-only; logout followed by offline request cannot replay personal data |
| Rate limit | use an approved synthetic identity/client; attempts 1–8 allowed by limiter, ninth returns 429 and `Retry-After`; delete nothing manually |

For the limiter smoke, prefer a dedicated synthetic `.invalid` test profile created in an approved non-production rehearsal. If Production must be tested, use only an owner-controlled existing eligible profile and a pre-approved source, account for the 15-minute window, and stop after the first 429. Never lock an unrelated user.

## 11. First controlled user

Do not choose the user in this preparation task. The operator must select an owner-controlled account with:

- unique normalized email and phone;
- no membership in any of the ten anonymized duplicate groups;
- no review/conflict state after the first approved scan;
- preferably one existing MoviBack membership with consistent ledger;
- no same-event tournament or same-team league collision;
- no existing Auth link;
- direct access to the email inbox and support ownership during the window.

Sequence: record public UUID and read-only business counts; verify eligible legacy access; request activation; follow verified email callback; create password; complete linking; authenticate through Auth; call `/api/user/me`; compare MoviBack, Store, tournaments and any Monday League identity to the recorded UUID; logout and login again; confirm legacy login now returns `AUTH_LOGIN_REQUIRED`; confirm profile count and business row IDs did not change.

## 12. Monitoring

Capture baselines immediately before deploy and snapshots at 1h, 6h, 24h, 7d and 30d. Monitor:

- total active profiles, Auth-linked profiles and legacy profiles remaining;
- `activation_pending`, `review_required`, `conflict` and `merged` distributions;
- legacy login successes, denials and rate-limit events;
- Auth login failures and password-reset requests;
- duplicate queue size, stale groups and merge failures;
- application/API 5xx and latency, especially `/api/user/login`, `/api/user/me` and `/api/admin/users/duplicates`;
- MoviBack, Store, tournaments and Monday League authorization errors;
- SMTP delivery, bounce and callback failures.

At 24h, 7d and 30d, compare counts to the prior snapshot and explain every merge or link. No Stage 6 threshold or retirement decision is part of this rollout.

## 13. Duplicate review operations

Do not run the scanner during migration application. After the application smoke tests pass, obtain a separate operational approval to run the Stage 4 scan. Reconcile its output to the ten anonymized precheck groups. Review the two dual-MoviBack groups and the same-event tournament group manually. A merge requires a saved decision, current fingerprint, explicit `MERGE` confirmation, domain review and successful post-merge verification. Process one group at a time during the initial period. Never use an alias as authentication authority.

## 14. Rollback

1. **Level 1:** hide/disable activation and signup entry points while retaining Auth login/recovery for linked identities and eligible legacy access.
2. **Level 2:** stop new activation, linking, scans and merges. Preserve audit evidence and current links.
3. **Level 3:** roll the Vercel application back to deployment `dpl_Ay542Epp4JfEcf2Ef8vKCegparD2` or the explicitly recorded immediate predecessor. Additive database objects remain installed.
4. **Level 4:** apply a reviewed forward database correction for an isolated schema/function defect.
5. **Level 5:** restore the fresh pre-rollout database backup only for catastrophic corruption under incident-command approval, after accounting for unrelated writes since backup.

Never blindly set `auth_user_id` to NULL, delete `auth.users`, reactivate merged sources, reverse completed merges automatically or drop additive objects while linked identities exist.

## 15. Stage 6 exclusion

Stage 6 is excluded. Legacy access remains available only to eligible existing unlinked profiles. This rollout does not authorize bulk migration, legacy retirement, automatic merge, HMAC-cookie retirement or an adoption threshold decision.

## 16. Sign-off checklist

- [ ] HEAD and migration hashes match this document.
- [ ] Fresh `public` + `auth` backup, `pg_restore --list`, checksum and manifest pass.
- [ ] Managed backup/PITR state and restore owner are recorded.
- [ ] Direct read-only migration-ledger query is complete.
- [ ] No unexpected Auth 2.0 object or naming collision exists.
- [ ] Hosted Site URL, exact callback allow-list, email confirmation, password policy, rate limits and SMTP are approved.
- [ ] `NEXT_PUBLIC_APP_URL`, `AUTH2_LEGACY_REGISTRATION_DISABLED` and `LEGACY_RATE_LIMIT_SECRET` are present in Production.
- [ ] Duplicate, MoviBack and tournament risks are assigned to named reviewers.
- [ ] Monday League remains hidden draft with zero generated rounds.
- [ ] Migration operator, deploy operator, smoke-test operator and rollback commander are named.
- [ ] Eight migrations and every V1–V8 predicate are approved.
- [ ] First controlled user is owner-controlled and outside duplicate groups.
- [ ] Monitoring dashboards/queries and escalation contacts are ready.
- [ ] Stage 6 remains explicitly excluded.

The production write gate remains **NO-GO** until every checkbox is satisfied and the user gives explicit approval for the specific write operation.
