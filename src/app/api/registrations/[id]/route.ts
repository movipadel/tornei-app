import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

function phoneMatches(input: string, stored: string) {
  const a = normalizePhone(input);
  const b = normalizePhone(stored);
  if (!a || !b) return false;

  // stile Base44: match anche parziale (includes)
  return a.includes(b) || b.includes(a);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  // 1) carico record
  const { data: reg, error: rerr } = await sb
    .from("tournament_registrations")
    .select("id,p1_phone,p2_phone")
    .eq("id", id)
    .single();

  if (rerr || !reg) {
    return NextResponse.json({ error: rerr?.message ?? "Iscrizione non trovata" }, { status: 404 });
  }

  // 2) verifico autorizzazione via telefono
  const ok =
    phoneMatches(phone, reg.p1_phone) ||
    (reg.p2_phone ? phoneMatches(phone, reg.p2_phone) : false);

  if (!ok) {
    return NextResponse.json({ error: "Telefono non autorizzato" }, { status: 403 });
  }

  // 3) cancello
  const { error: derr } = await sb
    .from("tournament_registrations")
    .delete()
    .eq("id", id);

  if (derr) {
    return NextResponse.json({ error: derr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
