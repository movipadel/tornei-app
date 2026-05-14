import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const TARGETS = [
  "all",
  "moviback",
  "moviback_approved",
  "moviback_pending",
  "moviback_suspended",
  "staff",
];

function cleanString(v: unknown) {
  return String(v ?? "").trim();
}

function validDateOrNull(v: unknown) {
  const s = cleanString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const target = cleanString(body.target || "all");
  const title = cleanString(body.title);
  const bodyText = cleanString(body.body);
  const image_path = cleanString(body.image_path);
  const cta_label = cleanString(body.cta_label);
  const cta_url = cleanString(body.cta_url);
  const starts_at = validDateOrNull(body.starts_at) || new Date().toISOString();
  const ends_at = validDateOrNull(body.ends_at);
  const is_active = Boolean(body.is_active ?? true);

  if (!TARGETS.includes(target)) {
    return NextResponse.json({ error: "Target non valido" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "Titolo richiesto" }, { status: 400 });
  }

  if (!bodyText) {
    return NextResponse.json({ error: "Testo comunicazione richiesto" }, { status: 400 });
  }

  if (ends_at && new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
    return NextResponse.json(
      { error: "La data fine deve essere successiva alla data inizio" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("communications")
    .update({
      target,
      title,
      body: bodyText,
      image_path: image_path || null,
      cta_label: cta_label || null,
      cta_url: cta_url || null,
      starts_at,
      ends_at,
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const sb = supabaseAdmin();

  const { error } = await sb.from("communications").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}