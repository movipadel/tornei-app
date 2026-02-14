import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";


export const runtime = "nodejs";

type RunRow = {
  id: string;
  mode: string | null;
  status: string | null;
  started_at: string | null;
  created_at: string | null;
  rules: any;
};

type ParticipantRow = { id: string; name: string };

// ---------- Helpers (Fixed Pairs) ----------
function safeInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeMatchGamesAndWinner(match: any) {
  // A) one_set: home_games/away_games
  // B) best_of_3: set1..set3
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

    return {
      completed,
      homeGames: hg ?? 0,
      awayGames: ag ?? 0,
      winner,
      sets: null as any,
    };
  }

  const s1h = safeInt(match.set1_home_games);
  const s1a = safeInt(match.set1_away_games);
  const s2h = safeInt(match.set2_home_games);
  const s2a = safeInt(match.set2_away_games);
  const s3h = safeInt(match.set3_home_games);
  const s3a = safeInt(match.set3_away_games);

  const sets = [
    { h: s1h, a: s1a },
    { h: s2h, a: s2a },
    { h: s3h, a: s3a },
  ];

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

  return {
    completed,
    homeGames,
    awayGames,
    winner,
    sets: {
      homeSetsWon,
      awaySetsWon,
    },
  };
}

function sortStandings(a: any, b: any) {
  // Punti - GW - GL - DG (con GL asc)
  if (b.pt !== a.pt) return b.pt - a.pt;
  if (b.gw !== a.gw) return b.gw - a.gw;
  if (a.gl !== b.gl) return a.gl - b.gl;
  if (b.dg !== a.dg) return b.dg - a.dg;
  return String(a.name).localeCompare(String(b.name));
}

