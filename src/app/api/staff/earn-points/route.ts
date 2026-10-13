import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OperatorAccessDenied, requireOperatorPermission } from "@/lib/operatorAuthorization";

export const runtime = "nodejs";

const ALLOWED_CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreditResult = {
  ok: boolean;
  transaction_id: string;
  membership_id: string;
  base_points: number;
  membership_type_factor: number;
  applied_multiplier: number;
  credited_points: number;
  effective_incentive_source: "none" | "promo" | "agreement";
  promo_id: string | null;
  promo_type: "individual" | "global" | null;
  promo_title: string | null;
  promo_multiplier: number;
  agreement_id: string | null;
  agreement_name: string | null;
  entitlement_id: string | null;
  resulting_balance: number;
  club: string;
  event_at: string;
  created: boolean;
  replayed: boolean;
};

function creditErrorStatus(message: string) {
  if (message.includes("MEMBERSHIP_NOT_FOUND")) return 404;
  if (message.includes("IDEMPOTENCY_CONFLICT")) return 409;
  if (
    message.includes("MALFORMED_REQUEST") ||
    message.includes("CLUB_INVALID") ||
    message.includes("OPERATOR_INVALID") ||
    message.includes("MEMBERSHIP_CARDINALITY") ||
    message.includes("ACCOUNT_INACTIVE") ||
    message.includes("MEMBERSHIP_NOT_APPROVED") ||
    message.includes("TAX_CODE_INVALID") ||
    message.includes("CERTIFICATE_") ||
    message.includes("AMOUNT_TOO_LOW") ||
    message.includes("ENTITLEMENT_CARDINALITY")
  ) return 400;
  return 500;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  }

  let session;
  try {
    session = await requireOperatorPermission("scanner.manage");
  } catch (error) {
    if (!(error instanceof OperatorAccessDenied)) throw error;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session?.sid || !UUID_PATTERN.test(session.sid) || (session.role !== "admin" && session.role !== "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const membershipCode = String(body.membership_code ?? "").trim();
  const euroAmount = Number(body.euro_amount ?? 0);
  const club = String(body.club ?? "").trim().toUpperCase();
  const idempotencyKey = String(body.idempotency_key ?? "").trim();

  if (!membershipCode) return NextResponse.json({ error: "Codice tessera richiesto" }, { status: 400 });
  if (!Number.isFinite(euroAmount) || euroAmount <= 0) {
    return NextResponse.json({ error: "Importo non valido" }, { status: 400 });
  }
  if (!ALLOWED_CLUBS.includes(club)) {
    return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
  }
  if (!UUID_PATTERN.test(idempotencyKey)) {
    return NextResponse.json({ error: "Riferimento operazione non valido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().rpc("credit_moviback_points", {
    p_membership_code: membershipCode,
    p_euro_amount: euroAmount,
    p_club: club,
    p_idempotency_key: idempotencyKey,
    p_source_event_type: "staff_scan",
    p_source_event_id: idempotencyKey,
    p_operator_id: session.sid,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: creditErrorStatus(error.message) });
  }

  const result = data as CreditResult;
  return NextResponse.json({
    ok: true,
    transaction_id: result.transaction_id,
    membership_id: result.membership_id,
    points_added: result.credited_points,
    base_points: result.base_points,
    new_balance: result.resulting_balance,
    multiplier: result.membership_type_factor,
    promo_multiplier: result.promo_multiplier,
    promo_applied: result.effective_incentive_source === "promo",
    promo_type: result.promo_type,
    promo_id: result.promo_id,
    promo_title: result.promo_title,
    agreement_id: result.agreement_id,
    agreement_name: result.agreement_name,
    entitlement_id: result.entitlement_id,
    effective_multiplier: result.applied_multiplier,
    effective_incentive_source: result.effective_incentive_source,
    replayed: result.replayed,
    club: result.club,
  });
}
