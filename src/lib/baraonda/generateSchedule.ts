// src/lib/baraonda/generateSchedule.ts

export type Sex = "m" | "f";

export interface Participant {
  id: string;
  name: string;
  sex: Sex;
}

export interface BaraondaRules {
  players: number;
  matchesPerTurn: number; // nei casi protetti resta fisso; nei casi grandi è il massimo disponibile
  turns: number;
  matchesPerPlayer: number;
  category: "maschile" | "femminile" | "libero" | "misto";
  maxCourtsAvailable?: number;
  formula?: "snella" | "bilanciata" | "estesa" | "maratona" | null;
  flexibleTurns?: boolean;
}

export interface Match {
  matchNumber: number;
  players: [Participant, Participant, Participant, Participant]; // [t1p1,t1p2,t2p1,t2p2]
}

export interface Turn {
  turnNumber: number;
  matches: Match[];
  resting: Participant[];
}

type TeamSplit = {
  team1: [Participant, Participant];
  team2: [Participant, Participant];
  players: [Participant, Participant, Participant, Participant];
};

type EdgeMF = { m: Participant; f: Participant };
type Pair = [Participant, Participant];

// ---------- small utils ----------

function incNested(map: Map<string, Map<string, number>>, a: string, b: string, by = 1) {
  const row = map.get(a) ?? new Map<string, number>();
  row.set(b, (row.get(b) ?? 0) + by);
  map.set(a, row);
}

function getNested(map: Map<string, Map<string, number>>, a: string, b: string) {
  return map.get(a)?.get(b) ?? 0;
}

function pairKey(a: Participant, b: Participant) {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

function teamKey(t: [Participant, Participant]) {
  const ids = [t[0].id, t[1].id].sort();
  return `${ids[0]}+${ids[1]}`;
}

function matchKey(team1: [Participant, Participant], team2: [Participant, Participant]) {
  const a = teamKey(team1);
  const b = teamKey(team2);
  return a < b ? `${a}__VS__${b}` : `${b}__VS__${a}`;
}

function registerMatchRelations(
  team1: [Participant, Participant],
  team2: [Participant, Participant],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
) {
  const [a, b] = team1;
  const [c, d] = team2;

  // teammates
  incNested(teammateCount, a.id, b.id, 1);
  incNested(teammateCount, b.id, a.id, 1);
  incNested(teammateCount, c.id, d.id, 1);
  incNested(teammateCount, d.id, c.id, 1);

  // opponents
  for (const p of [a, b]) for (const o of [c, d]) incNested(opponentCount, p.id, o.id, 1);
  for (const p of [c, d]) for (const o of [a, b]) incNested(opponentCount, p.id, o.id, 1);
}

function isMixedTeam(t: [Participant, Participant]) {
  return t[0].sex !== t[1].sex;
}

function allTeamSplits(group: [Participant, Participant, Participant, Participant]): TeamSplit[] {
  const [a, b, c, d] = group;
  return [
    { team1: [a, b], team2: [c, d], players: [a, b, c, d] },
    { team1: [a, c], team2: [b, d], players: [a, c, b, d] },
    { team1: [a, d], team2: [b, c], players: [a, d, b, c] },
  ];
}

// ---------- deterministic MISTO 5+5 schedule ----------

function opponentPenaltyForMatch(eA: EdgeMF, eB: EdgeMF, opponentCount: Map<string, Map<string, number>>): number {
  const team1: [Participant, Participant] = [eA.m, eA.f];
  const team2: [Participant, Participant] = [eB.m, eB.f];

  let penalty = 0;
  for (const p of team1)
    for (const o of team2) {
      const cnt = getNested(opponentCount, p.id, o.id);
      penalty += cnt * cnt;
    }
  for (const p of team2)
    for (const o of team1) {
      const cnt = getNested(opponentCount, p.id, o.id);
      penalty += cnt * cnt;
    }
  return penalty;
}

function bestPairingOfFourEdges(
  edges4: [EdgeMF, EdgeMF, EdgeMF, EdgeMF],
  opponentCount: Map<string, Map<string, number>>
): [EdgeMF, EdgeMF, EdgeMF, EdgeMF] {
  const [e0, e1, e2, e3] = edges4;

  const options: Array<{ order: [EdgeMF, EdgeMF, EdgeMF, EdgeMF]; pen: number }> = [
    {
      order: [e0, e1, e2, e3],
      pen: opponentPenaltyForMatch(e0, e1, opponentCount) + opponentPenaltyForMatch(e2, e3, opponentCount),
    },
    {
      order: [e0, e2, e1, e3],
      pen: opponentPenaltyForMatch(e0, e2, opponentCount) + opponentPenaltyForMatch(e1, e3, opponentCount),
    },
    {
      order: [e0, e3, e1, e2],
      pen: opponentPenaltyForMatch(e0, e3, opponentCount) + opponentPenaltyForMatch(e1, e2, opponentCount),
    },
  ];

  options.sort((a, b) => a.pen - b.pen);
  return options[0].order;
}

function pickDisjointEdgesK(edges: EdgeMF[], k: number): EdgeMF[] | null {
  const usedM = new Set<string>();
  const usedF = new Set<string>();
  const picked: EdgeMF[] = [];

  function dfs(startIdx: number): boolean {
    if (picked.length === k) return true;
    for (let i = startIdx; i < edges.length; i++) {
      const e = edges[i];
      if (usedM.has(e.m.id) || usedF.has(e.f.id)) continue;

      usedM.add(e.m.id);
      usedF.add(e.f.id);
      picked.push(e);

      if (dfs(i + 1)) return true;

      picked.pop();
      usedM.delete(e.m.id);
      usedF.delete(e.f.id);
    }
    return false;
  }

  if (dfs(0)) return picked;
  return null;
}

function buildMisto5x5Edges(males: Participant[], females: Participant[]): EdgeMF[] {
  const edges: EdgeMF[] = [];
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 5; i++) {
      edges.push({ m: males[i], f: females[(i + r) % 5] });
    }
  }
  for (let i = 0; i < 5; i++) {
    edges.push({ m: males[i], f: females[i] });
  }
  return edges; // 30
}

function assertMistoCoverageAndEquity(
  males: Participant[],
  females: Participant[],
  played: Map<string, number>,
  matchesPerPlayer: number,
  teammateCount: Map<string, Map<string, number>>
) {
  for (const p of [...males, ...females]) {
    const c = played.get(p.id) ?? 0;
    if (c !== matchesPerPlayer) throw new Error(`Equità fallita: ${p.name} ha ${c} match invece di ${matchesPerPlayer}`);
  }
  for (const m of males) {
    for (const f of females) {
      const c = getNested(teammateCount, m.id, f.id) + getNested(teammateCount, f.id, m.id);
      if (c === 0) throw new Error(`Coverage MISTO fallita: ${m.name} non ha mai giocato con ${f.name}`);
    }
  }
}

function generateDeterministicMisto5x5(participants: Participant[], rules: BaraondaRules): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");
  if (males.length !== 5 || females.length !== 5) throw new Error("Preset misto deterministico supporta solo 5M+5F.");

  const edgesRemaining: EdgeMF[] = buildMisto5x5Edges(males, females);

  const played = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  for (const p of participants) {
    played.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turnsResult: Turn[] = [];
  let safety = 0;

  for (let t = 1; t <= rules.turns; t++) {
    const needEdges = t < rules.turns ? 4 : 2;

    safety++;
    if (safety > 1000) throw new Error("Loop di generazione schedule (safety).");

    const picked = pickDisjointEdgesK(edgesRemaining, needEdges);
    if (!picked) throw new Error("Impossibile comporre turni disgiunti con i vincoli correnti (unexpected).");

    for (const e of picked) {
      const idx = edgesRemaining.findIndex((x) => x.m.id === e.m.id && x.f.id === e.f.id);
      if (idx >= 0) edgesRemaining.splice(idx, 1);
    }

    const matches: Match[] = [];
    let matchNumber = 1;

    const activePlayers: Participant[] = [];
    for (const e of picked) activePlayers.push(e.m, e.f);

    const activeIds = new Set(activePlayers.map((p) => p.id));
    const resting = participants.filter((p) => !activeIds.has(p.id));

    if (needEdges === 4) {
      const ordered = bestPairingOfFourEdges(picked as [EdgeMF, EdgeMF, EdgeMF, EdgeMF], opponentCount);

      {
        const team1: [Participant, Participant] = [ordered[0].m, ordered[0].f];
        const team2: [Participant, Participant] = [ordered[1].m, ordered[1].f];
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
        matchNumber++;
      }

      {
        const team1: [Participant, Participant] = [ordered[2].m, ordered[2].f];
        const team2: [Participant, Participant] = [ordered[3].m, ordered[3].f];
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
      }
    } else {
      const team1: [Participant, Participant] = [picked[0].m, picked[0].f];
      const team2: [Participant, Participant] = [picked[1].m, picked[1].f];
      for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
    }

    turnsResult.push({ turnNumber: t, matches, resting });
  }

  assertMistoCoverageAndEquity(males, females, played, rules.matchesPerPlayer, teammateCount);
  return turnsResult;
}

// ---------- deterministic NON-MISTO for N=9 (no teammate repeats) ----------

function roundRobinPairsWithGhost(players: Participant[]): Array<{ pairs: Pair[]; rest: Participant }> {
  const ghost: Participant = { id: "__ghost__", name: "GHOST", sex: "m" };
  const arr = [...players, ghost];
  const n = arr.length;
  const half = n / 2;

  const rounds: Array<{ pairs: Pair[]; rest: Participant }> = [];

  let fixed = arr[0];
  let rot = arr.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const left = [fixed, ...rot.slice(0, half - 1)];
    const right = rot.slice(half - 1).reverse();

    const pairsAll: Pair[] = [];
    for (let i = 0; i < half; i++) {
      const a = left[i];
      const b = right[i];
      pairsAll.push([a, b]);
    }

    const ghostPair = pairsAll.find((p) => p[0].id === ghost.id || p[1].id === ghost.id);
    if (!ghostPair) throw new Error("RoundRobin: ghost pair missing");

    const rest = ghostPair[0].id === ghost.id ? ghostPair[1] : ghostPair[0];
    const realPairs = pairsAll.filter((p) => p[0].id !== ghost.id && p[1].id !== ghost.id);

    if (realPairs.length !== 4) throw new Error("RoundRobin: expected 4 real pairs");
    rounds.push({ pairs: realPairs, rest });

    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }

  return rounds;
}

