import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadTs(path, imports = {}) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, Response, Request, console,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  }, { filename: path });
  return loadedModule.exports;
}

const ownership = loadTs("src/lib/tournamentRegistrationOwnership.ts");
const homeCta = loadTs("src/lib/homeTournamentWindow.ts");
const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";
const playerId = "33333333-3333-4333-8333-333333333333";
const tournamentId = "44444444-4444-4444-8444-444444444444";
const scope = { userIds: [accountId], playerIds: [playerId], legacyKeys: ["3470000001"] };
const row = (overrides = {}) => ({
  id: "55555555-5555-4555-8555-555555555555", tournament_id: tournamentId,
  is_reserve: false, user_id: accountId, p1_player_identity_id: playerId,
  p2_player_identity_id: null, p1_phone: "+393470000001", p2_phone: null,
  ...overrides,
});
const tournament = { max_participants: 8, counts: { main: 1 }, registrations_open: true };

test("canonical ownership recognizes the real-case +39 snapshot without comparing profile phone text", () => {
  assert.equal(ownership.tournamentRegistrationPhoneKey("+39 347 0000001"), "3470000001");
  assert.equal(ownership.ownsTournamentRegistration(row(), scope), true);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: null }), scope), true);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: null, p1_player_identity_id: null, p2_player_identity_id: playerId }), scope), true);
  assert.equal(ownership.ownsTournamentRegistration(row({ p1_player_identity_id: null }), scope), true); // legacy user_id
});

test("phone fallback is limited to historical unlinked slots and never claims another canonical account", () => {
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: null, p1_player_identity_id: null }), scope), true);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: otherAccountId, p1_player_identity_id: null }), scope), false);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: otherAccountId, p1_player_identity_id: "other-player" }), scope), false);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: null, p1_player_identity_id: null, p1_phone: "+393470000002" }), scope), false);
  assert.equal(ownership.ownsTournamentRegistration(row({ user_id: null, p1_player_identity_id: null, p1_phone: null }), { ...scope, legacyKeys: [""] }), false);
});

test("registration and cancellation change the shared Home and /tornei status immediately", () => {
  let registrations = [];
  assert.equal(ownership.ownedTournamentStatus(registrations, tournamentId), "none");
  assert.equal(homeCta.getHomeTournamentCta(tournament, "none"), "register");
  registrations = ownership.upsertOwnedTournamentRegistration(registrations, { id: row().id, tournament_id: tournamentId, is_reserve: false });
  assert.equal(ownership.ownedTournamentStatus(registrations, tournamentId), "main");
  assert.equal(homeCta.getHomeTournamentCta(tournament, "main"), "registered");
  assert.equal(registrations.length, 1);
  registrations = ownership.removeOwnedTournamentRegistration(registrations, row().id);
  assert.equal(ownership.ownedTournamentStatus(registrations, tournamentId), "none");
  assert.equal(homeCta.getHomeTournamentCta(tournament, "none"), "register");
});

test("reserve and LIVE retain existing CTA priority", () => {
  const registration = { id: row().id, tournament_id: tournamentId, is_reserve: true };
  assert.equal(ownership.ownedTournamentStatus([registration], tournamentId), "reserve");
  assert.equal(homeCta.getHomeTournamentCta(tournament, "reserve"), "reserve");
  assert.equal(homeCta.getHomeTournamentCta({ ...tournament, hasLive: true }, "main"), "live");
  assert.equal(homeCta.getHomeTournamentCta({ ...tournament, hasLive: true }, "reserve"), "live");
});

test("authenticated GET returns only owned registration IDs and disables caching", async () => {
  const filters = [];
  let calls = 0;
  const otherRow = row({ id: "other", user_id: otherAccountId, p1_player_identity_id: "other-player", p1_phone: "+393470000001" });
  const sb = { from: (table) => {
    assert.equal(table, "tournament_registrations");
    return { select: () => ({ or: (filter) => {
      filters.push(filter);
      return { limit: async () => ({ data: ++calls === 1 ? [row(), otherRow] : [row(), otherRow], error: null }) };
    } }) };
  } };
  const route = loadTs("src/app/api/registrations/mine/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/userAuth": { getUserIdFromCookie: async () => accountId },
    "@/lib/supabaseAdmin": { supabaseAdmin: () => sb },
    "@/lib/playerIdentityServer": { resolvePlayerIdentityScope: async () => scope },
    "@/lib/tournamentRegistrationOwnership": ownership,
  });
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.deepEqual(Object.keys(body.data[0]).sort(), ["id", "is_reserve", "tournament_id"]);
  assert.equal(body.data[0].id, row().id);
  assert.match(filters[0], /user_id\.in/);
  assert.match(filters[0], /p1_player_identity_id\.in/);
  assert.match(filters[1], /p1_phone\.ilike/);
  assert.doesNotMatch(JSON.stringify(body), /phone|account_user_id|player_identity_id/);
});

test("anonymous registration-state GET returns no rows without querying the database", async () => {
  const route = loadTs("src/app/api/registrations/mine/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/userAuth": { getUserIdFromCookie: async () => null },
    "@/lib/supabaseAdmin": { supabaseAdmin: () => { throw new Error("DB reached"); } },
    "@/lib/playerIdentityServer": {},
    "@/lib/tournamentRegistrationOwnership": ownership,
  });
  const response = await route.GET();
  assert.deepEqual(await response.json(), { data: [] });
});

test("Home and /tornei use the same authenticated ownership state and optimistic POST result", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  const listing = readFileSync("src/app/tornei/page.tsx", "utf8");
  const dialog = readFileSync("src/components/tournaments/RegistrationDialog.tsx", "utf8");
  const card = readFileSync("src/components/tournaments/TournamentCard.tsx", "utf8");
  for (const source of [home, listing]) {
    assert.match(source, /fetch\("\/api\/registrations\/mine", \{ cache: "no-store" \}\)/);
    assert.match(source, /ownedTournamentStatus\(myRegs, tournamentId\)/);
    assert.match(source, /upsertOwnedTournamentRegistration\(current/);
    assert.match(source, /removeOwnedTournamentRegistration\(current/);
    assert.match(source, /myRegsReadyForUserId !== user\.id/);
    assert.match(source, /if \(!user\) return "none"/);
    assert.doesNotMatch(source, /\/api\/registrations\/search/);
  }
  assert.match(home, /upcomingTournaments\.length \? ownershipPending \?/);
  assert.match(listing, /\) : ownershipPending \? \(/);
  assert.match(dialog, /await onSuccess\(\{ id: json\.data\.id, is_reserve:/);
  assert.match(card, /status !== "none"/);
  assert.match(card, /title="Cancella iscrizione"/);
});
