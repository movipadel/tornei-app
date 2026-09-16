import assert from "node:assert/strict";
import test from "node:test";

// Node runs this focused test with native TypeScript stripping. The explicit
// extension is intentional for that runner and does not affect application imports.
// @ts-expect-error TypeScript config does not enable extension imports for app code.
import { buildFixedPairsSixBracketPlan } from "../src/lib/fixedPairsSixBracket.ts";

type Pair = {
  pairId: string;
  groupId: string;
  groupRank: number;
  pt: number;
  dg: number;
  gw: number;
};

function pair(
  pairId: string,
  groupId: string,
  groupRank: number,
  pt = 0,
  dg = 0,
  gw = 0
): Pair {
  return { pairId, groupId, groupRank, pt, dg, gw };
}

function fixture(scoreReversal = false) {
  const x = [
    pair("X1", "group-x", 1, scoreReversal ? 4 : 2, 8, 12),
    pair("X2", "group-x", 2, scoreReversal ? 2 : 1, 2, 8),
    pair("X3", "group-x", 3, scoreReversal ? 1 : 0, -2, 5),
  ];
  const y = [
    pair("Y1", "group-y", 1, scoreReversal ? 5 : 2, 6, 11),
    pair("Y2", "group-y", 2, scoreReversal ? 3 : 1, 5, 20),
    pair("Y3", "group-y", 3, scoreReversal ? 0 : 0, -7, 1),
  ];

  return {
    groups: [
      { group: { id: "group-y", position: 20 }, rows: y },
      { group: { id: "group-x", position: 10 }, rows: x },
    ],
    qualified: [y[0], x[0], y[1], x[1], x[2], y[2]],
  };
}

function pairIds(plan: NonNullable<ReturnType<typeof buildFixedPairsSixBracketPlan<Pair>>>) {
  return {
    quarterfinals: plan.quarterfinals.map((match) => [
      match.home.pairId,
      match.away.pairId,
    ]),
    semifinalByes: plan.semifinalByes.map((entry) => entry.pairId),
  };
}

test("maps two groups of three by group position", () => {
  const data = fixture();
  const plan = buildFixedPairsSixBracketPlan(data.groups, 6, data.qualified);
  assert.ok(plan);
  assert.deepEqual(pairIds(plan), {
    quarterfinals: [
      ["X2", "Y3"],
      ["Y2", "X3"],
    ],
    semifinalByes: ["Y1", "X1"],
  });
});

test("ignores cross-group score reversal after group ranks are known", () => {
  const data = fixture(true);
  const plan = buildFixedPairsSixBracketPlan(data.groups, 6, data.qualified);
  assert.ok(plan);
  assert.deepEqual(pairIds(plan).quarterfinals, [
    ["X2", "Y3"],
    ["Y2", "X3"],
  ]);
});

test("quarterfinal row winners propagate to the protected opposite-group winner", () => {
  const data = fixture();
  const plan = buildFixedPairsSixBracketPlan(data.groups, 6, data.qualified);
  assert.ok(plan);

  assert.equal(plan.quarterfinals[0].home.pairId, "X2");
  assert.equal(plan.semifinalByes[0].pairId, "Y1");
  assert.equal(plan.quarterfinals[1].home.pairId, "Y2");
  assert.equal(plan.semifinalByes[1].pairId, "X1");
});

test("serialized plan reload preserves match order and correction destination", () => {
  const data = fixture();
  const plan = buildFixedPairsSixBracketPlan(data.groups, 6, data.qualified);
  assert.ok(plan);

  const reloaded = JSON.parse(JSON.stringify(pairIds(plan)));
  assert.deepEqual(reloaded.quarterfinals[0], ["X2", "Y3"]);
  assert.equal(reloaded.semifinalByes[0], "Y1");

  const correctedWinner = reloaded.quarterfinals[0][1];
  assert.equal(correctedWinner, "Y3");
  assert.equal(reloaded.semifinalByes[0], "Y1");
});

test("falls back for other qualifier counts and invalid group shapes", () => {
  const data = fixture();

  for (const qualifiersCount of [4, 5, 7, 8, 9]) {
    assert.equal(
      buildFixedPairsSixBracketPlan(
        data.groups,
        qualifiersCount,
        data.qualified.slice(0, Math.min(qualifiersCount, 6))
      ),
      null
    );
  }

  assert.equal(buildFixedPairsSixBracketPlan(data.groups.slice(0, 1), 6, data.qualified), null);
  assert.equal(
    buildFixedPairsSixBracketPlan(
      [data.groups[0], { ...data.groups[1], rows: data.groups[1].rows.slice(0, 2) }],
      6,
      data.qualified
    ),
    null
  );
  assert.equal(
    buildFixedPairsSixBracketPlan(
      [
        data.groups[0],
        {
          ...data.groups[1],
          rows: data.groups[1].rows.map((entry, index) => ({
            ...entry,
            groupRank: index === 2 ? 2 : entry.groupRank,
          })),
        },
      ],
      6,
      data.qualified
    ),
    null
  );
});