function opponentPenaltyPairs(pairA: Pair, pairB: Pair, opponentCount: Map<string, Map<string, number>>): number {
  let pen = 0;
  for (const p of pairA)
    for (const o of pairB) {
      const c = getNested(opponentCount, p.id, o.id);
      pen += c * c;
    }
  for (const p of pairB)
    for (const o of pairA) {
      const c = getNested(opponentCount, p.id, o.id);
      pen += c * c;
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

function roundRobinPairsEven(players: Participant[]): Pair[][] {
  if (players.length % 2 !== 0) {
    throw new Error("roundRobinPairsEven richiede un numero pari di giocatori.");
  }

  const arr = [...players];
  const n = arr.length;
  const half = n / 2;

  const rounds: Pair[][] = [];

  let fixed = arr[0];
  let rot = arr.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const left = [fixed, ...rot.slice(0, half - 1)];
    const right = rot.slice(half - 1).reverse();

    const pairs: Pair[] = [];
    for (let i = 0; i < half; i++) {
      pairs.push([left[i], right[i]]);
    }

    if (pairs.length !== half) {
      throw new Error("RoundRobin even: numero pair non valido.");
    }

    rounds.push(pairs);

    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }

  return rounds;
}

function generateDeterministicNonMisto8(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  if (!(participants.length === 8 && rules.matchesPerTurn === 2 && rules.turns === 7 && rules.matchesPerPlayer === 7)) {
    throw new Error("NON-MISTO N=8: preset richiesto = matchesPerTurn=2, turns=7, matchesPerPlayer=7.");
  }

  const rr = roundRobinPairsEven(participants);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const usedMatchups = new Set<string>();
  const played = new Map<string, number>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
    played.set(p.id, 0);
  }

  const turnsResult: Turn[] = [];

  for (let t = 1; t <= rules.turns; t++) {
    const pairs = rr[t - 1] as [Pair, Pair, Pair, Pair];
    const ordered = bestPairingOfFourPairs(pairs, opponentCount, usedMatchups);

    const matches: Match[] = [];
    let matchNumber = 1;

    {
      const team1 = ordered[0];
      const team2 = ordered[1];

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      matches.push({
        matchNumber,
        players: [team1[0], team1[1], team2[0], team2[1]],
      });

      matchNumber++;
    }

    {
      const team1 = ordered[2];
      const team2 = ordered[3];

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      matches.push({
        matchNumber,
        players: [team1[0], team1[1], team2[0], team2[1]],
      });
    }

    turnsResult.push({
      turnNumber: t,
      matches,
      resting: [],
    });
  }

  // Check finale: tutti devono avere 7 match
  for (const p of participants) {
    const c = played.get(p.id) ?? 0;
    if (c !== 7) {
      throw new Error(`Equità NON-MISTO 8 fallita: ${p.name} ha ${c} match invece di 7.`);
    }
  }

  // Check finale: ogni coppia di compagni deve comparire esattamente una volta
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      const c =
        getNested(teammateCount, a.id, b.id) +
        getNested(teammateCount, b.id, a.id);

      if (c !== 2) {
        throw new Error(
          `Coverage NON-MISTO 8 fallita: ${a.name} e ${b.name} non hanno giocato esattamente una volta insieme.`
        );
      }
    }
  }

  return turnsResult;
}

function generateDeterministicNonMisto9(participants: Participant[], rules: BaraondaRules): Turn[] {
  const rr = roundRobinPairsWithGhost(participants);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const usedMatchups = new Set<string>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turnsResult: Turn[] = [];

  for (let t = 1; t <= rules.turns; t++) {
    const { pairs, rest } = rr[t - 1];
    const pairs4 = pairs as [Pair, Pair, Pair, Pair];
    const ordered = bestPairingOfFourPairs(pairs4, opponentCount, usedMatchups);

    const matches: Match[] = [];
    let matchNumber = 1;

    {
      const team1 = ordered[0];
      const team2 = ordered[1];
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));
      matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
      matchNumber++;
    }

    {
      const team1 = ordered[2];
      const team2 = ordered[3];
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));
      matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
    }

    turnsResult.push({ turnNumber: t, matches, resting: [rest] });
  }

  return turnsResult;
}

// ---------- deterministic NON-MISTO for N=10 (0 teammate repeats) ----------

function allPairings(list: Participant[]): Pair[][] {
  if (list.length === 0) return [[]];
  const [first, ...rest] = list;
  const out: Pair[][] = [];
  for (let i = 0; i < rest.length; i++) {
    const second = rest[i];
    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
    for (const tail of allPairings(remaining)) {
      out.push([[first, second], ...tail]);
    }
  }
  return out;
}

function generateDeterministicNonMisto10(participants: Participant[], rules: BaraondaRules): Turn[] {
  const players = [...participants].sort((a, b) => a.id.localeCompare(b.id));

  const remaining = new Map<string, number>();
  const restCount = new Map<string, number>();

  const teammateUsed = new Set<string>();
  const usedMatchups = new Set<string>();

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of players) {
    remaining.set(p.id, rules.matchesPerPlayer);
    restCount.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turnsResult: Turn[] = [];
  const maxTurns = rules.turns;

  function canStillFinish(): boolean {
    const turnsLeft = maxTurns - turnsResult.length;
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
      if (restsNeeded === turnsLeft) mustRest.push(p);
    }

    const base = [...players].sort((a, b) => {
      const ra = restCount.get(a.id) ?? 0;
      const rb = restCount.get(b.id) ?? 0;
      if (ra !== rb) return ra - rb;
      const na = remaining.get(a.id) ?? 0;
      const nb = remaining.get(b.id) ?? 0;
      if (na !== nb) return na - nb;
      return a.id.localeCompare(b.id);
    });

    const candidates: Array<[Participant, Participant]> = [];

    if (mustRest.length >= 2) {
      for (let i = 0; i < mustRest.length; i++) {
        for (let j = i + 1; j < mustRest.length; j++) {
          const a = mustRest[i];
          const b = mustRest[j];
          if ((restCount.get(a.id) ?? 0) >= 2) continue;
          if ((restCount.get(b.id) ?? 0) >= 2) continue;
          candidates.push([a, b]);
        }
      }
      return candidates;
    }

    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
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

        const m1k = matchKey(ordered[0], ordered[1]);
        const m2k = matchKey(ordered[2], ordered[3]);

        restCount.set(r1.id, (restCount.get(r1.id) ?? 0) + 1);
        restCount.set(r2.id, (restCount.get(r2.id) ?? 0) + 1);

        const matches: Match[] = [];
        let matchNumber = 1;

        const teamA1 = ordered[0];
        const teamA2 = ordered[1];
        const teamB1 = ordered[2];
        const teamB2 = ordered[3];

        for (const p of [...teamA1, ...teamA2, ...teamB1, ...teamB2]) {
          remaining.set(p.id, (remaining.get(p.id) ?? 0) - 1);
        }

        for (const [a, b] of [teamA1, teamA2, teamB1, teamB2]) {
          teammateUsed.add(pairKey(a, b));
        }

        registerMatchRelations(teamA1, teamA2, teammateCount, opponentCount);
        usedMatchups.add(m1k);
        matches.push({ matchNumber, players: [teamA1[0], teamA1[1], teamA2[0], teamA2[1]] });
        matchNumber++;

        registerMatchRelations(teamB1, teamB2, teammateCount, opponentCount);
        usedMatchups.add(m2k);
        matches.push({ matchNumber, players: [teamB1[0], teamB1[1], teamB2[0], teamB2[1]] });

        turnsResult.push({ turnNumber: turnIdx, matches, resting: [r1, r2] });

        if (dfs(turnIdx + 1)) return true;

        turnsResult.pop();
        usedMatchups.delete(m1k);
        usedMatchups.delete(m2k);

        for (const p of players) {
          remaining.set(p.id, rules.matchesPerPlayer);
          restCount.set(p.id, 0);
          teammateCount.set(p.id, new Map());
          opponentCount.set(p.id, new Map());
        }
        teammateUsed.clear();
        usedMatchups.clear();

        for (const trn of turnsResult) {
          for (const rp of trn.resting) {
            restCount.set(rp.id, (restCount.get(rp.id) ?? 0) + 1);
          }
          for (const m of trn.matches) {
            const team1: [Participant, Participant] = [m.players[0], m.players[1]];
            const team2: [Participant, Participant] = [m.players[2], m.players[3]];

            for (const p of [...team1, ...team2]) remaining.set(p.id, (remaining.get(p.id) ?? 0) - 1);

            teammateUsed.add(pairKey(team1[0], team1[1]));
            teammateUsed.add(pairKey(team2[0], team2[1]));

            registerMatchRelations(team1, team2, teammateCount, opponentCount);
            usedMatchups.add(matchKey(team1, team2));
          }
        }
      }
    }

    return false;
  }

  const ok = dfs(1);
  if (!ok) {
    throw new Error("Impossibile costruire schedule N=10 senza ripetizioni compagno con i vincoli attuali.");
  }

  if (teammateUsed.size !== 40) {
    throw new Error(`Check finale fallito: attesi 40 team unici, trovati ${teammateUsed.size}`);
  }

  return turnsResult;
}

// ---------- generic heuristic fallback ----------

function scoreSplit(
  split: TeamSplit,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>,
  category: string
): number {
  const W_TEAMMATE = 120;
  const W_OPPONENT = 90;

  let score = 0;
  const [a, b] = split.team1;
  const [c, d] = split.team2;

  score += getNested(teammateCount, a.id, b.id) * W_TEAMMATE;
  score += getNested(teammateCount, b.id, a.id) * W_TEAMMATE;
  score += getNested(teammateCount, c.id, d.id) * W_TEAMMATE;
  score += getNested(teammateCount, d.id, c.id) * W_TEAMMATE;

  const t1 = [a, b];
  const t2 = [c, d];

  for (const p of t1)
    for (const o of t2) {
      const cnt = getNested(opponentCount, p.id, o.id);
      score += cnt * cnt * W_OPPONENT;
    }
  for (const p of t2)
    for (const o of t1) {
      const cnt = getNested(opponentCount, p.id, o.id);
      score += cnt * cnt * W_OPPONENT;
    }

  if (category === "misto") score -= 0;
  return score;
}

