import { NextResponse } from "next/server";

import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyReviewError, reviewMovibackMembershipCompatible } from "@/lib/movibackReviewCompatibility";

export const runtime = "nodejs";

type PendingRow = Record<string, unknown> & { id: string; user_id: string | null };
type CertificateRow = { id: string; user_id: string; status: string; expiry_date: string | null; file_path: string | null; uploaded_at: string };
type ConventionRow = {
  membership_id: string;
  status: string;
  not_activation_reason: string | null;
  agreement: { name: string; multiplier: number } | { name: string; multiplier: number }[] | null;
  code: { code_suffix: string; status: string } | { code_suffix: string; status: string }[] | null;
};

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  const sb = supabaseAdmin();
  const memberships = await sb.from("loyalty_memberships").select(`
    id,user_id,membership_code,membership_type,has_existing_membership,
    existing_membership_type,existing_membership_number,fee_points,fee_paid,created_at,status,
    users(full_name,phone)
  `).eq("status", "pending_review").order("created_at", { ascending: true });
  if (memberships.error) return NextResponse.json({ error: memberships.error.message }, { status: 500 });

  const rows = (memberships.data ?? []) as PendingRow[];
  const userIds = [...new Set(rows.map((row) => String(row.user_id ?? "")).filter(Boolean))];
  const membershipIds = rows.map((row) => row.id);
  const certificateByUser = new Map<string, Omit<CertificateRow, "user_id">>();
  const conventionByMembership = new Map<string, ConventionRow>();

  if (userIds.length) {
    const certificates = await sb.from("medical_certificates")
      .select("id,user_id,status,expiry_date,file_path,uploaded_at")
      .in("user_id", userIds).order("uploaded_at", { ascending: false });
    if (certificates.error) return NextResponse.json({ error: certificates.error.message }, { status: 500 });
    for (const cert of (certificates.data ?? []) as CertificateRow[]) {
      if (!["pending_review", "approved"].includes(cert.status)) continue;
      if (!certificateByUser.has(cert.user_id) || (cert.status === "pending_review" && certificateByUser.get(cert.user_id)?.status !== "pending_review")) {
        const { user_id: _userId, ...publicCertificate } = cert;
        void _userId;
        certificateByUser.set(cert.user_id, publicCertificate);
      }
    }
  }
  if (membershipIds.length) {
    const conventions = await sb.from("moviback_agreement_entitlements")
      .select("membership_id,status,not_activation_reason,agreement:moviback_agreements(name,multiplier),code:moviback_agreement_codes(code_suffix,status)")
      .in("membership_id", membershipIds).in("status", ["pending", "not_activated"])
      .order("created_at", { ascending: false });
    if (conventions.error) return NextResponse.json({ error: conventions.error.message }, { status: 500 });
    for (const convention of (conventions.data ?? []) as ConventionRow[]) {
      if (!conventionByMembership.has(convention.membership_id)) conventionByMembership.set(convention.membership_id, convention);
    }
  }
  const enriched: PendingRow[] = rows.map((row) => ({
    ...row,
    membership_id: row.id,
    certificate_id: certificateByUser.get(String(row.user_id ?? ""))?.id ?? null,
    queue_kind: "membership_review",
    certificate: certificateByUser.get(String(row.user_id ?? "")) ?? null,
    pending_convention: conventionByMembership.get(row.id) ?? null,
  }));

  const pendingCertificates = await sb.from("medical_certificates")
    .select("id,user_id,status,expiry_date,file_path,uploaded_at")
    .eq("status", "pending_review").order("uploaded_at", { ascending: false });
  if (pendingCertificates.error) return NextResponse.json({ error: pendingCertificates.error.message }, { status: 500 });
  const existingUsers = new Set(rows.map((row) => String(row.user_id ?? "")));
  const replacementUserIds = [...new Set((pendingCertificates.data ?? []).map((item) => item.user_id).filter((id) => !existingUsers.has(id)))];
  if (replacementUserIds.length) {
    const replacements = await sb.from("loyalty_memberships")
      .select("id,user_id,membership_code,membership_type,has_existing_membership,existing_membership_type,existing_membership_number,fee_points,fee_paid,created_at,status,users(full_name,phone)")
      .in("user_id", replacementUserIds);
    if (replacements.error) return NextResponse.json({ error: replacements.error.message }, { status: 500 });
    const latest = new Map<string, Record<string, unknown>>();
    for (const cert of pendingCertificates.data ?? []) if (!latest.has(cert.user_id)) latest.set(cert.user_id, cert);
    for (const membership of replacements.data ?? []) {
      if (membership.status !== "approved") continue;
      const certificate = latest.get(membership.user_id) as CertificateRow | undefined;
      if (!certificate) continue;
      enriched.push({ ...membership, membership_id: membership.id, certificate_id: certificate.id,
        queue_kind: "certificate_review", certificate, pending_convention: null } as PendingRow);
    }
  }
  return NextResponse.json({ data: enriched });
}

