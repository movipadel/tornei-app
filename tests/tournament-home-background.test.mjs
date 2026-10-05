import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  getTournamentHomeBackground,
  normalizeTournamentHomeCategory,
  normalizeTournamentHomeType,
  TOURNAMENT_HOME_BACKGROUND_DEFAULT,
} from "../src/lib/tournamentHomeBackground.ts";

const cases = [
  ["Baraonda", "Maschile", "tournament-baraonda-maschile.png"],
  ["Baraonda", "Femminile", "tournament-baraonda-femminile.png"],
  ["Baraonda", "Misto", "tournament-baraonda-misto.png"],
  ["Baraonda", "Libero", "tournament-baraonda-open.png"],
  ["Coppie fisse", "Maschile", "tournament-coppie-maschile.png"],
  ["Coppie fisse", "Femminile", "tournament-coppie-femminile.png"],
  ["Coppie fisse", "Misto", "tournament-coppie-misto.png"],
  ["Coppie fisse", "Open", "tournament-coppie-open.png"],
];

test("all eight supported type/category combinations resolve to existing system assets", () => {
  for (const [type, category, filename] of cases) {
    const asset = getTournamentHomeBackground(type, category);
    assert.equal(asset, `/branding/tournament-backgrounds/${filename}`);
    assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), `missing ${asset}`);
  }
});

test("unsupported, null, and legacy combinations use the default asset", () => {
  for (const values of [[null, null], ["Legacy", "Maschile"], ["Baraonda", "Junior"], ["", "Open"]]) {
    assert.equal(getTournamentHomeBackground(values[0], values[1]), TOURNAMENT_HOME_BACKGROUND_DEFAULT);
  }
  assert.ok(existsSync(new URL(`../public${TOURNAMENT_HOME_BACKGROUND_DEFAULT}`, import.meta.url)));
});

test("normalization follows real Admin and stored values without changing data", () => {
  assert.equal(normalizeTournamentHomeType("  COPPIE FISSE "), "coppie");
  assert.equal(normalizeTournamentHomeType("Baraonda"), "baraonda");
  assert.equal(normalizeTournamentHomeCategory("Libero"), "open");
  assert.equal(normalizeTournamentHomeCategory("Open"), "open");
});

test("circuit data cannot affect background selection", () => {
  const standalone = getTournamentHomeBackground("Baraonda", "Misto");
  const withIgnoredCircuitArgument = getTournamentHomeBackground("Baraonda", "Misto", "circuit-id");
  assert.equal(withIgnoredCircuitArgument, standalone);
  assert.equal(getTournamentHomeBackground.length, 2);
});
