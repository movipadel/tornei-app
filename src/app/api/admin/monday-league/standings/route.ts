import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const sb = supabaseAdmin();
  const requested = new URL(req.url).searchParams.get("phase_id");
  const { data: season } = await sb.from("league_seasons").select("id").neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!season) return NextResponse.json({ data: null });
  const { data: phases } = await sb.from("league_phases").select("id,code,name,status").eq("season_id", season.id).in("status", ["generated", "in_progress", "finalized"]).order("sequence_number");
  const phase = (phases ?? []).find((item) => item.id === requested || item.code === requested) ?? (phases ?? []).find((item) => item.code === "phase1") ?? null;
  if (!phase) return NextResponse.json({ data: null });
  const { data, error } = await sb.rpc("league_get_standings", { p_phase_id: phase.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { ...data, phase, phases: phases ?? [] } });
}
