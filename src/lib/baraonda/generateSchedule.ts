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

// ---------- small utils ----------

function incNested(map: Map<string, Map<string, number>>, a: string, b: string, by = 1) {
  const row = map.get(a) ?? new Map<string, number>();
  row.set(b, (row.get(b) ?? 0) + by);
  map.set(a, row);
}

function getNested(map: Map<string, Map<string, number>>, a: string, b: string) {
  return map.get(a)?.get(b) ?? 0;
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

function opponentPenaltyForMatch(
  eA: EdgeMF,
  eB: EdgeMF,
  opponentCount: Map<string, Map<string, number>>
): number {
  // players in match: (mA,fA) vs (mB,fB)
  const team1: [Participant, Participant] = [eA.m, eA.f];
  const team2: [Participant, Participant] = [eB.m, eB.f];

  let penalty = 0;
  for (const p of team1) for (const o of team2) {
    const cnt = getNested(opponentCount, p.id, o.id);
    penalty += cnt * cnt; // quadratica
  }
  for (const p of team2) for (const o of team1) {
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
    { order: [e0, e1, e2, e3], pen: opponentPenaltyForMatch(e0, e1, opponentCount) + opponentPenaltyForMatch(e2, e3, opponentCount) },
    { order: [e0, e2, e1, e3], pen: opponentPenaltyForMatch(e0, e2, opponentCount) + opponentPenaltyForMatch(e1, e3, opponentCount) },
    { order: [e0, e3, e1, e2], pen: opponentPenaltyForMatch(e0, e3, opponentCount) + opponentPenaltyForMatch(e1, e2, opponentCount) },
  ];

  options.sort((a, b) => a.pen - b.pen);
  return options[0].order;
}

// Find a disjoint matching of size k from remaining edges (k small: 4 or 2)
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

  // try in given order (edges are constructed sensibly)
  if (dfs(0)) return picked;
  return null;
}

function buildMisto5x5Edges(males: Participant[], females: Participant[]): EdgeMF[] {
  // Decompose K5,5 into 5 perfect matchings:
  // round r: male i with female (i+r mod 5)
  const edges: EdgeMF[] = [];
  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < 5; i++) {
      edges.push({ m: males[i], f: females[(i + r) % 5] });
    }
  }
  // repeat one matching (r=0) to make degree 6 for everyone
  for (let i = 0; i < 5; i++) {
    edges.push({ m: males[i], f: females[i] });
  }
  // total 25 + 5 = 30 edges
  return edges;
}

function assertMistoCoverageAndEquity(
  males: Participant[],
  females: Participant[],
  played: Map<string, number>,
  matchesPerPlayer: number,
  teammateCount: Map<string, Map<string, number>>
) {
  // equity
  for (const p of [...males, ...females]) {
    const c = played.get(p.id) ?? 0;
    if (c !== matchesPerPlayer) {
      throw new Error(`Equità fallita: ${p.name} ha ${c} match invece di ${matchesPerPlayer}`);
    }
  }
  // coverage partner: every M with every F at least once
  for (const m of males) {
    for (const f of females) {
      const c = getNested(teammateCount, m.id, f.id) + getNested(teammateCount, f.id, m.id);
      if (c === 0) {
        throw new Error(`Coverage MISTO fallita: ${m.name} non ha mai giocato con ${f.name}`);
      }
    }
  }
}

function generateDeterministicMisto5x5(participants: Participant[], rules: BaraondaRules): Turn[] {
  const males = participants.filter((p) => p.sex === "m");
  const females = participants.filter((p) => p.sex === "f");

  if (males.length !== 5 || females.length !== 5) {
    throw new Error("Preset misto deterministico supporta solo 5M+5F.");
  }

  // Build 30 partner edges guaranteeing coverage + equity(6)
  const edgesRemaining: EdgeMF[] = buildMisto5x5Edges(males, females);

  // tracking
  const played = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();
  for (const p of participants) {
    played.set(p.id, 0);
    teammateCount.set(p.id, new Map());
    opponentCount.set(p.id, new Map());
  }

  const turnsResult: Turn[] = [];
  let edgeCursorSafety = 0;

  // We need 8 turns total:
  // first 7 turns: 2 matches => 4 edges
  // last turn: 1 match => 2 edges
  for (let t = 1; t <= rules.turns; t++) {
    const needEdges = t < rules.turns ? 4 : 2;

    // safety
    edgeCursorSafety++;
    if (edgeCursorSafety > 1000) throw new Error("Loop di generazione schedule (safety).");

    const picked = pickDisjointEdgesK(edgesRemaining, needEdges);
    if (!picked) {
      throw new Error("Impossibile comporre turni disgiunti con i vincoli correnti (unexpected).");
    }

    // remove picked from remaining
    for (const e of picked) {
      const idx = edgesRemaining.findIndex((x) => x.m.id === e.m.id && x.f.id === e.f.id);
      if (idx >= 0) edgesRemaining.splice(idx, 1);
    }

    // build matches
    const matches: Match[] = [];
    let matchNumber = 1;

    const activePlayers: Participant[] = [];
    for (const e of picked) {
      activePlayers.push(e.m, e.f);
    }

    const activeIds = new Set(activePlayers.map((p) => p.id));
    const resting = participants.filter((p) => !activeIds.has(p.id));

    if (needEdges === 4) {
      const ordered = bestPairingOfFourEdges(picked as [EdgeMF, EdgeMF, EdgeMF, EdgeMF], opponentCount);

      // match 1
      {
        const eA = ordered[0];
        const eB = ordered[1];
        const team1: [Participant, Participant] = [eA.m, eA.f];
        const team2: [Participant, Participant] = [eB.m, eB.f];

        // played update (one match each)
        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);

        registerMatchRelations(team1, team2, teammateCount, opponentCount);

        matches.push({
          matchNumber,
          players: [team1[0], team1[1], team2[0], team2[1]],
        });
        matchNumber++;
      }

      // match 2
      {
        const eA = ordered[2];
        const eB = ordered[3];
        const team1: [Participant, Participant] = [eA.m, eA.f];
        const team2: [Participant, Participant] = [eB.m, eB.f];

        for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);

        registerMatchRelations(team1, team2, teammateCount, opponentCount);

        matches.push({
          matchNumber,
          players: [team1[0], team1[1], team2[0], team2[1]],
        });
      }
    } else {
      // needEdges === 2 => single match
      const eA = picked[0];
      const eB = picked[1];
      const team1: [Participant, Participant] = [eA.m, eA.f];
      const team2: [Participant, Participant] = [eB.m, eB.f];

      for (const p of [...team1, ...team2]) played.set(p.id, (played.get(p.id) ?? 0) + 1);

      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      matches.push({
        matchNumber,
        players: [team1[0], team1[1], team2[0], team2[1]],
      });
    }

    turnsResult.push({ turnNumber: t, matches, resting });
  }

  // final checks
  assertMistoCoverageAndEquity(males, females, played, rules.matchesPerPlayer, teammateCount);

  return turnsResult;
}

