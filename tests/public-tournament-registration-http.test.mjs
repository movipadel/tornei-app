import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadRoute(path, imports) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    Response,
    Request,
    URL,
    console,
  }, { filename: path });
  return compiledModule.exports;
}

const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const uid = "11111111-1111-4111-8111-111111111111";
const tournamentId = "22222222-2222-4222-8222-222222222222";
const companionId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: tournamentId }) };

test("public POST ignores spoofed Player 1 and forwards explicit companion ID to the canonical RPC", async () => {
  let rpcArgs;
  let notifications;
  const tournament = {
    id: tournamentId, type: "Coppie fisse", category: "Libero", level: "principiante",
    registrations_open: true, circuit_id: null, circuit_ranking_group_id: null,
  };
  const sb = {
    from: (table) => {
      assert.equal(table, "tournaments");
      return { select: () => ({ eq: () => ({ single: async () => ({ data: tournament, error: null }) }) }) };
    },
    rpc: async (name, args) => {
      assert.equal(name, "public_tournament_register_self");
      rpcArgs = args;
      return { data: { id: "44444444-4444-4444-8444-444444444444", is_reserve: false, position: 1, p1_name: "Real User", p1_phone: "+393470000001", p2_name: "Companion" }, error: null };
    },
  };
  const route = loadRoute("src/app/api/tournaments/[id]/registrations/route.ts", {
    "next/server": next,
    "@/lib/supabaseAdmin": { supabaseAdmin: () => sb },
    "@/lib/userAuth": { getUserIdFromCookie: async () => uid },
    "@/lib/telegram": { sendTelegramMessage: async () => {} },
    "@/lib/staffPush": { enqueueStaffPushEvent: async () => {} },
    "@/lib/postCommitNotifications": {
      measureNotificationRequest: (_name, callback) => callback(),
      schedulePostCommitNotifications: (_name, jobs) => { notifications = jobs; },
    },
  });
  const response = await route.POST(new Request("http://127.0.0.1:3100/api/tournaments/x/registrations", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p1_name: "Spoof", p1_phone: "000", p1_gender: "M", p2_player_identity_id: companionId }),
  }), context);
  assert.equal(response.status, 201);
  assert.equal(rpcArgs.p_user, uid);
  assert.equal(rpcArgs.p_companion_identity, companionId);
  assert.equal(rpcArgs.p_companion_name, null);
  assert.equal(rpcArgs.p_companion_phone, null);
  assert.ok(!Object.values(rpcArgs).includes("Spoof"));
  assert.deepEqual(Array.from(notifications, (job) => job.provider), ["telegram", "push"]);
  const publicBody = await response.json();
  assert.deepEqual(Object.keys(publicBody.data).sort(), ["id", "is_reserve", "position"]);
});

test("public POST rejects anonymous requests before reaching the database", async () => {
  const route = loadRoute("src/app/api/tournaments/[id]/registrations/route.ts", {
    "next/server": next,
    "@/lib/supabaseAdmin": { supabaseAdmin: () => { throw Error("DB reached"); } },
    "@/lib/userAuth": { getUserIdFromCookie: async () => null },
    "@/lib/telegram": {},
    "@/lib/staffPush": {},
    "@/lib/postCommitNotifications": { measureNotificationRequest: (_name, callback) => callback() },
  });
  const response = await route.POST(new Request("http://127.0.0.1:3100/api/tournaments/x/registrations", { method: "POST", body: "{}" }), context);
  assert.equal(response.status, 401);
});

test("ambiguous self identity returns a safe review response without notifications", async () => {
  let notifications = 0;
  const route = loadRoute("src/app/api/tournaments/[id]/registrations/route.ts", {
    "next/server": next,
    "@/lib/supabaseAdmin": { supabaseAdmin: () => ({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {
        id: tournamentId, type: "Baraonda", category: "Libero", registrations_open: true,
        circuit_id: null, circuit_ranking_group_id: null,
      } }) }) }) }),
      rpc: async () => ({ data: { state: "review" }, error: null }),
    }) },
    "@/lib/userAuth": { getUserIdFromCookie: async () => uid },
    "@/lib/telegram": {},
    "@/lib/staffPush": {},
    "@/lib/postCommitNotifications": {
      measureNotificationRequest: (_name, callback) => callback(),
      schedulePostCommitNotifications: () => { notifications++; },
    },
  });
  const response = await route.POST(new Request("http://127.0.0.1:3100/api/tournaments/x/registrations", { method: "POST", body: "{}" }), context);
  assert.equal(response.status, 409);
  assert.equal(notifications, 0);
  assert.doesNotMatch(JSON.stringify(await response.json()), /case_id|account_user_id|phone/);
});

test("public search returns only canonical identity, display name and masked phone", async () => {
  const candidate = {
    id: companionId, full_name: "Synthetic Companion", normalized_phone: "+393470000123",
    account_user_id: null, email: "must-not-leak@example.invalid", internal_notes: "private",
  };
  const sb = {
    from: (table) => {
      if (table === "tournaments") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: tournamentId, type: "Coppie fisse", registrations_open: true } }) }) }) };
      if (table === "users") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: uid, identity_status: "active" } }) }) }) };
      if (table === "player_identities") return { select: () => ({ eq: () => ({ ilike: () => ({ limit: async () => ({ data: [candidate], error: null }) }) }) }) };
      throw Error(`Unexpected table: ${table}`);
    },
  };
  const route = loadRoute("src/app/api/tournaments/[id]/players/search/route.ts", {
    "next/server": next,
    "@/lib/userAuth": { getUserIdFromCookie: async () => uid },
    "@/lib/supabaseAdmin": { supabaseAdmin: () => sb },
  });
  const response = await route.GET(new Request(`http://127.0.0.1:3100/api/tournaments/${tournamentId}/players/search?q=Synthetic`), context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.data[0]).sort(), ["display_name", "masked_phone", "player_identity_id"]);
  assert.equal(body.data[0].masked_phone, "•••• 0123");
  assert.doesNotMatch(JSON.stringify(body), /must-not-leak|private|account_user_id/);
});
