import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type RegistrationRow = {
  user_id: string | null;
  name: string;
  phone: string | null;
  sex: "m" | "f";
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin(req);
if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  const sb = supabaseAdmin();

  const { data: regs, error } = await sb
    .from("registrations")
    .select("user_id,name,phone,sex")
    .eq("tournament_id", tournamentId)
    .eq("status", "main");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!regs || regs.length < 4) {
    return NextResponse.json({ error: "Iscritti insufficienti" }, { status: 400 });
  }

  const players = regs.length;
  const matchesPerTurn = players >= 8 ? 2 : 1;

  let turns = players;
  if (players === 10) turns = 5;
  if (players === 9) turns = 9;
  if (players === 8) turns = 7;
  if (players === 6) turns = 6;
  if (players === 5) turns = 5;
  if (players === 4) turns = 3;

  const matchesPerPlayer = (matchesPerTurn * 4 * turns) / players;

  const { data: run, error: runErr } = await sb
    .from("tournament_runs")
    .insert({
      tournament_id: tournamentId,
      mode: "baraonda",
      category: "libero",
      status: "locked",
      locked_at: new Date().toISOString(),
      rules: {
        players,
        matchesPerTurn,
        turns,
        matchesPerPlayer,
        durationPreset: players === 10 ? "short" : "standard",
        tieWinValue: 0.5,
      },
    })
    .select()
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? "Run error" }, { status: 500 });
  }

  const participants = (regs as RegistrationRow[]).map(r => ({
    run_id: run.id,
    user_id: r.user_id,
    name: r.name,
    phone: r.phone,
    sex: r.sex,
  }));

  const { error: perr } = await sb
    .from("tournament_run_participants")
    .insert(participants);

  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  return NextResponse.json({ runId: run.id });
}
