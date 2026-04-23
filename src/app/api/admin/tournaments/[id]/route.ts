import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type LegacyType = "Baraonda" | "Coppie fisse";
type LegacyCategory = "Maschile" | "Femminile" | "Misto" | "Libero";

const TYPE_UI_TO_DB: Record<string, LegacyType> = {
  baraonda: "Baraonda",
  coppia: "Coppie fisse",
  Baraonda: "Baraonda",
  "Coppie fisse": "Coppie fisse",
};

const CATEGORY_UI_TO_DB: Record<string, LegacyCategory> = {
  maschile: "Maschile",
  femminile: "Femminile",
  misto: "Misto",
  libero: "Libero",
  Maschile: "Maschile",
  Femminile: "Femminile",
  Misto: "Misto",
  Libero: "Libero",
};

function parseDateTimeFromBody(body: any): { date: string; time: string } {
  const d = typeof body?.date === "string" ? body.date.trim() : "";
  const t = typeof body?.time === "string" ? body.time.trim() : "";
  if (d && t) return { date: d.slice(0, 10), time: t.slice(0, 5) };

  const startAt = typeof body?.start_at === "string" ? body.start_at : null;
  if (startAt) {
    const dt = new Date(startAt);
    if (!Number.isNaN(dt.getTime())) {
      return {
        date: dt.toISOString().slice(0, 10),
        time: dt.toISOString().slice(11, 16),
      };
    }
  }

  return { date: "", time: "" };
}

function parseMaxParticipants(body: any): number {
  if (body?.max_participants !== undefined && body?.max_participants !== null) {
    const n = Number(body.max_participants);
    return Number.isFinite(n) ? n : 0;
  }

  if (body?.max_teams !== undefined && body?.max_teams !== null) {
    const n = Number(body.max_teams);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

async function validateCircuitCompatibility(params: {
  sb: ReturnType<typeof supabaseAdmin>;
  circuitId: string | null;
  type: LegacyType;
  category: LegacyCategory;
  level: string | null;
}) {
  const { sb, circuitId, type, category, level } = params;

  if (!circuitId) return;

  const { data: circuit, error: circuitErr } = await sb
    .from("circuits")
    .select("id,name,tournament_type")
    .eq("id", circuitId)
    .single();

  if (circuitErr || !circuit) {
    throw new Error("Circuito non trovato");
  }

  if (circuit.tournament_type !== type) {
    throw new Error("Il circuito selezionato non è compatibile con il tipo torneo");
  }

  const effectiveLevel = level ? String(level).trim() : null;
  if (!effectiveLevel) {
    throw new Error("Per associare un torneo a un circuito serve il livello");
  }

  const { data: rankingGroup, error: groupErr } = await sb
    .from("circuit_ranking_groups")
    .select("id")
    .eq("circuit_id", circuitId)
    .eq("category", category)
    .eq("level", effectiveLevel)
    .limit(1)
    .maybeSingle();

  if (groupErr) {
    throw new Error(groupErr.message);
  }

  if (!rankingGroup) {
    throw new Error("Il circuito selezionato non prevede la combinazione categoria/livello di questo torneo");
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("tournaments")
    .select("id,name,type,category,level,location,date,time,max_participants,image_url,show_participants,circuit_id,created_at,updated_at")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });

  const typeRaw = String(body?.type ?? "").trim();
  const type = TYPE_UI_TO_DB[typeRaw];
  if (!type) return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });

  const categoryRaw = String(body?.category ?? "").trim();
  const category = CATEGORY_UI_TO_DB[categoryRaw];
  if (!category) return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });

  const { date, time } = parseDateTimeFromBody(body);
  if (!date || !time) return NextResponse.json({ error: "Data e ora obbligatorie" }, { status: 400 });

  const maxParticipants = parseMaxParticipants(body);
  if (!maxParticipants || maxParticipants < 1) {
    return NextResponse.json({ error: "Max partecipanti non valido" }, { status: 400 });
  }

  const level =
  body?.level !== undefined && body?.level !== null
    ? String(body.level).trim()
    : null;

const circuitId =
  typeof body?.circuit_id === "string" && body.circuit_id.trim()
    ? body.circuit_id.trim()
    : null;

    const sb = supabaseAdmin();

try {
  await validateCircuitCompatibility({
    sb,
    circuitId,
    type,
    category,
    level,
  });
} catch (e: any) {
  return NextResponse.json(
    { error: e?.message ?? "Circuito non compatibile con il torneo" },
    { status: 400 }
  );
}

    const payload: any = {
  name,
  type,
  category,
  date,
  time,
  max_participants: maxParticipants,
  location: body?.location ? String(body.location).trim() : null,
  show_participants: Boolean(body?.show_participants),
  circuit_id: circuitId,
  updated_at: new Date().toISOString(),
};
  
  if (body?.show_participants !== undefined) {
    payload.show_participants = Boolean(body.show_participants);
  }

  if (body?.level !== undefined) payload.level = level || null;
  if (body?.image_url !== undefined) payload.image_url = body.image_url || null;

  const { data, error } = await sb.from("tournaments").update(payload).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  const sb = supabaseAdmin();

  // 1) prendi TUTTE le run del torneo (non solo l'ultima)
  const { data: runs, error: runsErr } = await sb
    .from("tournament_runs")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });

  const runIds = (runs ?? []).map((r: any) => String(r.id)).filter(Boolean);

  // 2) per ogni run: matches -> turns -> participants -> run
  for (const runId of runIds) {
    // 2a) turn ids
    const { data: turns, error: terr } = await sb
      .from("tournament_run_turns")
      .select("id")
      .eq("run_id", runId);

    if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });

    const turnIds = (turns ?? []).map((t: any) => String(t.id)).filter(Boolean);

    // 2b) delete matches (FK verso participants)
    if (turnIds.length) {
      const { error: merr } = await sb.from("tournament_run_matches").delete().in("turn_id", turnIds);
      if (merr) return NextResponse.json({ error: merr.message }, { status: 500 });

      // 2c) delete turns
      const { error: dterr } = await sb.from("tournament_run_turns").delete().in("id", turnIds);
      if (dterr) return NextResponse.json({ error: dterr.message }, { status: 500 });
    }

    // ⚠️ NON cancellare tournament_run_standings: è una VIEW (cannot delete from view)
    // Se è una view/materialized view, si aggiorna automaticamente quando spariscono i dati base.

    // 2d) delete participants
    const { error: perr } = await sb.from("tournament_run_participants").delete().eq("run_id", runId);
    if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

    // 2e) delete run
    const { error: drerr } = await sb.from("tournament_runs").delete().eq("id", runId);
    if (drerr) return NextResponse.json({ error: drerr.message }, { status: 500 });
  }

  // 3) elimina registrazioni collegate
  const { error: rerr } = await sb.from("tournament_registrations").delete().eq("tournament_id", tournamentId);
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  // 4) elimina torneo
  const { error: terr2 } = await sb.from("tournaments").delete().eq("id", tournamentId);
  if (terr2) return NextResponse.json({ error: terr2.message }, { status: 500 });

  return NextResponse.json({ ok: true, deletedRuns: runIds.length });
}
