import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") {
  throw new Error("Verified local Supabase required");
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = "http://127.0.0.1:3100";
const circuitId = "c3000000-0000-4000-8000-000000000001";
const groupId = "c3100000-0000-4000-8000-000000000001";
const existingId = "c3200000-0000-4000-8000-000000000001";
const missingId = "c3200000-0000-4000-8000-000000000002";
const resultIds = [
  "c3300000-0000-4000-8000-000000000001",
  "c3300000-0000-4000-8000-000000000002",
  "c3300000-0000-4000-8000-000000000003",
];
const check = ({ error }) => { if (error) throw error; };
const get = async (path) => {
  const response = await fetch(base + path, { cache: "no-store" });
  return { status: response.status, body: await response.json() };
};

let circuitInserted = false;
let groupInserted = false;
let tournamentInserted = false;
let resultsInserted = false;
try {
  check(await db.from("circuits").insert({ id: circuitId, name: "Circuito sintetico storico", slug: "fixture-circuit-stage-historical", tournament_type: "Baraonda", status: "active" }));
  circuitInserted = true;
  check(await db.from("circuit_ranking_groups").insert({ id: groupId, circuit_id: circuitId, category: "Libero", level: "principiante" }));
  groupInserted = true;
  check(await db.from("tournaments").insert({ id: existingId, circuit_id: circuitId, name: "Nome torneo modificato", type: "Baraonda", category: "Misto", level: "principiante", date: "2026-11-11", time: "20:00", location: "Movi Club", max_participants: 8, registrations_open: false }));
  tournamentInserted = true;
  check(await db.from("circuit_results").insert([
    { id: resultIds[0], circuit_id: circuitId, ranking_group_id: groupId, source_tournament_id: existingId, tournament_name: "Tappa 11 novembre", tournament_type: "Baraonda", tournament_date: "2026-11-11", player_key: "synthetic-1", player_name: "Giocatore Sintetico A", placement: 1, points: 450 },
    { id: resultIds[1], circuit_id: circuitId, ranking_group_id: groupId, source_tournament_id: existingId, tournament_name: "Tappa 11 novembre", tournament_type: "Baraonda", tournament_date: "2026-11-11", player_key: "synthetic-2", player_name: "Giocatore Sintetico B", placement: 2, points: 400 },
    { id: resultIds[2], circuit_id: circuitId, ranking_group_id: groupId, source_tournament_id: missingId, tournament_name: "Tappa 4 novembre", tournament_type: "Baraonda", tournament_date: "2026-11-04", player_key: "synthetic-1", player_name: "Giocatore Sintetico A", placement: 1, points: 300 },
  ]));
  resultsInserted = true;

  const before = await db.from("circuit_results").select("id,points,placement,source_tournament_id").eq("circuit_id", circuitId).order("id");
  check(before);
  assert.equal(before.data.length, 3);
  assert.equal(before.data.reduce((sum, row) => sum + row.points, 0), 1150);

  const list = await get("/api/circuits/fixture-circuit-stage-historical");
  assert.equal(list.status, 200);
  const played = list.body.ranking_groups.find((group) => group.id === groupId).played_stages;
  assert.deepEqual(new Set(played.map((stage) => stage.source_tournament_id)), new Set([existingId, missingId]));

  const path = (id) => `/api/circuits/fixture-circuit-stage-historical/stages/${id}?group=${groupId}`;
  const existing = await get(path(existingId));
  assert.equal(existing.status, 200);
  assert.equal(existing.body.stage.name, "Tappa 11 novembre");
  assert.equal(existing.body.stage.category, "Misto");
  assert.equal(existing.body.group.category, "Libero");
  assert.equal(existing.body.results.length, 2);
  assert.equal(existing.body.results.reduce((sum, row) => sum + row.points, 0), 850);

  const missing = await get(path(missingId));
  assert.equal(missing.status, 200);
  assert.equal(missing.body.stage.name, "Tappa 4 novembre");
  assert.equal(missing.body.stage.date, "2026-11-04");
  assert.equal(missing.body.stage.category, null);
  assert.equal(missing.body.stage.location, null);
  assert.equal(missing.body.results.length, 1);
  assert.equal(missing.body.results[0].points, 300);
  assert.equal((await get(`/api/circuits/fixture-circuit-stage-historical/stages/${missingId}`)).status, 200);
  assert.equal((await get(path("00000000-0000-4000-8000-000000000000"))).status, 404);
  assert.equal((await get(path("invalid-id"))).status, 404);

  const after = await db.from("circuit_results").select("id,points,placement,source_tournament_id").eq("circuit_id", circuitId).order("id");
  check(after);
  assert.deepEqual(after.data, before.data);
  console.log("Historical circuit stage HTTP acceptance PASS: existing/missing source, category mismatch, distinct stages, no result changes.");
} finally {
  if (resultsInserted) check(await db.from("circuit_results").delete().in("id", resultIds));
  if (tournamentInserted) check(await db.from("tournaments").delete().eq("id", existingId));
  if (groupInserted) check(await db.from("circuit_ranking_groups").delete().eq("id", groupId));
  if (circuitInserted) check(await db.from("circuits").delete().eq("id", circuitId));
}
