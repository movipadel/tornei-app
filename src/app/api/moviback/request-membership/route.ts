import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { sendAdminPushNotification } from "@/lib/adminPush";
import { movibackEnrollmentRateLimitKeys } from "@/lib/movibackAgreementActivation";
import { hashMovibackAgreementCode, normalizeMovibackAgreementCode } from "@/lib/movibackAgreementCodes";
import { calendarDaysAfter } from "@/lib/movibackEligibility";
import { measureNotificationRequest, schedulePostCommitNotifications } from "@/lib/postCommitNotifications";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTelegramMessage } from "@/lib/telegram";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";
const BUCKET = "medical-certificates";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EnrollmentResult = {
  ok?: boolean;
  replayed?: boolean;
  error_code?: string;
  membership_id?: string;
  certificate_id?: string;
  agreement?: { name: string; multiplier: number; status: string } | null;
};

const failures: Record<string, { status: number; message: string }> = {
  INVALID_CODE: { status: 400, message: "Codice convenzione non valido." },
  CODE_ALREADY_USED: { status: 409, message: "Questo codice convenzione è già riservato o utilizzato." },
  CODE_EXPIRED: { status: 410, message: "Questo codice convenzione è scaduto." },
  CODE_REVOKED: { status: 410, message: "Questo codice convenzione non è più valido." },
  AGREEMENT_NOT_ACTIVE: { status: 409, message: "La convenzione non è attualmente attiva." },
  RESERVATION_CONFLICT: { status: 409, message: "Questa richiesta ha già un altro codice convenzione riservato." },
  MEMBERSHIP_EXISTS: { status: 409, message: "Richiesta MoviBack già presente." },
  MEMBERSHIP_CARDINALITY: { status: 409, message: "Più membership MoviBack richiedono una verifica Admin." },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "La richiesta è cambiata. Riprova l’invio." },
  USER_NOT_ELIGIBLE: { status: 403, message: "Account non idoneo alla richiesta MoviBack." },
  INVALID_REQUEST: { status: 400, message: "Dati della richiesta non validi." },
};

const taxCode = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();
const validType = (value: string): value is "ASC" | "FITP" => value === "ASC" || value === "FITP";
const validDate = (value: string) => calendarDaysAfter(value, value) === 0;
const safeName = (value: string) => String(value || "certificato").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);

export async function POST(request: Request) {
  return measureNotificationRequest("/api/moviback/request-membership", () => handle(request));
}