function pickBestGroupAndSplit(
  pool: Participant[],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>,
  category: string,
  usedMatchups: Set<string>
): TeamSplit {
  function findBest(strictNoRepeatTeammate: boolean): { pick: TeamSplit | null; group: Participant[] } {
    let bestScore = Infinity;
    let bestPick: TeamSplit | null = null;
    let bestGroup: Participant[] = [];

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          for (let l = k + 1; l < pool.length; l++) {
            const group = [pool[i], pool[j], pool[k], pool[l]] as [Participant, Participant, Participant, Participant];

            if (category === "misto") {
              const males = group.filter((p) => p.sex === "m").length;
              const females = group.filter((p) => p.sex === "f").length;
              if (males !== 2 || females !== 2) continue;
            }

            for (const split of allTeamSplits(group)) {
              if (category === "misto") {
                if (!isMixedTeam(split.team1) || !isMixedTeam(split.team2)) continue;
              }

              if (strictNoRepeatTeammate) {
                const [a, b] = split.team1;
                const [c, d] = split.team2;
                const rep1 = getNested(teammateCount, a.id, b.id) > 0 || getNested(teammateCount, b.id, a.id) > 0;
                const rep2 = getNested(teammateCount, c.id, d.id) > 0 || getNested(teammateCount, d.id, c.id) > 0;
                if (rep1 || rep2) continue;

                const mk = matchKey(split.team1, split.team2);
                if (usedMatchups.has(mk)) continue;
              }

              const score = scoreSplit(split, teammateCount, opponentCount, category);
              if (score < bestScore) {
                bestScore = score;
                bestPick = split;
                bestGroup = group;
              }
            }
          }
        }
      }
    }

    return { pick: bestPick, group: bestGroup };
  }

  const strict = findBest(true);
  if (strict.pick) {
    for (const p of strict.group) {
      const idx = pool.findIndex((x) => x.id === p.id);
      if (idx >= 0) pool.splice(idx, 1);
    }
    return strict.pick;
  }

  const loose = findBest(false);
  if (loose.pick) {
    for (const p of loose.group) {
      const idx = pool.findIndex((x) => x.id === p.id);
      if (idx >= 0) pool.splice(idx, 1);
    }
    return loose.pick;
  }

  const g = pool.slice(0, 4) as [Participant, Participant, Participant, Participant];
  const pick = allTeamSplits(g)[0];
  for (const p of g) {
    const idx = pool.findIndex((x) => x.id === p.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return pick;
}

// ---------- MISTO (generic) — stable engine for 6..20 ----------

function mistoTargetMatchesPerPlayer(nPlayers: number): number {
  if (nPlayers === 6) return 4;
  if (nPlayers === 8) return 4;
  if (nPlayers === 12) return 6;
  if (nPlayers >= 14 && nPlayers <= 20) return 4;
  return 4;
}

function mistoExpectedTurns(nPlayers: number, matchesPerTurn: number, matchesPerPlayer: number): number {
  const totalSlots = nPlayers * matchesPerPlayer;
  const denom = matchesPerTurn * 4;
  if (totalSlots % denom !== 0) {
    throw new Error(
      `Regole MISTO non eque: N(${nPlayers}) * matchesPerPlayer(${matchesPerPlayer}) = ${totalSlots} ` +
        `non divisibile per matchesPerTurn(${matchesPerTurn}) * 4 = ${denom}.`
    );
  }
  return totalSlots / denom;
}

function generateGenericMistoSchedule(participants: Participant[], rules: BaraondaRules): Turn[] {
  const { matchesPerTurn } = rules;

  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  const n = participants.length;
  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length}).`);
  }

  const players = rules.players ?? participants.length;
  const maxMatchesPerTurn = Math.floor(players / 4);
  if (matchesPerTurn < 1 || matchesPerTurn > maxMatchesPerTurn) {
    throw new Error(`Misto: matchesPerTurn deve essere tra 1 e ${maxMatchesPerTurn} (players=${players})`);
  }

  const targetMpp = mistoTargetMatchesPerPlayer(n);

  if (n === 10) {
    throw new Error("MISTO N=10 deve usare il preset deterministico 5M+5F (gestito esternamente).");
  }

  const turns = mistoExpectedTurns(n, matchesPerTurn, targetMpp);

  const played = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of participants) {
    played.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  function maleCoveredAll(m: Participant) {
    for (const f of females) {
      const c = getNested(teammateCount, m.id, f.id) + getNested(teammateCount, f.id, m.id);
      if (c === 0) return false;
    }
    return true;
  }

  function femaleCoveredAll(f: Participant) {
    for (const m of males) {
      const c = getNested(teammateCount, f.id, m.id) + getNested(teammateCount, m.id, f.id);
      if (c === 0) return false;
    }
    return true;
  }

  function buildEdges(allowRepeatsAfterCoverageOnly: boolean): EdgeMF[] {
    const edges: EdgeMF[] = [];

    for (const m of males) {
      if ((played.get(m.id) ?? 0) >= targetMpp) continue;
      const mFull = maleCoveredAll(m);

      for (const f of females) {
        if ((played.get(f.id) ?? 0) >= targetMpp) continue;

        const tf = getNested(teammateCount, m.id, f.id) + getNested(teammateCount, f.id, m.id);

        if (tf === 0) {
          edges.push({ m, f });
          continue;
        }

        if (!allowRepeatsAfterCoverageOnly) continue;
        const fFull = femaleCoveredAll(f);
        if (mFull && fFull) edges.push({ m, f });
      }
    }

    edges.sort((a, b) => {
      const am = played.get(a.m.id) ?? 0;
      const bm = played.get(b.m.id) ?? 0;
      if (am !== bm) return am - bm;

      const af = played.get(a.f.id) ?? 0;
      const bf = played.get(b.f.id) ?? 0;
      if (af !== bf) return af - bf;

      const ar = getNested(teammateCount, a.m.id, a.f.id);
      const br = getNested(teammateCount, b.m.id, b.f.id);
      if (ar !== br) return ar - br;

      return (a.m.id + a.f.id).localeCompare(b.m.id + b.f.id);
    });

    return edges;
  }

  const turnsResult: Turn[] = [];
  const needEdges = matchesPerTurn * 2;

  function pickEdgesForTurn(): EdgeMF[] {
    const phase1 = buildEdges(false);
    const p1 = pickDisjointEdgesK(phase1, needEdges);
    if (p1) return p1;

    const phase2 = buildEdges(true);
    const p2 = pickDisjointEdgesK(phase2, needEdges);
    if (p2) return p2;

    throw new Error("MISTO: impossibile comporre un turno rispettando equità + vincoli.");
  }

  for (let t = 1; t <= turns; t++) {
    const picked = pickEdgesForTurn();

    const activePlayers: Participant[] = [];
    for (const e of picked) activePlayers.push(e.m, e.f);
    const activeIds = new Set(activePlayers.map((p) => p.id));
    const resting = participants.filter((p) => !activeIds.has(p.id));

    const matches: Match[] = [];
    let matchNumber = 1;

    if (needEdges === 2) {
      const team1: [Participant, Participant] = [picked[0].m, picked[0].f];
      const team2: [Participant, Participant] = [picked[1].m, picked[1].f];

      if (!isMixedTeam(team1) || !isMixedTeam(team2)) throw new Error("MISTO guardrail: team non misto.");

      for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
    } else {
      const ordered = bestPairingOfFourEdges(picked as [EdgeMF, EdgeMF, EdgeMF, EdgeMF], opponentCount);

      {
        const team1: [Participant, Participant] = [ordered[0].m, ordered[0].f];
        const team2: [Participant, Participant] = [ordered[1].m, ordered[1].f];
        if (!isMixedTeam(team1) || !isMixedTeam(team2)) throw new Error("MISTO guardrail: team non misto.");
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
        matchNumber++;
      }

      {
        const team1: [Participant, Participant] = [ordered[2].m, ordered[2].f];
        const team2: [Participant, Participant] = [ordered[3].m, ordered[3].f];
        if (!isMixedTeam(team1) || !isMixedTeam(team2)) throw new Error("MISTO guardrail: team non misto.");
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
      }
    }

    turnsResult.push({ turnNumber: t, matches, resting });
  }

  for (const p of participants) {
    const c = played.get(p.id) ?? 0;
    if (c !== targetMpp) {
      throw new Error(`Equità MISTO fallita: ${p.name} ha ${c} match invece di ${targetMpp}.`);
    }
  }

  return turnsResult;
}

// ---------- STRUCTURED MISTO (EVEN k+k ONLY: 8+8, 10+10) ----------

type StructuredMatch = {
  team1: [Participant, Participant];
  team2: [Participant, Participant];
  roundIndex: number;
};

function buildPartnerRoundsEven(
  males: Participant[],
  females: Participant[],
  M: number
) {
  const rounds: Array<Array<[Participant, Participant]>> = [];

  for (let r = 0; r < M; r++) {
    const round: Array<[Participant, Participant]> = [];

    for (let i = 0; i < males.length; i++) {
      round.push([males[i], females[(i + r) % females.length]]);
    }

    rounds.push(round);
  }

  return rounds;
}

function opponentPenalty(
  a: [Participant, Participant],
  b: [Participant, Participant],
  opponentCount: Map<string, Map<string, number>>
) {
  let score = 0;

  for (const p of a) {
    for (const o of b) {
      const c = getNested(opponentCount, p.id, o.id);
      score += c * c * 100;
    }
  }

  for (const p of b) {
    for (const o of a) {
      const c = getNested(opponentCount, p.id, o.id);
      score += c * c * 100;
    }
  }

  return score;
}

function pairTeamsBest(
  teams: Array<[Participant, Participant]>,
  opponentCount: Map<string, Map<string, number>>
) {
  const remaining = [...teams];
  const matches: Array<[[Participant, Participant], [Participant, Participant]]> = [];

  while (remaining.length > 0) {
    let bestI = 0;
    let bestJ = 1;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const score = opponentPenalty(remaining[i], remaining[j], opponentCount);
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const teamB = remaining.splice(bestJ, 1)[0];
    const teamA = remaining.splice(bestI, 1)[0];

    matches.push([teamA, teamB]);
  }

  return matches;
}

function packStructuredMatches(
  matches: StructuredMatch[],
  participants: Participant[],
  maxCourts: number
): Turn[] {
  const turns: Turn[] = [];

  for (const match of matches) {
    let placed = false;

    for (const turn of turns) {
      if (turn.matches.length >= maxCourts) continue;

      const conflict = turn.matches.some((m) =>
        [...m.players].some((p) =>
          [
            match.team1[0].id,
            match.team1[1].id,
            match.team2[0].id,
            match.team2[1].id,
          ].includes(p.id)
        )
      );

      if (!conflict) {
        turn.matches.push({
          matchNumber: turn.matches.length + 1,
          players: [
            match.team1[0],
            match.team1[1],
            match.team2[0],
            match.team2[1],
          ],
        });
        placed = true;
        break;
      }
    }

    if (!placed) {
      turns.push({
        turnNumber: turns.length + 1,
        matches: [
          {
            matchNumber: 1,
            players: [
              match.team1[0],
              match.team1[1],
              match.team2[0],
              match.team2[1],
            ],
          },
        ],
        resting: [],
      });
    }
  }

  for (const turn of turns) {
    const activeIds = new Set<string>();
    for (const m of turn.matches) {
      for (const p of m.players) {
        activeIds.add(p.id);
      }
    }
    turn.resting = participants.filter((p) => !activeIds.has(p.id));
  }

  return turns;
}

function generateStructuredMixedEven(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length})`);
  }

  if (males.length % 2 !== 0) {
    throw new Error("Il motore structured-even richiede numero pari per sesso.");
  }

  const M = rules.matchesPerPlayer;
  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const partnerRounds = buildPartnerRoundsEven(males, females, M);
  const allMatches: StructuredMatch[] = [];

  for (let r = 0; r < partnerRounds.length; r++) {
    const teams = partnerRounds[r];
    const pairings = pairTeamsBest(teams, opponentCount);

    for (const [team1, team2] of pairings) {
      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      allMatches.push({
        team1,
        team2,
        roundIndex: r,
      });
    }
  }

  const turns = packStructuredMatches(allMatches, participants, maxCourts);

  const played = new Map<string, number>();
  for (const p of participants) played.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== M) {
      throw new Error(`Equità structured-even fallita: ${p.name} ha ${count} match invece di ${M}`);
    }
  }

  return turns;
}

