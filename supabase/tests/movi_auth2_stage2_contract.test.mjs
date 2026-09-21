import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260927100000_movi_auth2_stage2_activation.sql");
const identity = read("../../src/lib/currentMoviUser.ts");
const me = read("../../src/app/api/user/me/route.ts");
const signup = read("../../src/app/api/auth/signup/route.ts");
const activate = read("../../src/app/api/auth/activation/complete/route.ts");
const reset = read("../../src/app/api/auth/password-reset/request/route.ts");
const proxy = read("../../proxy.ts");

test("verified identity commands derive email from auth.users and serialize normalized keys", () => {
  assert.match(migration, /FROM auth\.users u WHERE u\.id = p_auth_user_id FOR UPDATE/g);
  assert.match(migration, /email_confirmed_at/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('movi-auth-email:/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('movi-auth-phone:/);
  assert.doesNotMatch(migration, /UPDATE public\.user_identity_aliases/);
});

test("duplicate results are explicit and never merge", () => {
  assert.match(migration, /v_count > 1 THEN v_state := 'review_required'/);
  assert.match(migration, /v_profile\.auth_user_id IS NOT NULL/);
  assert.doesNotMatch(migration, /DELETE FROM public\.users/i);
  assert.doesNotMatch(migration, /resolve_canonical_user_id/);
});

test("browser roles cannot execute privileged linking or read activation state", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.resolve_and_link_verified_auth_user\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.resolve_and_link_verified_auth_user\(uuid\) TO service_role/);
  assert.match(migration, /MOVI_AUTH_LINK_EVENT_IMMUTABLE/);
});

test("Auth is authoritative and a mismatched legacy session fails closed", () => {
  assert.match(identity, /if \(authUser\)/);
  assert.match(identity, /auth_legacy_profile_mismatch/);
  assert.match(identity, /source: legacyProfile \? "legacy" : null/);
  assert.match(me, /status: 409/);
  assert.doesNotMatch(me, /access_token|refresh_token/);
});

test("signup and activation never accept client-selected identity ids", () => {
  assert.match(signup, /data\.user\.id/);
  assert.match(activate, /userData\.user\.id/);
  assert.doesNotMatch(signup + activate, /body\.auth_user_id|body\.public_user_id/);
  assert.doesNotMatch(signup + activate, /console\.(log|error).*password/);
});

test("reset is generic, redirects are fixed, and proxy refreshes sessions", () => {
  assert.match(reset, /genericEmailMessage/);
  assert.match(reset, /authRedirect\("\/auth\/callback\?next=\/reset-password"\)/);
  assert.match(proxy, /refreshSupabaseAuth/);
  assert.match(proxy, /admin\/:path|isAdminPath/);
});
