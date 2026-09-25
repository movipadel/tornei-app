import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20261001100000_movi_auth2_stage5b_legacy_cutover.sql");
const legacyLogin = read("../../src/app/api/user/login/route.ts");
const resolver = read("../../src/lib/currentMoviUser.ts");
const legacyForm = read("../../src/components/LegacyAccessForm.tsx");
const dialog = read("../../src/components/UserLoginDialog.tsx");
const authForm = read("../../src/components/MoviAuthForm.tsx");
const legacyPage = read("../../src/app/accesso-precedente/page.tsx");
const adminUi = read("../../src/app/admin/users/duplicates/page.tsx");
const adminQueue = read("../../src/app/api/admin/users/duplicates/route.ts");
const signup = read("../../src/app/api/auth/signup/route.ts");
const reset = read("../../src/app/api/auth/password-reset/request/route.ts");
const adminLogin = read("../../src/app/api/admin/login/route.ts");
const staffLogin = read("../../src/app/api/staff/login/route.ts");

test("legacy login is lookup-only and can never create a profile", () => {
  assert.match(legacyLogin, /legacy_user_login_lookup/);
  assert.doesNotMatch(legacyLogin, /\.insert\(|\.upsert\(|\.update\(/);
  assert.doesNotMatch(legacyLogin, /body\.(full_name|gender|privacy_accepted|terms_accepted)/);
  assert.match(migration, /It never creates, links, merges, or updates a profile/);
});

test("phone and email must resolve the same unique profile", () => {
  assert.match(migration, /normalize_user_mobile_e164\(p_phone\)/);
  assert.match(migration, /normalize_user_email\(p_email\)/);
  assert.match(migration, /v_pair_count=0/);
  assert.match(migration, /v_active_email_count<>1 OR v_active_phone_count<>1/);
  assert.doesNotMatch(migration, /user_identity_aliases/);
});

test("every migration state has an explicit fail-closed policy", () => {
  for (const state of ["legacy_allowed", "auth_required", "merged", "review_required", "conflict", "not_found"]) {
    assert.match(legacyLogin, new RegExp(state));
  }
  assert.match(migration, /IN\('legacy','activation_pending'\)/);
  assert.match(legacyLogin, /AUTH_LOGIN_REQUIRED/);
  assert.match(legacyLogin, /LEGACY_REVIEW_REQUIRED/);
  assert.match(legacyLogin, /LEGACY_CONFLICT/);
});

test("unknown users receive Auth signup guidance", () => {
  assert.match(legacyLogin, /Profilo non trovato\. Registrati con il nuovo accesso MOVI/);
  assert.match(legacyLogin, /redirect_to: "\/registrati"/);
  assert.match(legacyForm, /Registrati con il nuovo accesso MOVI/);
});

test("Auth login and signup are primary in the UI", () => {
  assert.match(dialog, /Accedi con email e password/);
  assert.match(dialog, /accesso precedente/);
  assert.match(authForm, /attiva-account/);
  assert.match(legacyPage, /Accesso precedente/);
  assert.match(signup, /prepare_user_auth_signup/);
});

test("stale legacy cookies cannot authorize linked or unsafe profiles", () => {
  assert.match(resolver, /\.is\("auth_user_id", null\)/);
  assert.match(resolver, /\["legacy", "activation_pending", "review_required"\]/);
  assert.match(resolver, /auth_legacy_profile_mismatch/);
});

test("cutover configuration is safe by default and has no creation fallback", () => {
  assert.match(legacyLogin, /AUTH2_LEGACY_REGISTRATION_DISABLED === "false"/);
  assert.match(legacyLogin, /LEGACY_CUTOVER_CONFIG_DISABLED/);
  assert.doesNotMatch(legacyLogin, /onConflict/);
});

test("telemetry and dashboard metrics are private and bounded", () => {
  for (const event of ["legacy_login_success", "legacy_login_not_found", "legacy_login_auth_required", "legacy_login_review_required", "legacy_login_conflict"]) {
    assert.match(migration, new RegExp(event));
  }
  assert.match(migration, /REVOKE ALL ON TABLE public\.user_legacy_login_events FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(migration, /submitted_(email|phone)|p_(password|token|cookie)/);
  assert.match(migration, /legacy_logins_30d/);
  assert.match(migration, /legacy_person_profiles/);
  assert.match(migration, /auth_linked_active_percent/);
  assert.match(adminQueue, /user_migration_summary/);
  assert.match(adminUi, /Accesso collegato/);
});

test("password reset remains generic and cannot fabricate a profile", () => {
  assert.match(reset, /resetPasswordForEmail/);
  assert.doesNotMatch(reset, /from\("users"\).*insert|from\("users"\).*upsert/s);
});

test("Stage 5B does not alter admin or staff authentication", () => {
  assert.doesNotMatch(migration, /staff_session|admin_session|verify_staff_login/);
  assert.match(adminLogin, /verify_staff_login/);
  assert.match(staffLogin, /verify_staff_login/);
});
