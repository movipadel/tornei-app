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
    .select("id,status,suspension_reason")
    .eq("user_id", uid)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: "MoviBack non trovato" }, { status: 404 });
  }

  if (membership.status !== "suspended") {
    return NextResponse.json({ error: "MoviBack non sospeso" }, { status: 400 });
  }

  if (membership.suspension_reason !== "Uscita volontaria utente") {
    return NextResponse.json(
      { error: "Riattivazione automatica non consentita. Contatta la segreteria." },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("loyalty_memberships")
    .update({
      status: "approved",
      suspended_at: null,
      suspension_reason: null,
      updated_at: now,
    })
    .eq("id", membership.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}