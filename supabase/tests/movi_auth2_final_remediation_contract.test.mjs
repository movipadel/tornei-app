import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/users/duplicates/route.ts", "utf8");
const login = fs.readFileSync("src/app/api/user/login/route.ts", "utf8");
const helper = fs.readFileSync("src/lib/legacyLoginRateLimit.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261003100000_movi_auth2_final_remediation.sql", "utf8");

test("M-02 replaces per-user count requests with one bounded set-based RPC", () => {
  assert.match(route, /rpc\("duplicate_user_reference_counts"/);
  assert.doesNotMatch(route, /userIds\.flatMap/);
  assert.doesNotMatch(route, /select\("id", \{ head: true, count: "exact" \}\)/);
  assert.match(route, /\.limit\(500\)/);
  assert.match(route, /groupsQuery = groupsQuery\.eq\("state"/);
  assert.match(route, /groupsQuery = groupsQuery\.eq\("confidence"/);
  assert.equal((migration.match(/union all/g) ?? []).length, 11);
  assert.match(migration, /limit 1000/);
  assert.match(migration, /jsonb_build_object\(/);
});

test("M-03 uses durable atomic HMAC buckets before legacy identity lookup", () => {
  assert.match(login, /consume_legacy_login_rate_limit/);
  assert.ok(login.indexOf("consume_legacy_login_rate_limit") < login.indexOf("legacy_user_login_lookup"));
  assert.match(login, /status: 429/);
  assert.match(login, /"Retry-After"/);
  assert.match(helper, /createHmac\("sha256"/);
  assert.match(helper, /x-vercel-forwarded-for/);
  assert.match(migration, /create table public\.legacy_login_rate_limits/);
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /v_identity_limit constant integer := 8/);
  assert.match(migration, /v_client_limit constant integer := 30/);
  assert.match(migration, /revoke all on table public\.legacy_login_rate_limits from public, anon, authenticated, service_role/);
});

test("M-03 never stores raw identity or credential fields", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table public.legacy_login_rate_limits"),
    migration.indexOf("create index legacy_login_rate_limits_window_idx"),
  );
  assert.doesNotMatch(tableDefinition, /\b(email|phone|ip|password|cookie|token)\b/i);
  assert.match(migration, /Keys are server HMACs/);
});
