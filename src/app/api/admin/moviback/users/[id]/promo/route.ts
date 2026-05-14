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

  const multiplier = Number(body.multiplier ?? 0);
  const days = Number(body.days ?? 0);
  const notes = String(body.notes ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "ID membership mancante" }, { status: 400 });
  }

  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return NextResponse.json(
      { error: "Il moltiplicatore deve essere maggiore di 1" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(days) || days < 1) {
    return NextResponse.json(
      { error: "Durata promo non valida" },
      { status: 400 }
    );
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

  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + Math.trunc(days));

  await sb
    .from("loyalty_user_promos")
    .update({
      is_active: false,
      updated_at: now.toISOString(),
    })
    .eq("membership_id", id)
    .eq("is_active", true);

  const { data, error } = await sb
    .from("loyalty_user_promos")
    .insert({
      membership_id: id,
      multiplier,
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
      is_active: true,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID membership mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("loyalty_user_promos")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("membership_id", id)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}