async function handle(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const userId = await getUserIdFromCookie();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Dati non validi" }, { status: 400 });

  const normalizedTaxCode = taxCode(String(form.get("tax_code") ?? ""));
  const membershipType = String(form.get("membership_type") ?? "");
  const expiryDate = String(form.get("expiry_date") ?? "");
  const file = form.get("certificate");
  const idempotencyKey = String(form.get("idempotency_key") ?? "").trim();
  const hasExisting = String(form.get("has_existing_membership") ?? "false") === "true";
  const existingType = String(form.get("existing_membership_type") ?? "");
  const existingNumber = String(form.get("existing_membership_number") ?? "").trim().toUpperCase();
  const rawCode = String(form.get("agreement_code") ?? "");
  const normalizedCode = normalizeMovibackAgreementCode(rawCode);

  if (normalizedTaxCode.length < 11 || normalizedTaxCode.length > 16) return NextResponse.json({ error: "Codice fiscale non valido" }, { status: 400 });
  if (!validType(membershipType)) return NextResponse.json({ error: "Tipo tessera non valido" }, { status: 400 });
  if (!UUID.test(idempotencyKey)) return NextResponse.json({ error: "Identificativo richiesta non valido" }, { status: 400 });
  if (rawCode.trim() && (!normalizedCode || normalizedCode.length > 64)) return NextResponse.json({ error: "Codice convenzione non valido.", code: "INVALID_CODE" }, { status: 400 });
  if (hasExisting && (!validType(existingType) || existingType !== membershipType)) {
    return NextResponse.json({ error: "Il tipo tessera dichiarato deve coincidere con la tessera selezionata" }, { status: 400 });
  }
  if (hasExisting && existingType === "FITP" && !existingNumber) return NextResponse.json({ error: "Numero tessera FITP obbligatorio" }, { status: 400 });
  if (!validDate(expiryDate)) return NextResponse.json({ error: "Data scadenza certificato obbligatoria" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Certificato medico obbligatorio" }, { status: 400 });
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "Formato certificato non valido. Usa PDF, JPG, PNG o WEBP." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "File troppo grande. Dimensione massima 8MB." }, { status: 400 });

  const sb = supabaseAdmin();
  if (normalizedCode) {
    try {
      const keys = movibackEnrollmentRateLimitKeys(request, userId);
      const limited = await sb.rpc("consume_legacy_login_rate_limit", { p_client_key: keys.clientKey, p_identity_key: keys.identityKey });
      if (limited.error) return NextResponse.json({ error: "Verifica del codice temporaneamente non disponibile." }, { status: 503 });
      const limit = (limited.data ?? {}) as { allowed?: boolean; retry_after_seconds?: number };
      if (!limit.allowed) {
        const retry = Math.max(1, Math.ceil(Number(limit.retry_after_seconds) || 900));
        return NextResponse.json({ error: "Troppi tentativi. Riprova più tardi." }, { status: 429, headers: { "Retry-After": String(retry) } });
      }
    } catch {
      return NextResponse.json({ error: "Verifica del codice temporaneamente non disponibile." }, { status: 503 });
    }
  }

  const filePath = `${userId}/enrollment-${idempotencyKey}-${safeName(file.name)}`;
  const uploaded = await sb.storage.from(BUCKET).upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  const duplicateUpload = Boolean(uploaded.error && /duplicate|already exists/i.test(uploaded.error.message));
  if (uploaded.error && !duplicateUpload) return NextResponse.json({ error: uploaded.error.message }, { status: 500 });

  const codeHash = normalizedCode ? hashMovibackAgreementCode(normalizedCode) : null;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({
    normalizedTaxCode, membershipType, expiryDate, hasExisting, existingType, existingNumber,
    filePath, fileSize: file.size, fileType: file.type, codeHash,
  })).digest("hex");
  const feePoints = hasExisting ? 0 : membershipType === "FITP" ? 15 : 0;
  const saved = await sb.rpc("submit_moviback_membership_request_c5", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_membership_code: `MOVI-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
    p_tax_code: normalizedTaxCode,
    p_membership_type: membershipType,
    p_fee_points: feePoints,
    p_fee_paid: hasExisting || feePoints === 0,
    p_has_existing_membership: hasExisting,
    p_existing_membership_type: hasExisting ? existingType : null,
    p_existing_membership_number: hasExisting && existingType === "FITP" ? existingNumber : null,
    p_certificate_file_path: filePath,
    p_certificate_expiry: expiryDate,
    p_code_hash: codeHash,
  });
  if (saved.error) {
    if (!duplicateUpload) await sb.storage.from(BUCKET).remove([filePath]);
    console.error("MoviBack C5 enrollment failed", saved.error.code);
    return NextResponse.json({ error: "Errore creazione richiesta MoviBack" }, { status: 500 });
  }
  const result = (saved.data ?? {}) as EnrollmentResult;
  if (!result.ok) {
    if (!duplicateUpload) await sb.storage.from(BUCKET).remove([filePath]);
    const failure = failures[String(result.error_code ?? "")] ?? { status: 500, message: "Errore creazione richiesta MoviBack" };
    return NextResponse.json({ error: failure.message, code: result.error_code }, { status: failure.status });
  }

  const [membership, certificate] = await Promise.all([
    sb.from("loyalty_memberships").select("id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,has_existing_membership,existing_membership_type,existing_membership_number,created_at").eq("id", result.membership_id!).single(),
    sb.from("medical_certificates").select("id,user_id,file_path,status,uploaded_at,expiry_date").eq("id", result.certificate_id!).single(),
  ]);
  if (membership.error || certificate.error) return NextResponse.json({ error: "Richiesta salvata; aggiorna la pagina." }, { status: 503 });

  if (!result.replayed) {
    schedulePostCommitNotifications("/api/moviback/request-membership", [
      {
        provider: "telegram",
        run: () => sendTelegramMessage(
          `🎁 RICHIESTA MOVIBACK\n\n👤 Utente ID: ${userId}\n🎫 Tessera: ${membershipType}\n📄 Certificato caricato${result.agreement ? `\n🏢 Convenzione in attesa: ${result.agreement.name}` : ""}`,
        ),
        failureLog: "MoviBack request Telegram notify error (ignored):",
      },
      {
        provider: "push",
        run: () => sendAdminPushNotification({ title: "🎁 Richiesta MoviBack", body: `Tessera ${membershipType} · certificato caricato`, url: "/admin/moviback/requests" }),
        failureLog: "MoviBack request admin push notify error (ignored):",
      },
    ]);
  }
  return NextResponse.json({ ok: true, replayed: Boolean(result.replayed), membership: membership.data, certificate: certificate.data, agreement: result.agreement ?? null });
}
