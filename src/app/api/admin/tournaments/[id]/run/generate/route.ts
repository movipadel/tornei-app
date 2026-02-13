import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateBaraondaSchedule } from "@/lib/baraonda/generateSchedule";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type ParticipantRow = {
  id: string;
  name: string;
  sex: "m" | "f";
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { id } = await ctx.params;

  // ✅ supporta body { runId } (consigliato)
  const body = await req.json().catch(() => ({}));
  const runId = String(body?.runId ?? id ?? "");

  if (!runId) return NextResponse.json({ error: "runId mancante" }, { status: 400 });

  // run
  const { data: run, error: runErr } = await sb
    .from("tournament_runs")
    .select("id,rules,status")
    .eq("id", runId)
    .single();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  // ✅ se già ci sono turni -> non rigenero (evita duplicate key)
  const { count: existingTurns, error: cErr } = await sb
    .from("tournament_run_turns")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  if ((existingTurns ?? 0) > 0) {
    return NextResponse.json({ ok: true, reused: true, runId });
  }

  // participants
  const { data: participants, error: perr } = await sb
    .from("tournament_run_participants")
    .select("id,name,sex")
    .eq("run_id", runId);

  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  if (!participants || participants.length < 4) {
    return NextResponse.json({ error: "Partecipanti insufficienti" }, { status: 400 });
  }

  const schedule = generateBaraondaSchedule(participants as ParticipantRow[], run.rules);

  // insert turns + matches
  for (const t of schedule) {
    const { data: turnRow, error: turnErr } = await sb
      .from("tournament_run_turns")
      .insert({ run_id: runId, turn_number: t.turnNumber })
      .select()
      .single();

    if (turnErr || !turnRow) return NextResponse.json({ error: turnErr?.message ?? "Turn insert error" }, { status: 500 });

    const matchesPayload = t.matches.map((m) => ({
      turn_id: turnRow.id,
      match_number: m.matchNumber,
      p1_id: m.players[0].id,
      p2_id: m.players[1].id,
      p3_id: m.players[2].id,
      p4_id: m.players[3].id,
    }));

    if (matchesPayload.length) {
      const { error: merr } = await sb.from("tournament_run_matches").insert(matchesPayload);
      if (merr) return NextResponse.json({ error: merr.message }, { status: 500 });
    }
  }

  // running
  const { error: uerr } = await sb
    .from("tournament_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  return NextResponse.json({ ok: true, runId });
}