// ---------- STRUCTURED MISTO ODD (7+7 => 8, 9+9 => 10) ----------

type OddBaseRound = {
  activeTeams: Array<[Participant, Participant]>;
  byeTeam: [Participant, Participant];
};

function buildPartnerRoundsOddBase(
  males: Participant[],
  females: Participant[]
): Array<Array<[Participant, Participant]>> {
  const k = males.length;
  const rounds: Array<Array<[Participant, Participant]>> = [];

  for (let r = 0; r < k; r++) {
    const round: Array<[Participant, Participant]> = [];
    for (let i = 0; i < k; i++) {
      round.push([males[i], females[(i + r) % k]]);
    }
    rounds.push(round);
  }

  return rounds;
}

function chooseByeTeamForOddRound(
  roundTeams: Array<[Participant, Participant]>,
  byeCount: Map<string, number>
): OddBaseRound {
  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < roundTeams.length; i++) {
    const [m, f] = roundTeams[i];
    const score =
      (byeCount.get(m.id) ?? 0) * 1000 +
      (byeCount.get(f.id) ?? 0) * 1000 +
      i * 0.01;

    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const byeTeam = roundTeams[bestIdx];
  const activeTeams = roundTeams.filter((_, idx) => idx !== bestIdx);

  return { activeTeams, byeTeam };
}

function pairOddTeamsBest(
  teams: Array<[Participant, Participant]>,
  opponentCount: Map<string, Map<string, number>>
): Array<[[Participant, Participant], [Participant, Participant]]> {
  const remaining = [...teams];
  const matches: Array<[[Participant, Participant], [Participant, Participant]]> = [];

  while (remaining.length > 0) {
    let bestI = 0;
    let bestJ = 1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const score = opponentPenalty(remaining[i], remaining[j], opponentCount);
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const teamB = remaining.splice(bestJ, 1)[0];
    const teamA = remaining.splice(bestI, 1)[0];
    matches.push([teamA, teamB]);
  }

  return matches;
}

function buildOddExtraMatches(
  males: Participant[],
  females: Participant[],
  extraMatchesNeeded: number,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): StructuredMatch[] {
  const participants = [...males, ...females];
  const extraAppearancesNeeded = new Map<string, number>();

  for (const p of participants) {
    extraAppearancesNeeded.set(p.id, 2);
  }

  function need(p: Participant) {
    return extraAppearancesNeeded.get(p.id) ?? 0;
  }

  function canUsePlayer(p: Participant) {
    return need(p) > 0;
  }

  function scoreExtraTeam(team: [Participant, Participant]) {
    const [m, f] = team;
    const repeatCount = teammatePairCount(m, f, teammateCount);

    let score = 0;
    score -= need(m) * 800;
    score -= need(f) * 800;

    if (repeatCount === 0) score -= 300;
    if (repeatCount === 1) score += 2500;
    if (repeatCount >= 2) score += 100000;

    return score;
  }

  function scoreExtraMatch(
    team1: [Participant, Participant],
    team2: [Participant, Participant]
  ) {
    const players4 = [...team1, ...team2];
    let score = 0;

    for (const p of players4) {
      if (!canUsePlayer(p)) return 1000000;
      score -= need(p) * 700;
    }

    score += scoreExtraTeam(team1);
    score += scoreExtraTeam(team2);
    score += opponentPenalty(team1, team2, opponentCount);

    return score;
  }

  const out: StructuredMatch[] = [];

  for (let matchIdx = 0; matchIdx < extraMatchesNeeded; matchIdx++) {
    let best:
      | {
          team1: [Participant, Participant];
          team2: [Participant, Participant];
          score: number;
        }
      | null = null;

    for (let i = 0; i < males.length; i++) {
      const m1 = males[i];
      if (!canUsePlayer(m1)) continue;

      for (let j = 0; j < females.length; j++) {
        const f1 = females[j];
        if (!canUsePlayer(f1)) continue;

        const team1: [Participant, Participant] = [m1, f1];

        for (let k = 0; k < males.length; k++) {
          const m2 = males[k];
          if (m2.id === m1.id) continue;
          if (!canUsePlayer(m2)) continue;

          for (let l = 0; l < females.length; l++) {
            const f2 = females[l];
            if (f2.id === f1.id) continue;
            if (!canUsePlayer(f2)) continue;

            const team2: [Participant, Participant] = [m2, f2];
            const score = scoreExtraMatch(team1, team2);

            if (!best || score < best.score) {
              best = { team1, team2, score };
            }
          }
        }
      }
    }

    if (!best) {
      throw new Error("Impossibile costruire i match extra del misto dispari.");
    }

    const players4 = [...best.team1, ...best.team2];

    if (players4.some((p) => need(p) <= 0)) {
      throw new Error("Odd extra: tentativo di usare un giocatore già saturo.");
    }

    registerMatchRelations(best.team1, best.team2, teammateCount, opponentCount);

    for (const p of players4) {
      extraAppearancesNeeded.set(p.id, need(p) - 1);
    }

    out.push({
      team1: best.team1,
      team2: best.team2,
      roundIndex: 1000 + matchIdx,
    });
  }

  for (const p of participants) {
    const left = need(p);
    if (left !== 0) {
      throw new Error(`Extra matches odd falliti: ${p.name} ha bisogno residuo di ${left}`);
    }
  }

  return out;
}

// ---------- 9x9 dedicated helpers ----------

function buildPartnerRoundsOddBase9x9(
  males: Participant[],
  females: Participant[]
): Array<Array<[Participant, Participant]>> {
  if (males.length !== 9 || females.length !== 9) {
    throw new Error("buildPartnerRoundsOddBase9x9 supporta solo 9+9.");
  }
  return buildPartnerRoundsOddBase(males, females);
}

function chooseByeTeamForOddRound9x9(
  roundTeams: Array<[Participant, Participant]>,
  byeCount: Map<string, number>,
  played: Map<string, number>,
  targetMatches: number
): OddBaseRound {
  let candidates = roundTeams.map((team, idx) => {
    const [m, f] = team;
    const mBye = byeCount.get(m.id) ?? 0;
    const fBye = byeCount.get(f.id) ?? 0;
    const mPlayed = played.get(m.id) ?? 0;
    const fPlayed = played.get(f.id) ?? 0;

    return {
      idx,
      team,
      mBye,
      fBye,
      mPlayed,
      fPlayed,
    };
  });

  // PRIORITÀ ASSOLUTA:
  // se possibile, scegli un bye team con uomo e donna che non hanno ancora mai riposato
  const bothFresh = candidates.filter((c) => c.mBye === 0 && c.fBye === 0);
  if (bothFresh.length > 0) {
    bothFresh.sort((a, b) => {
      const playedA = a.mPlayed + a.fPlayed;
      const playedB = b.mPlayed + b.fPlayed;
      if (playedA !== playedB) return playedA - playedB;
      return a.idx - b.idx;
    });

    const picked = bothFresh[0];
    return {
      byeTeam: picked.team,
      activeTeams: roundTeams.filter((_, idx) => idx !== picked.idx),
    };
  }

  // seconda priorità: almeno uno dei due non ha ancora mai fatto bye
  const oneFresh = candidates.filter((c) => c.mBye === 0 || c.fBye === 0);
  if (oneFresh.length > 0) {
    oneFresh.sort((a, b) => {
      const freshA = (a.mBye === 0 ? 1 : 0) + (a.fBye === 0 ? 1 : 0);
      const freshB = (b.mBye === 0 ? 1 : 0) + (b.fBye === 0 ? 1 : 0);
      if (freshA !== freshB) return freshB - freshA;

      const byeA = a.mBye + a.fBye;
      const byeB = b.mBye + b.fBye;
      if (byeA !== byeB) return byeA - byeB;

      const playedA = a.mPlayed + a.fPlayed;
      const playedB = b.mPlayed + b.fPlayed;
      if (playedA !== playedB) return playedA - playedB;

      return a.idx - b.idx;
    });

    const picked = oneFresh[0];
    return {
      byeTeam: picked.team,
      activeTeams: roundTeams.filter((_, idx) => idx !== picked.idx),
    };
  }

  // fallback finale: minimizza ripetizioni bye e played
  candidates.sort((a, b) => {
    const byeA = a.mBye + a.fBye;
    const byeB = b.mBye + b.fBye;
    if (byeA !== byeB) return byeA - byeB;

    const playedA = a.mPlayed + a.fPlayed;
    const playedB = b.mPlayed + b.fPlayed;
    if (playedA !== playedB) return playedA - playedB;

    return a.idx - b.idx;
  });

  const picked = candidates[0];
  return {
    byeTeam: picked.team,
    activeTeams: roundTeams.filter((_, idx) => idx !== picked.idx),
  };
}

function buildOddExtraMatches9x9(
  males: Participant[],
  females: Participant[],
  played: Map<string, number>,
  targetMatches: number,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): StructuredMatch[] {
  if (males.length !== 9 || females.length !== 9) {
    throw new Error("buildOddExtraMatches9x9 supporta solo 9+9.");
  }

  const participants = [...males, ...females];
  const needs = new Map<string, number>();

  for (const p of participants) {
    needs.set(p.id, targetMatches - (played.get(p.id) ?? 0));
  }

  const totalNeeds = [...needs.values()].reduce((a, b) => a + b, 0);
  if (totalNeeds % 4 !== 0) {
    throw new Error(`9x9 extra incoerenti: somma needs = ${totalNeeds}, non divisibile per 4.`);
  }

  const extraMatchesNeeded = totalNeeds / 4;
  const out: StructuredMatch[] = [];

  function need(p: Participant) {
    return needs.get(p.id) ?? 0;
  }

  function canUse(p: Participant) {
    return need(p) > 0;
  }

  function scoreTeam(team: [Participant, Participant]) {
    const [m, f] = team;
    const repeatCount = teammatePairCount(m, f, teammateCount);

    let score = 0;
    score -= need(m) * 900;
    score -= need(f) * 900;

    if (repeatCount === 0) score -= 300;
    if (repeatCount === 1) score += 2500;
    if (repeatCount >= 2) score += 100000;

    return score;
  }

  function scoreMatch(team1: [Participant, Participant], team2: [Participant, Participant]) {
    const players4 = [...team1, ...team2];
    let score = 0;

    for (const p of players4) {
      if (!canUse(p)) return 1000000;
      score -= need(p) * 800;
    }

    score += scoreTeam(team1);
    score += scoreTeam(team2);
    score += opponentPenalty(team1, team2, opponentCount);

    return score;
  }

  for (let matchIdx = 0; matchIdx < extraMatchesNeeded; matchIdx++) {
    let best:
      | {
          team1: [Participant, Participant];
          team2: [Participant, Participant];
          score: number;
        }
      | null = null;

    for (let i = 0; i < males.length; i++) {
      const m1 = males[i];
      if (!canUse(m1)) continue;

      for (let j = 0; j < females.length; j++) {
        const f1 = females[j];
        if (!canUse(f1)) continue;

        const team1: [Participant, Participant] = [m1, f1];

        for (let k = 0; k < males.length; k++) {
          const m2 = males[k];
          if (m2.id === m1.id) continue;
          if (!canUse(m2)) continue;

          for (let l = 0; l < females.length; l++) {
            const f2 = females[l];
            if (f2.id === f1.id) continue;
            if (!canUse(f2)) continue;

            const team2: [Participant, Participant] = [m2, f2];
            const score = scoreMatch(team1, team2);

            if (!best || score < best.score) {
              best = { team1, team2, score };
            }
          }
        }
      }
    }

    if (!best) {
      throw new Error("Impossibile costruire i match extra 9x9 del misto dispari.");
    }

    const players4 = [...best.team1, ...best.team2];
    if (players4.some((p) => need(p) <= 0)) {
      throw new Error("9x9 extra: tentativo di usare un giocatore già saturo.");
    }

    registerMatchRelations(best.team1, best.team2, teammateCount, opponentCount);

    for (const p of players4) {
      needs.set(p.id, need(p) - 1);
      played.set(p.id, (played.get(p.id) ?? 0) + 1);
    }

    out.push({
      team1: best.team1,
      team2: best.team2,
      roundIndex: 1000 + matchIdx,
    });
  }

  for (const p of participants) {
    const left = need(p);
    if (left !== 0) {
      throw new Error(`Extra matches 9x9 falliti: ${p.name} ha bisogno residuo di ${left}`);
    }
  }

  return out;
}

