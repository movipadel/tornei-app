import { generateBaraondaSchedule, type Participant, type BaraondaRules } from "../src/lib/baraonda/generateSchedule";

function computeTurns(players: number) {
  if (players === 10) return 10;
  if (players === 9) return 9;
  if (players === 8) return 7;
  if (players === 7) return 7;
  if (players === 6) return 6;
  if (players === 5) return 5;
  if (players === 4) return 3;
  return players;
}

function makePlayers(n: number): Participant[] {
  return Array.from({ length: n }).map((_, i) => ({
    id: `P${i + 1}`,
    name: `Player ${i + 1}`,
    sex: "m" as const,
  }));
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function teamKey(a: string, b: string) {
  const ids = [a, b].sort();
  return `${ids[0]}+${ids[1]}`;
}

function matchKey(team1: [string, string], team2: [string, string]) {
  const a = teamKey(team1[0], team1[1]);
  const b = teamKey(team2[0], team2[1]);
  return a < b ? `${a}__VS__${b}` : `${b}__VS__${a}`;
}

function analyzeOnce(n: number) {
  const players = shuffle(makePlayers(n));
  const matchesPerTurn = n >= 8 ? 2 : 1;
  const turns = computeTurns(n);
  const matchesPerPlayer = (matchesPerTurn * 4 * turns) / n;

  const rules: BaraondaRules = {
    players: n,
    matchesPerTurn,
    turns,
    matchesPerPlayer,
    category: "libero",
  };

  const schedule = generateBaraondaSchedule(players, rules);

  const teammateCounts = new Map<string, number>();
  const matchCounts = new Map<string, number>();

  for (const t of schedule) {
    for (const m of t.matches) {
      const p = m.players;
      const t1 = [p[0].id, p[1].id] as [string, string];
      const t2 = [p[2].id, p[3].id] as [string, string];

      // teammates
      const k1 = pairKey(t1[0], t1[1]);
      const k2 = pairKey(t2[0], t2[1]);
      teammateCounts.set(k1, (teammateCounts.get(k1) ?? 0) + 1);
      teammateCounts.set(k2, (teammateCounts.get(k2) ?? 0) + 1);

      // identical matchup
      const mk = matchKey(t1, t2);
      matchCounts.set(mk, (matchCounts.get(mk) ?? 0) + 1);
    }
  }

  const teammateDup = Array.from(teammateCounts.values()).some((v) => v > 1);
  const matchupDup = Array.from(matchCounts.values()).some((v) => v > 1);

  return { teammateDup, matchupDup };
}

function run() {
  const ITER = 500;
  const Ns = [4, 5, 6, 7, 8, 9, 10]; // baraonda

  for (const n of Ns) {
    let teammateDupCount = 0;
    let matchupDupCount = 0;

    for (let i = 0; i < ITER; i++) {
      const r = analyzeOnce(n);
      if (r.teammateDup) teammateDupCount++;
      if (r.matchupDup) matchupDupCount++;
    }

    console.log(
      `N=${n} | teammateDup: ${teammateDupCount}/${ITER} | identicalMatchDup: ${matchupDupCount}/${ITER}`
    );
  }
}

run();
