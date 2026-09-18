import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { guardStaff, getStaffSessionOrNull } from "@/lib/staffGuard";
import crypto from "crypto";
import { isUuid, mapMovibackRpcError } from "@/lib/movibackContracts";

export const runtime = "nodejs";

function stableDeliveryKey(actorId: string, redemptionId: string) {
  const hash = crypto
    .createHash("sha256")
    .update(`pf08b2c5:deliver:${actorId}:${redemptionId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "4";
  hash[16] = "8";
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

type Params = {
  params: Promise<{
    token: string;
  }>;
};

async function getOperator() {
  const adminDenied = await guardAdmin();

  if (!adminDenied) {
    const admin = await getStaffSessionOrNull();
    return {
      ok: true,
      handledBy: admin?.sid ?? null,
      role: "admin",
      denied: null,
    };
  }

  const staffDenied = await guardStaff();

  if (!staffDenied) {
    const staff = await getStaffSessionOrNull();

    return {
      ok: true,
      handledBy: staff?.sid ?? null,
      role: "staff",
      denied: null,
    };
  }

  return {
    ok: false,
    handledBy: null,
    role: null,
    denied: staffDenied,
  };
}

export async function POST(req: Request, { params }: Params) {
  const operator = await getOperator();

  if (!operator.ok) {
  return (
    operator.denied ??
    NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
  );
}

  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const { data: redemption, error: readErr } = await sb
    .from("reward_redemptions")
    .select("id,status,fulfillment_type")
    .eq("qr_token", token)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (!redemption) {
    return NextResponse.json({ error: "QR non valido" }, { status: 404 });
  }

  if (!operator.handledBy || !isUuid(operator.handledBy)) {
    return NextResponse.json({ error: "Operatore non valido" }, { status: 403 });
  }

  const suppliedKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (suppliedKey && !isUuid(suppliedKey)) {
    return NextResponse.json(
      { error: "Chiave operazione non valida", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 }
    );
  }

  const { data, error } = await sb.rpc("deliver_moviback_redemption", {
    p_actor_id: operator.handledBy,
    p_idempotency_key:
      suppliedKey || stableDeliveryKey(operator.handledBy, redemption.id),
    p_redemption_id: redemption.id,
  });

  if (error) {
    const mapped = mapMovibackRpcError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status }
    );
  }

  return NextResponse.json({
    ok: true,
    data,
  });
}
