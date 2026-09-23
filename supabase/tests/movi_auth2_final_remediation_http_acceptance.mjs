import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.FINAL_AUTH_SUPABASE_URL;
const serviceKey = process.env.FINAL_AUTH_SERVICE_ROLE_KEY;
const appUrl = process.env.FINAL_AUTH_APP_URL ?? "http://127.0.0.1:3210";
const staffSecret = process.env.FINAL_AUTH_STAFF_COOKIE_SECRET;
if (supabaseUrl !== "http://127.0.0.1:55021") throw new Error("Refusing test: target must be exactly http://127.0.0.1:55021");
if (!serviceKey || !staffSecret) throw new Error("Explicit local service key and staff secret are required");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const staffId = "f3000000-0000-4000-8000-000000000001";
const eligibleId = "f3000000-0000-4000-8000-000000000002";
const syntheticIds = Array.from({ length: 210 }, (_, index) =>
  `f4${String(index + 1).padStart(6, "0")}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const eligible = { phone: "3479910001", email: "final-rate-eligible@example.invalid" };

async function postLegacy(body, ip) {
  return fetch(`${appUrl}/api/user/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

await service.from("staff_users").upsert({ id: staffId, full_name: "Final Audit Admin", email: "final-audit-admin@example.invalid", role: "admin", is_active: true });
const profiles = syntheticIds.map((id, index) => ({
  id,
  full_name: `M02 HTTP ${index + 1}`,
  phone: `348${String(index + 1).padStart(7, "0")}`,
  email: `m02-http-${Math.floor(index / 2) + 1}@example.invalid`,
  gender: index % 2 ? "F" : "M",
  auth_migration_state: "legacy",
}));
for (let offset = 0; offset < profiles.length; offset += 50) {
  const { error } = await service.from("users").upsert(profiles.slice(offset, offset + 50));
  if (error) throw error;
}
const { error: eligibleError } = await service.from("users").upsert({
  id: eligibleId, full_name: "Final Rate Eligible", phone: eligible.phone,
  email: eligible.email, gender: "M", auth_migration_state: "legacy",
});
if (eligibleError) throw eligibleError;
const { error: scanError } = await service.rpc("run_user_duplicate_scan", { p_actor_staff_id: staffId });
if (scanError) throw scanError;

const staffToken = await new SignJWT({ sid: staffId, role: "admin", name: "Final Audit Admin" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m")
  .sign(new TextEncoder().encode(staffSecret));
const started = performance.now();
const dashboard = await fetch(`${appUrl}/api/admin/users/duplicates`, {
  headers: { cookie: `staff_session=${staffToken}` }, cache: "no-store",
});
const elapsedMs = performance.now() - started;
const raw = await dashboard.text();
assert.equal(dashboard.status, 200, raw);
const payload = JSON.parse(raw);
assert.ok(payload.data.length >= 105, "expected duplicate groups at 210-user scale");
assert.ok(payload.summary.total_users >= 211);
const high = await fetch(`${appUrl}/api/admin/users/duplicates?confidence=high`, {
  headers: { cookie: `staff_session=${staffToken}` }, cache: "no-store",
}).then((response) => response.json());
assert.ok(high.data.every((group) => group.confidence === "high"));

let before = await service.from("users").select("id", { count: "exact", head: true });
let response = await postLegacy({ phone: "3479999999", email: "final-rate-unknown@example.invalid" }, "198.51.100.10");
assert.equal(response.status, 404);
let after = await service.from("users").select("id", { count: "exact", head: true });
assert.equal(after.count, before.count, "unknown login created a profile");

response = await postLegacy({ phone: eligible.phone, email: "wrong@example.invalid" }, "198.51.100.11");
assert.equal(response.status, 404);

for (let attempt = 1; attempt <= 8; attempt++) {
  response = await postLegacy(eligible, "198.51.100.12");
  assert.equal(response.status, 200, `eligible attempt ${attempt} should be allowed`);
}
response = await postLegacy(eligible, "198.51.100.12");
assert.equal(response.status, 429);
assert.ok(Number(response.headers.get("retry-after")) > 0);
assert.equal((await response.json()).code, "LEGACY_RATE_LIMITED");

response = await postLegacy(eligible, "198.51.100.13");
assert.equal(response.status, 200, "separate client bucket should remain available");

console.log(JSON.stringify({
  result: "MOVI_AUTH2_FINAL_HTTP_ACCEPTANCE_PASS",
  duplicate_groups: payload.data.length,
  dashboard_ms: Number(elapsedMs.toFixed(1)),
  payload_bytes: Buffer.byteLength(raw),
  fixture_db_requests: 19,
  legacy_rate_limit: "8 client+identity / 30 client / 15m",
}));
