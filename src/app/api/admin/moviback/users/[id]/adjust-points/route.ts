import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const points = Number(body.points_delta ?? 0);
  const notes = String(body.notes ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "ID membership mancante" }, { status: 400 });
  }

  if (!Number.isFinite(points) || points === 0) {
    return NextResponse.json({ error: "Inserisci un valore punti diverso da zero" }, { status: 400 });
  }

  if (!notes) {
    return NextResponse.json({ error: "Nota obbligatoria" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id")
    .eq("id", id)
    .single();

  if (membershipErr || !membership) {
    return NextResponse.json(
      { error: membershipErr?.message || "Membership non trovata" },
      { status: 404 }
    );
  }

  const { data, error } = await sb
    .from("loyalty_transactions")
    .insert({
      membership_id: id,
      type: "adjustment",
      source: "manual_adjustment",
      euro_amount: null,
      points_delta: Math.trunc(points),
      notes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}