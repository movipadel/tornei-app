import { NextResponse } from "next/server";
import { requireOperatorPermission, OperatorAccessDenied } from "@/lib/operatorAuthorization";
import { generateMovibackAgreementCodeBatch, MOVIBACK_CODE_BATCH_MAX } from "@/lib/movibackAgreementCodes";
import { safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let operator; try { operator = await requireOperatorPermission("moviback.manage"); } catch (error) { return NextResponse.json({ error: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? "Authentication required" : "Forbidden" }, { status: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? 401 : 403 }); }
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params; const body = await request.json().catch(() => ({})); const quantity = Number(body.quantity); const key = String(body.idempotency_key ?? "");
  if (!UUID.test(id) || !UUID.test(key) || !Number.isInteger(quantity) || quantity < 1 || quantity > MOVIBACK_CODE_BATCH_MAX) return NextResponse.json({ error: `Richiesta non valida. Massimo ${MOVIBACK_CODE_BATCH_MAX} codici.` }, { status: 400 });
  const validFrom = String(body.valid_from || new Date().toISOString()); const validUntil = String(body.valid_until || "") || null;
  if (!Number.isFinite(Date.parse(validFrom)) || (validUntil && (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= Date.parse(validFrom)))) return NextResponse.json({ error: "Validità codici non valida" }, { status: 400 });
  const generated = generateMovibackAgreementCodeBatch(quantity);
  const { data, error } = await supabaseAdmin().rpc("generate_moviback_agreement_code_batch", { p_agreement_id: id, p_idempotency_key: key, p_codes: generated.map(({ hash, suffix }) => ({ hash, suffix })), p_valid_from: validFrom, p_valid_until: validUntil, p_actor_staff_id: operator.sid });
  if (error) return NextResponse.json({ error: safeDatabaseError(error) }, { status: 409 });
  const result = data as { created: boolean; batch_id: string; quantity: number; plaintext_recoverable: boolean };
  if (!result.created) return NextResponse.json({ ok: true, data: result, warning: "Batch già creato. I codici completi non possono essere recuperati." });
  return NextResponse.json({ ok: true, data: { ...result, codes: generated.map(({ code }) => code) } }, { status: 201 });
}
