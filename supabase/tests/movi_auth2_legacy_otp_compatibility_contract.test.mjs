import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../src/app/attiva-account/page.tsx");
const form = read("../../src/components/MoviAuthForm.tsx");
const callback = read("../../src/app/auth/callback/route.ts");
const complete = read("../../src/app/api/auth/activation/complete/route.ts");
const legacyActivation = read("../../src/app/api/auth/legacy-profile/activate/route.ts");
const resolver = read("../migrations/20260930100000_movi_auth2_stage5a_progressive_migration.sql");
const resolverBody = resolver.match(
  /CREATE OR REPLACE FUNCTION public\.resolve_and_link_verified_auth_user[\s\S]*?\nEND \$\$;/,
)?.[0] ?? "";

test("plain activation keeps the current legacy profile lookup", () => {
  assert.match(page, /verified === "1"/);
  assert.match(page, /: <LegacyProfileActivation \/>/);
  assert.match(legacyActivation, /lookup_legacy_profile_for_activation/);
});

test("verified legacy OTP renders the existing activation completion form", () => {
  assert.match(page, /<MoviAuthForm mode="activate" \/>/);
  assert.match(callback, /legacyActivationNext = "\/attiva-account\?verified=1"/);
  assert.match(form, /mode === "activate" && legacyVerified/);
  assert.match(form, /post\("\/api\/auth\/activation\/complete", form\)/);
  assert.match(form, /Completa l’attivazione/);
});

test("verified query alone cannot set a password or link a profile", () => {
  assert.match(complete, /supabase\.auth\.getUser\(\)/);
  assert.match(complete, /userData\.user\?\.email_confirmed_at/);
  assert.match(complete, /status: 403/);
  assert.ok(complete.indexOf("getUser()") < complete.indexOf("updateUser({ password"));
  assert.ok(complete.indexOf("email_confirmed_at") < complete.indexOf("resolve_and_link_verified_auth_user"));
});

test("legacy no-onboarding completion delegates password and linking to existing authorities", () => {
  assert.match(complete, /updateUser\(\{ password: body\.password \}\)/);
  assert.match(complete, /resolve_and_link_verified_auth_user/);
  assert.match(resolver, /INSERT INTO public\.user_auth_onboarding/);
  assert.match(resolver, /'activation',v_state,v_email,v_count/);
  assert.match(resolver, /INSERT INTO public\.user_auth_link_events/);
  assert.match(resolver, /'verification_completed'/);
});

test("resolver links only one active candidate and leaves merged history outside matching", () => {
  assert.match(resolverBody, /WHERE u\.identity_status='active' AND public\.normalize_user_email\(u\.email\)=v_email/);
  assert.match(resolverBody, /ELSIF v_count>1 THEN/);
  assert.match(resolverBody, /v_state:='review_required'/);
  assert.match(resolverBody, /UPDATE public\.users SET auth_user_id=p_auth_user_id,auth_migration_state='linked'/);
  assert.doesNotMatch(resolverBody, /identity_status='merged'/);
});

test("modern activation remains on its existing signup and callback path", () => {
  assert.match(legacyActivation, /sendPreHotfixActivationEmail/);
  assert.match(legacyActivation, /supabase\.auth\.signUp/);
  assert.match(legacyActivation, /flow=activation/);
  assert.doesNotMatch(page, /activation\/complete/);
});
