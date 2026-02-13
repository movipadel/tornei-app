import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type StandingRow = {
  run_id: string;
  participant_id: string;
  name: string;
  games_won: number | null;
  games_lost: number | null;
  matches_won: number | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await ctx.params;
  const sb = supabaseAdmin();

  // latest run for tournament (solo running/finished)
  const { data: run, error: runErr } = await sb
    .from("tournament_runs")
    .select("id,status,started_at,completed_at,created_at")
    .eq("tournament_id", tournamentId)
    .in("status", ["running", "finished"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ status: "no-run" });

  // standings
  const { data: standingsRaw, error: stErr } = await sb
    .from("tournament_run_standings")
    .select("run_id,participant_id,name,games_won,games_lost,matches_won")
    .eq("run_id", run.id);

  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

  const standings = ((standingsRaw ?? []) as StandingRow[])
    .map((r) => {
      const gw = Number(r.games_won ?? 0);
      const gl = Number(r.games_lost ?? 0);
      const mw = Number(r.matches_won ?? 0);
      return {
        participant_id: r.participant_id,
        name: r.name,
        games_won: gw,
        games_lost: gl,
        games_diff: gw - gl,
        matches_won: mw,
      };
    })
    .sort((a, b) => {
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      if (b.games_diff !== a.games_diff) return b.games_diff - a.games_diff;
      return b.games_won - a.games_won;
    });

  // turns + matches (for dialog)
  const { data: participants, error: pErr } = await sb
    .from("tournament_run_participants")
    .select("id,name")
    .eq("run_id", run.id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const nameById = new Map((participants ?? []).map((p: any) => [p.id, p.name]));
  const allIds = (participants ?? []).map((p: any) => p.id);

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
        team1: [nameById.get(m.p1_id) ?? m.p1_id, nameById.get(m.p2_id) ?? m.p2_id],
        team2: [nameById.get(m.p3_id) ?? m.p3_id, nameById.get(m.p4_id) ?? m.p4_id],
        team1_games: m.team1_games,
        team2_games: m.team2_games,
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

  return NextResponse.json({
    status: run.status,
    runId: run.id,
    currentTurn,
    totalTurns: turnsOut.length,
    top3: standings.slice(0, 3),
    standings,
    turns: turnsOut,
  });
}
