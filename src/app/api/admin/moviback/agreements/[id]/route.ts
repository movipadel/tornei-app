import { NextResponse } from "next/server";
import { requireOperatorPermission, OperatorAccessDenied } from "@/lib/operatorAuthorization";
import { parseAgreementInput, safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function auth() { try { return await requireOperatorPermission("moviback.manage"); } catch (error) { return NextResponse.json({ error: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? "Authentication required" : "Forbidden" }, { status: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? 401 : 403 }); } }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await auth(); if (operator instanceof NextResponse) return operator;
  const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: "Convenzione non valida" }, { status: 400 });
  const sb = supabaseAdmin();
  const [agreement, codes, batches, entitlements, audit] = await Promise.all([
    sb.from("moviback_agreements").select("*").eq("id", id).maybeSingle(),
    sb.from("moviback_agreement_codes").select("id,code_suffix,batch_id,status,valid_from,valid_until,claimed_at,claimed_by_membership_id,revoked_at,created_at").eq("agreement_id", id).order("created_at", { ascending: false }).limit(500),
    sb.from("moviback_agreement_code_batches").select("id,quantity,valid_from,valid_until,generated_by,created_at").eq("agreement_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("moviback_agreement_entitlements").select("id,membership_id,status,activation_source,effective_from,effective_until,revoked_at,revocation_reason,created_at").eq("agreement_id", id).order("created_at", { ascending: false }).limit(200),
    sb.from("moviback_agreement_audit_events").select("id,event_type,actor_staff_id,reason,created_at").eq("agreement_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const error = agreement.error || codes.error || batches.error || entitlements.error || audit.error;
  if (error) return NextResponse.json({ error: safeDatabaseError(error) }, { status: 500 });
  if (!agreement.data) return NextResponse.json({ error: "Convenzione non trovata" }, { status: 404 });
  return NextResponse.json({ data: { agreement: agreement.data, codes: codes.data ?? [], batches: batches.data ?? [], entitlements: entitlements.data ?? [], audit_events: audit.data ?? [] } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await auth(); if (operator instanceof NextResponse) return operator;
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const { id } = await params; if (!UUID.test(id)) return NextResponse.json({ error: "Convenzione non valida" }, { status: 400 });
  try {
    const input = parseAgreementInput(await request.json());
    const { data, error } = await supabaseAdmin().rpc("update_moviback_agreement", { p_agreement_id: id, p_name: input.name, p_slug: input.slug, p_status: input.status, p_multiplier: input.multiplier, p_valid_from: input.validFrom, p_valid_until: input.validUntil, p_actor_staff_id: operator.sid });
    if (error) return NextResponse.json({ error: safeDatabaseError(error) }, { status: error.code === "23505" || error.code === "23514" ? 409 : 400 });
    return NextResponse.json({ ok: true, data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dati non validi" }, { status: 400 }); }
}
