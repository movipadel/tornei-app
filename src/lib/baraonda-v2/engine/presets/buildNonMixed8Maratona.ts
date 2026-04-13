import type {
  BaraondaContext,
  Participant,
  Turn,
  TurnMatch,
} from "../../domain/types";

type Pair = [Participant, Participant];

function incNested(
  map: Map<string, Map<string, number>>,
  a: string,
  b: string,
  by = 1
): void {
  const row = map.get(a) ?? new Map<string, number>();
  row.set(b, (row.get(b) ?? 0) + by);
  map.set(a, row);
}

function getNested(
  map: Map<string, Map<string, number>>,
  a: string,
  b: string
): number {
  return map.get(a)?.get(b) ?? 0;
}

function pairKey(a: Participant, b: Participant): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

function teamKey(t: Pair): string {
  const ids = [t[0].id, t[1].id].sort();
  return `${ids[0]}+${ids[1]}`;
}

function matchKey(team1: Pair, team2: Pair): string {
  const a = teamKey(team1);
  const b = teamKey(team2);
  return a < b ? `${a}__VS__${b}` : `${b}__VS__${a}`;
}

function registerMatchRelations(
  team1: Pair,
  team2: Pair,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): void {
  const [a, b] = team1;
  const [c, d] = team2;

  incNested(teammateCount, a.id, b.id, 1);
  incNested(teammateCount, b.id, a.id, 1);
  incNested(teammateCount, c.id, d.id, 1);
  incNested(teammateCount, d.id, c.id, 1);

  for (const p of [a, b]) {
    for (const o of [c, d]) {
      incNested(opponentCount, p.id, o.id, 1);
    }
  }

  for (const p of [c, d]) {
    for (const o of [a, b]) {
      incNested(opponentCount, p.id, o.id, 1);
    }
  }
}

function roundRobinPairsEven(players: Participant[]): Pair[][] {
  if (players.length % 2 !== 0) {
    throw new Error("roundRobinPairsEven richiede un numero pari di giocatori.");
  }

  const arr = [...players];
  const n = arr.length;
  const half = n / 2;

  const rounds: Pair[][] = [];

  const fixed = arr[0];
  let rot = arr.slice(1);

  for (let r = 0; r < n - 1; r += 1) {
    const left = [fixed, ...rot.slice(0, half - 1)];
    const right = rot.slice(half - 1).reverse();

    const pairs: Pair[] = [];
    for (let i = 0; i < half; i += 1) {
      pairs.push([left[i], right[i]]);
    }

    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }

  return rounds;
}

function opponentPenaltyPairs(
  pairA: Pair,
  pairB: Pair,
  opponentCount: Map<string, Map<string, number>>
): number {
  let pen = 0;

  for (const p of pairA) {
    for (const o of pairB) {
      const c = getNested(opponentCount, p.id, o.id);
      pen += c * c;
    }
  }

  for (const p of pairB) {
    for (const o of pairA) {
      const c = getNested(opponentCount, p.id, o.id);
      pen += c * c;
    }
  }

  return pen;
}

function bestPairingOfFourPairs(
  pairs4: [Pair, Pair, Pair, Pair],
  opponentCount: Map<string, Map<string, number>>,
  usedMatchups: Set<string>
): [Pair, Pair, Pair, Pair] {
  const [p0, p1, p2, p3] = pairs4;

  const options: Array<{ order: [Pair, Pair, Pair, Pair]; pen: number }> = [
    {
      order: [p0, p1, p2, p3],
      pen:
        opponentPenaltyPairs(p0, p1, opponentCount) +
        opponentPenaltyPairs(p2, p3, opponentCount) +
        (usedMatchups.has(matchKey(p0, p1)) ? 9999 : 0) +
        (usedMatchups.has(matchKey(p2, p3)) ? 9999 : 0),
    },
    {
      order: [p0, p2, p1, p3],
      pen:
        opponentPenaltyPairs(p0, p2, opponentCount) +
        opponentPenaltyPairs(p1, p3, opponentCount) +
        (usedMatchups.has(matchKey(p0, p2)) ? 9999 : 0) +
        (usedMatchups.has(matchKey(p1, p3)) ? 9999 : 0),
    },
    {
      order: [p0, p3, p1, p2],
      pen:
        opponentPenaltyPairs(p0, p3, opponentCount) +
        opponentPenaltyPairs(p1, p2, opponentCount) +
        (usedMatchups.has(matchKey(p0, p3)) ? 9999 : 0) +
        (usedMatchups.has(matchKey(p1, p2)) ? 9999 : 0),
    },
  ];

  options.sort((a, b) => a.pen - b.pen);
  return options[0].order;
}

function cloneMatch(match: TurnMatch, matchNumber = 1): TurnMatch {
  return {
    matchNumber,
    players: [...match.players] as [Participant, Participant, Participant, Participant],
  };
}

function expandTurnsForCourts(turns: Turn[], maxCourts: number): Turn[] {
  if (maxCourts >= 2) return turns;

  const expanded: Turn[] = [];
  let nextTurnNumber = 1;

  for (const turn of turns) {
    for (const match of turn.matches) {
      expanded.push({
        turnNumber: nextTurnNumber,
        matches: [cloneMatch(match, 1)],
        resting: [...turn.resting],
      });
      nextTurnNumber += 1;
    }
  }

  return expanded;
}

export function buildNonMixed8MaratonaTurns(
  context: BaraondaContext,
  participants: Participant[]
): Turn[] {
  if (context.isMixed) {
    throw new Error("Preset 8 maratona valido solo per non-misto.");
  }

  if (
    !(
      participants.length === 8 &&
      context.formula === "maratona" &&
      context.matchesPerPlayer === 7 &&
      context.totalMatches === 14
    )
  ) {
    throw new Error(
      "Preset 8 maratona richiede: 8 giocatori, formula maratona, 7 match a testa, 14 match totali."
    );
  }

  const players = [...participants].sort((a, b) => a.id.localeCompare(b.id, "it"));
  const rr = roundRobinPairsEven(players);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const usedMatchups = new Set<string>();
  const played = new Map<string, number>();

  for (const p of players) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
    played.set(p.id, 0);
  }

  const turns: Turn[] = [];

  for (let t = 1; t <= 7; t += 1) {
    const pairs = rr[t - 1] as [Pair, Pair, Pair, Pair];
    const ordered = bestPairingOfFourPairs(pairs, opponentCount, usedMatchups);

    const turnMatches: TurnMatch[] = [];

    {
      const team1 = ordered[0];
      const team2 = ordered[1];

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      turnMatches.push({
        matchNumber: 1,
        players: [team1[0], team1[1], team2[0], team2[1]],
      });
    }

    {
      const team1 = ordered[2];
      const team2 = ordered[3];

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      turnMatches.push({
        matchNumber: 2,
        players: [team1[0], team1[1], team2[0], team2[1]],
      });
    }

    turns.push({
      turnNumber: t,
      matches: turnMatches,
      resting: [],
    });
  }

  for (const p of players) {
    const c = played.get(p.id) ?? 0;
    if (c !== 7) {
      throw new Error(
        `Preset 8 maratona: equità fallita per ${p.name}, ha ${c} match invece di 7.`
      );
    }
  }

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const c =
        getNested(teammateCount, a.id, b.id) +
        getNested(teammateCount, b.id, a.id);

      if (c !== 2) {
        throw new Error(
          `Preset 8 maratona: coverage partner fallita per ${a.name} e ${b.name}.`
        );
      }
    }
  }

  return expandTurnsForCourts(turns, context.maxCourts);
}