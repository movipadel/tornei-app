import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
if (denied) return denied;

  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  const sb = supabaseAdmin();

  // trova run attiva fixed_pairs
  const { data: run, error: rerr } = await sb
    .from("tournament_runs")
    .select("id,mode,status,created_at")
    .eq("tournament_id", tournamentId)
    .eq("mode", "fixed_pairs")
    .in("status", ["locked", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  // niente da resettare
  if (!run?.id) return NextResponse.json({ ok: true, reset: false }, { status: 200 });

  const runId = String(run.id);

  // ✅ via semplice: delete run (se hai FK ON DELETE CASCADE dai figli -> pulisce tutto)
  const { error: derr } = await sb.from("tournament_runs").delete().eq("id", runId);
  if (derr) return NextResponse.json({ error: derr.message }, { status: 500 });

  return NextResponse.json({ ok: true, reset: true }, { status: 200 });
}
