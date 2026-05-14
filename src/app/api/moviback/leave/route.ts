import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function POST() {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id,status")
    .eq("user_id", uid)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: "MoviBack non attivo" }, { status: 404 });
  }

  if (membership.status === "suspended") {
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await sb
    .from("loyalty_memberships")
    .update({
      status: "suspended",
      suspended_at: now,
      suspension_reason: "Uscita volontaria utente",
      updated_at: now,
    })
    .eq("id", membership.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await sb
    .from("reward_redemptions")
    .update({
      status: "cancelled",
      cancelled_at: now,
      notes: "Annullato per uscita volontaria da MoviBack",
    })
    .eq("membership_id", membership.id)
    .eq("status", "requested");

  return NextResponse.json({ ok: true });
}