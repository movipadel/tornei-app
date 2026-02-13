import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function parseScore(v: any): number | null | undefined {
  // undefined = campo non inviato
  if (v === undefined) return undefined;

  // null = voglio cancellare
  if (v === null) return null;

  // number
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return undefined;
    return Math.floor(v);
  }

  // string numeric
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
  }

  return undefined;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; matchId: string }> }
) {
  const denied = guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matchId } = await ctx.params;
  if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const team1 = parseScore(body?.team1_games);
  const team2 = parseScore(body?.team2_games);

  // se non arriva nulla di valido, errore
  if (team1 === undefined && team2 === undefined) {
    return NextResponse.json(
      { error: "Missing or invalid team1_games/team2_games" },
      { status: 400 }
    );
  }

  const patch: any = {};

  // aggiorna solo i campi inviati (null incluso)
  if (team1 !== undefined) patch.team1_games = team1;
  if (team2 !== undefined) patch.team2_games = team2;

  // completed_at: se entrambi NON null (cioè numeri), setta; altrimenti null
  const willHaveTeam1 =
    team1 !== undefined ? team1 : undefined; // solo se inviato
  const willHaveTeam2 =
    team2 !== undefined ? team2 : undefined;

  // Per decidere completed_at, ci serve lo stato finale.
  // Quindi leggiamo i valori correnti se uno dei due non è stato inviato.
  const sb = supabaseAdmin();

  const { data: current, error: cerr } = await sb
    .from("tournament_run_matches")
    .select("team1_games,team2_games")
    .eq("id", matchId)
    .maybeSingle();

  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const finalTeam1 =
    willHaveTeam1 !== undefined ? willHaveTeam1 : (current.team1_games as number | null);
  const finalTeam2 =
    willHaveTeam2 !== undefined ? willHaveTeam2 : (current.team2_games as number | null);

  const completed =
    finalTeam1 !== null &&
    finalTeam2 !== null &&
    typeof finalTeam1 === "number" &&
    typeof finalTeam2 === "number";

  patch.completed_at = completed ? new Date().toISOString() : null;

  const { data: updated, error } = await sb
    .from("tournament_run_matches")
    .update(patch)
    .eq("id", matchId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, match: updated });
}
