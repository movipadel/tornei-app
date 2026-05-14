import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const SCHEDULE_TYPES = ["always", "time_window", "weekdays", "weekend"];
const TARGET_TYPES = ["all", "birthday", "gender", "age_range", "new_members"];

function parseDaysOfWeek(value: any) {
  if (!Array.isArray(value)) return null;

  const days = value
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7);

  return days.length > 0 ? [...new Set(days)] : null;
}

function cleanTime(value: any) {
  const s = String(value ?? "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("loyalty_global_promos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const title = String(body.title ?? "").trim();
  const multiplier = Number(body.multiplier ?? 0);
  const days = Number(body.days ?? 0);
  const notes = String(body.notes ?? "").trim();

  const scheduleType = String(body.schedule_type ?? "always").trim();
  const daysOfWeek = parseDaysOfWeek(body.days_of_week);
  const startTime = cleanTime(body.start_time);
  const endTime = cleanTime(body.end_time);

  const targetType = String(body.target_type ?? "all").trim();
  const targetGender = String(body.target_gender ?? "").trim() || null;
  const minAge =
    body.min_age === "" || body.min_age === null || body.min_age === undefined
      ? null
      : Number(body.min_age);
  const maxAge =
    body.max_age === "" || body.max_age === null || body.max_age === undefined
      ? null
      : Number(body.max_age);
  const newMemberDays =
    body.new_member_days === "" ||
    body.new_member_days === null ||
    body.new_member_days === undefined
      ? null
      : Number(body.new_member_days);

  if (!title) {
    return NextResponse.json({ error: "Titolo obbligatorio" }, { status: 400 });
  }

  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return NextResponse.json(
      { error: "Moltiplicatore non valido" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(days) || days < 1) {
    return NextResponse.json(
      { error: "Durata promo non valida" },
      { status: 400 }
    );
  }

  if (!SCHEDULE_TYPES.includes(scheduleType)) {
    return NextResponse.json(
      { error: "Tipo calendario non valido" },
      { status: 400 }
    );
  }

  if (scheduleType === "time_window" && (!startTime || !endTime)) {
    return NextResponse.json(
      { error: "Fascia oraria obbligatoria" },
      { status: 400 }
    );
  }

  if (scheduleType === "weekdays" && !daysOfWeek) {
    return NextResponse.json(
      { error: "Seleziona almeno un giorno della settimana" },
      { status: 400 }
    );
  }

  if (!TARGET_TYPES.includes(targetType)) {
    return NextResponse.json(
      { error: "Target promo non valido" },
      { status: 400 }
    );
  }

  if (targetType === "gender" && !["M", "F"].includes(String(targetGender))) {
    return NextResponse.json(
      { error: "Genere target non valido" },
      { status: 400 }
    );
  }

  if (
    targetType === "age_range" &&
    ((minAge !== null && (!Number.isFinite(minAge) || minAge < 0)) ||
      (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < 0)) ||
      (minAge === null && maxAge === null))
  ) {
    return NextResponse.json(
      { error: "Fascia età non valida" },
      { status: 400 }
    );
  }

  if (
    targetType === "age_range" &&
    minAge !== null &&
    maxAge !== null &&
    minAge > maxAge
  ) {
    return NextResponse.json(
      { error: "Età minima maggiore dell'età massima" },
      { status: 400 }
    );
  }

  if (
    targetType === "new_members" &&
    (!Number.isFinite(newMemberDays) || Number(newMemberDays) < 1)
  ) {
    return NextResponse.json(
      { error: "Periodo nuovi iscritti non valido" },
      { status: 400 }
    );
  }

  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + Math.trunc(days));

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("loyalty_global_promos")
    .insert({
      title,
      multiplier,
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
      is_active: true,
      notes: notes || null,

      schedule_type: scheduleType,
      days_of_week: scheduleType === "weekdays" ? daysOfWeek : null,
      start_time: scheduleType === "time_window" ? startTime : null,
      end_time: scheduleType === "time_window" ? endTime : null,

      target_type: targetType,
      target_gender: targetType === "gender" ? targetGender : null,
      min_age: targetType === "age_range" ? minAge : null,
      max_age: targetType === "age_range" ? maxAge : null,
      new_member_days: targetType === "new_members" ? newMemberDays : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}