import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sortPublicCircuitStageResults } from "../src/lib/circuitStageResults.ts";
import { buildPersonalCircuitStages, resolvePersonalCircuit } from "../src/lib/personalCircuit.ts";
import { buildPublicCircuitRanking } from "../src/lib/circuitPublicRanking.ts";
import { ownsCircuitResult } from "../src/lib/playerIdentity.ts";

const dependencies = { buildPublicCircuitRanking, ownsCircuitResult };

const base = { ranking_group_id: "group-a", source_tournament_id: "stage-a", tournament_name: "Tappa A", tournament_date: "2026-09-01", player_key: "mine", player_name: "Mario Rossi", player_identity_id: "player-a", points: 100, placement: 2 };

test("certified ownership resolves the exact public position and never falls back to another certified row", () => {
  const rows = [base, { ...base, player_key: "other", player_name: "Altro", player_identity_id: "player-b", points: 200, placement: 1 }];
  const result = resolvePersonalCircuit(rows, ["player-a"], ["other"], dependencies);
  assert.equal(result.state, "ready");
  assert.equal(result.rank.position, 2);
  assert.equal(result.rank.total_points, 100);
  assert.equal(result.totalRankedPlayers, 2);
  assert.equal(result.ownedRows.length, 1);
});

test("no owned results is empty and an ambiguous public name is review-required", () => {
  assert.equal(resolvePersonalCircuit([base], [], [], dependencies).state, "empty");
  const collision = { ...base, player_key: "other", player_identity_id: "player-b" };
  assert.equal(resolvePersonalCircuit([base, collision], ["player-a"], [], dependencies).state, "review_required");
});

test("personal stages batch-join tournament fields and deduplicate exact copies", () => {
  const second = { ...base, source_tournament_id: "stage-b", tournament_name: "Tappa B", tournament_date: "2026-09-08", points: 150, placement: 1 };
  const result = buildPersonalCircuitStages([base, { ...base }, second], [
    { id: "stage-a", name: "Tappa A reale", date: "2026-09-01", time: "20:00:00", location: "Manta", category: "Maschile", level: "intermedio" },
    { id: "stage-b", name: "Tappa B reale", date: "2026-09-08", time: "21:00:00", location: "Revello", category: "Maschile", level: "intermedio" },
  ]);
  assert.equal(result.state, "ready");
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].location, "Revello");
  assert.equal(result.stages[1].name, "Tappa A reale");
});

test("conflicting duplicate stage rows stop personal history", () => {
  assert.equal(buildPersonalCircuitStages([base, { ...base, points: 999 }], []).state, "review_required");
});

test("stage result ordering exactly preserves Phase 1 semantics", () => {
  const rows = sortPublicCircuitStageResults([
    { player_name: "Zeta", points: 100, placement: 2 },
    { player_name: "Alfa", points: 100, placement: 1 },
    { player_name: "Beta", points: 100, placement: null },
    { player_name: "Gamma", points: 200, placement: null },
  ]);
  assert.deepEqual(rows.map((row) => row.player_name), ["Gamma", "Alfa", "Zeta", "Beta"]);
});

test("routes derive identity from session, reject selector parameters, and bind stages to circuit", () => {
  const personalRoute = readFileSync("src/app/api/user/circuits/[slug]/route.ts", "utf8");
  const stageRoute = readFileSync("src/app/api/circuits/[slug]/stages/[tournamentId]/route.ts", "utf8");
  const page = readFileSync("src/app/circuiti/[slug]/page.tsx", "utf8");
  assert.match(personalRoute, /getCurrentMoviUser\(\)/);
  assert.match(personalRoute, /key !== "group"/);
  assert.doesNotMatch(personalRoute, /search\.get\("(?:user_id|player_identity_id|name)"\)/);
  assert.match(stageRoute, /\.eq\("id", tournamentId\)[\s\S]*\.eq\("circuit_id", circuitResult\.data\.id\)/);
  assert.match(stageRoute, /\.eq\("source_tournament_id", tournamentId\)/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-selected=\{activeTab === "ranking"\}/);
  assert.match(page, /ArrowLeft|ArrowRight/);
  assert.match(page, /source_tournament_id/);
});

test("final micro-polish preserves the stage destination and uses an accessible crown icon", () => {
  const circuitPage = readFileSync("src/app/circuiti/[slug]/page.tsx", "utf8");
  const circuitStyles = readFileSync("src/app/circuiti/[slug]/CircuitDetail.module.css", "utf8");
  const stagePage = readFileSync("src/app/circuiti/[slug]/tappe/[tournamentId]/page.tsx", "utf8");
  assert.match(stagePage, /<ArrowLeft size=\{18\} aria-hidden \/>Torna al circuito/);
  assert.doesNotMatch(stagePage, /Torna a \{data\.circuit\.name\}/);
  assert.match(stagePage, /const backHref = `\/circuiti\/\$\{encodeURIComponent\(slug\)\}\$\{backGroup \? `\?group=/);
  assert.match(circuitPage, /<Crown className=\{styles\.crown\}[^>]+aria-hidden/);
  assert.match(circuitPage, /aria-label=\{`\$\{row\.position\}ª posizione`\}/);
  assert.match(circuitStyles, /\.podium1 \.medal\{border:2px solid #ffd150;background:#0b1730/);
});
