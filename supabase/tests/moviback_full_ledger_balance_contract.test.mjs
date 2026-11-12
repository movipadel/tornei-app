import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20261112090057_moviback_full_ledger_balance.sql");
const helperSource = read("../../src/lib/movibackBalanceServer.ts");
const compiled = ts.transpileModule(helperSource.replace('import "server-only";', ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const balanceModule = { exports: {} };
Function("module", "exports", compiled)(balanceModule, balanceModule.exports);
const { getMovibackBalance, getMovibackBalances, getMovibackGlobalBalance } = balanceModule.exports;

test("SQL balance RPC sums the complete signed ledger and is service-role only", () => {
  assert.match(migration, /sum\(tx\.points_delta\)/);
  assert.match(migration, /where tx\.membership_id = any\(p_membership_ids\)/);
  assert.doesNotMatch(migration, /\blimit\b|\boffset\b/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.get_moviback_points_balances\(uuid\[\]\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_moviback_points_balances\(uuid\[\]\) to service_role/i);
});

test("helper preserves full balance at 16, 80, 81 and 150 movements, including reversals", async () => {
  for (const count of [16, 80, 81, 150]) {
    const deltas = Array.from({ length: count === 150 ? 149 : count }, () => 1);
    if (count === 150) deltas.push(-20);
    const calls = [];
    const sb = { rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: [{ membership_id: "member", points_balance: deltas.reduce((sum, value) => sum + value, 0) }], error: null };
    } };
    assert.equal(await getMovibackBalance(sb, "member"), count === 150 ? 129 : count);
    assert.deepEqual(calls, [["get_moviback_points_balances", { p_membership_ids: ["member"] }]]);
  }
});

test("batch and global balance use the same DB aggregate and fill empty members with zero", async () => {
  const sb = { rpc: async (_, { p_membership_ids }) => ({
    data: p_membership_ids === null
      ? [{ membership_id: null, points_balance: -4 }]
      : [{ membership_id: "one", points_balance: -4 }],
    error: null,
  }) };
  assert.deepEqual([...await getMovibackBalances(sb, ["one", "empty"])], [["one", -4], ["empty", 0]]);
  assert.equal(await getMovibackGlobalBalance(sb), -4);
});

test("recent lists remain bounded while balance never sums a list page", () => {
  const routes = [
    ["../../src/app/api/admin/moviback/users/[id]/route.ts", 80],
    ["../../src/app/api/moviback/me/route.ts", 20],
    ["../../src/lib/customerHubServer.ts", 20],
  ];
  for (const [path, limit] of routes) {
    const source = read(path);
    assert.match(source, new RegExp(`\\.limit\\(${limit}\\)`));
    assert.match(source, /getMovibackBalance/);
  }
  const dashboard = read("../../src/app/api/admin/moviback/dashboard/route.ts");
  assert.match(dashboard, /getMovibackGlobalBalance/);
  assert.doesNotMatch(dashboard, /totalPointsBalance\s*=\s*allTx\.reduce/);
  for (const path of ["../../src/app/api/store/orders/route.ts", "../../src/app/api/moviback/rewards/redeem/route.ts"]) {
    assert.match(read(path), /getMovibackBalance\(sb, membership\.id\)/);
  }
});
