import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { operatorHasPermission } from "../../src/lib/operatorAuthorizationCore.ts";
import { isOperatorPermissionKey } from "../../src/lib/operatorPermissions.ts";

if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") {
  throw new Error("Safe local runner required");
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.OPERATOR_EDITOR_TEST_BASE_URL ?? "http://localhost:3100";
const ids = {
  staleAdmin: "15100000-0000-4000-8000-000000000001",
  staleStaff: "15100000-0000-4000-8000-000000000002",
  inactive: "15100000-0000-4000-8000-000000000003",
  permissionStaff: "15100000-0000-4000-8000-000000000004",
};
const rows = [
  { id: ids.staleAdmin, full_name: "Stale Admin JWT", email: "stale-admin-jwt@example.invalid", role: "staff", is_active: true },
  { id: ids.staleStaff, full_name: "Stale Staff JWT", email: "stale-staff-jwt@example.invalid", role: "admin", is_active: true },
  { id: ids.inactive, full_name: "Inactive Operator", email: "inactive-operator@example.invalid", role: "admin", is_active: false },
  { id: ids.permissionStaff, full_name: "Permission Staff", email: "permission-staff-http@example.invalid", role: "staff", is_active: true },
];
const token = async (sid, role) => new SignJWT({ sid, role, name: "JWT hint", email: "hint@example.invalid" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m")
  .sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
const request = async (path, jwt, redirect = "follow") => fetch(base + path, {
  headers: jwt ? { Cookie: `staff_session=${jwt}` } : {}, redirect,
});
let checks = 0;
try {
  assert.ifError((await db.from("staff_users").upsert(rows)).error);
  const adminHint = await token(ids.staleAdmin, "admin");
  const staffHint = await token(ids.staleStaff, "staff");
  const inactiveHint = await token(ids.inactive, "admin");

  let response = await request("/api/admin/me", adminHint);
  assert.equal(response.status, 403); checks++;
  response = await request("/api/staff/me", adminHint);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, "staff"); checks++;

  response = await request("/api/admin/me", staffHint);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, "admin"); checks++;

  assert.equal((await request("/api/admin/me", inactiveHint)).status, 403); checks++;
  assert.equal((await request("/api/staff/me", inactiveHint)).status, 403); checks++;

  response = await request("/admin", adminHint, "manual");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/staff$/); checks++;
  assert.equal((await request("/admin", staffHint, "manual")).status, 200); checks++;
  assert.equal((await request("/staff", staffHint, "manual")).status, 200); checks++;

  response = await request("/admin", null, "manual");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/admin\/login/); checks++;
  response = await request("/staff", null, "manual");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/staff\/login/); checks++;

  const permissionOperator = {
    sid: ids.permissionStaff, name: "Permission Staff",
    email: "permission-staff-http@example.invalid", role: "staff",
  };
  const hasGrant = async (staffUserId, permissionKey) => {
    const result = await db.from("staff_permissions").select("staff_user_id")
      .eq("staff_user_id", staffUserId).eq("permission_key", permissionKey).maybeSingle();
    assert.ifError(result.error);
    return Boolean(result.data);
  };
  assert.equal(await operatorHasPermission(permissionOperator, "tournaments.manage", isOperatorPermissionKey, hasGrant), false); checks++;
  assert.ifError((await db.from("staff_permissions").insert({ staff_user_id: ids.permissionStaff, permission_key: "tournaments.manage" })).error);
  assert.equal(await operatorHasPermission(permissionOperator, "tournaments.manage", isOperatorPermissionKey, hasGrant), true); checks++;
  assert.ifError((await db.from("staff_permissions").delete().eq("staff_user_id", ids.permissionStaff).eq("permission_key", "tournaments.manage")).error);
  assert.equal(await operatorHasPermission(permissionOperator, "tournaments.manage", isOperatorPermissionKey, hasGrant), false); checks++;
  assert.equal(await operatorHasPermission(permissionOperator, "unknown.manage", isOperatorPermissionKey, hasGrant), false); checks++;

  console.log(`Operator permissions HTTP PASS: ${checks} DB-authoritative guard/proxy checks.`);
} finally {
  await db.from("staff_permissions").delete().in("staff_user_id", Object.values(ids));
  await db.from("staff_users").delete().in("id", Object.values(ids));
}
