import type {
  BaraondaContext,
  Participant,
  Turn,
  TurnMatch,
} from "../../domain/types";

type Pair = [Participant, Participant];
type MatchTuple = [Pair, Pair];

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

function allPerfectMatchingsOfSixPairs(
  pairs: [Pair, Pair, Pair, Pair, Pair, Pair]
): Array<[MatchTuple, MatchTuple, MatchTuple]> {
  const [p0, p1, p2, p3, p4, p5] = pairs;

  return [
    [[p0, p1], [p2, p3], [p4, p5]],
    [[p0, p1], [p2, p4], [p3, p5]],
    [[p0, p1], [p2, p5], [p3, p4]],

    [[p0, p2], [p1, p3], [p4, p5]],
    [[p0, p2], [p1, p4], [p3, p5]],
    [[p0, p2], [p1, p5], [p3, p4]],

    [[p0, p3], [p1, p2], [p4, p5]],
    [[p0, p3], [p1, p4], [p2, p5]],
    [[p0, p3], [p1, p5], [p2, p4]],

    [[p0, p4], [p1, p2], [p3, p5]],
    [[p0, p4], [p1, p3], [p2, p5]],
    [[p0, p4], [p1, p5], [p2, p3]],

    [[p0, p5], [p1, p2], [p3, p4]],
    [[p0, p5], [p1, p3], [p2, p4]],
    [[p0, p5], [p1, p4], [p2, p3]],
  ];
}

function bestPairingOfSixPairs(
  pairs6: [Pair, Pair, Pair, Pair, Pair, Pair],
  opponentCount: Map<string, Map<string, number>>,
  usedMatchups: Set<string>
): [MatchTuple, MatchTuple, MatchTuple] {
  const options = allPerfectMatchingsOfSixPairs(pairs6);

  let best = options[0];
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const option of options) {
    let penalty = 0;

    for (const [team1, team2] of option) {
      penalty += opponentPenaltyPairs(team1, team2, opponentCount);

      if (usedMatchups.has(matchKey(team1, team2))) {
        penalty += 9999;
      }
    }

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = option;
    }
  }

  return best;
}

export function buildNonMixed12EstesaTurns(
  context: BaraondaContext,
  participants: Participant[]
): Turn[] {
  if (context.isMixed) {
    throw new Error("Preset 12 estesa valido solo per non-misto.");
  }

  if (
    !(
      participants.length === 12 &&
      context.formula === "estesa" &&
      context.matchesPerPlayer === 10 &&
      context.totalMatches === 30
    )
  ) {
    throw new Error(
      "Preset 12 estesa richiede: 12 giocatori, formula estesa, 10 match a testa, 30 match totali."
    );
  }

  const players = [...participants].sort((a, b) => a.id.localeCompare(b.id, "it"));

  const rr = roundRobinPairsEven(players); // 11 round da 6 pair

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

  // Prendiamo i primi 10 round del round-robin:
  // ogni round = 6 coppie disgiunte = 3 match = 12 attivi = 0 riposi
  for (let t = 1; t <= 10; t += 1) {
    const pairs6 = rr[t - 1] as [Pair, Pair, Pair, Pair, Pair, Pair];
    const grouped = bestPairingOfSixPairs(pairs6, opponentCount, usedMatchups);

    const turnMatches: TurnMatch[] = [];

    for (let i = 0; i < grouped.length; i += 1) {
      const [team1, team2] = grouped[i];

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      turnMatches.push({
        matchNumber: i + 1,
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
    if (c !== 10) {
      throw new Error(
        `Preset 12 estesa: equità fallita per ${p.name}, ha ${c} match invece di 10.`
      );
    }
  }

  // Niente repeat partner: usando 10 round diversi del RR su 11 totali,
  // ogni giocatore incontra 10 compagni distinti.
  const seenPartnerPairs = new Set<string>();
  for (const turn of turns) {
    for (const match of turn.matches) {
      const team1: Pair = [match.players[0], match.players[1]];
      const team2: Pair = [match.players[2], match.players[3]];

      const k1 = pairKey(team1[0], team1[1]);
      const k2 = pairKey(team2[0], team2[1]);

      if (seenPartnerPairs.has(k1) || seenPartnerPairs.has(k2)) {
        throw new Error("Preset 12 estesa: repeat partner rilevato.");
      }

      seenPartnerPairs.add(k1);
      seenPartnerPairs.add(k2);
    }
  }

  return turns;
}