function buildStructuredOddPartialMatches9x9(
  males: Participant[],
  females: Participant[],
  targetMatches: number,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): StructuredMatch[] {
  if (males.length !== 9 || females.length !== 9) {
    throw new Error("buildStructuredOddPartialMatches9x9 supporta solo 9+9.");
  }

  if (!(targetMatches === 6 || targetMatches === 8)) {
    throw new Error(`9x9 non-complete supporta solo 6 o 8 match, ricevuti ${targetMatches}.`);
  }

  const participants = [...males, ...females];
  const totalMatchesNeeded = (participants.length * targetMatches) / 4; // 27 oppure 36

  const played = new Map<string, number>();
  const byeCount = new Map<string, number>();

  for (const p of participants) {
    played.set(p.id, 0);
    byeCount.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const rawBaseRounds = buildPartnerRoundsOddBase9x9(males, females);

  function need(p: Participant) {
    return targetMatches - (played.get(p.id) ?? 0);
  }

  function remainingMatchesToBuild(currentBuilt: number) {
    return totalMatchesNeeded - currentBuilt;
  }

  function canStillFinishAfterHypotheticalMatch(matchPlayers: Participant[], currentBuilt: number) {
    const tempPlayed = new Map(played);

    for (const p of matchPlayers) {
      tempPlayed.set(p.id, (tempPlayed.get(p.id) ?? 0) + 1);
    }

    const left = totalMatchesNeeded - (currentBuilt + 1);

    for (const p of participants) {
      const n = targetMatches - (tempPlayed.get(p.id) ?? 0);
      if (n < 0) return false;
      if (n > left) return false;
    }

    return true;
  }

  function countFutureRoundAppearances(p: Participant, fromRoundIndex: number) {
    let total = 0;
    for (let r = fromRoundIndex; r < rawBaseRounds.length; r++) {
      const roundTeams = rawBaseRounds[r];
      for (const [m, f] of roundTeams) {
        if (m.id === p.id || f.id === p.id) {
          total++;
          break;
        }
      }
    }
    return total;
  }

  function scoreByeTeamForPartial(
    team: [Participant, Participant],
    roundIndex: number
  ) {
    const [m, f] = team;

    const mBye = byeCount.get(m.id) ?? 0;
    const fBye = byeCount.get(f.id) ?? 0;
    const mNeed = need(m);
    const fNeed = need(f);
    const mPlayed = played.get(m.id) ?? 0;
    const fPlayed = played.get(f.id) ?? 0;

    let score = 0;

    // chi ha ancora tanto bisogno dovrebbe evitare il bye
    score += mNeed * 4000;
    score += fNeed * 4000;

    // chi ha già fatto pochi bye può riposare più facilmente
    score += mBye * 1200;
    score += fBye * 1200;

    // chi ha già giocato di più è più candidabile al bye
    score -= mPlayed * 40;
    score -= fPlayed * 40;

    // piccolo tie-break deterministico
    score += roundIndex * 0.01;

    return score;
  }

  function chooseByeTeamForPartialRound(
    roundTeams: Array<[Participant, Participant]>,
    roundIndex: number
  ): OddBaseRound {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < roundTeams.length; i++) {
      const team = roundTeams[i];
      const score = scoreByeTeamForPartial(team, roundIndex);

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) {
      throw new Error("9x9 partial: impossibile scegliere bye team.");
    }

    return {
      byeTeam: roundTeams[bestIdx],
      activeTeams: roundTeams.filter((_, idx) => idx !== bestIdx),
    };
  }

  function scoreCandidateMatch(
  team1: [Participant, Participant],
  team2: [Participant, Participant],
  roundIndex: number
) {
  const players4 = [...team1, ...team2];
  let score = 0;

  // 1) REGOLA MADRE: prima di tutto servono match a chi ne ha bisogno
  for (const p of players4) {
    const n = need(p);
    if (n <= 0) return 1_000_000_000;
    score -= n * 5000;
  }

  // 2) PARTNER: vincolo molto più rigido degli avversari
  for (const [a, b] of [team1, team2]) {
    const repeatCount = teammatePairCount(a, b, teammateCount);

    if (repeatCount === 0) {
      score -= 4000;
    } else if (repeatCount === 1) {
      score += 80000;
    } else {
      score += 1_000_000;
    }
  }

  // 3) AVVERSARI: importante, ma meno dei partner
  score += opponentPenalty(team1, team2, opponentCount);

  // 4) Criticità residua: se uno rischia di non arrivare a target, il match vale di più
  for (const p of players4) {
    const future = countFutureRoundAppearances(p, roundIndex + 1);
    const n = need(p);

    if (future < n - 1) {
      score += 200000;
    }
  }

  // 5) tie-break deterministico
  score += roundIndex * 0.01;

  return score;
}

  function buildRoundCandidateMatches(
  roundTeams: Array<[Participant, Participant]>,
  roundIndex: number,
  globalBuiltCount: number
): StructuredMatch[] {
  const out: StructuredMatch[] = [];
  let remaining = [...roundTeams];

  while (remaining.length >= 2) {
    let best: { i: number; j: number; score: number } | null = null;

    // LIVELLO 1: accetta solo team con partner mai usati
    best = findBestPair(remaining, false);

    // LIVELLO 2: se impossibile, consenti partner ripetuti una sola volta
    if (!best) {
      best = findBestPair(remaining, true);
    }

    if (!best) break;

    const teamB = remaining.splice(best.j, 1)[0];
    const teamA = remaining.splice(best.i, 1)[0];

    out.push({
      team1: teamA,
      team2: teamB,
      roundIndex,
    });
  }

  return out;

  function findBestPair(
    teams: Array<[Participant, Participant]>,
    allowRepeatOnce: boolean
  ): { i: number; j: number; score: number } | null {
    let bestLocal: { i: number; j: number; score: number } | null = null;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const team1 = teams[i];
        const team2 = teams[j];
        const players4 = [...team1, ...team2];

        // Nessuno deve superare il target
        if (players4.some((p) => need(p) <= 0)) continue;

        // La regola madre deve restare chiudibile
        if (!canStillFinishAfterHypotheticalMatch(players4, globalBuiltCount + out.length)) {
          continue;
        }

        const rep1 = teammatePairCount(team1[0], team1[1], teammateCount);
const rep2 = teammatePairCount(team2[0], team2[1], teammateCount);

// 9+9 bilanciata (6 match): partner già usati vietati
if (targetMatches === 6) {
  if (rep1 > 0 || rep2 > 0) continue;
} else {
  // 9+9 estesa (8 match): consenti al massimo repeat=1 solo nel fallback locale
  if (!allowRepeatOnce) {
    if (rep1 > 0 || rep2 > 0) continue;
  } else {
    if (rep1 >= 2 || rep2 >= 2) continue;
  }
}

        const score = scoreCandidateMatch(team1, team2, roundIndex);

        if (!bestLocal || score < bestLocal.score) {
          bestLocal = { i, j, score };
        }
      }
    }

    return bestLocal;
  }
}

  function applyMatch(match: StructuredMatch) {
    registerMatchRelations(match.team1, match.team2, teammateCount, opponentCount);

    for (const p of [...match.team1, ...match.team2]) {
      played.set(p.id, (played.get(p.id) ?? 0) + 1);
    }
  }

  function allAtTarget() {
    return participants.every((p) => (played.get(p.id) ?? 0) === targetMatches);
  }

  function canStillFinishGlobal(currentBuilt: number) {
    const left = remainingMatchesToBuild(currentBuilt);

    for (const p of participants) {
      const n = need(p);
      if (n < 0) return false;
      if (n > left) return false;
    }

    return true;
  }

  const allStructuredMatches: StructuredMatch[] = [];

  // workaround pulito per usare il built globale nel builder del round

  for (let roundIndex = 0; roundIndex < rawBaseRounds.length; roundIndex++) {
    if (allStructuredMatches.length >= totalMatchesNeeded) break;
    if (allAtTarget()) break;

    const roundTeams = rawBaseRounds[roundIndex];
    const plan = chooseByeTeamForPartialRound(roundTeams, roundIndex);

    const [bm, bf] = plan.byeTeam;
    byeCount.set(bm.id, (byeCount.get(bm.id) ?? 0) + 1);
    byeCount.set(bf.id, (byeCount.get(bf.id) ?? 0) + 1);


    const roundCandidates = buildRoundCandidateMatches(
  plan.activeTeams,
  roundIndex,
  allStructuredMatches.length
);

    for (const match of roundCandidates) {
      if (allStructuredMatches.length >= totalMatchesNeeded) break;

      const players4 = [...match.team1, ...match.team2];

      if (players4.some((p) => need(p) <= 0)) continue;
      if (!canStillFinishAfterHypotheticalMatch(players4, allStructuredMatches.length)) continue;

      applyMatch(match);
      allStructuredMatches.push(match);
    }

    if (!canStillFinishGlobal(allStructuredMatches.length)) {
      throw new Error("9x9 partial: stato incoerente, impossibile mantenere equità finale.");
    }
  }

  // Seconda passata: se manca ancora qualcosa, costruisci in modo opportunistico
