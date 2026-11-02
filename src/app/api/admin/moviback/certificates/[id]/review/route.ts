import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyReviewError } from "@/lib/movibackReviewCompatibility";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const notes = String(body.notes ?? "").trim();
  if (!id || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Revisione non valida" }, { status: 400 });
  if (action === "reject" && !notes) return NextResponse.json({ error: "Motivo del rifiuto obbligatorio" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: certificate, error: readError } = await sb.from("medical_certificates").select("id,user_id,file_path,status").eq("id", id).maybeSingle();
  if (readError || !certificate) return NextResponse.json({ error: "Certificato non trovato" }, { status: 404 });
  if (certificate.status !== "pending_review") return NextResponse.json({ error: "Il certificato non è più in revisione" }, { status: 409 });
  if (!certificate.file_path) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });
  const signed = await sb.storage.from("medical-certificates").createSignedUrl(certificate.file_path, 60);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });

  const session = await getStaffSessionFromCookie();
  const membershipId = String(body.membership_id ?? "");
  const membership = await sb.from("loyalty_memberships").select("id,user_id,status").eq("id", membershipId).maybeSingle();
  if (membership.error || !membership.data || membership.data.user_id !== certificate.user_id)
    return NextResponse.json({ error: "Membership non corrispondente" }, { status: 409 });
  const { data, error } = await sb.rpc("review_moviback_certificate", {
    p_membership_id: membershipId, p_certificate_id: id, p_action: action,
    p_notes: notes, p_actor_staff_id: session!.sid,
  });
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Revisione certificati disponibile dopo l’aggiornamento del database" }, { status: 503 });
  if (error && classifyReviewError(error) === "AUTHORIZATION_FAILED") return NextResponse.json({ error: "Operatore non autorizzato" }, { status: 403 });
  if (error) return NextResponse.json({ error: "Errore durante la revisione del certificato" }, { status: 500 });
  if (!data?.ok) {
    const code = String(data?.error_code ?? "REVIEW_FAILED");
    return NextResponse.json({ error: code === "CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED"
      ? "Certificato scaduto: richiedere un nuovo certificato" : "Revisione non disponibile", code }, { status: 409 });
  }
  return NextResponse.json({ ok: true, data });
}
