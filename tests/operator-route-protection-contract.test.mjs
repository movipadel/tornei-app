import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const packageJson = JSON.parse(read("package.json"));
const proxy = read("src/proxy.ts");
const adminGuard = read("src/lib/adminGuard.ts");
const staffGuard = read("src/lib/staffGuard.ts");

test("Next 16 proxy lives at the supported convention level beside src/app", () => {
  assert.match(packageJson.dependencies.next, /^16\./);
  assert.equal(existsSync(new URL("src/proxy.ts", root)), true);
  assert.equal(existsSync(new URL("proxy.ts", root)), false);
  assert.match(proxy, /export async function proxy\(request: NextRequest\)/);
  assert.match(proxy, /export const config = \{[\s\S]*matcher:/);
});

test("anonymous operator routes preserve their separate login redirects", () => {
  assert.match(proxy, /url\.pathname = isStaffPath \? "\/staff\/login" : "\/admin\/login"/);
  assert.match(proxy, /url\.searchParams\.set\("next", pathname\)/);
  assert.match(proxy, /pathname\.startsWith\("\/admin\/login"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/staff\/login"\)/);
});

test("staff can reach only classified Admin domains before authoritative page guards", () => {
  assert.match(proxy, /role === "admin" \|\| role === "staff"/);
  assert.match(proxy, /resolveOperatorFromSession\(session\)/);
  assert.match(proxy, /isAdminPath && operator\.role !== "admin" && !delegatedAdminPagePermission/);
  assert.match(proxy, /url\.pathname = "\/staff"/);
});

test("API guards continue to enforce admin and staff role separation", () => {
  assert.match(adminGuard, /getCurrentOperator/);
  assert.match(adminGuard, /operator\.role !== "admin"/);
  assert.match(staffGuard, /getCurrentOperator/);
  assert.match(adminGuard + staffGuard, /status: 403/);
});