if (allStructuredMatches.length < totalMatchesNeeded && !allAtTarget()) {
  const fallbackCandidates: StructuredMatch[] = [];

  for (let roundIndex = 0; roundIndex < rawBaseRounds.length; roundIndex++) {
    const roundTeams = rawBaseRounds[roundIndex];

    for (let byeIdx = 0; byeIdx < roundTeams.length; byeIdx++) {
      const activeTeams = roundTeams.filter((_, idx) => idx !== byeIdx);

      for (let i = 0; i < activeTeams.length; i++) {
        for (let j = i + 1; j < activeTeams.length; j++) {
          fallbackCandidates.push({
            team1: activeTeams[i],
            team2: activeTeams[j],
            roundIndex: 100 + roundIndex,
          });
        }
      }
    }
  }

  while (allStructuredMatches.length < totalMatchesNeeded && !allAtTarget()) {
    let bestMatch: StructuredMatch | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const match of fallbackCandidates) {
      const players4 = [...match.team1, ...match.team2];

      // Nessuno può sforare
      if (players4.some((p) => need(p) <= 0)) continue;

      // Nel 9+9 bilanciata i partner ripetuti restano vietati
      if (targetMatches === 6) {
        const rep1 = teammatePairCount(match.team1[0], match.team1[1], teammateCount);
        const rep2 = teammatePairCount(match.team2[0], match.team2[1], teammateCount);

        if (rep1 > 0 || rep2 > 0) continue;
      }

      // Deve restare possibile chiudere la regola madre
      if (!canStillFinishAfterHypotheticalMatch(players4, allStructuredMatches.length)) continue;

      const score = scoreCandidateMatch(match.team1, match.team2, match.roundIndex);

      if (score < bestScore) {
        bestScore = score;
        bestMatch = match;
      }
    }

    if (!bestMatch) break;

    applyMatch(bestMatch);
    allStructuredMatches.push(bestMatch);
  }
}

  // Validazione finale: REGOLA MADRE
  if (allStructuredMatches.length !== totalMatchesNeeded) {
    throw new Error(
      `9x9 partial: match costruiti ${allStructuredMatches.length}/${totalMatchesNeeded}.`
    );
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`9x9 partial incompleto: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return allStructuredMatches;
}

function generateStructuredMixed7x7Complete(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length})`);
  }

  const k = males.length;

  if (k % 2 === 0) {
    throw new Error("Il motore structured-odd richiede numero dispari per sesso.");
  }

  const targetMatches = rules.matchesPerPlayer;

  const supported = k === 7 && targetMatches === 8;

  if (!supported) {
    throw new Error(`Structured odd non supportato per ${k}+${k} con ${targetMatches} match.`);
  }

  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const byeCount = new Map<string, number>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
    byeCount.set(p.id, 0);
  }

  const rawBaseRounds = buildPartnerRoundsOddBase(males, females);
  const allStructuredMatches: StructuredMatch[] = [];

  for (let roundIndex = 0; roundIndex < rawBaseRounds.length; roundIndex++) {
    const plan = chooseByeTeamForOddRound(rawBaseRounds[roundIndex], byeCount);

    const [bm, bf] = plan.byeTeam;
    byeCount.set(bm.id, (byeCount.get(bm.id) ?? 0) + 1);
    byeCount.set(bf.id, (byeCount.get(bf.id) ?? 0) + 1);

    const pairings = pairOddTeamsBest(plan.activeTeams, opponentCount);

    for (const [team1, team2] of pairings) {
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      allStructuredMatches.push({
        team1,
        team2,
        roundIndex,
      });
    }
  }

  const extraMatchesNeeded = 7;

  const extraMatches = buildOddExtraMatches(
    males,
    females,
    extraMatchesNeeded,
    teammateCount,
    opponentCount
  );

  allStructuredMatches.push(...extraMatches);

  const turns = packStructuredMatches(allStructuredMatches, participants, maxCourts);

  const played = new Map<string, number>();
  for (const p of participants) played.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`Equità structured-odd fallita: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return turns;
}

function generateStructuredMixed9x9Complete(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length})`);
  }

  const k = males.length;

  if (k % 2 === 0) {
    throw new Error("Il motore structured-odd richiede numero dispari per sesso.");
  }

  const targetMatches = rules.matchesPerPlayer;

  const supported = k === 9 && targetMatches === 10;

  if (!supported) {
    throw new Error(`Structured odd non supportato per ${k}+${k} con ${targetMatches} match.`);
  }

  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const byeCount = new Map<string, number>();
  const played = new Map<string, number>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
    byeCount.set(p.id, 0);
    played.set(p.id, 0);
  }

  const rawBaseRounds = buildPartnerRoundsOddBase9x9(males, females);
  const allStructuredMatches: StructuredMatch[] = [];

  for (let roundIndex = 0; roundIndex < rawBaseRounds.length; roundIndex++) {
    const plan = chooseByeTeamForOddRound9x9(rawBaseRounds[roundIndex], byeCount, played, targetMatches);

    const [bm, bf] = plan.byeTeam;
    byeCount.set(bm.id, (byeCount.get(bm.id) ?? 0) + 1);
    byeCount.set(bf.id, (byeCount.get(bf.id) ?? 0) + 1);

    const pairings = pairOddTeamsBest(plan.activeTeams, opponentCount);

    for (const [team1, team2] of pairings) {
      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      allStructuredMatches.push({
        team1,
        team2,
        roundIndex,
      });
    }
  }

  const extraMatches = buildOddExtraMatches9x9(
    males,
    females,
    played,
    targetMatches,
    teammateCount,
    opponentCount
  );

  allStructuredMatches.push(...extraMatches);

  const turns = packStructuredMatches(allStructuredMatches, participants, maxCourts);

  const finalPlayed = new Map<string, number>();
  for (const p of participants) finalPlayed.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        finalPlayed.set(p.id, (finalPlayed.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = finalPlayed.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`Equità structured-odd fallita: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return turns;
}

// ---------- STRUCTURED MISTO ODD NON-COMPLETE (7+7 => 4/6, 9+9 => 6/8) ----------

function buildStructuredOddPartialMatches(
  males: Participant[],
  females: Participant[],
  targetMatches: number,
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>
): StructuredMatch[] {
  const participants = [...males, ...females];
  const k = males.length;

  const totalMatchesNeeded = (participants.length * targetMatches) / 4;
  if (!Number.isInteger(totalMatchesNeeded)) {
    throw new Error("Odd partial: totalMatchesNeeded non intero.");
  }

  const matchesPerFullRound = (k - 1) / 2; // 7+7 => 3, 9+9 => 4
  const fullRoundsCount = Math.floor(totalMatchesNeeded / matchesPerFullRound);
  const partialMatchesCount = totalMatchesNeeded % matchesPerFullRound;

  const played = new Map<string, number>();
  const byeCount = new Map<string, number>();

  for (const p of participants) {
    played.set(p.id, 0);
    byeCount.set(p.id, 0);
  }

  const rawBaseRounds = buildPartnerRoundsOddBase(males, females);
  const allMatches: StructuredMatch[] = [];

  function remainingNeed(p: Participant) {
    return targetMatches - (played.get(p.id) ?? 0);
  }

  function chooseByeTeamForOddPartialRound(
    roundTeams: Array<[Participant, Participant]>
  ): OddBaseRound {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < roundTeams.length; i++) {
      const [m, f] = roundTeams[i];

      let score = 0;
      score += remainingNeed(m) * 1000;
      score += remainingNeed(f) * 1000;
      score += (byeCount.get(m.id) ?? 0) * 600;
      score += (byeCount.get(f.id) ?? 0) * 600;
      score += i * 0.01;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) {
      throw new Error("Odd partial: impossibile scegliere il bye team.");
    }

    const byeTeam = roundTeams[bestIdx];
    const activeTeams = roundTeams.filter((_, idx) => idx !== bestIdx);

    return { activeTeams, byeTeam };
  }

  function scorePartialMatch(
    team1: [Participant, Participant],
    team2: [Participant, Participant]
  ) {
    let score = 0;

    for (const p of [...team1, ...team2]) {
      const need = remainingNeed(p);
      score -= need * 700;
      if (need <= 0) score += 100000;
    }

    for (const [a, b] of [team1, team2]) {
      const repeatCount = teammatePairCount(a, b, teammateCount);

      if (repeatCount >= 2) score += 100000;
      if (repeatCount === 1) score += 2500;
      if (repeatCount === 0) score -= 300;
    }

    score += opponentPenalty(team1, team2, opponentCount);

    return score;
  }

  function pairTeamsGreedyLimited(
    teams: Array<[Participant, Participant]>,
    limitMatches: number
  ): Array<[[Participant, Participant], [Participant, Participant]]> {
    const remaining = [...teams];
    const out: Array<[[Participant, Participant], [Participant, Participant]]> = [];

    while (remaining.length >= 2 && out.length < limitMatches) {
      let bestI = -1;
      let bestJ = -1;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < remaining.length; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          const score = scorePartialMatch(remaining[i], remaining[j]);

          if (score < bestScore) {
            bestScore = score;
            bestI = i;
            bestJ = j;
          }
        }
      }

      if (bestI < 0 || bestJ < 0) break;

      const teamB = remaining.splice(bestJ, 1)[0];
      const teamA = remaining.splice(bestI, 1)[0];
      out.push([teamA, teamB]);
    }

    return out;
  }

  // 1) ROUND PIENI
  for (let roundIndex = 0; roundIndex < fullRoundsCount; roundIndex++) {
    const roundTeams = rawBaseRounds[roundIndex % rawBaseRounds.length];
    const plan = chooseByeTeamForOddPartialRound(roundTeams);

    const [bm, bf] = plan.byeTeam;
    byeCount.set(bm.id, (byeCount.get(bm.id) ?? 0) + 1);
    byeCount.set(bf.id, (byeCount.get(bf.id) ?? 0) + 1);

    const eligibleTeams = plan.activeTeams.filter(
      ([a, b]) => remainingNeed(a) > 0 && remainingNeed(b) > 0
    );

    const pairings = pairTeamsGreedyLimited(eligibleTeams, matchesPerFullRound);

    if (pairings.length !== matchesPerFullRound) {
      throw new Error(`Odd partial: round pieno ${roundIndex + 1} incompleto.`);
    }

    for (const [team1, team2] of pairings) {
      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      for (const p of [...team1, ...team2]) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      allMatches.push({
        team1,
        team2,
        roundIndex,
      });
    }
  }

  // 2) ROUND PARZIALE FINALE
  if (partialMatchesCount > 0) {
    const roundIndex = fullRoundsCount;

    const needyMales = males.filter((p) => remainingNeed(p) > 0);
    const needyFemales = females.filter((p) => remainingNeed(p) > 0);

    const neededTeams = partialMatchesCount * 2;

    if (needyMales.length !== neededTeams || needyFemales.length !== neededTeams) {
      throw new Error(
        `Odd partial: chiusura finale incoerente (M needy=${needyMales.length}, F needy=${needyFemales.length}, teams necessari=${neededTeams}).`
      );
    }

    type CandidateTeam = {
      team: [Participant, Participant];
      score: number;
    };

    function buildBestPartialTeamsExact(
      malesPool: Participant[],
      femalesPool: Participant[],
      teamsNeeded: number
    ): Array<[Participant, Participant]> {
      const remainingM = [...malesPool];
      const remainingF = [...femalesPool];
      const selected: Array<[Participant, Participant]> = [];

      while (selected.length < teamsNeeded) {
        let best: CandidateTeam | null = null;
        let bestMi = -1;
        let bestFi = -1;

        for (let mi = 0; mi < remainingM.length; mi++) {
          for (let fi = 0; fi < remainingF.length; fi++) {
            const m = remainingM[mi];
            const f = remainingF[fi];

            const repeatCount = teammatePairCount(m, f, teammateCount);

            let score = 0;
            score -= remainingNeed(m) * 500;
            score -= remainingNeed(f) * 500;

            if (repeatCount === 0) score -= 300;
            if (repeatCount === 1) score += 2500;
            if (repeatCount >= 2) score += 100000;

            score += (mi + fi) * 0.01;

            if (!best || score < best.score) {
              best = { team: [m, f], score };
              bestMi = mi;
              bestFi = fi;
            }
          }
        }

        if (!best || bestMi < 0 || bestFi < 0) {
          throw new Error("Odd partial: impossibile costruire i team finali.");
        }

        selected.push(best.team);
        remainingM.splice(bestMi, 1);
        remainingF.splice(bestFi, 1);
      }

      return selected;
    }

    const finalTeams = buildBestPartialTeamsExact(needyMales, needyFemales, neededTeams);
    const pairings = pairTeamsGreedyLimited(finalTeams, partialMatchesCount);

    let built = 0;

    for (const [team1, team2] of pairings) {
      const players4 = [...team1, ...team2];

      if (players4.some((p) => (played.get(p.id) ?? 0) >= targetMatches)) {
        continue;
      }

      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      for (const p of players4) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      allMatches.push({
        team1,
        team2,
        roundIndex,
      });

      built++;
    }

    if (built !== partialMatchesCount) {
      throw new Error(
        `Odd partial: impossibile chiudere il round finale senza violare equità (${built}/${partialMatchesCount}).`
      );
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`Odd partial incompleto: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return allMatches;
}

function generateStructuredMixed7x7NonComplete(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length})`);
  }

  const k = males.length;
  const targetMatches = rules.matchesPerPlayer;

  const supported = k === 7 && (targetMatches === 4 || targetMatches === 6);

  if (!supported) {
    throw new Error(`Structured odd non-complete non supportato per ${k}+${k} con ${targetMatches} match.`);
  }

  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const allStructuredMatches = buildStructuredOddPartialMatches(
    males,
    females,
    targetMatches,
    teammateCount,
    opponentCount
  );

  const turns = packStructuredMatches(allStructuredMatches, participants, maxCourts);

  const played = new Map<string, number>();
  for (const p of participants) played.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`Equità structured-odd-non-complete fallita: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return turns;
}

