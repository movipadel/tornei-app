// src/lib/baraonda/generateSchedule.ts

export type Sex = "m" | "f";

export interface Participant {
  id: string;
  name: string;
  sex: Sex;
}

export interface BaraondaRules {
  players: number;
  matchesPerTurn: number; // 1 o 2
  turns: number;
  matchesPerPlayer: number;
  category: "maschile" | "femminile" | "libero" | "misto";
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

      // match 1
      {
        const team1: [Participant, Participant] = [ordered[0].m, ordered[0].f];
        const team2: [Participant, Participant] = [ordered[1].m, ordered[1].f];
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);
        registerMatchRelations(team1, team2, teammateCount, opponentCount);
        matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
        matchNumber++;
      }

      // match 2
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
  const arr = [...players, ghost]; // 10
  const n = arr.length; // 10
  const half = n / 2; // 5

  const rounds: Array<{ pairs: Pair[]; rest: Participant }> = [];

  let fixed = arr[0];
  let rot = arr.slice(1); // 9 elems

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

  return rounds; // 9
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

    // match 1
    {
      const team1 = ordered[0];
      const team2 = ordered[1];
      registerMatchRelations(team1, team2, teammateCount, opponentCount);
      usedMatchups.add(matchKey(team1, team2));
      matches.push({ matchNumber, players: [team1[0], team1[1], team2[0], team2[1]] });
      matchNumber++;
    }

    // match 2
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
  // returns list of pairings that fully cover list (perfect matchings)
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
  // Expect: players=10, matchesPerTurn=2, turns=10, matchesPerPlayer=8
  const players = [...participants].sort((a, b) => a.id.localeCompare(b.id));

  const remaining = new Map<string, number>();
  const restCount = new Map<string, number>();

  const teammateUsed = new Set<string>(); // 0 repeats guaranteed by construction
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
    // quick feasibility: each player needs remaining matches; each future turn can give max 1 match per player
    const turnsLeft = maxTurns - turnsResult.length;
    for (const p of players) {
      const need = remaining.get(p.id) ?? 0;
      if (need < 0) return false;
      if (need > turnsLeft) return false; // since at most 1 match/turn
    }
    return true;
  }

  function pickRestCandidates(turnIdx: number): Array<[Participant, Participant]> {
    // Deterministic order: prioritize who MUST rest to not exceed rest=2 by end, and who has lower remaining
    const turnsLeft = maxTurns - turnIdx + 1;

    const mustRest: Participant[] = [];
    for (const p of players) {
      const r = restCount.get(p.id) ?? 0;
      // if remaining turns == rests needed, they must rest every remaining turn
      const restsNeeded = 2 - r;
      if (restsNeeded === turnsLeft) mustRest.push(p);
    }

    const base = [...players].sort((a, b) => {
      const ra = restCount.get(a.id) ?? 0;
      const rb = restCount.get(b.id) ?? 0;
      if (ra !== rb) return ra - rb; // who rested less gets priority to rest sooner (to avoid end squeeze)
      const na = remaining.get(a.id) ?? 0;
      const nb = remaining.get(b.id) ?? 0;
      if (na !== nb) return na - nb;
      return a.id.localeCompare(b.id);
    });

    const candidates: Array<[Participant, Participant]> = [];

    // If there are "mustRest" players, force them in rest pair
    if (mustRest.length >= 2) {
      // take first two mustRest pairs (deterministic)
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

    // Otherwise generate a limited deterministic set of pairs (keeps search fast)
    for (let i = 0; i < base.length; i++) {
      for (let j = i + 1; j < base.length; j++) {
        const a = base[i];
        const b = base[j];
        if ((restCount.get(a.id) ?? 0) >= 2) continue;
        if ((restCount.get(b.id) ?? 0) >= 2) continue;
        candidates.push([a, b]);
        if (candidates.length >= 18) return candidates; // cap branching
      }
    }

    return candidates;
  }

  function dfs(turnIdx: number): boolean {
    if (turnIdx > maxTurns) return true;
    if (!canStillFinish()) return false;

    const restPairs = pickRestCandidates(turnIdx);

    for (const [r1, r2] of restPairs) {
      // compute active = players excluding resters AND with remaining>0
      const active = players.filter(
        (p) => p.id !== r1.id && p.id !== r2.id && (remaining.get(p.id) ?? 0) > 0
      );

      if (active.length !== 8) continue;

      // all perfect matchings on active (105)
      const pairings = allPairings(active);

      // deterministic ordering of pairings: prefer those that avoid already-used teammate pairs and reduce opponent repeats
      for (const pairs of pairings) {
        // HARD: no teammate repeats
        let ok = true;
        for (const [a, b] of pairs) {
          const pk = pairKey(a, b);
          if (teammateUsed.has(pk)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        // choose best way to group 4 pairs into 2 matches
        const p4 = pairs as [Pair, Pair, Pair, Pair];
        const ordered = bestPairingOfFourPairs(p4, opponentCount, usedMatchups);

        const m1k = matchKey(ordered[0], ordered[1]);
        const m2k = matchKey(ordered[2], ordered[3]);

        // prefer no identical matchups if possible
        const matchupPenalty = (usedMatchups.has(m1k) ? 1000 : 0) + (usedMatchups.has(m2k) ? 1000 : 0);

        // if both would repeat matchups, still allow, but try other ordering first:
        // (we already included usedMatchups in bestPairingOfFourPairs with 9999, so this mostly won't happen)
        if (matchupPenalty >= 2000) {
          // still possible later; don't hard-block to avoid dead ends
        }

        // apply
        restCount.set(r1.id, (restCount.get(r1.id) ?? 0) + 1);
        restCount.set(r2.id, (restCount.get(r2.id) ?? 0) + 1);

        // matches: 2 matches, 4 teams
        const matches: Match[] = [];
        let matchNumber = 1;

        const teamA1 = ordered[0];
        const teamA2 = ordered[1];
        const teamB1 = ordered[2];
        const teamB2 = ordered[3];

        // update remaining (each active player plays exactly 1 match this turn)
        for (const p of [...teamA1, ...teamA2, ...teamB1, ...teamB2]) {
          remaining.set(p.id, (remaining.get(p.id) ?? 0) - 1);
        }

        // teammateUsed + relations + usedMatchups
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

        // rollback
        turnsResult.pop();

        usedMatchups.delete(m1k);
        usedMatchups.delete(m2k);

        // rollback relations (we can't easily rollback maps cheaply) -> instead rebuild on backtrack would be heavy.
        // To keep it deterministic and fast, we DON'T backtrack deep often; but we must be correct if we do.
        // So we implement a safe full rebuild when backtracking.
        // (This is rare because the constraints are solvable and our ordering is strong.)

        // Full rebuild state from scratch based on turnsResult
        // reset all state
        for (const p of players) {
          remaining.set(p.id, rules.matchesPerPlayer);
          restCount.set(p.id, 0);
          teammateCount.set(p.id, new Map());
          opponentCount.set(p.id, new Map());
        }
        teammateUsed.clear();
        usedMatchups.clear();

        for (const trn of turnsResult) {
          // rests
          for (const rp of trn.resting) {
            restCount.set(rp.id, (restCount.get(rp.id) ?? 0) + 1);
          }
          // matches
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

        // continue trying other pairings / rest pairs
      }
    }

    return false;
  }

  const ok = dfs(1);
  if (!ok) {
    throw new Error("Impossibile costruire schedule N=10 senza ripetizioni compagno con i vincoli attuali.");
  }

  // final hard check: 0 teammate repeats
  // (teammateUsed size must be 40: 10 turns * 2 matches * 2 teams = 40)
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

// ---------- main exported function ----------

export function generateBaraondaSchedule(participants: Participant[], rules: BaraondaRules): Turn[] {
  const { category, matchesPerTurn, turns, matchesPerPlayer } = rules;

  if (participants.length < 4) throw new Error("Partecipanti insufficienti");

  if (category === "misto") {
    const males = participants.filter((p) => p.sex === "m").length;
    const females = participants.filter((p) => p.sex === "f").length;
    if (males !== females) throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males}, F=${females})`);
  }

  // ✅ deterministic MISTO 5+5
  if (category === "misto" && participants.length === 10 && matchesPerTurn === 2 && turns === 8 && matchesPerPlayer === 6) {
    return generateDeterministicMisto5x5(participants, rules);
  }

  // ✅ deterministic NON-MISTO 9 players (0 teammate repeats)
  if (category !== "misto" && participants.length === 9 && matchesPerTurn === 2 && turns === 9) {
    return generateDeterministicNonMisto9(participants, rules);
  }

  // ✅ deterministic NON-MISTO 10 players (0 teammate repeats)
  if (category !== "misto" && participants.length === 10 && matchesPerTurn === 2 && turns === 10 && matchesPerPlayer === 8) {
    return generateDeterministicNonMisto10(participants, rules);
  }

  // ---- fallback heuristic for other cases ----
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
