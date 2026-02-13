import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
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
  // Nuovo (Base44 style): date + time
  const d = typeof body?.date === "string" ? body.date.trim() : "";
  const t = typeof body?.time === "string" ? body.time.trim() : "";

  if (d && t) return { date: d.slice(0, 10), time: t.slice(0, 5) };

  // Vecchio: start_at (datetime-local o ISO)
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

  // fallback: adesso
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 16),
  };
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

export async function GET(req: Request) {
  const denied = guardAdmin(req);
  if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  // 1) tornei
  const { data, error } = await sb
    .from("tournaments")
    .select("id,name,type,category,date,time,location,max_participants,image_url,level,created_at,updated_at")
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tournaments = data ?? [];
  if (tournaments.length === 0) return NextResponse.json({ data: [] });

  // 2) counts (main/reserve/male/female) per tutti i tornei
  const ids = tournaments.map((t) => t.id);

  const { data: regs, error: rerr } = await sb
    .from("tournament_registrations")
    .select("tournament_id,is_reserve,p1_gender")
    .in("tournament_id", ids);

  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  const counts: Record<string, { main: number; reserve: number; male: number; female: number }> = {};
  for (const t of tournaments) counts[t.id] = { main: 0, reserve: 0, male: 0, female: 0 };

  for (const r of regs ?? []) {
    const c = counts[r.tournament_id];
    if (!c) continue;

    if (r.is_reserve) {
      c.reserve += 1;
    } else {
      c.main += 1;
      if (r.p1_gender === "M") c.male += 1;
      if (r.p1_gender === "F") c.female += 1;
    }
  }

  const out = tournaments.map((t) => ({
    ...t,
    counts: counts[t.id] ?? { main: 0, reserve: 0, male: 0, female: 0 },
  }));

  return NextResponse.json({ data: out });
}

export async function POST(req: Request) {
  const denied = guardAdmin(req);
if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!date || !time) {
    return NextResponse.json({ error: "Data e ora obbligatorie" }, { status: 400 });
  }

  const maxParticipants = parseMaxParticipants(body);
  if (!maxParticipants || maxParticipants < 1) {
    return NextResponse.json({ error: "Numero massimo partecipanti obbligatorio" }, { status: 400 });
  }

  const payload: any = {
    name,
    type,
    category,
    location: body?.location ? String(body.location).trim() : null,
    date,
    time,
    max_participants: maxParticipants,
    notes: body?.notes ? String(body.notes) : null,
    updated_at: new Date().toISOString(),
  };

  // opzionali (se colonna esiste)
  if (body?.image_url !== undefined) payload.image_url = body.image_url || null;
  if (body?.level !== undefined) payload.level = body.level || null;

  const sb = supabaseAdmin();
  const { data, error } = await sb.from("tournaments").insert(payload).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
