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
      ? "Il passaggio al nuovo accesso richiede una verifica manuale. Il tuo accesso attuale resta disponibile."
      : state === "conflict"
        ? "Il passaggio al nuovo accesso richiede assistenza."
        : "Nuovo accesso MOVI disponibile",
  } : identity.source === "auth" && identity.profile ? { status: "linked", activation_available: false } : null;
  return NextResponse.json({ user: identity.profile, migration });
}
