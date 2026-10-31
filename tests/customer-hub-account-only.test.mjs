import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { customerAuthAccess, customerHubMatchesSearch } from "../src/lib/customerHub.ts";

const read = (path) => readFileSync(path, "utf8");

test("auth access labels use existing migration and link semantics", () => {
  assert.deepEqual(customerAuthAccess("activation_pending", false), {
    key: "to_activate",
    label: "Nuovo accesso: da attivare",
  });
  assert.equal(customerAuthAccess("legacy", false).key, "to_activate");
  assert.equal(customerAuthAccess("linked", true).key, "active");
  assert.equal(customerAuthAccess("review_required", false).key, "review");
  assert.equal(customerAuthAccess("conflict", false).key, "conflict");
});

test("customer search matches safe account identifiers", () => {
  const values = ["Cliente Sintetica", "+39 349 000 7008", "customer-hub-h@example.invalid"];
  assert.equal(customerHubMatchesSearch("sintetica", values), true);
  assert.equal(customerHubMatchesSearch("3490007008", values), true);
  assert.equal(customerHubMatchesSearch("hub-h@example.invalid", values), true);
  assert.equal(customerHubMatchesSearch("assente", values), false);
});

test("unified registry keeps player and account identities distinct", () => {
  const api = read("src/app/api/admin/players/route.ts");
  assert.match(api, /kind: "player" as const/);
  assert.match(api, /result_key: `player:\$\{player\.id\}`/);
  assert.match(api, /kind: "account_only" as const/);
  assert.match(api, /result_key: `account:\$\{item\.id\}`/);
  assert.match(api, /player_identity_id: null/);
  assert.match(api, /\.eq\("identity_status", "active"\)/);
  assert.doesNotMatch(api, /\.not\("auth_user_id"/);
  assert.doesNotMatch(api, /\.eq\("auth_migration_state", "linked"\)/);
});

test("account-only reads never create identities and resolution is explicit Admin-only", () => {
  const route = read("src/app/api/admin/players/account/[id]/route.ts");
  const detail = read("src/app/admin/players/account/[id]/AccountOnlyCustomerDetail.tsx");
  const getBody = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.doesNotMatch(getBody, /\.rpc\(|\.insert\(|\.upsert\(/);
  assert.match(route, /const denied = await guardAdmin\(\)/);
  assert.match(route, /\.rpc\("player_profile_resolve_account"/);
  assert.match(detail, /Crea o collega identità giocatore/);
  assert.match(detail, /window\.confirm/);
  assert.match(detail, /Identità giocatore non collegata/);
});

test("synthetic account-only fixture has approved MoviBack data without Auth or player identity", () => {
  const fixture = read("supabase/tests/fixtures/customer_hub.local.mjs");
  const acceptance = read("supabase/tests/customer_hub_local_acceptance.mjs");
  assert.match(fixture, /Account legacy senza identità giocatore/);
  assert.match(fixture, /auth_user_id:null,auth_migration_state:'activation_pending'/);
  assert.match(fixture, /if\(isAccountOnly\)[\s\S]*?continue;/);
  assert.match(fixture, /kind==='account_only'.*?'approved'/);
  assert.match(acceptance, /account-only fixture must not auto-create a player identity/);
});
