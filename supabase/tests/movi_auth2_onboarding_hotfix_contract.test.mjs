import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const activation = read("../../src/app/api/auth/activation/request/route.ts");
const signup = read("../../src/app/api/auth/signup/route.ts");
const resend = read("../../src/app/api/auth/resend/route.ts");
const preHotfix = read("../../src/lib/preHotfixActivation.ts");
const authLookup = read("../../src/lib/authUserLookup.ts");
const callback = read("../../src/app/auth/callback/route.ts");
const activationComplete = read("../../src/app/api/auth/activation/complete/route.ts");
const signupFinalize = read("../../src/app/api/auth/signup/finalize/route.ts");
const form = read("../../src/components/MoviAuthForm.tsx");
const migration = read("../migrations/20260930100000_movi_auth2_stage5a_progressive_migration.sql");

const occurrences = (source, pattern) => source.match(pattern)?.length ?? 0;

test("normal activation has one verification-email operation", () => {
  assert.equal(occurrences(activation, /\.auth\.signUp\(/g), 1);
  assert.doesNotMatch(activation, /signInWithOtp|\.auth\.resend\(|resetPasswordForEmail/);
  assert.match(activation, /password: body\.password/);
  assert.match(activation, /flow=activation/);
});

test("normal signup has one verification-email operation", () => {
  assert.equal(occurrences(signup, /\.auth\.signUp\(/g), 1);
  assert.doesNotMatch(signup, /signInWithOtp|\.auth\.resend\(|resetPasswordForEmail/);
  assert.match(signup, /prepare_user_auth_signup/);
  assert.match(signup, /flow=signup/);
});

test("callback and finalizers cannot trigger another confirmation", () => {
  const completionCode = callback + activationComplete + signupFinalize;
  assert.doesNotMatch(completionCode, /signUp|signInWithOtp|\.auth\.resend\(|resetPasswordForEmail/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /resolve_and_link_verified_auth_user/);
  assert.match(callback, /finalize_verified_auth_signup/);
});

test("resend is isolated and cannot create or link a business identity", () => {
  assert.equal(occurrences(resend, /\.auth\.resend\(/g), 1);
  assert.doesNotMatch(resend, /signUp|prepare_user_auth_signup|finalize_verified_auth_signup|resolve_and_link_verified_auth_user/);
  assert.match(form, /Non hai ricevuto l’email\? Invia di nuovo/);
});

test("the normal UI is form, sent state, callback, done", () => {
  assert.match(form, /Controlla la tua email/);
  assert.match(form, /autoComplete="email"/);
  assert.match(form, /autoComplete="new-password"/);
  assert.match(form, /if \(busy\) return/);
  assert.doesNotMatch(form, /Email verificata: stiamo creando il profilo/);
});

test("pre-hotfix links remain resumable", () => {
  assert.match(callback, /legacyActivationNext = "\/attiva-account\?verified=1"/);
  assert.match(callback, /legacySignupNext = "\/registrati\?verified=1"/);
  assert.match(form, /post\("\/api\/auth\/signup\/finalize"\)/);
  assert.match(form, /post\("\/api\/auth\/activation\/complete", form\)/);
  assert.equal(occurrences(preHotfix, /signInWithOtp\(/g), 1);
  assert.match(preHotfix, /shouldCreateUser: false/);
  assert.match(authLookup, /admin\/users\?filter=/);
  assert.doesNotMatch(preHotfix + authLookup, /\.insert\(|\.upsert\(|resolve_and_link_verified_auth_user/);
});

test("callback replay and duplicate handling keep the certified invariants", () => {
  assert.match(callback, /getUser\(\)/);
  assert.match(migration, /ON CONFLICT\(event_key\) DO NOTHING/);
  assert.match(migration, /v_state:='review_required'/);
  assert.match(migration, /run_user_duplicate_scan\(NULL\)/);
  assert.doesNotMatch(migration, /execute_reviewed_user_merge|execute_user_merge/);
});
