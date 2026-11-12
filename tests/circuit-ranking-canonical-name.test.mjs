import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPublicCircuitRanking } from "../src/lib/circuitPublicRanking.ts";
import { formatCircuitRankingDisplayName, withCanonicalCircuitRankingNames } from "../src/lib/circuitRankingDisplayName.ts";

const read = (path) => readFileSync(path, "utf8");
const active = (full_name) => ({ full_name, status: "active", merged_into_player_id: null });

test("linked Frank snapshot displays Frenk without changing ranking arithmetic or source rows", () => {
  const results = Object.freeze([
    Object.freeze({ player_name: "MARIO ROSSI", player_identity_id: null, points: 700 }),
    Object.freeze({ player_name: "ANNA VERDI", player_identity_id: null, points: 600 }),
    Object.freeze({ player_name: "Frank Dema", player_identity_id: "frenk", points: 450 }),
  ]);
  const ranking = buildPublicCircuitRanking(results);
  const displayed = withCanonicalCircuitRankingNames(ranking, results, new Map([["frenk", active("Frenk Dema")]]));
  assert.deepEqual(displayed.map((row) => [row.position, row.player_name, row.total_points, row.events_played]),
    ranking.map((row) => [row.position, row.player_name, row.total_points, row.events_played]));
  assert.deepEqual(displayed.map((row) => [row.position, row.total_points, row.events_played]), [[1, 700, 1], [2, 600, 1], [3, 450, 1]]);
  assert.equal(displayed[2].display_name, "Frenk Dema");
  assert.equal(formatCircuitRankingDisplayName(displayed[2].display_name), "FRENK DEMA");
  assert.equal(results[2].player_name, "Frank Dema");
});

test("historical, missing, merged and conflicting identity links use the snapshot", () => {
  const results = [
    { player_name: "Historical Name", player_identity_id: null, points: 100 },
    { player_name: "Missing Name", player_identity_id: "missing", points: 90 },
    { player_name: "Merged Name", player_identity_id: "merged", points: 80 },
    { player_name: "Shared Name", player_identity_id: "one", points: 70 },
    { player_name: "Shared Name", player_identity_id: "two", points: 60 },
  ];
  const identities = new Map([
    ["merged", { full_name: "Wrong Canonical", status: "merged", merged_into_player_id: "other" }],
    ["one", active("First Person")], ["two", active("Second Person")],
  ]);
  const ranking = buildPublicCircuitRanking(results);
  const displayed = withCanonicalCircuitRankingNames(ranking, results, identities);
  assert.deepEqual(displayed.map((row) => row.display_name), ranking.map((row) => row.player_name));
  assert.equal(formatCircuitRankingDisplayName(displayed[0].display_name), "SHARED NAME");
});

test("two historical names linked to one identity retain two existing ranking rows", () => {
  const results = [
    { player_name: "Frank Dema", player_identity_id: "frenk", points: 100 },
    { player_name: "Frenk Dema", player_identity_id: "frenk", points: 50 },
  ];
  const ranking = buildPublicCircuitRanking(results);
  const displayed = withCanonicalCircuitRankingNames(ranking, results, new Map([["frenk", active("Frenk Dema")]]));
  assert.equal(displayed.length, ranking.length);
  assert.deepEqual(displayed.map((row) => [row.position, row.total_points, row.events_played]),
    ranking.map((row) => [row.position, row.total_points, row.events_played]));
  assert.deepEqual(displayed.map((row) => row.display_name), ["Frenk Dema", "Frenk Dema"]);
});

test("public route decorates after aggregation and never mutates circuit results", () => {
  const route = read("src/app/api/circuits/[slug]/route.ts");
  const page = read("src/app/circuiti/[slug]/page.tsx");
  assert.match(route, /ranking_group_id,player_identity_id,source_tournament_id/);
  assert.match(route, /buildPublicCircuitRanking\(results\), results, canonicalNames/);
  assert.match(route, /\.from\("player_identities"\)/);
  assert.doesNotMatch(route, /\.from\("circuit_results"\)\.(?:update|insert|delete)|update\s+circuit_results/i);
  assert.match(page, /formatCircuitRankingDisplayName\(row\.display_name\)/);
  assert.match(page, /row\.display_name\.toLocaleLowerCase\("it"\)/);
});
