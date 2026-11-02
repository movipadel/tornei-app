import { NextResponse } from "next/server";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mediaConsentRpcMissing } from "@/lib/mediaConsentCompatibility";

export const runtime = "nodejs";

async function userId() {
  const identity = await getCurrentMoviUser();
  return identity.conflict_state ? null : identity.public_user_id;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Accedi per continuare" }, { status: 401 });
  const sb = supabaseAdmin();
  const [state, account] = await Promise.all([
    sb.rpc("current_user_media_consent", { p_user_id: id }),
    sb.from("users").select("age_confirmed_at").eq("id", id).single(),
  ]);
  if (account.error || (state.error && !mediaConsentRpcMissing(state.error, "current_user_media_consent")))
    return NextResponse.json({ error: "Consenso non disponibile" }, { status: 503 });
  if (mediaConsentRpcMissing(state.error, "current_user_media_consent"))
    return NextResponse.json({ data: { available: false, status: "not_collected", effective_at: null,
      source: null, adult_confirmed: Boolean(account.data?.age_confirmed_at) } });
  return NextResponse.json({ data: { status: state.data?.[0]?.status ?? "not_collected",
    available: true, effective_at: state.data?.[0]?.effective_at ?? null, source: state.data?.[0]?.source ?? null,
    adult_confirmed: Boolean(account.data?.age_confirmed_at) } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Accedi per continuare" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? "");
  if (!["granted", "not_granted", "revoked"].includes(status)) return NextResponse.json({ error: "Scelta non valida" }, { status: 400 });
  const result = await supabaseAdmin().rpc("record_user_media_consent", {
    p_user_id: id, p_status: status, p_source: "profile", p_actor_user_id: id,
    p_actor_staff_id: null, p_policy_version: "v1", p_evidence_reference: null, p_notes: null,
  });
  if (mediaConsentRpcMissing(result.error, "record_user_media_consent"))
    return NextResponse.json({ error: "Consenso media disponibile dopo l’aggiornamento del database" }, { status: 503 });
  if (result.error) return NextResponse.json({ error: result.error.message.includes("ADULT_CONFIRMATION_REQUIRED")
    ? "Per concedere il consenso devi prima confermare di avere almeno 18 anni." : "Consenso non registrato" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
