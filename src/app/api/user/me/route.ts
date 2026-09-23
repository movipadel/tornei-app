import { NextResponse } from "next/server";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";

export const runtime = "nodejs";

export async function GET() {
  const identity = await getCurrentMoviUser();
  if (identity.conflict_state) {
    return NextResponse.json(
      { user: null, error: "SESSION_IDENTITY_CONFLICT", conflict_state: identity.conflict_state },
      { status: 409 }
    );
  }
  const state = identity.migration_state;
  const migration = identity.source === "legacy" ? {
    status: state === "review_required" ? "review_required" : state === "conflict" ? "conflict" : "available",
    activation_available: state === "legacy" || state === "activation_pending",
    message: state === "review_required"
      ? "Abbiamo trovato più profili associati ai tuoi dati. Li sistemiamo noi senza perdere punti, tornei o storico."
      : state === "conflict"
        ? "Il tuo profilo resta invariato. Contatta MOVI e lo sistemiamo."
        : "Userai email e password senza perdere nulla del tuo profilo.",
  } : identity.source === "auth" && identity.profile ? { status: "linked", activation_available: false } : null;
  return NextResponse.json({ user: identity.profile, migration });
}
