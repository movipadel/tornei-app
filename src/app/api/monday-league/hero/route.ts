import { NextResponse } from "next/server";
import { derivePublicLeagueHeroState } from "@/lib/monday-league/public-read-model";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from("league_seasons")
      .select("name,status,published_at,public_visibility")
      .eq("public_visibility", "public").not("published_at", "is", null)
      .lte("published_at", new Date().toISOString()).in("status", ["draft", "phase1", "phase2", "completed", "archived"])
      .order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ? { visible: true, ...derivePublicLeagueHeroState(data.status === "archived" ? "completed" : data.status), seasonName: data.name } : { visible: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Monday League hero read failed", error);
    return NextResponse.json({ visible: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
