import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Staff dashboard reads current DB permissions and the central catalogue", () => {
  const page = read("../src/app/staff/page.tsx");
  const authorization = read("../src/lib/operatorAuthorization.ts");
  assert.match(page, /getEffectiveOperatorPermissions/);
  assert.match(page, /OPERATOR_PERMISSIONS\.filter/);
  assert.match(authorization, /from\("staff_permissions"\)/);
  assert.match(authorization, /operator\.role === "admin"/);
});

test("the catalogue is the shared source for all eleven operational destinations", () => {
  const catalogue = read("../src/lib/operatorPermissions.ts");
  for (const [permission, destination] of [
    ["scanner.manage", "/staff/operations"],
    ["tournaments.manage", "/admin/tournaments"],
    ["circuits.manage", "/admin/circuits"],
    ["players.manage", "/admin/players"],
    ["requests.manage", "/admin/requests"],
    ["padelleria.manage", "/admin/padelleria"],
    ["communications.manage", "/admin/comunicazioni"],
    ["moviback.manage", "/admin/moviback"],
    ["partners.manage", "/admin/partners"],
    ["store.manage", "/admin/store/products"],
    ["monday_league.manage", "/admin/monday-league"],
  ]) {
    assert.match(catalogue, new RegExp(`${permission.replace(".", "\\.")}[\\s\\S]{0,240}${destination.replaceAll("/", "\\/")}`));
  }
});

test("Admin shell filters operational navigation and isolates Admin-only entries", () => {
  const layout = read("../src/app/admin/layout.tsx");
  const navigation = read("../src/components/operator/OperatorNavigation.tsx");
  assert.match(layout, /allowed\.has\(item\.key\)/);
  assert.match(layout, /ADMIN_ONLY_NAVIGATION/);
  assert.match(navigation, /role === "admin"/);
  assert.match(navigation, /Solo Admin/);
});

test("zero-permission Staff gets a safe dashboard empty state", () => {
  const dashboard = read("../src/app/staff/StaffDashboard.tsx");
  assert.match(dashboard, /Nessuna area operativa assegnata\./);
  assert.match(dashboard, /Contatta un Admin/);
});

test("Scanner workflow remains permission guarded and legacy query links remain supported", () => {
  assert.match(read("../src/app/staff/operations/layout.tsx"), /scanner\.manage/);
  assert.match(read("../src/app/staff/scanner/layout.tsx"), /scanner\.manage/);
  assert.match(read("../src/app/staff/rewards/layout.tsx"), /scanner\.manage/);
  assert.match(read("../src/app/staff/page.tsx"), /redirect\(`\/staff\/operations/);
  const scanner = read("../src/app/staff/scanner/page.tsx");
  assert.match(scanner, /\/staff\/operations\?code=/);
  assert.match(scanner, /\/staff\/operations\?reward=/);
});

test("Phase 3 introduces navigation only, with no permission mutation UI", () => {
  for (const source of [
    read("../src/app/staff/StaffDashboard.tsx"),
    read("../src/components/operator/OperatorNavigation.tsx"),
  ]) {
    assert.doesNotMatch(source, /checkbox|permission mutation|role changer/i);
    assert.doesNotMatch(source, /staff_permissions/);
  }
});
