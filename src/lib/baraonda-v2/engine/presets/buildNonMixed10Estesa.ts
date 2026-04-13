import type {
  BaraondaContext,
  Participant,
  Turn,
  TurnMatch,
} from "../../domain/types";

type Pair = [Participant, Participant];
type MatchTuple = [Pair, Pair];

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

function allPairings(list: Participant[]): Pair[][] {
  if (list.length === 0) return [[]];

  const [first, ...rest] = list;
  const out: Pair[][] = [];

  for (let i = 0; i < rest.length; i += 1) {
    const second = rest[i];
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];

    for (const tail of allPairings(remaining)) {
      out.push([[first, second], ...tail]);
    }
  }

  return out;
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

export function buildNonMixed10EstesaTurns(
  context: BaraondaContext,
  participants: Participant[]
): Turn[] {
  if (context.isMixed) {
    throw new Error("Preset 10 estesa valido solo per non-misto.");
  }

  if (
    !(
      participants.length === 10 &&
      context.formula === "estesa" &&
      context.matchesPerPlayer === 8 &&
      context.totalMatches === 20
    )
  ) {
    throw new Error(
      "Preset 10 estesa richiede: 10 giocatori, formula estesa, 8 match a testa, 20 match totali."
    );
  }

  const players = [...participants].sort((a, b) => a.id.localeCompare(b.id, "it"));

  const remaining = new Map<string, number>();
  const restCount = new Map<string, number>();
  const teammateUsed = new Set<string>();
  const usedMatchups = new Set<string>();

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of players) {
    remaining.set(p.id, 8);
    restCount.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turns: Turn[] = [];
  const maxTurns = 10;

  function canStillFinish(): boolean {
    const turnsLeft = maxTurns - turns.length;

    for (const p of players) {
      const need = remaining.get(p.id) ?? 0;
      if (need < 0) return false;
      if (need > turnsLeft) return false;
    }

    return true;
  }

  function pickRestCandidates(turnIdx: number): Array<[Participant, Participant]> {
    const turnsLeft = maxTurns - turnIdx + 1;
    const mustRest: Participant[] = [];

    for (const p of players) {
      const r = restCount.get(p.id) ?? 0;
      const restsNeeded = 2 - r;
      if (restsNeeded === turnsLeft) {
        mustRest.push(p);
      }
    }

    const base = [...players].sort((a, b) => {
      const ra = restCount.get(a.id) ?? 0;
      const rb = restCount.get(b.id) ?? 0;
      if (ra !== rb) return ra - rb;

      const na = remaining.get(a.id) ?? 0;
      const nb = remaining.get(b.id) ?? 0;
      if (na !== nb) return na - nb;

      return a.id.localeCompare(b.id, "it");
    });

    const candidates: Array<[Participant, Participant]> = [];

    if (mustRest.length >= 2) {
      for (let i = 0; i < mustRest.length; i += 1) {
        for (let j = i + 1; j < mustRest.length; j += 1) {
          const a = mustRest[i];
          const b = mustRest[j];

          if ((restCount.get(a.id) ?? 0) >= 2) continue;
          if ((restCount.get(b.id) ?? 0) >= 2) continue;

          candidates.push([a, b]);
        }
      }

      return candidates;
    }

    for (let i = 0; i < base.length; i += 1) {
      for (let j = i + 1; j < base.length; j += 1) {
        const a = base[i];
        const b = base[j];

        if ((restCount.get(a.id) ?? 0) >= 2) continue;
        if ((restCount.get(b.id) ?? 0) >= 2) continue;

        candidates.push([a, b]);
        if (candidates.length >= 18) return candidates;
      }
    }

    return candidates;
  }

  function rebuildStateFromTurns(): void {
    for (const p of players) {
      remaining.set(p.id, 8);
      restCount.set(p.id, 0);
      teammateCount.set(p.id, new Map());
      opponentCount.set(p.id, new Map());
    }

    teammateUsed.clear();
    usedMatchups.clear();

    for (const turn of turns) {
      for (const rp of turn.resting) {
        restCount.set(rp.id, (restCount.get(rp.id) ?? 0) + 1);
      }

      for (const m of turn.matches) {
        const team1: Pair = [m.players[0], m.players[1]];
        const team2: Pair = [m.players[2], m.players[3]];

        for (const p of [...team1, ...team2]) {
          remaining.set(p.id, (remaining.get(p.id) ?? 0) - 1);
        }

        teammateUsed.add(pairKey(team1[0], team1[1]));
        teammateUsed.add(pairKey(team2[0], team2[1]));

        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        usedMatchups.add(matchKey(team1, team2));
      }
    }
  }

  function dfs(turnIdx: number): boolean {
    if (turnIdx > maxTurns) return true;
    if (!canStillFinish()) return false;

    const restPairs = pickRestCandidates(turnIdx);

    for (const [r1, r2] of restPairs) {
      const active = players.filter(
        (p) => p.id !== r1.id && p.id !== r2.id && (remaining.get(p.id) ?? 0) > 0
      );

      if (active.length !== 8) continue;

      const pairings = allPairings(active);

      for (const pairs of pairings) {
        let ok = true;

        for (const [a, b] of pairs) {
          const pk = pairKey(a, b);
          if (teammateUsed.has(pk)) {
            ok = false;
            break;
          }
        }

        if (!ok) continue;

        const p4 = pairs as [Pair, Pair, Pair, Pair];
        const ordered = bestPairingOfFourPairs(p4, opponentCount, usedMatchups);

        const teamA1 = ordered[0];
        const teamA2 = ordered[1];
        const teamB1 = ordered[2];
        const teamB2 = ordered[3];

        const m1k = matchKey(teamA1, teamA2);
        const m2k = matchKey(teamB1, teamB2);

        restCount.set(r1.id, (restCount.get(r1.id) ?? 0) + 1);
        restCount.set(r2.id, (restCount.get(r2.id) ?? 0) + 1);

        for (const p of [...teamA1, ...teamA2, ...teamB1, ...teamB2]) {
          remaining.set(p.id, (remaining.get(p.id) ?? 0) - 1);
        }

        teammateUsed.add(pairKey(teamA1[0], teamA1[1]));
        teammateUsed.add(pairKey(teamA2[0], teamA2[1]));
        teammateUsed.add(pairKey(teamB1[0], teamB1[1]));
        teammateUsed.add(pairKey(teamB2[0], teamB2[1]));

        registerMatchRelations(teamA1, teamA2, teammateCount, opponentCount);
        registerMatchRelations(teamB1, teamB2, teammateCount, opponentCount);

        usedMatchups.add(m1k);
        usedMatchups.add(m2k);

        const turnMatches: TurnMatch[] = [
          {
            matchNumber: 1,
            players: [teamA1[0], teamA1[1], teamA2[0], teamA2[1]],
          },
          {
            matchNumber: 2,
            players: [teamB1[0], teamB1[1], teamB2[0], teamB2[1]],
          },
        ];

        turns.push({
          turnNumber: turnIdx,
          matches: turnMatches,
          resting: [r1, r2],
        });

        if (dfs(turnIdx + 1)) return true;

        turns.pop();
        rebuildStateFromTurns();
      }
    }

    return false;
  }

  const ok = dfs(1);

  if (!ok) {
    throw new Error(
      "Preset 10 estesa: impossibile costruire schedule deterministico con i vincoli attuali."
    );
  }

  if (teammateUsed.size !== 40) {
    throw new Error(
      `Preset 10 estesa: attesi 40 team unici, trovati ${teammateUsed.size}.`
    );
  }

  return expandTurnsForCourts(turns, context.maxCourts);
}