// ---------- GET ----------
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  const sb = supabaseAdmin();

  // 1) run attiva (running/locked) più recente, fallback ultima run
  const { data: activeRun, error: aerr } = await sb
    .from("tournament_runs")
    .select("id,mode,status,started_at,created_at,rules")
    .eq("tournament_id", tournamentId)
    .in("status", ["running", "locked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aerr) return NextResponse.json({ error: aerr.message }, { status: 500 });

  let run = (activeRun as RunRow | null) ?? null;

  if (!run?.id) {
    const { data: lastRun, error: rerr } = await sb
      .from("tournament_runs")
      .select("id,mode,status,started_at,created_at,rules")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });
    run = (lastRun as RunRow | null) ?? null;
  }

  if (!run?.id) {
    return NextResponse.json(
      { tournamentId, runId: null, mode: null, status: null, started_at: null, rules: null, turns: [] },
      { status: 200 }
    );
  }

  const runId = String(run.id);
  const mode = String(run.mode ?? "");

  // ======================
  // BARAONDA
  // ======================
  if (mode === "baraonda") {
    const { data: participants, error: perr } = await sb
      .from("tournament_run_participants")
      .select("id,name")
      .eq("run_id", runId);

    if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

    const plist = (participants ?? []) as ParticipantRow[];
    const nameById = new Map(plist.map((p) => [p.id, p.name]));
    const allIds = plist.map((p) => p.id);

    const { data: turns, error: terr } = await sb
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
            p1_id,
            p2_id,
            p3_id,
            p4_id
          )
        `
      )
      .eq("run_id", runId)
      .order("turn_number", { ascending: true });

    if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });

    const out = (turns ?? []).map((t: any) => {
      const matches = ((t.tournament_run_matches ?? []) as any[]).sort((a, b) => a.match_number - b.match_number);

      const activeIds = new Set<string>();
      for (const m of matches) {
        activeIds.add(m.p1_id);
        activeIds.add(m.p2_id);
        activeIds.add(m.p3_id);
        activeIds.add(m.p4_id);
      }

      const resting = allIds.filter((pid) => !activeIds.has(pid)).map((pid) => nameById.get(pid) ?? pid);

      return {
        id: t.id,
        turn_number: t.turn_number,
        matches: matches.map((m) => {
          const team1 = [nameById.get(m.p1_id) ?? m.p1_id, nameById.get(m.p2_id) ?? m.p2_id];
          const team2 = [nameById.get(m.p3_id) ?? m.p3_id, nameById.get(m.p4_id) ?? m.p4_id];

          return {
            id: m.id,
            match_number: m.match_number,
            team1_games: m.team1_games,
            team2_games: m.team2_games,
            team1,
            team2,
            patch_url: `/api/admin/tournaments/${tournamentId}/run/match/${m.id}`,
          };
        }),
        resting,
      };
    });

    return NextResponse.json(
      {
        tournamentId,
        runId,
        mode: "baraonda",
        status: run.status ?? null,
        started_at: run.started_at ?? null,
        rules: run.rules ?? null,
        turns: out,
        matches_fp: [],
      },
      { status: 200 }
    );
  }

  // ======================
  // FIXED PAIRS
  // ======================
  if (mode === "fixed_pairs") {
    // pairs
    const { data: pairs, error: perr } = await sb
      .from("tournament_run_pairs")
      .select("id,name,registration_id,created_at")
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
      .order("starts_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });

    if (merr) return NextResponse.json({ error: merr.message }, { status: 500 });

    const matchList = (matches ?? []) as any[];

         // ============================================================
    // BRACKET AUTOFILL (solo GET - NON scrive su DB)
    // Riempie i match "vuoti" del tabellone usando i vincitori
    // del round precedente (Ottavi -> Quarti -> Semi -> Finale...).
    // Funziona con qualsiasi qualifiersCount.
    // ============================================================

    function winnerPairIdFromMatch(m: any): string | null {
      const homeId = m.home_pair_id ? String(m.home_pair_id) : null;
      const awayId = m.away_pair_id ? String(m.away_pair_id) : null;
      if (!homeId || !awayId) return null;

      const computed = computeMatchGamesAndWinner(m);
      if (!computed.completed || !computed.winner) return null;
      return computed.winner === "home" ? homeId : awayId;
    }

    function roundRank(label: string | null | undefined): number {
      const s = String(label ?? "").toLowerCase();

      // supportiamo varianti
      if (s.includes("sedices")) return 10; // Sedicesimi
      if (s.includes("ottav")) return 20;   // Ottavi
      if (s.includes("quart")) return 30;   // Quarti
      if (s.includes("semi")) return 40;    // Semifinali
      if (s.includes("final")) return 50;   // Finale

      // fallback: se non riconosciuto, mettilo in mezzo
      return 999;
    }

    // bracket matches
    const bracketMatches = matchList
      .filter((m) => String(m.stage) === "bracket")
      .slice();

    // raggruppo per round_label
    const byRound = new Map<string, any[]>();
    for (const m of bracketMatches) {
      const key = String(m.round_label ?? "Tabellone");
      const arr = byRound.get(key) ?? [];
      arr.push(m);
      byRound.set(key, arr);
    }

    // ordino round per importanza (Ottavi -> Quarti -> Semi -> Finale)
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

    // calcolo "effective ids" per ogni match del bracket (riempiti quando possibile)
    const effectiveIdsByMatchId = new Map<string, { homeId: string | null; awayId: string | null }>();

    // inizializzo con quello che c'è
    for (const m of bracketMatches) {
      const id = String(m.id);
      effectiveIdsByMatchId.set(id, {
        homeId: m.home_pair_id ? String(m.home_pair_id) : null,
        awayId: m.away_pair_id ? String(m.away_pair_id) : null,
      });
    }

    // propagazione winners round->round
    for (let i = 0; i < rounds.length - 1; i++) {
      const prev = rounds[i];
      const next = rounds[i + 1];

      // winners del round precedente
      const winners = prev.matches
        .map((m) => winnerPairIdFromMatch(m))
        .filter((x): x is string => !!x);

      // riempi i match del next round: ogni match prende 2 winners
      for (let mi = 0; mi < next.matches.length; mi++) {
        const nm = next.matches[mi];
        const nmId = String(nm.id);

        const cur = effectiveIdsByMatchId.get(nmId) ?? { homeId: null, awayId: null };

        const wHome = winners[mi * 2] ?? null;
        const wAway = winners[mi * 2 + 1] ?? null;

        // riempio solo se vuoto
        const filledHome = cur.homeId ?? wHome;
        const filledAway = cur.awayId ?? wAway;

        effectiveIdsByMatchId.set(nmId, { homeId: filledHome, awayId: filledAway });
      }
    }

    // helper da usare nel mapping matches_fp
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


   // ✅ matches_fp “normalizzato” per FixedPairsRunClient (robusto con home/away null)
const matches_fp = matchList.map((m) => {
  const homeId = m.home_pair_id ? String(m.home_pair_id) : null;
  const awayId = m.away_pair_id ? String(m.away_pair_id) : null;

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

    // ✅ HOME/AWAY sempre presenti (anche quando nel DB sono null)
    home: homeId
      ? { id: homeId, name: home?.name ?? homeId }
      : { id: "", name: "—" },

    away: awayId
      ? { id: awayId, name: away?.name ?? awayId }
      : { id: "", name: "—" },

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

    patch_url: `/api/admin/tournaments/${tournamentId}/fixed/run/match/${m.id}`,
  };
});



    // standings per girone (solo stage=group e solo match completati con winner)
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
      standingsByGroup[gid] = [...standingsByGroup[gid]].sort(sortStandings);
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

    return NextResponse.json(
      {
        tournamentId,
        runId,
        mode: "fixed_pairs",
        status: run.status ?? null,
        started_at: run.started_at ?? null,
        rules: run.rules ?? null,

        // per il client
        turns: [],
        matches_fp,

        // extra (ci servirà dopo)
        groups: outGroups,
        standingsByGroup,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ error: `Run mode non supportata: ${mode}` }, { status: 400 });
}
