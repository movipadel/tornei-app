import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = String(body.category ?? "").trim();
  const points_cost = Number(body.points_cost ?? 0);
  const image_path = String(body.image_path ?? "").trim();
  const stock_qty =
    body.stock_qty !== null && body.stock_qty !== undefined && body.stock_qty !== ""
      ? Number(body.stock_qty)
      : null;
  const is_active = Boolean(body.is_active);

  if (!id) {
    return NextResponse.json({ error: "ID premio mancante" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Nome premio richiesto" }, { status: 400 });
  }

  if (!Number.isFinite(points_cost) || points_cost <= 0) {
    return NextResponse.json({ error: "Costo punti non valido" }, { status: 400 });
  }

  if (stock_qty !== null && (!Number.isFinite(stock_qty) || stock_qty < 0)) {
    return NextResponse.json({ error: "Quantità non valida" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("rewards_catalog")
    .update({
      name,
      description: description || null,
      category: category || null,
      points_cost,
      image_path: image_path || null,
      stock_qty,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID premio mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("rewards_catalog")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}