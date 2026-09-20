import { NextResponse } from "next/server";

import { getPublicLeagueTeam } from "@/lib/monday-league/public-read-model";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const phaseId = new URL(request.url).searchParams.get("phase");
    const data = await getPublicLeagueTeam(slug, phaseId, await getUserIdFromCookie());
    if (data.available && "found" in data && !data.found) {
      return NextResponse.json({ error: "Squadra non trovata" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public Monday League team read failed", error);
    return NextResponse.json({ error: "Impossibile caricare la squadra" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
