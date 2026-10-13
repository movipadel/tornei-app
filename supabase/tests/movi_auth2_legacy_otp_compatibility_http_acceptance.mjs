import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.LEGACY_COMPAT_SUPABASE_URL;
const serviceKey = process.env.LEGACY_COMPAT_SERVICE_ROLE_KEY;
const appUrl = process.env.LEGACY_COMPAT_APP_URL ?? "http://127.0.0.1:3102";
if (supabaseUrl !== "http://127.0.0.1:55421") throw new Error("Refusing test: local Supabase required");
if (!serviceKey || appUrl !== "http://127.0.0.1:3102") throw new Error("Explicit local test configuration required");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const canonicalId = "c8200000-0000-4000-8000-000000000001";
const mergedId = "c8200000-0000-4000-8000-000000000002";
const email = "legacy-otp-compat@example.invalid";
const oldPassword = "Legacy-Compat-Old-2026!";
const newPassword = "Legacy-Compat-New-2026!";
let authId = "";

function cookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

async function post(path, body, cookie = "") {
  return fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

function cleanupSql(candidateAuthId = "00000000-0000-0000-0000-000000000000") {
  const sql = `
    begin;
    set local session_replication_role = replica;
    delete from public.user_auth_link_events where auth_user_id = '${candidateAuthId}'::uuid;
    delete from public.user_auth_migration_events where auth_user_id = '${candidateAuthId}'::uuid;
    delete from public.user_auth_onboarding where auth_user_id = '${candidateAuthId}'::uuid;
    delete from public.users where id in ('${mergedId}'::uuid, '${canonicalId}'::uuid);
    commit;
  `;
  const result = spawnSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", [
    "-h", "127.0.0.1", "-p", "55422", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Fixture cleanup failed");
}

async function removeAuthUsersByEmail() {
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  for (const user of listed.data.users) {
    if (user.email === email) {
      cleanupSql(user.id);
      const removed = await service.auth.admin.deleteUser(user.id);
      if (removed.error) throw removed.error;
    }
  }
}

await removeAuthUsersByEmail();
cleanupSql();

try {
  const created = await service.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
  if (created.error) throw created.error;
  authId = created.data.user.id;

  let result = await service.from("users").insert({
    id: canonicalId,
    full_name: "Legacy OTP Canonical",
    phone: "3479820261",
    email,
    gender: "M",
    identity_status: "active",
    auth_migration_state: "activation_pending",
  });
  if (result.error) throw result.error;
  result = await service.from("users").insert({
    id: mergedId,
    full_name: "Legacy OTP Historical",
    phone: "3479820262",
    email,
    gender: "M",
    identity_status: "merged",
    merged_into_user_id: canonicalId,
    merged_at: new Date().toISOString(),
    auth_migration_state: "merged",
  });
  if (result.error) throw result.error;

  const beforeOnboarding = await service.from("user_auth_onboarding").select("auth_user_id", { count: "exact", head: true }).eq("auth_user_id", authId);
  assert.equal(beforeOnboarding.count, 0, "legacy fixture unexpectedly has onboarding");

  const invalid = await post("/api/auth/activation/complete", { password: newPassword, password_confirm: newPassword });
  assert.equal(invalid.status, 403, "verified=1 without a valid Auth session did not fail closed");

  const login = await post("/api/auth/login", { email, password: oldPassword });
  assert.equal(login.status, 200, await login.text());
  const sessionCookie = cookies(login);
  assert.ok(sessionCookie.includes("auth-token"), "Auth session cookie missing");

  const completed = await post("/api/auth/activation/complete", {
    password: newPassword,
    password_confirm: newPassword,
  }, sessionCookie);
  const completedBody = await completed.json();
  assert.equal(completed.status, 200, JSON.stringify(completedBody));
  assert.equal(completedBody.state, "linked");

  const canonical = await service.from("users").select("auth_user_id,auth_migration_state,identity_status").eq("id", canonicalId).single();
  if (canonical.error) throw canonical.error;
  assert.deepEqual(canonical.data, { auth_user_id: authId, auth_migration_state: "linked", identity_status: "active" });
  const historical = await service.from("users").select("auth_user_id,auth_migration_state,identity_status,merged_into_user_id").eq("id", mergedId).single();
  if (historical.error) throw historical.error;
  assert.deepEqual(historical.data, {
    auth_user_id: null,
    auth_migration_state: "merged",
    identity_status: "merged",
    merged_into_user_id: canonicalId,
  });

  const onboarding = await service.from("user_auth_onboarding").select("flow,state,match_count,linked_public_user_id").eq("auth_user_id", authId).single();
  if (onboarding.error) throw onboarding.error;
  assert.deepEqual(onboarding.data, { flow: "activation", state: "linked", match_count: 1, linked_public_user_id: canonicalId });
  const migrationEvents = await service.from("user_auth_migration_events").select("event_type").eq("auth_user_id", authId);
  if (migrationEvents.error) throw migrationEvents.error;
  assert.deepEqual(new Set(migrationEvents.data.map((event) => event.event_type)), new Set(["verification_completed", "linked"]));
  const linkEvents = await service.from("user_auth_link_events").select("event_type,public_user_id").eq("auth_user_id", authId);
  if (linkEvents.error) throw linkEvents.error;
  assert.ok(linkEvents.data.some((event) => event.event_type === "linked" && event.public_user_id === canonicalId));

  const newLogin = await post("/api/auth/login", { email, password: newPassword });
  assert.equal(newLogin.status, 200, "login with completed password failed");
  const oldLogin = await post("/api/auth/login", { email, password: oldPassword });
  assert.equal(oldLogin.status, 401, "old password still authenticates after completion");

  console.log("Legacy OTP compatibility local HTTP acceptance PASS: invalid session rejected, canonical linked, merged history preserved, onboarding/events created, new login succeeds.");
} finally {
  if (authId) {
    cleanupSql(authId);
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error) throw removed.error;
  } else {
    cleanupSql();
  }
}