function generateStructuredMixed9x9NonComplete(
  participants: Participant[],
  rules: BaraondaRules
): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== females.length) {
    throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males.length}, F=${females.length})`);
  }

  const k = males.length;
  const targetMatches = rules.matchesPerPlayer;

  // 9+9 bilanciata: costruzione partner-first con 54 coppie uniche
if (k === 9 && targetMatches === 6) {
  const uniquePairs = build9x9BalancedPartners(males, females);
  const allStructuredMatches = build9x9BalancedMatches(uniquePairs);

  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);
  const turns = packStructuredMatches(allStructuredMatches, participants, maxCourts);

  const played = new Map<string, number>();
  for (const p of participants) played.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== 6) {
      throw new Error(`Equità 9x9 bilanciata fallita: ${p.name} ha ${count} match invece di 6.`);
    }
  }

  return turns;
}

  const supported = k === 9 && (targetMatches === 6 || targetMatches === 8);

  if (!supported) {
    throw new Error(`Structured odd non-complete non supportato per ${k}+${k} con ${targetMatches} match.`);
  }

  const maxCourts = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

  for (const p of participants) {
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const allStructuredMatches = buildStructuredOddPartialMatches9x9(
    males,
    females,
    targetMatches,
    teammateCount,
    opponentCount
  );

  const turns = packStructuredMatches(allStructuredMatches, participants, maxCourts);

  const played = new Map<string, number>();
  for (const p of participants) played.set(p.id, 0);

  for (const turn of turns) {
    for (const match of turn.matches) {
      for (const p of match.players) {
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }
    }
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== targetMatches) {
      throw new Error(`Equità structured-odd-non-complete fallita: ${p.name} ha ${count} match invece di ${targetMatches}`);
    }
  }

  return turns;
}

function build9x9BalancedPartners(
  males: Participant[],
  females: Participant[]
): Array<[Participant, Participant]> {
  if (males.length !== 9 || females.length !== 9) {
    throw new Error("build9x9BalancedPartners supporta solo 9+9.");
  }

  const pairs: Array<[Participant, Participant]> = [];
  const rounds = 6;

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < 9; i++) {
      pairs.push([males[i], females[(i + r) % 9]]);
    }
  }

  return pairs; // 54 coppie tutte diverse
}

function build9x9BalancedMatches(
  pairs: Array<[Participant, Participant]>
): StructuredMatch[] {
  const remaining = [...pairs];
  const matches: StructuredMatch[] = [];
  let roundIndex = 0;

  while (remaining.length >= 2) {
    let bestI = -1;
    let bestJ = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const team1 = remaining[i];
        const team2 = remaining[j];

        const players = [...team1, ...team2];
        const ids = new Set(players.map((p) => p.id));

        // nello stesso match servono 4 giocatori diversi
        if (ids.size !== 4) continue;

        let score = 0;

        // piccolo criterio: evita di accoppiare team "troppo vicini" se possibile
        // e lascia un tie-break deterministico stabile
        score += Math.abs(i - j) * 0.01;

        if (score < bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI < 0 || bestJ < 0) {
      throw new Error("Impossibile costruire i match 9x9 bilanciata da partner unici.");
    }

    const teamB = remaining.splice(bestJ, 1)[0];
    const teamA = remaining.splice(bestI, 1)[0];

    matches.push({
      team1: teamA,
      team2: teamB,
      roundIndex,
    });

    roundIndex++;
  }

  if (matches.length !== 27) {
    throw new Error(`9x9 bilanciata: attesi 27 match, trovati ${matches.length}.`);
  }

  return matches;
}

// ---------- flexible large-engine utils ----------

function teammatePairCount(
  a: Participant,
  b: Participant,
  teammateCount: Map<string, Map<string, number>>
) {
  return getNested(teammateCount, a.id, b.id) + getNested(teammateCount, b.id, a.id);
}

function isFreshTeam(
  team: [Participant, Participant],
  teammateCount: Map<string, Map<string, number>>
) {
  return teammatePairCount(team[0], team[1], teammateCount) === 0;
}

function uniqueMixedPartnersCount(
  p: Participant,
  participants: Participant[],
  teammateCount: Map<string, Map<string, number>>
) {
  const others = participants.filter((x) => x.sex !== p.sex);
  let total = 0;
  for (const o of others) {
    if (teammatePairCount(p, o, teammateCount) > 0) total++;
  }
  return total;
}

function buildFlexibleTurnPlan(totalMatches: number, maxCourtsAvailable: number): number[] {
  const plan: number[] = [];
  let remaining = totalMatches;

  while (remaining > 0) {
    const use = Math.min(maxCourtsAvailable, remaining);
    plan.push(use);
    remaining -= use;
  }

  return plan;
}

function validateMixedQuality(
  schedule: Turn[],
  participants: Participant[],
  minUniquePartners: number
): boolean {
  const teammateCount = new Map<string, Set<string>>();

  for (const p of participants) {
    teammateCount.set(p.id, new Set());
  }

  for (const turn of schedule) {
    for (const match of turn.matches) {
      const [a, b, c, d] = match.players;

      teammateCount.get(a.id)?.add(b.id);
      teammateCount.get(b.id)?.add(a.id);

      teammateCount.get(c.id)?.add(d.id);
      teammateCount.get(d.id)?.add(c.id);
    }
  }

  for (const p of participants) {
    const unique = teammateCount.get(p.id)?.size ?? 0;
    if (unique < minUniquePartners) {
      return false;
    }
  }

  return true;
}

function pickBestFlexibleGroupAndSplit(
  pool: Participant[],
  allParticipants: Participant[],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>,
  category: string,
  usedMatchups: Set<string>,
  remainingMatches: Map<string, number>,
  attemptIndex = 0
): TeamSplit {
  let bestScore = Infinity;
  let bestPick: TeamSplit | null = null;
  let bestGroup: Participant[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const group = [pool[i], pool[j], pool[k], pool[l]] as [Participant, Participant, Participant, Participant];

          if (category === "misto") {
            const males = group.filter((p) => p.sex === "m").length;
            const females = group.filter((p) => p.sex === "f").length;
            if (males !== 2 || females !== 2) continue;
          }

          for (const split of allTeamSplits(group)) {
            if (category === "misto") {
              if (!isMixedTeam(split.team1) || !isMixedTeam(split.team2)) continue;
            }

            let score = scoreSplit(split, teammateCount, opponentCount, category);

            for (const p of group) {
              score -= (remainingMatches.get(p.id) ?? 0) * 15;
            }

            if (category === "misto") {
              const mixedPairs: Array<[Participant, Participant]> = [split.team1, split.team2];

              for (const [a, b] of mixedPairs) {
                const repeatCount = teammatePairCount(a, b, teammateCount);

                const aUniquePartners = uniqueMixedPartnersCount(a, allParticipants, teammateCount);
                const bUniquePartners = uniqueMixedPartnersCount(b, allParticipants, teammateCount);

                const maxOppositePartnersA = allParticipants.filter((p) => p.sex !== a.sex).length;
                const maxOppositePartnersB = allParticipants.filter((p) => p.sex !== b.sex).length;

                const aMissing = maxOppositePartnersA - aUniquePartners;
                const bMissing = maxOppositePartnersB - bUniquePartners;

                if (repeatCount >= 2) {
                  score += 100000;
                }

                if (repeatCount >= 1) {
                  score += 1800;

                  score += aMissing * 350;
                  score += bMissing * 350;

                  if (aUniquePartners <= 6) score += 1200;
                  if (bUniquePartners <= 6) score += 1200;

                  if (aUniquePartners <= 5) score += 2000;
                  if (bUniquePartners <= 5) score += 2000;
                }

                if (repeatCount === 0) {
                  score -= 400;

                  score -= aMissing * 40;
                  score -= bMissing * 40;
                }
              }
            }

            const mk = matchKey(split.team1, split.team2);
            if (usedMatchups.has(mk)) score += 120;

            const tieSeed =
              (attemptIndex + 1) *
              (
                split.team1[0].id.charCodeAt(0) +
                split.team1[1].id.charCodeAt(0) +
                split.team2[0].id.charCodeAt(0) +
                split.team2[1].id.charCodeAt(0)
              );

            score += (tieSeed % 17) * 0.01;

            if (score < bestScore) {
              bestScore = score;
              bestPick = split;
              bestGroup = group;
            }
          }
        }
      }
    }
  }

  if (!bestPick) {
    throw new Error("Impossibile costruire il prossimo gruppo di gioco.");
  }

  for (const p of bestGroup) {
    const idx = pool.findIndex((x) => x.id === p.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return bestPick;
}

function generateFlexibleLargeSchedule(
  participants: Participant[],
  rules: BaraondaRules,
  attemptIndex = 0
): Turn[] {
  const category = rules.category;
  const matchesPerPlayer = rules.matchesPerPlayer;
  const maxCourtsAvailable = Math.max(1, rules.maxCourtsAvailable ?? rules.matchesPerTurn ?? 1);

  const totalMatches = (participants.length * matchesPerPlayer) / 4;
  if (!Number.isInteger(totalMatches)) {
    throw new Error(`Equità fallita: ${participants.length} * ${matchesPerPlayer} non divisibile per 4`);
  }

  if (category === "misto") {
    const males = participants.filter((p) => p.sex === "m").length;
    const females = participants.filter((p) => p.sex === "f").length;
    if (males !== females) {
      throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males}, F=${females})`);
    }
  }

  const turnPlan = buildFlexibleTurnPlan(totalMatches, maxCourtsAvailable);

  const remainingMatches = new Map<string, number>();
  const played = new Map<string, number>();
  const rested = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const usedMatchups = new Set<string>();

  for (const p of participants) {
    remainingMatches.set(p.id, matchesPerPlayer);
    played.set(p.id, 0);
    rested.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turnsResult: Turn[] = [];

  for (let t = 0; t < turnPlan.length; t++) {
    const matchesThisTurn = turnPlan[t];
    const activeNeeded = matchesThisTurn * 4;

    const sorted = [...participants].sort((a, b) => {
      const ra = remainingMatches.get(a.id) ?? 0;
      const rb = remainingMatches.get(b.id) ?? 0;
      if (ra !== rb) return rb - ra;

      const pa = played.get(a.id) ?? 0;
      const pb = played.get(b.id) ?? 0;
      if (pa !== pb) return pa - pb;

      const ta = rested.get(a.id) ?? 0;
      const tb = rested.get(b.id) ?? 0;
      if (ta !== tb) return ta - tb;

      return a.id.localeCompare(b.id);
    });

    const activePool: Participant[] = [];
    const resting: Participant[] = [];

    if (category === "misto") {
      const malesSorted = sorted.filter(
        (p) => p.sex === "m" && (remainingMatches.get(p.id) ?? 0) > 0
      );
      const femalesSorted = sorted.filter(
        (p) => p.sex === "f" && (remainingMatches.get(p.id) ?? 0) > 0
      );

      const perSexNeeded = activeNeeded / 2;

      if (!Number.isInteger(perSexNeeded)) {
        throw new Error(`Turno ${t + 1}: attivi richiesti non compatibili col misto (${activeNeeded})`);
      }

      const activeMales = malesSorted.slice(0, perSexNeeded);
      const activeFemales = femalesSorted.slice(0, perSexNeeded);

      if (activeMales.length !== perSexNeeded || activeFemales.length !== perSexNeeded) {
        throw new Error(
          `Turno ${t + 1}: impossibile bilanciare attivi M/F (${activeMales.length}/${perSexNeeded} uomini, ${activeFemales.length}/${perSexNeeded} donne)`
        );
      }

      activePool.push(...activeMales, ...activeFemales);

      const activeIds = new Set(activePool.map((p) => p.id));

      for (const p of participants) {
        if (activeIds.has(p.id)) continue;
        resting.push(p);
        rested.set(p.id, (rested.get(p.id) ?? 0) + 1);
      }
    } else {
      for (const p of sorted) {
        if ((remainingMatches.get(p.id) ?? 0) <= 0) {
          resting.push(p);
          rested.set(p.id, (rested.get(p.id) ?? 0) + 1);
          continue;
        }

        if (activePool.length < activeNeeded) {
          activePool.push(p);
        } else {
          resting.push(p);
          rested.set(p.id, (rested.get(p.id) ?? 0) + 1);
        }
      }
    }

    if (activePool.length !== activeNeeded) {
      throw new Error(`Turno ${t + 1}: attivi insufficienti (${activePool.length}/${activeNeeded})`);
    }

    const matches: Match[] = [];
    let matchNumber = 1;

    while (activePool.length >= 4) {
      const pick = pickBestFlexibleGroupAndSplit(
        activePool,
        participants,
        teammateCount,
        opponentCount,
        category,
        usedMatchups,
        remainingMatches,
        attemptIndex
      );

      const { players, team1, team2 } = pick;

      for (const p of players) {
        remainingMatches.set(p.id, (remainingMatches.get(p.id) ?? 0) - 1);
        played.set(p.id, (played.get(p.id) ?? 0) + 1);
      }

      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      matches.push({
        matchNumber,
        players,
      });

      matchNumber++;
    }

    turnsResult.push({
      turnNumber: t + 1,
      matches,
      resting,
    });
  }

  for (const p of participants) {
    const count = played.get(p.id) ?? 0;
    if (count !== matchesPerPlayer) {
      throw new Error(`Equità finale fallita: ${p.name} ha ${count} match invece di ${matchesPerPlayer}`);
    }
  }

  return turnsResult;
}

