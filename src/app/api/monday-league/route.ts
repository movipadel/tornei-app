import { NextResponse } from "next/server";

import { getPublicLeagueSnapshot } from "@/lib/monday-league/public-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const phaseId = new URL(request.url).searchParams.get("phase");
    const data = await getPublicLeagueSnapshot(phaseId);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public Monday League read failed", error);
    return NextResponse.json({ error: "Impossibile caricare la Monday League" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
