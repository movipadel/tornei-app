import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) {
    return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 1️⃣ trova l’ULTIMA run del torneo (qualsiasi stato)
  // ⚠️ IMPORTANTISSIMO: non solo locked/running
  const { data: run, error: rerr } = await sb
    .from("tournament_runs")
    .select("id,created_at")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rerr) {
    return NextResponse.json({ error: rerr.message }, { status: 500 });
  }

  if (!run?.id) {
    return NextResponse.json({
      ok: true,
      deleted: false,
      reason: "No run found",
    });
  }

  const runId = String(run.id);

  // 2️⃣ prendi TUTTI i turni della run
  const { data: turns, error: terr } = await sb
    .from("tournament_run_turns")
    .select("id")
    .eq("run_id", runId);

  if (terr) {
    return NextResponse.json({ error: terr.message }, { status: 500 });
  }

  const turnIds = (turns ?? [])
    .map((t: any) => String(t.id))
    .filter(Boolean);

  // 3️⃣ cancella MATCH → TURNI
  if (turnIds.length > 0) {
    const { error: merr } = await sb
      .from("tournament_run_matches")
      .delete()
      .in("turn_id", turnIds);

    if (merr) {
      return NextResponse.json({ error: merr.message }, { status: 500 });
    }

    const { error: dterr } = await sb
      .from("tournament_run_turns")
      .delete()
      .in("id", turnIds);

    if (dterr) {
      return NextResponse.json({ error: dterr.message }, { status: 500 });
    }
  }

  // 4️⃣ cancella PARTECIPANTI
  const { error: perr } = await sb
    .from("tournament_run_participants")
    .delete()
    .eq("run_id", runId);

  if (perr) {
    return NextResponse.json({ error: perr.message }, { status: 500 });
  }

  // 5️⃣ cancella RUN
  const { error: drerr } = await sb
    .from("tournament_runs")
    .delete()
    .eq("id", runId);

  if (drerr) {
    return NextResponse.json({ error: drerr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: true,
    runId,
    deletedCounts: {
      turns: turnIds.length,
    },
  });
}
