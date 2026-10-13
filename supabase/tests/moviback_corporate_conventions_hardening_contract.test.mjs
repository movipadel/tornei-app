import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migrations = [
  "supabase/migrations/20261023100000_moviback_corporate_conventions_foundation.sql",
  "supabase/migrations/20261024100000_moviback_corporate_conventions_admin.sql",
  "supabase/migrations/20261025100000_moviback_corporate_conventions_self_service.sql",
  "supabase/migrations/20261026100000_moviback_corporate_conventions_new_member.sql",
  "supabase/migrations/20261027100000_moviback_corporate_conventions_reporting.sql",
  "supabase/migrations/20261028100000_moviback_corporate_conventions_notifications.sql",
].map(read).join("\n");

test("C8 code generation is high entropy, hash-only, normalized and bounded", () => {
  const source = read("src/lib/movibackAgreementCodes.ts");
  assert.match(source, /const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"/);
  assert.match(source, /index < 20/);
  assert.match(source, /randomInt\(ALPHABET\.length\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ""\)/);
  assert.match(source, /MOVIBACK_CODE_BATCH_MAX = 500/);
  assert.doesNotMatch(migrations, /plaintext_code|plaintext_secret/i);
});

test("C8 public activation is identity-bound, rate-limited before hash lookup and fail-closed", () => {
  const route = read("src/app/api/moviback/agreements/activate/route.ts");
  const helper = read("src/lib/movibackAgreementActivation.ts");
  assert.match(route, /getCurrentMoviUser\(\)/);
  assert.ok(route.indexOf("consume_legacy_login_rate_limit") < route.indexOf("claim_moviback_agreement_code"));
  assert.match(route, /normalized\.length > 64/);
  assert.match(helper, /createHmac\("sha256", secret\)/);
  assert.match(helper, /publicUserId/);
  assert.match(helper, /Missing rate-limit secret/);
  assert.match(migrations, /REVOKE ALL ON FUNCTION public\.claim_moviback_agreement_code\(uuid,text\) FROM PUBLIC,anon,authenticated/i);
  assert.match(migrations, /GRANT EXECUTE ON FUNCTION public\.claim_moviback_agreement_code\(uuid,text\) TO service_role/i);
});

test("C8 Admin routes enforce moviback.manage and bounded reads", () => {
  const routes = readdirSync("src/app/api/admin/moviback/agreements", { recursive: true })
    .filter((name) => String(name).endsWith("route.ts"))
    .map((name) => read(`src/app/api/admin/moviback/agreements/${String(name).replaceAll("\\", "/")}`));
  assert.ok(routes.length >= 5);
  for (const route of routes) assert.match(route, /(?:require|guard)OperatorPermission\("moviback\.manage"\)/);
  const detail = read("src/app/api/admin/moviback/agreements/[id]/route.ts");
  assert.match(detail, /\.limit\(500\)/);
  assert.match(detail, /\.limit\(200\)/);
  assert.match(detail, /\.limit\(50\)/);
});

test("C8 SECURITY DEFINER functions have fixed search paths and minimal grants", () => {
  const definitions = [...migrations.matchAll(/CREATE(?: OR REPLACE)? FUNCTION[\s\S]*?\$function\$;/gi)].map((match) => match[0]);
  const definers = definitions.filter((definition) => /SECURITY DEFINER/i.test(definition));
  assert.ok(definers.length >= 8);
  for (const definition of definers) {
    assert.match(definition, /SET search_path TO pg_catalog, public(?:, extensions)?/i);
    assert.doesNotMatch(definition, /EXECUTE\s+format|EXECUTE\s+[^;]*\|\|/i);
  }
  assert.doesNotMatch(migrations, /GRANT EXECUTE ON FUNCTION[^;]+ TO (?:PUBLIC|anon|authenticated)/i);
});

test("C8 CSV export neutralizes spreadsheet formula prefixes", () => {
  const page = read("src/app/admin/moviback/agreements/[id]/page.tsx");
  assert.match(page, /\^\[=\+\\-@\\t\\r\]/);
  assert.match(page, /map\(csvCell\)\.join\(","\)/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test("C8 local email transport remains synthetic and production-credential safe", () => {
  const runner = read("scripts/padelleria-local.mjs");
  const notification = read("src/lib/userNotificationEmail.ts");
  assert.match(runner, /RESEND_API_KEY:'re_local_disabled'/);
  assert.match(runner, /USER_EMAIL_LOCAL_VERIFIED:'1'/);
  assert.match(runner, /USER_EMAIL_TRANSPORT:'local'/);
  assert.match(notification, /LOCAL_EMAIL_TRANSPORT_REQUIRED/);
  assert.match(notification, /LOCAL_EMAIL_EXTERNAL_CREDENTIALS_PRESENT/);
  assert.match(notification, /process\.env\.SUPABASE_URL === "http:\/\/127\.0\.0\.1:55421"/);
  assert.doesNotMatch(notification, /RESEND_API_KEY\s*=|re_[A-Za-z0-9]{20,}/);
});
