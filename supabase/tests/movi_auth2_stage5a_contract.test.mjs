import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260930100000_movi_auth2_stage5a_progressive_migration.sql");
const legacyLogin = read("../../src/app/api/user/login/route.ts");
const me = read("../../src/app/api/user/me/route.ts");
const start = read("../../src/app/api/user/activation/start/route.ts");
const resolver = read("../../src/lib/currentMoviUser.ts");
const prompt = read("../../src/components/ProgressiveAuthPrompt.tsx");
const adminQueue = read("../../src/app/api/admin/users/duplicates/route.ts");
const adminUi = read("../../src/app/admin/users/duplicates/page.tsx");
const reset = read("../../src/app/api/auth/password-reset/request/route.ts");
const signup = read("../../src/app/api/auth/signup/finalize/route.ts");
const unifiedSignup = read("../../src/lib/resolveAuthOnboarding.ts");
const proxy = read("../../proxy.ts");
const staffSession = read("../../src/lib/staffSession.ts");

test("migration state is additive and progressive", () => {
  assert.match(migration, /ADD COLUMN auth_migration_state/);
  for (const state of ["legacy", "activation_pending", "linked", "review_required", "conflict", "merged"]) assert.match(migration, new RegExp(`'${state}'`));
  assert.doesNotMatch(migration, /INSERT INTO auth\.users/);
  assert.doesNotMatch(migration, /execute_reviewed_user_merge|execute_user_merge/);
});

test("legacy login remains available but linked profiles must use Auth", () => {
  assert.match(legacyLogin, /profile\.auth_user_id/);
  assert.match(legacyLogin, /AUTH_LOGIN_REQUIRED/);
  assert.match(legacyLogin, /legacy_user_login_lookup/);
  assert.match(migration, /normalize_user_mobile_e164\(p_phone\)/);
  assert.doesNotMatch(legacyLogin, /\.update\(|\.upsert\(/);
  assert.match(legacyLogin, /createUserSessionToken/);
  assert.match(legacyLogin, /activation_available/);
});

test("activation prompt is non-blocking and handoff still requires verified email", () => {
  assert.match(prompt, /Attiva il nuovo accesso/);
  assert.match(prompt, /senza perdere nulla del tuo profilo/);
  assert.match(start, /identity\.source !== "legacy"/);
  assert.match(migration, /verification_completed/);
  assert.match(migration, /email_confirmed_at/);
});

test("duplicates enter Stage 4 review without automatic merge", () => {
  assert.match(migration, /run_user_duplicate_scan\(NULL\)/);
  assert.match(migration, /activation_review_required/);
  assert.match(migration, /v_state:='review_required'/);
  assert.doesNotMatch(start, /group_id|candidate|match_count/);
});

test("Auth precedence and dual-session mismatch remain fail closed", () => {
  assert.match(resolver, /auth_legacy_profile_mismatch/);
  assert.match(resolver, /if \(authUser\)/);
  assert.match(me, /SESSION_IDENTITY_CONFLICT/);
});

test("admin view exposes safe states and counters without Auth ids", () => {
  assert.match(adminQueue, /auth_migration_state/);
  assert.match(adminQueue, /auth_linked: Boolean\(auth_user_id\)/);
  assert.match(adminQueue, /user_migration_summary/);
  assert.match(adminUi, /Accesso collegato/);
  assert.doesNotMatch(adminUi, /auth_user_id/);
});

test("telemetry is private immutable and contains no sensitive values", () => {
  const table = migration.match(/CREATE TABLE public\.user_auth_migration_events[\s\S]*?\n\);/)?.[0] ?? "";
  assert.match(migration, /user_auth_migration_events_immutable/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.user_auth_migration_events FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(table, /email|password|access_token|refresh_token/i);
});

test("signup and generic password reset remain independent", () => {
  assert.match(signup + unifiedSignup, /finalize_verified_auth_signup/);
  assert.match(reset, /genericEmailMessage/);
  assert.doesNotMatch(reset, /createUser|admin\.createUser/);
});

test("Stage 5A does not alter admin or staff authentication", () => {
  assert.doesNotMatch(migration + legacyLogin + me + start + prompt + adminQueue + adminUi, /STAFF_COOKIE_NAME|ADMIN_COOKIE_NAME/);
  assert.match(proxy, /STAFF_COOKIE_NAME/);
  assert.match(staffSession, /staff_session/);
});
