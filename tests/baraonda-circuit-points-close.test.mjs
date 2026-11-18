import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { buildPublicCircuitRanking } from "../src/lib/circuitPublicRanking.ts";

const source = readFileSync("src/app/api/admin/tournaments/[id]/run/close/route.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tournamentId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const circuitId = "30000000-0000-4000-8000-000000000001";
const groupId = "40000000-0000-4000-8000-000000000001";
const scale = [450, 400, 350, 300, 250, 200, 150, 100];

function fixture({ category = "Libero", groupCategory = "Libero", explicitGroup = null, rules = scale, groupExists = true } = {}) {
  const participants = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`, name: `Synthetic ${i + 1}`, phone: `34700000${String(i + 1).padStart(2, "0")}`,
  }));
  const matches = Array.from({ length: 14 }, (_, i) => ({
    id: `m${i}`, p1_id: "p1", p2_id: "p2", p3_id: "p3", p4_id: "p4",
    team1_games: 6, team2_games: 2, completed_at: "2026-11-18T22:00:00Z",
  }));
  const tournament = {
    id: tournamentId, name: "Synthetic Crazy Winter", type: "Baraonda", category,
    level: "principiante", date: "2026-11-18", circuit_id: circuitId,
    circuit_ranking_group_id: explicitGroup,
  };
  const run = { id: runId, mode: "baraonda", status: "running", rules: { tieWinValue: 0.5 }, created_at: "2026-11-18" };
  const ruleRows = rules.map((points, i) => ({
    id: `rule${i}`, circuit_id: circuitId, min_admissions: 8, max_admissions: 8,
    rule_type: "placement", placement: i + 1, stage: null, points,
  }));
  const writes = [];
  const rpcCalls = [];
  function query(table) {
    const filters = [];
    let mutation = null;
    const q = {
      select: () => q, eq: (key, value) => { filters.push([key, value]); return q; },
      in: (key, value) => { filters.push([key, value]); return q; },
      order: () => q, limit: () => q,
      update: (value) => { mutation = value; return q; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    function result() {
      if (mutation) {
        writes.push({ table, mutation });
        if (table === "tournament_runs") run.status = mutation.status;
        return { data: null, error: null };
      }
      const data = table === "tournaments" ? tournament
        : table === "tournament_runs" ?
            (filters.some(([key, values]) => key === "status" && Array.isArray(values) && !values.includes(run.status)) ? null : run)
        : table === "circuit_ranking_groups" ? (groupExists &&
            filters.every(([key, value]) => key !== "category" || value === groupCategory) ? { id: groupId } : null)
        : table === "circuit_points_rules" ? ruleRows
        : table === "tournament_run_participants" ? participants
        : table === "tournament_run_turns" ? [{ id: "turn1" }]
        : table === "tournament_run_matches" ? matches
        : (() => { throw Error(`Unexpected table ${table}`); })();
      return { data, error: null };
    }
    return q;
  }
  const sb = {
    from: query,
    rpc: async (name, args) => {
      assert.equal(name, "player_identity_materialize_circuit");
      rpcCalls.push(args);
      run.status = "completed";
      return { data: args.p_rows.length, error: null };
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, require: (name) => ({
      "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
      "@/lib/supabaseAdmin": { supabaseAdmin: () => sb },
      "@/lib/operatorAuthorization": { guardOperatorPermission: async () => null },
    })[name], Request, Response, console,
  });
  return {
    close: () => mod.exports.POST(new Request("http://127.0.0.1:3100/close", { method: "POST" }), { params: Promise.resolve({ id: tournamentId }) }),
    rpcCalls, writes, groupId,
  };
}

test("missing Crazy Winter point rules fail before materialization or run completion", async () => {
  const f = fixture({ rules: [] });
  const response = await f.close();
  assert.notEqual(response.status, 200);
  assert.match((await response.json()).error, /punti|rule/i);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.writes.length, 0);
});

test("eight-player Baraonda assigns configured placement scale exactly once", async () => {
  const f = fixture();
  const response = await f.close();
  assert.equal(response.status, 200);
  assert.equal(f.rpcCalls.length, 1);
  assert.deepEqual(Array.from(f.rpcCalls[0].p_rows, row => row.points), scale);
  assert.deepEqual(Array.from(f.rpcCalls[0].p_rows, row => row.placement), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(f.rpcCalls[0].p_rows.reduce((sum, row) => sum + row.points, 0), 2200);
});

test("Misto operational category uses explicit Libero ranking destination", async () => {
  const f = fixture({ category: "Misto", explicitGroup: groupId });
  const response = await f.close();
  assert.equal(response.status, 200);
  assert.ok(f.rpcCalls[0].p_rows.every(row => row.ranking_group_id === groupId));
});

test("missing ranking destination fails without materialization", async () => {
  const f = fixture({ groupExists: false });
  const response = await f.close();
  assert.equal(response.status, 400);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.writes.length, 0);
});

test("partial point scale fails before materialization", async () => {
  const f = fixture({ rules: scale.slice(0, 7) });
  const response = await f.close();
  assert.notEqual(response.status, 200);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.writes.length, 0);
});

test("an explicitly all-zero scale cannot silently close a ranking stage", async () => {
  const f = fixture({ rules: scale.map(() => 0) });
  const response = await f.close();
  assert.notEqual(response.status, 200);
  assert.equal(f.rpcCalls.length, 0);
  assert.equal(f.writes.length, 0);
});

test("a single explicitly zero-point placement is honored without zeroing the stage", async () => {
  const expected = [...scale];
  expected[7] = 0;
  const f = fixture({ rules: expected });
  const response = await f.close();
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(f.rpcCalls[0].p_rows, row => row.points), expected);
  assert.equal(f.rpcCalls[0].p_rows.reduce((sum, row) => sum + row.points, 0), 2100);
});

test("retry of a completed run does not materialize or award a second time", async () => {
  const f = fixture();
  assert.equal((await f.close()).status, 200);
  const retry = await f.close();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadyClosed, true);
  assert.equal(f.rpcCalls.length, 1);
  assert.equal(f.rpcCalls[0].p_tournament, tournamentId);
});

test("a prior correctly scored stage remains intact in overall ranking aggregation", async () => {
  const f = fixture();
  assert.equal((await f.close()).status, 200);
  const previous = Object.freeze(scale.map((points, i) => Object.freeze({ player_name: `Prior ${i + 1}`, points })));
  const before = buildPublicCircuitRanking(previous);
  const after = buildPublicCircuitRanking([...previous, ...f.rpcCalls[0].p_rows]);
  assert.equal(before.reduce((sum, row) => sum + row.total_points, 0), 2200);
  assert.equal(after.reduce((sum, row) => sum + row.total_points, 0), 4400);
  assert.equal(after.length, 16);
  assert.deepEqual(Array.from(previous, row => row.points), scale);
});
