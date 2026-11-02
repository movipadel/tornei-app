import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mediaConsentRpcMissing } from "@/lib/mediaConsentCompatibility";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status ?? "");
  const source = String(body.source ?? "");
  const note = String(body.notes ?? "").trim();
  const evidence = String(body.evidence_reference ?? "").trim();
  if (!["granted", "not_granted", "revoked"].includes(status) || !["admin_assisted", "paper_import"].includes(source))
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  if (status === "granted" && (body.confirmed !== true || (!note && !evidence)))
    return NextResponse.json({ error: "Conferma ed evidenza del consenso obbligatorie" }, { status: 400 });
  if (status === "revoked" && !note) return NextResponse.json({ error: "Motivo della revoca obbligatorio" }, { status: 400 });
  const session = await getStaffSessionFromCookie();
  const result = await supabaseAdmin().rpc("record_user_media_consent", {
    p_user_id: id, p_status: status, p_source: source, p_actor_user_id: null,
    p_actor_staff_id: session!.sid, p_policy_version: "v1", p_evidence_reference: evidence || null, p_notes: note || null,
  });
  if (mediaConsentRpcMissing(result.error, "record_user_media_consent"))
    return NextResponse.json({ error: "Consenso media disponibile dopo l’aggiornamento del database" }, { status: 503 });
  if (result.error) return NextResponse.json({ error: result.error.message.includes("ADULT_CONFIRMATION_REQUIRED")
    ? "Conferma 18+ mancante: impossibile concedere il consenso" : "Consenso non registrato" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
