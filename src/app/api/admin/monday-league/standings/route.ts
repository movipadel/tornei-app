import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const denied = await guardAdmin(); if (denied) return denied;
  const phaseId = new URL(req.url).searchParams.get("phase_id");
  if (!phaseId) return NextResponse.json({ error: "phase_id mancante" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("league_get_standings", { p_phase_id: phaseId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
