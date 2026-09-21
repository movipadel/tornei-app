import { NextResponse } from "next/server";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  const identity = await getCurrentMoviUser();
  if (identity.source !== "legacy" || !identity.public_user_id || identity.conflict_state) {
    return NextResponse.json({ error: "Sessione legacy valida richiesta" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin().rpc("start_user_auth_migration", {
    p_public_user_id: identity.public_user_id,
  });
  if (error) return NextResponse.json({ error: "Attivazione non disponibile" }, { status: 409 });
  const state = String((data as { state?: string } | null)?.state ?? "unavailable");
  if (state === "review_required" || state === "conflict") {
    return NextResponse.json({ status: state, activation_available: false });
  }
  return NextResponse.json({ status: state, activation_available: state === "activation_pending", redirect_to: "/attiva-account" });
}
