import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("reward_point_ranges")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const label = String(body.label ?? "").trim();
  const min_points =
    body.min_points === "" || body.min_points === null || body.min_points === undefined
      ? null
      : Number(body.min_points);
  const max_points =
    body.max_points === "" || body.max_points === null || body.max_points === undefined
      ? null
      : Number(body.max_points);
  const sort_order = Number(body.sort_order ?? 0);
  const is_active = Boolean(body.is_active ?? true);

  if (!label) {
    return NextResponse.json({ error: "Nome fascia richiesto" }, { status: 400 });
  }

  if (min_points !== null && (!Number.isFinite(min_points) || min_points < 0)) {
    return NextResponse.json({ error: "Punti minimi non validi" }, { status: 400 });
  }

  if (max_points !== null && (!Number.isFinite(max_points) || max_points < 0)) {
    return NextResponse.json({ error: "Punti massimi non validi" }, { status: 400 });
  }

  if (min_points !== null && max_points !== null && min_points > max_points) {
    return NextResponse.json({ error: "Min punti deve essere minore di Max punti" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("reward_point_ranges")
    .insert({
      label,
      min_points,
      max_points,
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}