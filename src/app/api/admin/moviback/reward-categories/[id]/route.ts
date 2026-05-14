import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const sort_order = Number(body.sort_order ?? 0);
  const is_active = Boolean(body.is_active ?? true);

  if (!name) {
    return NextResponse.json({ error: "Nome categoria richiesto" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("reward_categories")
    .update({
      name,
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const sb = supabaseAdmin();

  const { error } = await sb.from("reward_categories").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}