import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";



function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function safeInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ==========================
 *  Baraonda: standings row
 *  ========================== */
type StandingRow = {
  name: string;
  points: number; // Pt
  played: number; // Pg
  wins: number; // V
  draws: number; // P
  losses: number; // S
  gw: number; // GW
  gl: number; // GL
  difg: number; // DifG
};

/** ==========================
 *  Fixed Pairs helpers
 *  (read-only, copiati dall'admin)
 *  ========================== */
function computeMatchGamesAndWinner(match: any) {
  const hasSets =
    "set1_home_games" in match ||
    "set2_home_games" in match ||
    "set3_home_games" in match ||
    "set1_away_games" in match ||
    "set2_away_games" in match ||
    "set3_away_games" in match;

  if (!hasSets) {
    const hg = safeInt(match.home_games);
    const ag = safeInt(match.away_games);
    const completed = match.completed_at != null || (hg !== null && ag !== null);
    let winner: "home" | "away" | null = null;
    if (hg !== null && ag !== null && hg !== ag) winner = hg > ag ? "home" : "away";
    return { completed, homeGames: hg ?? 0, awayGames: ag ?? 0, winner, sets: null as any };
  }

  const s1h = safeInt(match.set1_home_games);
  const s1a = safeInt(match.set1_away_games);
  const s2h = safeInt(match.set2_home_games);
  const s2a = safeInt(match.set2_away_games);
  const s3h = safeInt(match.set3_home_games);
  const s3a = safeInt(match.set3_away_games);

  const sets = [{ h: s1h, a: s1a }, { h: s2h, a: s2a }, { h: s3h, a: s3a }];
  const validSets = sets.filter((s) => s.h !== null && s.a !== null);

  const homeGames = validSets.reduce((sum, s) => sum + (s.h ?? 0), 0);
  const awayGames = validSets.reduce((sum, s) => sum + (s.a ?? 0), 0);

  let homeSetsWon = 0;
  let awaySetsWon = 0;
  for (const s of validSets) {
    if ((s.h ?? 0) > (s.a ?? 0)) homeSetsWon++;
    else if ((s.a ?? 0) > (s.h ?? 0)) awaySetsWon++;
  }

  const completed = match.completed_at != null || validSets.length > 0;
  let winner: "home" | "away" | null = null;
  if (homeSetsWon !== awaySetsWon) winner = homeSetsWon > awaySetsWon ? "home" : "away";

  return { completed, homeGames, awayGames, winner, sets: { homeSetsWon, awaySetsWon } };
}

function sortStandingsFixedPairs(a: any, b: any) {
  // Pt -> GW -> GL(asc) -> DG -> nome
  if (b.pt !== a.pt) return b.pt - a.pt;
  if (b.gw !== a.gw) return b.gw - a.gw;
  if (a.gl !== b.gl) return a.gl - b.gl;
  if (b.dg !== a.dg) return b.dg - a.dg;
  return String(a.name).localeCompare(String(b.name));
}