function getMixedQualityMinPartners(participants: Participant[], rules: BaraondaRules): number {
  const malesCount = participants.filter((p) => p.sex === "m").length;
  const maxRealisticPartners = Math.min(malesCount, rules.matchesPerPlayer);

  if (rules.matchesPerPlayer <= 4) {
    return Math.max(3, maxRealisticPartners);
  }

  return maxRealisticPartners;
}

// ---------- main exported function ----------

export function generateBaraondaSchedule(participants: Participant[], rules: BaraondaRules): Turn[] {
  const { category, matchesPerTurn, turns, matchesPerPlayer } = rules;

  if (participants.length < 4) throw new Error("Partecipanti insufficienti");

  const maxMatchesPerTurn = Math.floor(participants.length / 4);
  if (matchesPerTurn < 1 || matchesPerTurn > maxMatchesPerTurn) {
    throw new Error(`matchesPerTurn deve essere tra 1 e ${maxMatchesPerTurn} (players=${participants.length})`);
  }

  if (category === "misto") {
    const males = participants.filter((p) => p.sex === "m").length;
    const females = participants.filter((p) => p.sex === "f").length;
    if (males !== females) throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males}, F=${females})`);
  }

  const isProtectedNonMisto = category !== "misto" && participants.length <= 10;
  const isProtectedMisto = category === "misto" && participants.length <= 12;
  const isProtectedCase = isProtectedNonMisto || isProtectedMisto;

  if (!isProtectedCase && rules.flexibleTurns) {
    if (category === "misto") {
      const males = participants.filter((p) => p.sex === "m").length;

      // casi pari grandi: 8+8, 10+10
      if (males % 2 === 0 && males >= 4) {
        return generateStructuredMixedEven(participants, rules);
      }

      // 7+7 dedicato
      if (males === 7) {
        if (rules.matchesPerPlayer === 8) {
          return generateStructuredMixed7x7Complete(participants, rules);
        }

        if (rules.matchesPerPlayer === 4 || rules.matchesPerPlayer === 6) {
          return generateStructuredMixed7x7NonComplete(participants, rules);
        }
      }

            // 9+9 dedicato
      if (males === 9) {
        if (rules.matchesPerPlayer === 10) {
          return generateStructuredMixed9x9Complete(participants, rules);
        }

        if (rules.matchesPerPlayer === 6 || rules.matchesPerPlayer === 8) {
  return generateStructuredMixed9x9NonComplete(participants, rules);
}
      }

      // fallback residuale
      const attempts = 6;

      for (let i = 0; i < attempts; i++) {
        const schedule = generateFlexibleLargeSchedule(participants, rules, i);

        const minPartners = getMixedQualityMinPartners(participants, rules);
        const isValid = validateMixedQuality(schedule, participants, minPartners);

        if (isValid) return schedule;
      }

      throw new Error("Impossibile generare un calendario con qualità sufficiente (misto grande).");
    }

    return generateFlexibleLargeSchedule(participants, rules);
  }

  // ✅ deterministic MISTO 5+5
  if (category === "misto" && participants.length === 10) {
    if (!(matchesPerTurn === 2 && turns === 8 && matchesPerPlayer === 6)) {
      throw new Error("MISTO N=10: preset richiesto = matchesPerTurn=2, turns=8, matchesPerPlayer=6.");
    }
    return generateDeterministicMisto5x5(participants, rules);
  }

  // ✅ generic MISTO protetto fino a 6+6
  if (category === "misto") {
    return generateGenericMistoSchedule(participants, rules);
  }

    // ✅ deterministic NON-MISTO 8
  if (participants.length === 8 && matchesPerTurn === 2 && turns === 7 && matchesPerPlayer === 7) {
    return generateDeterministicNonMisto8(participants, rules);
  }

  // ✅ deterministic NON-MISTO 9
  if (participants.length === 9 && matchesPerTurn === 2 && turns === 9) {
    return generateDeterministicNonMisto9(participants, rules);
  }

  // ✅ deterministic NON-MISTO 10
  if (participants.length === 10 && matchesPerTurn === 2 && turns === 10 && matchesPerPlayer === 8) {
    return generateDeterministicNonMisto10(participants, rules);
  }

  // ---- fallback heuristic per i casi storici piccoli ----
  const activeSlots = matchesPerTurn * 4;

  const played = new Map<string, number>();
  const rested = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  const usedMatchups = new Set<string>();

  participants.forEach((p) => {
    played.set(p.id, 0);
    rested.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  });

  const turnsResult: Turn[] = [];

  for (let t = 1; t <= turns; t++) {
    const sorted = [...participants].sort((a, b) => {
      const pa = played.get(a.id) ?? 0;
      const pb = played.get(b.id) ?? 0;
      if (pa !== pb) return pa - pb;
      return (rested.get(a.id) ?? 0) - (rested.get(b.id) ?? 0);
    });

    const active: Participant[] = [];
    const resting: Participant[] = [];

    for (const p of sorted) {
      if (active.length < activeSlots && (played.get(p.id) ?? 0) < matchesPerPlayer) {
        active.push(p);
      } else {
        resting.push(p);
        rested.set(p.id, (rested.get(p.id) ?? 0) + 1);
      }
    }

    const matches: Match[] = [];
    let matchNumber = 1;

    while (active.length >= 4) {
      const pick = pickBestGroupAndSplit(active, teammateCount, opponentCount, category, usedMatchups);
      const { players, team1, team2 } = pick;

      players.forEach((p) => played.set(p.id, (played.get(p.id) ?? 0) + 1));
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));

      matches.push({ matchNumber, players });
      matchNumber++;
    }

    turnsResult.push({ turnNumber: t, matches, resting });
  }

  return turnsResult;
}