import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const domains = [
  ["tournaments.manage", "../src/app/admin/tournaments/layout.tsx", "../src/app/api/admin/tournaments/route.ts"],
  ["circuits.manage", "../src/app/admin/circuits/layout.tsx", "../src/app/api/admin/circuits/[id]/route.ts"],
  ["players.manage", "../src/app/admin/players/layout.tsx", "../src/app/api/admin/players/route.ts"],
  ["requests.manage", "../src/app/admin/requests/layout.tsx", "../src/app/api/admin/requests/route.ts"],
  ["padelleria.manage", "../src/app/admin/padelleria/layout.tsx", "../src/app/api/admin/padelleria/route.ts"],
  ["communications.manage", "../src/app/admin/comunicazioni/layout.tsx", "../src/app/api/admin/comunicazioni/route.ts"],
  ["moviback.manage", "../src/app/admin/moviback/layout.tsx", "../src/app/api/admin/moviback/dashboard/route.ts"],
  ["partners.manage", "../src/app/admin/partners/layout.tsx", "../src/app/api/admin/partners/route.ts"],
  ["store.manage", "../src/app/admin/store/products/layout.tsx", "../src/app/api/admin/store/products/route.ts"],
  ["monday_league.manage", "../src/app/admin/monday-league/layout.tsx", "../src/app/api/admin/monday-league/overview/route.ts"],
];

test("every delegated domain has a server page guard and an independent API guard", () => {
  for (const [permission, layoutPath, apiPath] of domains) {
    assert.match(read(layoutPath), new RegExp(permission.replace(".", "\\.")), layoutPath);
    assert.match(read(apiPath), new RegExp(permission.replace(".", "\\.")), apiPath);
  }
  assert.match(read("../src/app/admin/store-orders/layout.tsx"), /store\.manage/);
});

test("scanner surfaces require scanner.manage rather than generic Staff role", () => {
  for (const path of [
    "../src/app/staff/operations/layout.tsx",
    "../src/app/staff/scanner/layout.tsx",
    "../src/app/staff/rewards/layout.tsx",
    "../src/app/api/staff/lookup-membership/route.ts",
    "../src/app/api/staff/earn-points/route.ts",
    "../src/app/api/staff/reward-delivery/route.ts",
  ]) assert.match(read(path), /scanner\.manage/, path);
});

test("Admin-only and system-only exceptions remain on guardAdmin", () => {
  for (const path of [
    "../src/app/api/admin/users/route.ts",
    "../src/app/api/admin/users/access-problems/route.ts",
    "../src/app/api/admin/users/duplicates/route.ts",
    "../src/app/api/admin/circuits/[id]/merge-player-keys/route.ts",
    "../src/app/api/admin/player-identities/route.ts",
    "../src/app/api/admin/moviback/users/[id]/adjust-points/route.ts",
    "../src/app/api/admin/moviback/certificates/[id]/review/route.ts",
    "../src/app/api/admin/store-economics/route.ts",
    "../src/app/api/admin/store-orders/toggle-paid/route.ts",
    "../src/app/api/admin/upload/route.ts",
    "../src/app/api/admin/push/subscribe/route.ts",
  ]) assert.match(read(path), /guardAdmin/, path);
});

test("proxy only opens classified delegated page prefixes to Staff", () => {
  const proxy = read("../src/proxy.ts");
  const manifest = read("../src/lib/operatorRouteAccess.ts");
  assert.match(proxy, /delegatedAdminPagePermission/);
  assert.match(proxy, /operator\.role !== "admin" && !delegatedAdminPagePermission/);
  for (const [permission] of domains) assert.match(manifest, new RegExp(permission.replace(".", "\\.")));
  assert.doesNotMatch(manifest, /admin\/users|admin\/upload|store-economics/);
});

test("DB RPC delegation is permission-aware without broadening identity reconciliation", () => {
  const migration = read("../supabase/migrations/20261016100000_operator_permissions_domain_enforcement.sql");
  assert.match(migration, /operator_has_permission\(p_actor_id,'monday_league\.manage'\)/);
  assert.match(migration, /player_profile_write_operator/);
  assert.match(migration, /operator_has_permission\(p_actor,'players\.manage'\)/);
  assert.doesNotMatch(migration, /create or replace function public\.player_identity_admin/);
  assert.match(read("../src/app/api/admin/player-identities/route.ts"), /guardAdmin/);
});

test("specialized uploads are scoped while the generic upload remains Admin-only", () => {
  const scoped = [
    ["../src/app/api/admin/circuits/home-image/route.ts", "circuits.manage"],
    ["../src/app/api/admin/comunicazioni/image/route.ts", "communications.manage"],
    ["../src/app/api/admin/padelleria/[id]/media/route.ts", "padelleria.manage"],
    ["../src/app/api/admin/partners/[id]/media/route.ts", "partners.manage"],
    ["../src/app/api/admin/store/products/image/route.ts", "store.manage"],
    ["../src/app/api/admin/moviback/rewards/image/route.ts", "moviback.manage"],
  ];
  for (const [path, permission] of scoped) assert.match(read(path), new RegExp(permission.replace(".", "\\.")), path);
  assert.match(read("../src/app/api/admin/upload/route.ts"), /guardAdmin/);
});

test("sensitive Store and MoviBack helpers remain narrower than their normal domains", () => {
  assert.match(read("../src/lib/storeEconomicsAccess.ts"), /role !== "admin"/);
  assert.match(read("../src/app/api/admin/store-orders/toggle-paid/route.ts"), /guardAdmin/);
  assert.match(read("../src/app/api/admin/moviback/certificate-url/route.ts"), /guardAdmin/);
  assert.match(read("../src/app/api/admin/moviback/users/[id]/adjust-points/route.ts"), /guardAdmin/);
});
