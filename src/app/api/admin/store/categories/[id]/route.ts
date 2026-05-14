import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? slugify(name)).trim();
  const sort_order = Number(body.sort_order ?? 0);
  const is_active = Boolean(body.is_active);

  if (!id) return NextResponse.json({ error: "ID categoria mancante" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nome categoria richiesto" }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "Slug categoria richiesto" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("store_categories")
    .update({
      name,
      slug,
      sort_order,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) return NextResponse.json({ error: "ID categoria mancante" }, { status: 400 });

  const sb = supabaseAdmin();

  const { error } = await sb.from("store_categories").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}