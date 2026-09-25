import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20261004100000_movi_auth2_access_help_requests.sql");
const lookup = read("../../src/app/api/auth/legacy-profile/lookup/route.ts");
const activate = read("../../src/app/api/auth/legacy-profile/activate/route.ts");
const help = read("../../src/app/api/auth/legacy-profile/help/route.ts");
const context = read("../../src/lib/accessHelpContext.ts");
const signup = read("../../src/app/api/auth/signup/route.ts");
const resolver = read("../../src/lib/resolveAuthOnboarding.ts");
const admin = read("../../src/app/api/admin/users/access-problems/route.ts");
const ui = read("../../src/components/LegacyProfileActivation.tsx");
const authForm = read("../../src/components/MoviAuthForm.tsx");
const masking = read("../../src/lib/privacyMasking.ts");
const accessAdmin = read("../../src/app/api/admin/users/access-problems/route.ts");

test("pre-Auth help storage is additive, private, minimal and non-authorizing", () => {
  assert.match(migration, /create table public\.user_access_help_requests/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.user_access_help_requests from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.user_access_help_requests to service_role/i);
  const table = migration.match(/create table public\.user_access_help_requests[\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(table, /auth_user_id|email\s+text|password|token/i);
  assert.doesNotMatch(migration, /update\s+public\.users\s+set|update\s+auth\.users|execute_user_merge/i);
});

test("lookup is conservative and the browser cannot select a public profile id", () => {
  assert.match(migration, /normalize_user_mobile_e164/);
  assert.match(migration, /normalize_user_person_name/);
  assert.match(migration, /identity_status = 'active'/);
  assert.match(migration, /merged_into_user_id is null/);
  assert.doesNotMatch(lookup + activate + help, /body\.public_user_id|body\.auth_user_id/);
  assert.match(context, /httpOnly: true/);
  assert.match(activate, /lookup_legacy_profile_for_activation/);
  assert.match(resolver, /validate_legacy_activation_context/);
});

test("help creation is idempotent and lifecycle-only", () => {
  assert.match(migration, /request_key text not null unique/i);
  assert.match(migration, /on conflict\(request_key\) do nothing/i);
  assert.match(migration, /prevent_user_access_help_identity_mutation/);
  assert.match(migration, /status in \('open','resolved','cancelled'\)/i);
  assert.match(help, /accessRequestKey/);
});

test("new profile preflight runs before Auth signup", () => {
  assert.match(signup, /new_user_profile_preflight/);
  assert.ok(signup.indexOf("new_user_profile_preflight") < signup.indexOf("supabase.auth.signUp"));
  assert.match(signup, /existing_profile/);
});

test("admin queue aggregates help and onboarding with bounded set queries", () => {
  assert.match(admin, /user_access_help_requests/);
  assert.match(admin, /user_auth_onboarding/);
  for (const state of ["conflict", "review_required", "pending_verification"]) assert.match(admin, new RegExp(state));
  assert.match(admin, /email_confirmed_at/);
  assert.match(admin, /close_user_access_help_request/);
  assert.match(admin, /resolve_and_link_verified_auth_user/);
  assert.match(admin, /deleteUser/);
  assert.doesNotMatch(admin, /for \([^)]*\)\s*\{[\s\S]*?await\s+sb\.from/);
});

test("mobile UX exposes only human choices and masks lookup PII", () => {
  for (const copy of ["Nome e cognome", "Numero di telefono", "È il mio profilo", "Chiedi aiuto a MOVI", "Controlla la tua email"]) assert.match(ui, new RegExp(copy));
  assert.match(lookup, /maskEmail/); assert.match(lookup, /maskPhone/);
  assert.doesNotMatch(ui, /public_user_id|auth_user_id|migration state|profilo legacy/i);
});

test("Auth copy is valid UTF-8 text without known mojibake", () => {
  const audited = ui + authForm + lookup + help + accessAdmin + masking;
  assert.doesNotMatch(audited, /Ã|â|Â|ï¿½|�/);
  for (const copy of [
    "È il mio profilo", "Non è il mio profilo", "più", "già", "attività",
    "all’accesso", "Cerca il mio profilo", "Crea la tua password",
    "Invia", "Invia di nuovo", "Crea nuovo profilo",
  ]) assert.match(audited, new RegExp(copy));
});

test("phone and email masks are readable and privacy safe", () => {
  const compiled = ts.transpileModule(masking, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const cjs = { exports: {} };
  Function("exports", "module", compiled)(cjs.exports, cjs);
  const { maskEmail, maskPhone } = cjs.exports;
  assert.equal(maskPhone("3929624858"), "••••••4858");
  const masked = maskEmail("m.rinaudo.tn@gmail.com");
  assert.equal(masked, "m***.r******.t***@gmail.com");
  assert.notEqual(masked, "m.rinaudo.tn@gmail.com");
});