const reviewErrors: Record<string, { status: number; message: string }> = {
  INVALID_ACTION: { status: 400, message: "Azione non valida" },
  OPERATOR_INVALID: { status: 403, message: "Operatore non autorizzato" },
  MEMBERSHIP_NOT_FOUND: { status: 404, message: "Richiesta non trovata" },
  MEMBERSHIP_NOT_REVIEWABLE: { status: 409, message: "La richiesta non è più in revisione" },
  CERTIFICATE_MISSING: { status: 400, message: "Certificato medico non presente" },
  CERTIFICATE_NOT_ELIGIBLE: { status: 400, message: "Il certificato non consente l’approvazione MoviBack" },
  MEMBERSHIP_NOT_ELIGIBLE: { status: 400, message: "La membership non è idonea all’approvazione" },
  REJECTION_REASON_REQUIRED: { status: 400, message: "Motivo rifiuto obbligatorio" },
  CERTIFICATE_MEMBERSHIP_MISMATCH: { status: 409, message: "Il certificato non appartiene alla membership" },
  CERTIFICATE_NOT_PENDING: { status: 409, message: "Il certificato non è più in revisione" },
  CERTIFICATE_NOT_REVIEWABLE: { status: 409, message: "Il certificato non è più disponibile per la revisione" },
  CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED: { status: 409, message: "Certificato scaduto: richiedere un nuovo certificato" },
};

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const certificateId = String(body.certificate_id ?? "");
  const queueKind = String(body.queue_kind ?? "");
  const action = String(body.action ?? "");
  if (!id || !certificateId || !["membership_review", "certificate_review"].includes(queueKind) || !["approve", "reject"].includes(action)) return NextResponse.json({ error: "Dati mancanti o non validi" }, { status: 400 });

  const sb = supabaseAdmin();
  const certificate = await sb.from("loyalty_memberships").select("user_id,status").eq("id", id).maybeSingle();
  if (certificate.error || !certificate.data) return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
  if ((queueKind === "membership_review" && certificate.data.status !== "pending_review") ||
      (queueKind === "certificate_review" && certificate.data.status !== "approved")) {
    return NextResponse.json({ error: "La richiesta non è più in revisione" }, { status: 409 });
  }
  const latest = await sb.from("medical_certificates").select("id,file_path,user_id,status")
    .eq("id", certificateId).maybeSingle();
  if (latest.error || !latest.data?.file_path || latest.data.user_id !== certificate.data.user_id ||
      (queueKind === "certificate_review" && latest.data.status !== "pending_review") ||
      (queueKind === "membership_review" && !["pending_review", "approved"].includes(latest.data.status)))
    return NextResponse.json({ error: "Certificato non più disponibile per la revisione" }, { status: 409 });
  if (action === "approve") {
    const signed = await sb.storage.from("medical-certificates").createSignedUrl(latest.data.file_path, 60);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });
  }
  const session = await getStaffSessionFromCookie();
  if (queueKind === "membership_review") {
    const outcome = await reviewMovibackMembershipCompatible(sb, {
      membershipId: id, certificateId, userId: certificate.data.user_id,
      action: action as "approve" | "reject",
      rejectionReason: action === "reject" ? String(body.rejection_reason ?? "") : null,
      certificateNote: String(body.certificate_note ?? ""), actorStaffId: session!.sid,
    });
    if (outcome.kind === "SUCCESS") return NextResponse.json({ ok: true, ...outcome.data });
    if (outcome.kind === "RPC_NOT_INSTALLED") return NextResponse.json({ error: "Revisione temporaneamente non disponibile" }, { status: 503 });
    if (outcome.kind === "AUTHORIZATION_FAILED") return NextResponse.json({ error: "Operatore non autorizzato" }, { status: 403 });
    if (outcome.kind === "BUSINESS_RULE_REJECTED") {
      const failure = reviewErrors[String(outcome.code ?? "")] ?? { status: 409, message: "Revisione non disponibile" };
      return NextResponse.json({ error: failure.message, code: outcome.code }, { status: failure.status });
    }
    console.error("MoviBack membership review failed", outcome.code);
    return NextResponse.json({ error: "Errore durante la revisione MoviBack" }, { status: 500 });
  }
  const reviewed = await sb.rpc("review_moviback_certificate", {
      p_membership_id: id, p_certificate_id: certificateId, p_action: action,
      p_notes: String(body.rejection_reason ?? body.certificate_note ?? ""), p_actor_staff_id: session!.sid,
    });
  if (reviewed.error) {
    if (reviewed.error.code === "PGRST202") return NextResponse.json({ error: "Revisione certificati disponibile dopo l’aggiornamento del database" }, { status: 503 });
    if (classifyReviewError(reviewed.error) === "AUTHORIZATION_FAILED") return NextResponse.json({ error: "Operatore non autorizzato" }, { status: 403 });
    console.error("MoviBack certificate review failed", reviewed.error.code);
    return NextResponse.json({ error: "Errore durante la revisione MoviBack" }, { status: 500 });
  }
  const result = (reviewed.data ?? {}) as { ok?: boolean; error_code?: string; convention_status?: string; convention_reason?: string };
  if (!result.ok) {
    const failure = reviewErrors[String(result.error_code ?? "")] ?? { status: 500, message: "Errore durante la revisione MoviBack" };
    return NextResponse.json({ error: failure.message, code: result.error_code }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, ...result });
}
