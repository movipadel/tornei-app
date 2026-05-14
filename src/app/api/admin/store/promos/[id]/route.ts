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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;

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
      .update({
        name,
        discount_percent: discountPercent,
        is_active: Boolean(body?.is_active),
        starts_at: cleanDate(body?.starts_at),
        ends_at: cleanDate(body?.ends_at),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore aggiornamento promo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { error } = await sb.from("store_promos").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}