import assert from "node:assert/strict";
import test from "node:test";
import { generateMondayLeaguePhase1 } from "../../src/lib/monday-league/generator.ts";

function ids(count) {
  return Array.from(
    { length: count },
    (_, index) => `team-${String(index + 1).padStart(2, "0")}`
  );
}

function assertGeneration(teamIds, generation) {
  const count = teamIds.length;
  assert.equal(generation.rounds.length, count % 2 === 0 ? count - 1 : count);
  assert.equal(generation.matchCount, (count * (count - 1)) / 2);
  assert.equal(generation.quality.invariantViolations.length, 0);
  assert.match(generation.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(new Set(generation.tieBreakOrder).size, count);
  assert.deepEqual([...generation.tieBreakOrder].sort(), [...teamIds].sort());

  const pairs = new Set();
  const byeCounts = new Map(teamIds.map((id) => [id, 0]));
  for (const round of generation.rounds) {
    const seen = new Set();
    for (const match of round.matches) {
      assert.notEqual(match.homeTeamId, match.awayTeamId);
      assert.ok(!seen.has(match.homeTeamId));
      assert.ok(!seen.has(match.awayTeamId));
      seen.add(match.homeTeamId);
      seen.add(match.awayTeamId);
      const key = [match.homeTeamId, match.awayTeamId].sort().join(":");
      assert.ok(!pairs.has(key));
      pairs.add(key);
    }
    if (count % 2 === 0) {
      assert.equal(round.byeTeamId, null);
      assert.equal(seen.size, count);
    } else {
      assert.ok(round.byeTeamId);
      assert.ok(!seen.has(round.byeTeamId));
      byeCounts.set(round.byeTeamId, byeCounts.get(round.byeTeamId) + 1);
      assert.equal(seen.size, count - 1);
    }
  }
  assert.equal(pairs.size, (count * (count - 1)) / 2);

  for (const team of generation.quality.teams) {
    assert.equal(Math.abs(team.difference), count % 2 === 0 ? 1 : 0);
    assert.ok(team.maxSameSideStreak <= 2);
    assert.equal(team.triplePlusStreakCount, 0);
    if (count % 2 === 1) assert.equal(byeCounts.get(team.teamId), 1);
  }
}

test("all supported team counts satisfy pairing, BYE and hard balance invariants", () => {
  for (let count = 2; count <= 16; count += 1) {
    const teamIds = ids(count);
    assertGeneration(teamIds, generateMondayLeaguePhase1(`phase-${count}`, teamIds));
    assertGeneration(teamIds.toReversed(), generateMondayLeaguePhase1(`phase-reversed-${count}`, teamIds.toReversed()));
  }
});

test("generation and fingerprint are deterministic", () => {
  const teamIds = ids(16);
  const first = generateMondayLeaguePhase1("phase-deterministic", teamIds);
  const second = generateMondayLeaguePhase1("phase-deterministic", [...teamIds]);
  assert.deepEqual(second, first);
});

test("16-team golden schedule has 15 rounds, 120 matches and 7/8 balance", () => {
  const generation = generateMondayLeaguePhase1("phase-16", ids(16));
  assert.equal(generation.rounds.length, 15);
  assert.equal(generation.matchCount, 120);
  assert.ok(generation.rounds.every((round) => round.matches.length === 8));
  assert.ok(
    generation.quality.teams.every((team) =>
      (team.homeCount === 7 && team.awayCount === 8) ||
      (team.homeCount === 8 && team.awayCount === 7)
    )
  );
});

test("15-team golden schedule has one BYE each and exact 7/7 balance", () => {
  const generation = generateMondayLeaguePhase1("phase-15", ids(15));
  assert.equal(generation.rounds.length, 15);
  assert.equal(generation.matchCount, 105);
  assert.ok(generation.quality.teams.every((team) => team.homeCount === 7 && team.awayCount === 7));
});

test("13-team golden schedule has one BYE each and exact 6/6 balance", () => {
  const generation = generateMondayLeaguePhase1("phase-13", ids(13));
  assert.equal(generation.rounds.length, 13);
  assert.equal(generation.matchCount, 78);
  assert.ok(generation.quality.teams.every((team) => team.homeCount === 6 && team.awayCount === 6));
});

test("invalid team sets fail before generation", () => {
  assert.throws(() => generateMondayLeaguePhase1("phase", ["one"]));
  assert.throws(() => generateMondayLeaguePhase1("phase", Array(17).fill("x")));
  assert.throws(() => generateMondayLeaguePhase1("phase", ["a", "a"]));
  assert.throws(() => generateMondayLeaguePhase1("", ["a", "b"]));
});
