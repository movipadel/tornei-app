import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function cleanDate(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("store_promos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const discountPercent = Math.trunc(Number(body?.discount_percent ?? 0));

    if (!name) {
      return NextResponse.json({ error: "Nome promo obbligatorio" }, { status: 400 });
    }

    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json({ error: "Percentuale sconto non valida" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("store_promos")
      .insert({
        name,
        discount_percent: discountPercent,
        is_active: Boolean(body?.is_active ?? true),
        starts_at: cleanDate(body?.starts_at),
        ends_at: cleanDate(body?.ends_at),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore creazione promo" },
      { status: 500 }
    );
  }
}