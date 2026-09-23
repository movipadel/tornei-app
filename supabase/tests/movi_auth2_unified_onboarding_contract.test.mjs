import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const resolver = read("../../src/lib/resolveAuthOnboarding.ts");
const callback = read("../../src/app/auth/callback/route.ts");
const resume = read("../../src/app/api/auth/onboarding/resume/route.ts");
const me = read("../../src/app/api/user/me/route.ts");
const prompt = read("../../src/components/ProgressiveAuthPrompt.tsx");
const signup = read("../../src/app/api/auth/signup/route.ts");
const signupFinalize = read("../../src/app/api/auth/signup/finalize/route.ts");

test("signup resolution uses the certified phone preflight and verified email", () => {
  assert.match(resolver, /legacy_user_auth_migration_preflight/);
  assert.match(resolver, /normalizeEmail\(candidate\.email\) === verifiedEmail/);
  assert.match(resolver, /authUser\.email_confirmed_at/);
  assert.doesNotMatch(resolver, /draft\.full_name|candidate\.full_name|select\([^)]*full_name/);
});

test("safe existing signup delegates the transactional link to the certified resolver", () => {
  assert.match(resolver, /runResolutionRpc\("activation", authUser\.id\)/);
  assert.match(resolver, /candidate\?\.identity_status === "active"/);
  assert.match(resolver, /!candidate\.auth_user_id/);
  assert.match(resolver, /auth_migration_state === "legacy"/);
  assert.match(resolver, /auth_migration_state === "activation_pending"/);
});

test("zero and unsafe candidates remain in the existing signup finalizer", () => {
  assert.match(resolver, /runResolutionRpc\("signup", authUser\.id\)/);
  assert.match(resolver, /finalize_verified_auth_signup/);
  assert.match(resolver, /resolve_and_link_verified_auth_user/);
});

test("callback derives actual flow from onboarding and no longer depends only on URL flow", () => {
  assert.match(callback, /resolveVerifiedAuthOnboarding\(userData\.user, flow\)/);
  assert.match(callback, /if \(flow \|\| exchanged\)/);
  assert.match(callback, /resultRedirect\(result\.flow, result\.state\)/);
});

test("verified stranded sessions have an idempotent no-email resume path", () => {
  assert.match(me, /resume_available: state === "pending_verification"/);
  assert.match(prompt, /\/api\/auth\/onboarding\/resume/);
  assert.match(resume, /getUser\(\)/);
  assert.match(resume, /email_confirmed_at/);
  assert.match(resume, /resolveVerifiedAuthOnboarding/);
  assert.doesNotMatch(resume + resolver, /signUp|signInWithOtp|\.auth\.resend|resetPasswordForEmail/);
});

test("same Auth link is idempotent and only onboarding metadata is repaired", () => {
  assert.match(resolver, /linkedProfile\?\.id/);
  assert.match(resolver, /linked_public_user_id: linkedProfile\.id/);
  assert.match(resolver, /state: "linked"/);
});

test("normal signup still contains exactly one confirmation-email trigger", () => {
  assert.equal(signup.match(/\.auth\.signUp\(/g)?.length ?? 0, 1);
  assert.doesNotMatch(callback + resume + resolver + signupFinalize, /signInWithOtp|\.auth\.resend|resetPasswordForEmail|\.auth\.signUp\(/);
});

test("unified resolution never merges or rewrites business ownership", () => {
  assert.doesNotMatch(resolver, /execute_user_merge|execute_reviewed_user_merge|\.from\("(loyalty_|store_|tournament|league_)/);
  assert.doesNotMatch(resolver, /\.delete\(/);
});