function roundRank(label: string | null | undefined): number {
  const s = String(label ?? "").toLowerCase();
  if (s.includes("sedices")) return 10;
  if (s.includes("ottav")) return 20;
  if (s.includes("quart")) return 30;
  if (s.includes("semi")) return 40;
  if (s.includes("final")) return 50;
  return 999;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await ctx.params;
  const sb = supabaseAdmin();


  // ultima run (running/finished) con mode
  const { data: run, error: runErr } = await sb
    .from("tournament_runs")
    .select("id,status,created_at,mode,rules")
    .eq("tournament_id", tournamentId)
    .in("status", ["running", "finished"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run?.id) return NextResponse.json({ status: "no-run" });

  const mode = String((run as any)?.mode ?? "");

  /** ============================================================
   *  FIXED PAIRS (PUBBLICO)
   *  ============================================================ */
  if (mode === "fixed_pairs") {
    const runId = String(run.id);

    // pairs
    const { data: pairs, error: perr } = await sb
      .from("tournament_run_pairs")
      .select("id,name,created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

    const pairsList = (pairs ?? []) as any[];
    const pairById = new Map<string, any>(pairsList.map((p) => [String(p.id), p]));

    // groups
    const { data: groups, error: gerr } = await sb
      .from("tournament_run_groups")
      .select("id,name,position")
      .eq("run_id", runId)
      .order("position", { ascending: true });

    if (gerr) return NextResponse.json({ error: gerr.message }, { status: 500 });

    const groupsList = (groups ?? []) as any[];
    const groupById = new Map<string, any>(groupsList.map((g) => [String(g.id), g]));
    const groupIds = groupsList.map((g) => String(g.id));

    // group_pairs
    let groupPairs: any[] = [];
    if (groupIds.length) {
      const { data: gp, error: gperr } = await sb
        .from("tournament_run_group_pairs")
        .select("group_id,pair_id")
        .in("group_id", groupIds);

      if (gperr) return NextResponse.json({ error: gperr.message }, { status: 500 });
      groupPairs = (gp ?? []) as any[];
    }

    const pairIdsByGroupId = new Map<string, string[]>();
    for (const gp of groupPairs) {
      const gid = String(gp.group_id);
      const pid = String(gp.pair_id);
      const arr = pairIdsByGroupId.get(gid) ?? [];
      arr.push(pid);
      pairIdsByGroupId.set(gid, arr);
    }

    // matches fp
    const { data: matches, error: merr } = await sb
      .from("tournament_run_matches_fp")
      .select("*")
      .eq("run_id", runId)
      .order("stage", { ascending: true })
      .order("starts_at", { ascending: true })
      .order("created_at", { ascending: true });

    if (merr) return NextResponse.json({ error: merr.message }, { status: 500 });

    const matchList = (matches ?? []) as any[];

    // ---- Bracket autofill (solo memoria, non scrive su DB)
    function winnerPairIdFromMatch(m: any): string | null {
      const homeId = m.home_pair_id ? String(m.home_pair_id) : null;
      const awayId = m.away_pair_id ? String(m.away_pair_id) : null;
      if (!homeId || !awayId) return null;

      const computed = computeMatchGamesAndWinner(m);
      if (!computed.completed || !computed.winner) return null;
      return computed.winner === "home" ? homeId : awayId;
    }

    const bracketMatches = matchList.filter((m) => String(m.stage) === "bracket").slice();

    const byRound = new Map<string, any[]>();
    for (const m of bracketMatches) {
      const key = String(m.round_label ?? "Tabellone");
      const arr = byRound.get(key) ?? [];
      arr.push(m);
      byRound.set(key, arr);
    }

    const rounds = Array.from(byRound.entries())
      .map(([round, ms]) => ({
        round,
        rank: roundRank(round),
        matches: ms.sort(
          (a, b) =>
            String(a.starts_at ?? "").localeCompare(String(b.starts_at ?? "")) ||
            String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
            String(a.id ?? "").localeCompare(String(b.id ?? ""))
        ),
      }))
      .sort((a, b) => a.rank - b.rank);

    const effectiveIdsByMatchId = new Map<string, { homeId: string | null; awayId: string | null }>();
    for (const m of bracketMatches) {
      effectiveIdsByMatchId.set(String(m.id), {
        homeId: m.home_pair_id ? String(m.home_pair_id) : null,
        awayId: m.away_pair_id ? String(m.away_pair_id) : null,
      });
    }

    for (let i = 0; i < rounds.length - 1; i++) {
      const prev = rounds[i];
      const next = rounds[i + 1];

      const winners = prev.matches.map((m) => winnerPairIdFromMatch(m)).filter((x): x is string => !!x);

      for (let mi = 0; mi < next.matches.length; mi++) {
        const nm = next.matches[mi];
        const nmId = String(nm.id);
        const cur = effectiveIdsByMatchId.get(nmId) ?? { homeId: null, awayId: null };

        const wHome = winners[mi * 2] ?? null;
        const wAway = winners[mi * 2 + 1] ?? null;

        effectiveIdsByMatchId.set(nmId, {
          homeId: cur.homeId ?? wHome,
          awayId: cur.awayId ?? wAway,
        });
      }
    }

    function effectiveBracketPairIds(m: any) {
      if (String(m.stage) !== "bracket") {
        return {
          homeId: m.home_pair_id ? String(m.home_pair_id) : null,
          awayId: m.away_pair_id ? String(m.away_pair_id) : null,
        };
      }
      const v = effectiveIdsByMatchId.get(String(m.id));
      return {
        homeId: v?.homeId ?? (m.home_pair_id ? String(m.home_pair_id) : null),
        awayId: v?.awayId ?? (m.away_pair_id ? String(m.away_pair_id) : null),
      };
    }

    // normalizzo matches_fp (home/away sempre presenti con "—")
    const matches_fp = matchList.map((m) => {
      const eff = effectiveBracketPairIds(m);
      const homeId = eff.homeId;
      const awayId = eff.awayId;

      const home = homeId ? pairById.get(homeId) : null;
      const away = awayId ? pairById.get(awayId) : null;

      const gid = m.group_id ? String(m.group_id) : null;
      const gname = gid ? (groupById.get(gid)?.name ?? null) : null;

      const s1h = safeInt(m.set1_home_games);
      const s1a = safeInt(m.set1_away_games);
      const s2h = safeInt(m.set2_home_games);
      const s2a = safeInt(m.set2_away_games);
      const s3h = safeInt(m.set3_home_games);
      const s3a = safeInt(m.set3_away_games);

      const hs = safeInt(m.home_sets);
      const as = safeInt(m.away_sets);

      const hasAnySetValue =
        s1h !== null || s1a !== null || s2h !== null || s2a !== null || s3h !== null || s3a !== null;

      return {
        id: String(m.id),
        stage: String(m.stage) as "group" | "bracket",
        group_id: gid,
        group_name: gname,
        round_label: m.round_label ?? null,

        home: homeId ? { id: homeId, name: home?.name ?? homeId } : { id: "", name: "—" },
        away: awayId ? { id: awayId, name: away?.name ?? awayId } : { id: "", name: "—" },

        court: m.court ?? null,
        starts_at: m.starts_at ?? null,
        completed_at: m.completed_at ?? null,

        home_games: safeInt(m.home_games),
        away_games: safeInt(m.away_games),

        sets: hasAnySetValue
          ? {
              set1: { home: s1h, away: s1a },
              set2: { home: s2h, away: s2a },
              set3: { home: s3h, away: s3a },
              homeSetsWon: hs ?? 0,
              awaySetsWon: as ?? 0,
            }
          : null,
      };
    });

    // standingsByGroup
    const standingsByGroup: Record<string, any[]> = {};
    for (const g of groupsList) {
      const gid = String(g.id);
      const pids = pairIdsByGroupId.get(gid) ?? [];
      standingsByGroup[gid] = pids.map((pid) => ({
        pairId: pid,
        name: pairById.get(pid)?.name ?? pid,
        pt: 0,
        gw: 0,
        gl: 0,
        dg: 0,
        played: 0,
        wins: 0,
        losses: 0,
      }));
    }

    const indexByGroupPair = new Map<string, Map<string, any>>();
    for (const g of groupsList) {
      const gid = String(g.id);
      const m = new Map<string, any>();
      for (const row of standingsByGroup[gid] ?? []) m.set(String(row.pairId), row);
      indexByGroupPair.set(gid, m);
    }

    // calcolo standings usando SOLO match stage=group e SOLO completati con winner
    for (const m of matchList) {
      if (String(m.stage) !== "group") continue;
      if (!m.group_id) continue;

      const gid = String(m.group_id);
      const idx = indexByGroupPair.get(gid);
      if (!idx) continue;

      const homeId = String(m.home_pair_id);
      const awayId = String(m.away_pair_id);

      const computed = computeMatchGamesAndWinner(m);
      if (!computed.completed || !computed.winner) continue;

      const homeRow = idx.get(homeId);
      const awayRow = idx.get(awayId);
      if (!homeRow || !awayRow) continue;

      const hg = computed.homeGames;
      const ag = computed.awayGames;

      homeRow.gw += hg;
      homeRow.gl += ag;
      awayRow.gw += ag;
      awayRow.gl += hg;

      homeRow.dg = homeRow.gw - homeRow.gl;
      awayRow.dg = awayRow.gw - awayRow.gl;

      homeRow.played += 1;
      awayRow.played += 1;

      if (computed.winner === "home") {
        homeRow.pt += 1;
        homeRow.wins += 1;
        awayRow.losses += 1;
      } else {
        awayRow.pt += 1;
        awayRow.wins += 1;
        homeRow.losses += 1;
      }
    }

    for (const gid of Object.keys(standingsByGroup)) {
      standingsByGroup[gid] = [...standingsByGroup[gid]].sort(sortStandingsFixedPairs);
    }

    const outGroups = groupsList.map((g) => {
      const gid = String(g.id);
      const pids = pairIdsByGroupId.get(gid) ?? [];
      return {
        id: gid,
        name: g.name,
        position: g.position,
        pairs: pids.map((pid) => ({
          id: pid,
          name: pairById.get(pid)?.name ?? pid,
        })),
      };
    });

    const bracketRounds = rounds.map((r) => ({
      label: r.round,
      matchIds: r.matches.map((m) => String(m.id)),
    }));

    return NextResponse.json({
      mode: "fixed_pairs",
      status: run.status,
      runId: run.id,
      rules: (run as any).rules ?? null,
      groups: outGroups,
      standingsByGroup,
      matches_fp,
      bracketRounds,
    });
  }

  /** ============================================================
   *  BARAONDA (come prima)
   *  ============================================================ */

  // participants (per nomi + resting)
  const { data: participants, error: pErr } = await sb
    .from("tournament_run_participants")
    .select("id,name")
    .eq("run_id", run.id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const nameById = new Map((participants ?? []).map((p: any) => [p.id, p.name]));
  const allIds = (participants ?? []).map((p: any) => p.id);

  // turns + matches
  const { data: turns, error: tErr } = await sb
    .from("tournament_run_turns")
    .select(
      `
      id,
      turn_number,
      tournament_run_matches (
        id,
        match_number,
        team1_games,
        team2_games,
        completed_at,
        p1_id,p2_id,p3_id,p4_id
      )
    `
    )
    .eq("run_id", run.id)
    .order("turn_number", { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const turnsOut = (turns ?? []).map((t: any) => {
    const matches = (t.tournament_run_matches ?? []).sort((a: any, b: any) => a.match_number - b.match_number);

    const active = new Set<string>();
    matches.forEach((m: any) => {
      active.add(m.p1_id);
      active.add(m.p2_id);
      active.add(m.p3_id);
      active.add(m.p4_id);
    });

    const resting = allIds
      .filter((id: string) => !active.has(id))
      .map((id: string) => nameById.get(id) ?? id);

    return {
      turn_number: t.turn_number,
      matches: matches.map((m: any) => ({
        match_number: m.match_number,
        team1: [nameById.get(m.p1_id) ?? m.p1_id, nameById.get(m.p2_id) ?? m.p2_id] as [string, string],
        team2: [nameById.get(m.p3_id) ?? m.p3_id, nameById.get(m.p4_id) ?? m.p4_id] as [string, string],
        team1_games: m.team1_games as number | null,
        team2_games: m.team2_games as number | null,
        completed: !!m.completed_at,
      })),
      resting,
    };
  });

  // current turn snapshot
  let currentTurn = 1;
  for (const t of turnsOut) {
    const allCompleted = t.matches.length > 0 && t.matches.every((m: any) => m.completed);
    if (!allCompleted) {
      currentTurn = t.turn_number;
      break;
    }
    currentTurn = t.turn_number;
  }

  // standings (GW -> Pt -> DifG -> GL -> nome)
  const map = new Map<string, StandingRow>();
  function ensure(name: string) {
    if (!map.has(name)) {
      map.set(name, { name, points: 0, played: 0, wins: 0, draws: 0, losses: 0, gw: 0, gl: 0, difg: 0 });
    }
    return map.get(name)!;
  }

  for (const t of turnsOut) {
    for (const m of t.matches ?? []) {
      const s1 = m.team1_games;
      const s2 = m.team2_games;
      if (s1 == null || s2 == null) continue;

      const team1 = m.team1 ?? [];
      const team2 = m.team2 ?? [];

      const t1Win = s1 > s2;
      const t2Win = s2 > s1;
      const draw = s1 === s2;

      for (const p of team1) {
        const r = ensure(p);
        r.played += 1;
        r.gw += s1;
        r.gl += s2;
        if (t1Win) {
          r.wins += 1;
          r.points += 1;
        } else if (draw) {
          r.draws += 1;
          r.points += 0.5;
        } else {
          r.losses += 1;
        }
      }

      for (const p of team2) {
        const r = ensure(p);
        r.played += 1;
        r.gw += s2;
        r.gl += s1;
        if (t2Win) {
          r.wins += 1;
          r.points += 1;
        } else if (draw) {
          r.draws += 1;
          r.points += 0.5;
        } else {
          r.losses += 1;
        }
      }
    }
  }

  const standings = Array.from(map.values()).map((r) => ({
    ...r,
    difg: r.gw - r.gl,
    points: round1(r.points),
  }));

  standings.sort((a, b) => {
    if (b.gw !== a.gw) return b.gw - a.gw;
    if (b.points !== a.points) return b.points - a.points;
    if (b.difg !== a.difg) return b.difg - a.difg;
    if (a.gl !== b.gl) return a.gl - b.gl;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    mode: "baraonda",
    status: run.status,
    runId: run.id,
    currentTurn,
    totalTurns: turnsOut.length,
    standings,
    turns: turnsOut,
  });
}