// ---------- generic heuristic fallback (your previous logic, simplified & stable) ----------

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

  // teammate penalty
  score += getNested(teammateCount, a.id, b.id) * W_TEAMMATE;
  score += getNested(teammateCount, b.id, a.id) * W_TEAMMATE;
  score += getNested(teammateCount, c.id, d.id) * W_TEAMMATE;
  score += getNested(teammateCount, d.id, c.id) * W_TEAMMATE;

  // opponent quadratic penalty
  const t1 = [a, b];
  const t2 = [c, d];

  for (const p of t1) for (const o of t2) {
    const cnt = getNested(opponentCount, p.id, o.id);
    score += (cnt * cnt) * W_OPPONENT;
  }
  for (const p of t2) for (const o of t1) {
    const cnt = getNested(opponentCount, p.id, o.id);
    score += (cnt * cnt) * W_OPPONENT;
  }

  // if misto, prefer mixed teams (hard in pick)
  if (category === "misto") score -= 0;

  return score;
}

function pickBestGroupAndSplit(
  pool: Participant[],
  teammateCount: Map<string, Map<string, number>>,
  opponentCount: Map<string, Map<string, number>>,
  category: string
): TeamSplit {
  let bestScore = Infinity;
  let bestPick: TeamSplit | null = null;
  let bestGroup: Participant[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const group = [pool[i], pool[j], pool[k], pool[l]] as [
            Participant,
            Participant,
            Participant,
            Participant
          ];

          if (category === "misto") {
            const males = group.filter((p) => p.sex === "m").length;
            const females = group.filter((p) => p.sex === "f").length;
            if (males !== 2 || females !== 2) continue;
          }

          for (const split of allTeamSplits(group)) {
            if (category === "misto") {
              if (!isMixedTeam(split.team1) || !isMixedTeam(split.team2)) continue;
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

  if (!bestPick) {
    const g = pool.slice(0, 4) as [Participant, Participant, Participant, Participant];
    bestPick = allTeamSplits(g)[0];
    bestGroup = g;
  }

  // remove used
  for (const p of bestGroup) {
    const idx = pool.findIndex((x) => x.id === p.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  return bestPick;
}

// ---------- main exported function ----------

export function generateBaraondaSchedule(participants: Participant[], rules: BaraondaRules): Turn[] {
  const { category, matchesPerTurn, turns, matchesPerPlayer } = rules;

  // basic validation
  if (participants.length < 4) throw new Error("Partecipanti insufficienti");

  // MISTO validation
  if (category === "misto") {
    const males = participants.filter((p) => p.sex === "m").length;
    const females = participants.filter((p) => p.sex === "f").length;
    if (males !== females) {
      throw new Error(`Baraonda misto richiede stesso numero M/F (M=${males}, F=${females})`);
    }
  }

  // ✅ Deterministic path: exactly the configuration you chose for 5+5 coverage+equity
  if (
    category === "misto" &&
    participants.length === 10 &&
    matchesPerTurn === 2 &&
    turns === 8 &&
    matchesPerPlayer === 6
  ) {
    return generateDeterministicMisto5x5(participants, rules);
  }

  // ---- fallback heuristic for other cases (keeps your general behavior) ----
  const activeSlots = matchesPerTurn * 4;

  const played = new Map<string, number>();
  const rested = new Map<string, number>();
  const teammateCount = new Map<string, Map<string, number>>();
  const opponentCount = new Map<string, Map<string, number>>();

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
      const pick = pickBestGroupAndSplit(active, teammateCount, opponentCount, category);
      const { players, team1, team2 } = pick;

      players.forEach((p) => played.set(p.id, (played.get(p.id) ?? 0) + 1));
      registerMatchRelations(team1, team2, teammateCount, opponentCount);

      matches.push({ matchNumber, players });
      matchNumber++;
    }

    turnsResult.push({ turnNumber: t, matches, resting });
  }

  return turnsResult;
}
