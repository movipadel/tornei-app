import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("store_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? slugify(name)).trim();
  const sort_order = Number(body.sort_order ?? 0);
  const is_active = Boolean(body.is_active ?? true);

  if (!name) return NextResponse.json({ error: "Nome categoria richiesto" }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "Slug categoria richiesto" }, { status: 400 });

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("store_categories")
    .insert({ name, slug, sort_order, is_active })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}