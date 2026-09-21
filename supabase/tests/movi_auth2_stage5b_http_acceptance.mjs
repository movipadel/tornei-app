import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.STAGE5B_SUPABASE_URL;
const anonKey = process.env.STAGE5B_SUPABASE_ANON_KEY;
const serviceKey = process.env.STAGE5B_SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.STAGE5B_APP_URL ?? "http://127.0.0.1:3200";
if (supabaseUrl !== "http://127.0.0.1:55021") throw new Error("Refusing Auth operation: target must be exactly http://127.0.0.1:55021");
if (!anonKey || !serviceKey) throw new Error("Local Supabase keys are required explicitly");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = {
  eligible: "5bd00000-0000-4000-8000-000000000001",
  linked: "5bd00000-0000-4000-8000-000000000002",
  reviewA: "5bd00000-0000-4000-8000-000000000003",
  reviewB: "5bd00000-0000-4000-8000-000000000004",
  conflict: "5bd00000-0000-4000-8000-000000000005",
};
const testEmails = [
  "stage5b-http-eligible@example.invalid",
  "stage5b-http-review@example.invalid",
  "stage5b-http-conflict@example.invalid",
  "stage5b-http-signup@example.invalid",
];
const password = "Stage5B-Local-Password-94!";

async function post(path, body, cookie = "") {
  return fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}
function cookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}
async function json(response) { return response.json().catch(() => ({})); }
async function authUserByEmail(email) {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email) ?? null;
}
async function cleanup() {
  await service.from("users").delete().in("id", Object.values(ids));
  await service.from("users").delete().in("email", testEmails);
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (testEmails.includes(user.email ?? "")) await service.auth.admin.deleteUser(user.id);
  }
}

await cleanup();
try {
  let result = await service.auth.admin.createUser({ email: testEmails[0], password, email_confirm: true });
  if (result.error) throw result.error;
  const eligibleAuthId = result.data.user.id;

  const { error: insertError } = await service.from("users").insert([
    { id: ids.eligible, full_name: "HTTP Eligible", phone: "3479800001", email: testEmails[0], gender: "M", auth_migration_state: "legacy" },
    { id: ids.reviewA, full_name: "HTTP Review A", phone: "3479800003", email: testEmails[1], gender: "F", auth_migration_state: "review_required" },
    { id: ids.reviewB, full_name: "HTTP Review B", phone: "3479800004", email: testEmails[1], gender: "F", auth_migration_state: "review_required" },
    { id: ids.conflict, full_name: "HTTP Conflict", phone: "3479800005", email: testEmails[2], gender: "M", auth_migration_state: "conflict" },
  ]);
  if (insertError) throw insertError;

  const before = await service.from("users").select("id", { count: "exact", head: true });
  let response = await post("/api/user/login", { phone: "3479899999", email: "stage5b-http-missing@example.invalid" });
  assert.equal(response.status, 404);
  assert.equal((await json(response)).redirect_to, "/registrati");
  const after = await service.from("users").select("id", { count: "exact", head: true });
  assert.equal(after.count, before.count, "unknown legacy login created a profile");

  response = await post("/api/user/login", { phone: "3479800001", email: "wrong@example.invalid" });
  assert.equal(response.status, 404);
  response = await post("/api/user/login", { phone: "3479899999", email: testEmails[0] });
  assert.equal(response.status, 404);

  response = await post("/api/user/login", { phone: "+39 347 980 0001", email: testEmails[0].toUpperCase() });
  assert.equal(response.status, 200);
  const legacyCookie = cookies(response);
  assert.match(legacyCookie, /user_session=/);

  response = await post("/api/user/login", { phone: "3479800003", email: testEmails[1] });
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "LEGACY_REVIEW_REQUIRED");
  response = await post("/api/user/login", { phone: "3479800005", email: testEmails[2] });
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "LEGACY_CONFLICT");

  const linked = await service.rpc("resolve_and_link_verified_auth_user", { p_auth_user_id: eligibleAuthId });
  if (linked.error) throw linked.error;
  assert.equal(linked.data.state, "linked");
  response = await post("/api/user/login", { phone: "3479800001", email: testEmails[0] });
  assert.equal(response.status, 409);
  assert.equal((await json(response)).code, "AUTH_LOGIN_REQUIRED");

  response = await fetch(`${appUrl}/api/user/me`, { headers: { Cookie: legacyCookie } });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).user, null, "stale legacy cookie remained authoritative after linking");

  response = await post("/api/auth/login", { email: testEmails[0], password });
  assert.equal(response.status, 200);
  const authCookie = cookies(response);
  response = await fetch(`${appUrl}/api/user/me`, { headers: { Cookie: authCookie } });
  const authMe = await json(response);
  assert.equal(response.status, 200);
  assert.equal(authMe.user.id, ids.eligible);

  response = await post("/api/auth/signup", {
    email: testEmails[3], password, password_confirm: password,
    full_name: "HTTP New Auth", phone: "3479800006", gender: "F",
    privacy_accepted: true, terms_accepted: true, age_confirmed: true, marketing_accepted: false,
  });
  assert.equal(response.status, 200);
  const signupAuth = await authUserByEmail(testEmails[3]);
  assert.ok(signupAuth);
  const confirmed = await service.auth.admin.updateUserById(signupAuth.id, { email_confirm: true });
  if (confirmed.error) throw confirmed.error;
  response = await post("/api/auth/login", { email: testEmails[3], password });
  assert.equal(response.status, 200);
  const signupCookie = cookies(response);
  response = await post("/api/auth/signup/finalize", {}, signupCookie);
  assert.equal(response.status, 200);
  assert.equal((await json(response)).state, "linked");
  const newProfile = await service.from("users").select("id,auth_user_id").eq("email", testEmails[3]).single();
  if (newProfile.error) throw newProfile.error;
  assert.equal(newProfile.data.auth_user_id, signupAuth.id);

  process.stdout.write("Stage 5B local HTTP acceptance PASS: Auth signup/login, eligible/unknown/linked/review/conflict legacy access, and stale-cookie denial.\n");
} finally {
  await cleanup();
}
