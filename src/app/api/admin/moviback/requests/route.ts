import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { computeMovibackEligibility } from "@/lib/movibackEligibility";

export const runtime = "nodejs";

type CertificateRow = {
  id: string;
  user_id: string;
  status: string;
  expiry_date: string | null;
  file_path: string | null;
  uploaded_at: string;
};

type CertificatePayload = Omit<CertificateRow, "user_id">;

type PendingMembershipRow = Record<string, unknown> & {
  user_id: string | null;
};

// 📥 LISTA richieste
export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("loyalty_memberships")
    .select(`
      id,
      user_id,
      membership_code,
      membership_type,
      has_existing_membership,
      existing_membership_type,
      existing_membership_number,
      fee_points,
      fee_paid,
      created_at,
      status,
      users (
        full_name,
        phone
      )
    `)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as PendingMembershipRow[];
  const userIds = Array.from(
    new Set(
      rows
        .map((row) => String(row.user_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const certificateByUserId = new Map<string, CertificatePayload>();

  if (userIds.length > 0) {
    const { data: certificates } = await sb
      .from("medical_certificates")
      .select("id,user_id,status,expiry_date,file_path,uploaded_at")
      .in("user_id", userIds)
      .order("uploaded_at", { ascending: false });

    for (const cert of (certificates ?? []) as CertificateRow[]) {
      if (certificateByUserId.has(cert.user_id)) continue;

      certificateByUserId.set(cert.user_id, {
        id: cert.id,
        status: cert.status,
        expiry_date: cert.expiry_date,
        file_path: cert.file_path,
        uploaded_at: cert.uploaded_at,
      });
    }
  }

  const enriched: any[] = rows.map((row) => ({
    ...row,
    certificate_only: false,
    certificate:
      certificateByUserId.get(String(row.user_id ?? "").trim()) ?? null,
  }));

  const pendingCertificates = await sb.from("medical_certificates").select("id,user_id,status,expiry_date,file_path,uploaded_at").eq("status", "pending_review").order("uploaded_at", { ascending: false });
  if (pendingCertificates.error) return NextResponse.json({ error: pendingCertificates.error.message }, { status: 500 });
  const existingUsers = new Set(rows.map((row) => String(row.user_id ?? "")));
  const replacementUserIds = Array.from(new Set((pendingCertificates.data ?? []).map((item) => item.user_id).filter((userId) => !existingUsers.has(userId))));
  if (replacementUserIds.length) {
    const replacementMemberships = await sb.from("loyalty_memberships").select("id,user_id,membership_code,membership_type,has_existing_membership,existing_membership_type,existing_membership_number,fee_points,fee_paid,created_at,status,users(full_name,phone)").in("user_id", replacementUserIds);
    if (replacementMemberships.error) return NextResponse.json({ error: replacementMemberships.error.message }, { status: 500 });
    const latestPending = new Map<string, any>();
    for (const certificate of pendingCertificates.data ?? []) if (!latestPending.has(certificate.user_id)) latestPending.set(certificate.user_id, certificate);
    for (const membership of replacementMemberships.data ?? []) enriched.push({ ...membership, certificate_only: true, certificate: latestPending.get(membership.user_id) ?? null });
  }

  return NextResponse.json({ data: enriched });
}

// ✅ AZIONI approva/rifiuta
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id, action, rejection_reason, certificate_note } = await req.json().catch(() => ({}));

  if (!id || !action) {
    return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
  }

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  if (action === "approve") {
    const { data: membership, error: readErr } = await sb
      .from("loyalty_memberships")
      .select("id,user_id,status,fee_points,fee_paid,membership_type,tax_code,health_data_consent_at")
      .eq("id", id)
      .single();

    if (readErr || !membership) {
      return NextResponse.json(
        { error: readErr?.message || "Richiesta non trovata" },
        { status: 404 }
      );
    }

    if (!["pending_review", "approved"].includes(membership.status)) {
      return NextResponse.json(
        { error: "La richiesta non è più in revisione" },
        { status: 400 }
      );
    }

    const { data: certificates, error: certificateReadError } = await sb
      .from("medical_certificates")
      .select("id,status,expiry_date,uploaded_at,file_path")
      .eq("user_id", membership.user_id)
      .order("uploaded_at", { ascending: false });
    if (certificateReadError) return NextResponse.json({ error: certificateReadError.message }, { status: 500 });
    const certificate = certificates?.[0];
    if (!certificate?.file_path) return NextResponse.json({ error: "Certificato medico non presente" }, { status: 400 });
    const signed = await sb.storage.from("medical-certificates").createSignedUrl(certificate.file_path, 60);
    if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "File del certificato non disponibile" }, { status: 400 });
    const session = await getStaffSessionFromCookie();
    const reviewTime = new Date().toISOString();
    const reviewed = await sb.from("medical_certificates").update({ status: "approved", reviewed_at: reviewTime, reviewed_by: session!.sid, notes: String(certificate_note ?? "").trim() || "Certificato approvato con la richiesta MoviBack" }).eq("id", certificate.id);
    if (reviewed.error) return NextResponse.json({ error: reviewed.error.message }, { status: 500 });
    if (membership.status === "approved") return NextResponse.json({ ok: true, certificate_only: true });
    const eligibility = computeMovibackEligibility({ memberships: [{ ...membership, status: "approved" }], certificates: (certificates ?? []).map((item, index) => index === 0 ? { ...item, status: "approved" } : item) });
    if (!["active", "grace_period"].includes(eligibility.eligibility_state)) return NextResponse.json({ error: eligibility.human_message, code: eligibility.reason_code }, { status: 400 });

    const feePoints = Number(membership.fee_points || 0);
    const shouldChargeFee = feePoints > 0 && !membership.fee_paid;

    // Scala i punti anche se il saldo va negativo.
    // Esempio: saldo 0, tessera FITP 15 punti => saldo -15.
    if (shouldChargeFee) {
      const { error: feeTxErr } = await sb.from("loyalty_transactions").insert({
        membership_id: membership.id,
        type: "redeem",
        source: "membership_fee",
        euro_amount: null,
        points_delta: -feePoints,
        notes: `Costo tessera ${membership.membership_type}: ${feePoints} punti`,
      });

      if (feeTxErr) {
        return NextResponse.json({ error: feeTxErr.message }, { status: 500 });
      }
    }

    const now = new Date().toISOString();

    const { error } = await sb
      .from("loyalty_memberships")
      .update({
        status: "approved",
        approved_at: now,
        approved_by: session!.sid,
        fee_paid: true,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "reject") {
  const rejectionReason = String(rejection_reason ?? "").trim();

  if (!rejectionReason) {
    return NextResponse.json(
      { error: "Motivo rifiuto obbligatorio" },
      { status: 400 }
    );
  }

  const { data: membership, error: readErr } = await sb
    .from("loyalty_memberships")
    .select("id,status,user_id")
    .eq("id", id)
    .single();

  if (readErr || !membership) {
    return NextResponse.json(
      { error: readErr?.message || "Richiesta non trovata" },
      { status: 404 }
    );
  }

  if (!["pending_review", "approved"].includes(membership.status)) {
    return NextResponse.json(
      { error: "La richiesta non è più in revisione" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { data: latestCertificate } = await sb.from("medical_certificates").select("id").eq("user_id", membership.user_id).order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
  if (latestCertificate?.id) {
    const session = await getStaffSessionFromCookie();
    const rejectedCertificate = await sb.from("medical_certificates").update({ status: "rejected", reviewed_at: now, reviewed_by: session!.sid, notes: rejectionReason }).eq("id", latestCertificate.id);
    if (rejectedCertificate.error) return NextResponse.json({ error: rejectedCertificate.error.message }, { status: 500 });
  }

  if (membership.status === "approved") return NextResponse.json({ ok: true, certificate_only: true });

  const { error } = await sb
    .from("loyalty_memberships")
    .update({
      status: "rejected",
      rejection_reason: rejectionReason,
      rejected_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

return NextResponse.json({ ok: true });
}
