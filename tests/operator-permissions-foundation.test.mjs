import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  operatorHasPermission,
  resolveOperatorIdentity,
} from "../src/lib/operatorAuthorizationCore.ts";
import {
  OPERATOR_PERMISSIONS,
  isOperatorPermissionKey,
} from "../src/lib/operatorPermissions.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261015100000_operator_permissions_foundation.sql");
const authorization = read("../src/lib/operatorAuthorization.ts");
const resolver = read("../src/lib/operatorResolver.ts");
const adminGuard = read("../src/lib/adminGuard.ts");
const staffGuard = read("../src/lib/staffGuard.ts");
const proxy = read("../src/proxy.ts");

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  staff: "10000000-0000-4000-8000-000000000002",
};

test("V1 catalogue is exact, typed at runtime, and uses human labels", () => {
  assert.deepEqual(
    OPERATOR_PERMISSIONS.map((item) => item.key),
    [
      "scanner.manage", "tournaments.manage", "circuits.manage", "players.manage",
      "requests.manage", "padelleria.manage", "communications.manage",
      "moviback.manage", "partners.manage", "store.manage", "monday_league.manage",
    ],
  );
  assert.ok(OPERATOR_PERMISSIONS.every((item) => item.label && item.description));
  assert.equal(isOperatorPermissionKey("scanner.manage"), true);
  assert.equal(isOperatorPermissionKey("root.everything"), false);
});

test("operator resolution ignores stale JWT role and uses current active DB record", async () => {
  const rows = new Map([
    [ids.admin, { id: ids.admin, full_name: "A", email: "a@example.invalid", role: "staff", is_active: true }],
    [ids.staff, { id: ids.staff, full_name: "S", email: "s@example.invalid", role: "admin", is_active: true }],
  ]);
  const load = async (id) => rows.get(id) ?? null;
  assert.equal((await resolveOperatorIdentity({ sid: ids.admin, role: "admin" }, load)).role, "staff");
  assert.equal((await resolveOperatorIdentity({ sid: ids.staff, role: "staff" }, load)).role, "admin");
  rows.get(ids.admin).is_active = false;
  assert.equal(await resolveOperatorIdentity({ sid: ids.admin, role: "admin" }, load), null);
});

test("Admin bypass and Staff exact grants react immediately without a new session", async () => {
  const admin = { sid: ids.admin, name: "A", email: "a@example.invalid", role: "admin" };
  const staff = { sid: ids.staff, name: "S", email: "s@example.invalid", role: "staff" };
  const grants = new Set([`${ids.staff}:scanner.manage`]);
  const hasGrant = async (id, key) => grants.has(`${id}:${key}`);
  assert.equal(await operatorHasPermission(admin, "store.manage", isOperatorPermissionKey, hasGrant), true);
  assert.equal(await operatorHasPermission(staff, "scanner.manage", isOperatorPermissionKey, hasGrant), true);
  assert.equal(await operatorHasPermission(staff, "tournaments.manage", isOperatorPermissionKey, hasGrant), false);
  grants.add(`${ids.staff}:tournaments.manage`);
  assert.equal(await operatorHasPermission(staff, "tournaments.manage", isOperatorPermissionKey, hasGrant), true);
  grants.delete(`${ids.staff}:tournaments.manage`);
  assert.equal(await operatorHasPermission(staff, "tournaments.manage", isOperatorPermissionKey, hasGrant), false);
  assert.equal(await operatorHasPermission(admin, "unknown.manage", isOperatorPermissionKey, hasGrant), false);
});

test("schema is strict, private, append-only, and backfills scanner access only to Staff", () => {
  assert.match(migration, /CREATE TABLE public\.staff_permissions/);
  assert.match(migration, /PRIMARY KEY \(staff_user_id, permission_key\)/);
  assert.match(migration, /staff_permissions_key_check/);
  assert.match(migration, /CREATE TABLE public\.operator_access_audit_events/);
  assert.match(migration, /operator_access_audit_events_immutable/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON TABLE public\.staff_permissions FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /WHERE role = 'staff'/);
  assert.doesNotMatch(migration, /WHERE role = 'admin'/);
});

test("production guards and proxy resolve current DB operator state", () => {
  assert.match(resolver, /from\("staff_users"\)/);
  assert.match(resolver, /select\("id,full_name,email,role,is_active"\)/);
  assert.match(adminGuard, /getCurrentOperator/);
  assert.match(adminGuard, /operator\.role !== "admin"/);
  assert.match(staffGuard, /getCurrentOperator/);
  assert.match(authorization, /from\("staff_permissions"\)/);
  assert.match(authorization, /isOperatorPermissionKey/);
  assert.match(proxy, /resolveOperatorFromSession/);
  assert.match(proxy, /operator\.role !== "admin"/);
});
