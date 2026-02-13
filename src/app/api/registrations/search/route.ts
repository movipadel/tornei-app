import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ""));

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  // Cerchiamo per match parziale (come Base44: includes)
  // Nota: usiamo ilike su entrambi i telefoni
  const pattern = `%${phone}%`;

  const { data, error } = await sb
    .from("tournament_registrations")
    .select("id,tournament_id,is_reserve,p1_name,p1_phone,p2_name,p2_phone,created_at")
    .or(`p1_phone.ilike.${pattern},p2_phone.ilike.${pattern}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
