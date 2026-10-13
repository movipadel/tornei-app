import { NextResponse } from "next/server";
import { requireOperatorPermission, OperatorAccessDenied } from "@/lib/operatorAuthorization";
import { parseAgreementInput, safeDatabaseError } from "@/lib/movibackAgreementAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function operatorOrResponse() {
  try { return await requireOperatorPermission("moviback.manage"); }
  catch (error) { return NextResponse.json({ error: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? "Authentication required" : "Forbidden" }, { status: error instanceof OperatorAccessDenied && error.code === "OPERATOR_REQUIRED" ? 401 : 403 }); }
}

export async function GET() {
  const operator = await operatorOrResponse(); if (operator instanceof NextResponse) return operator;
  const sb = supabaseAdmin();
  const [agreements, codes, entitlements, batches] = await Promise.all([
    sb.from("moviback_agreements").select("*").order("created_at", { ascending: false }),
    sb.from("moviback_agreement_codes").select("agreement_id,status"),
    sb.from("moviback_agreement_entitlements").select("agreement_id,status,revoked_at"),
    sb.from("moviback_agreement_code_batches").select("agreement_id"),
  ]);
  const error = agreements.error || codes.error || entitlements.error || batches.error;
  if (error) return NextResponse.json({ error: safeDatabaseError(error) }, { status: 500 });
  const data = (agreements.data ?? []).map((agreement) => {
    const agreementCodes = (codes.data ?? []).filter((row) => row.agreement_id === agreement.id);
    return {
      ...agreement,
      active_entitlements: (entitlements.data ?? []).filter((row) => row.agreement_id === agreement.id && row.status === "active" && !row.revoked_at).length,
      batches: (batches.data ?? []).filter((row) => row.agreement_id === agreement.id).length,
      code_counts: Object.fromEntries(["available", "reserved", "claimed", "used", "revoked", "expired"].map((status) => [status, agreementCodes.filter((row) => row.status === status).length])),
    };
  });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const operator = await operatorOrResponse(); if (operator instanceof NextResponse) return operator;
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  try {
    const input = parseAgreementInput(await request.json());
    const { data, error } = await supabaseAdmin().rpc("create_moviback_agreement", { p_name: input.name, p_slug: input.slug, p_status: input.status, p_multiplier: input.multiplier, p_valid_from: input.validFrom, p_valid_until: input.validUntil, p_actor_staff_id: operator.sid });
    if (error) return NextResponse.json({ error: safeDatabaseError(error) }, { status: error.code === "23505" || error.code === "23514" ? 409 : 400 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Dati non validi" }, { status: 400 }); }
}
