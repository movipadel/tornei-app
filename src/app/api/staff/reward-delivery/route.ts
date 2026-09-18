import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStaffSessionOrNull, guardStaff } from "@/lib/staffGuard";
import {
  isUuid,
  mapMovibackRpcError,
  normalizeManualRewardCode,
} from "@/lib/movibackContracts";

export const runtime = "nodejs";

type RewardCredential =
  | { kind: "qr_token"; value: string }
  | { kind: "manual_code"; value: string };

function stableDeliveryKey(actorId: string, redemptionId: string) {
  const hash = crypto
    .createHash("sha256")
    .update(`pf08b2c10:deliver:${actorId}:${redemptionId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "4";
  hash[16] = "8";
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function rewardCredential(input: unknown): RewardCredential | null {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value || value.length > 512) return null;

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "riscatto-premio" && parts[1]) {
      value = decodeURIComponent(parts[1]).trim();
    }
  } catch {
    // Raw QR tokens and manual codes are accepted below.
  }

  if (/^[0-9a-f]{48}$/i.test(value)) {
    return { kind: "qr_token", value: value.toLowerCase() };
  }

  const manualCode = normalizeManualRewardCode(value);
  return manualCode ? { kind: "manual_code", value: manualCode } : null;
}

async function loadRedemption(
  credential: RewardCredential,
  includeStoreFulfillment = true
) {
  const sb = supabaseAdmin();
  const { data: redemption, error } = await sb
    .from("reward_redemptions")
    .select(`
      id,
      status,
      fulfillment_type,
      points_cost,
      requested_at,
      processing_at,
      ready_at,
      delivered_at,
      terminal_reason,
      reward:rewards_catalog (
        id,
        name
      ),
      membership:loyalty_memberships (
        id,
        user:users (
          id,
          full_name
        )
      )
    `)
    .eq(credential.kind, credential.value)
    .maybeSingle();

  if (error) throw error;
  if (!redemption) return null;

  let storeFulfillment = null;
  if (includeStoreFulfillment) {
    const { data, error: orderError } = await sb
      .from("store_orders")
      .select(`
        id,
        status,
        store_order_items (
          product_name,
          color_name,
          size_label,
          custom_product_name,
          custom_variant,
          quantity
        )
      `)
      .eq("order_type", "reward_redemption")
      .eq("related_redemption_id", redemption.id)
      .maybeSingle();

    if (orderError) throw orderError;
    storeFulfillment = data;
  }

  return {
    ...redemption,
    deliverable: redemption.status === "ready",
    already_delivered: redemption.status === "delivered",
    requires_manual_review:
      redemption.fulfillment_type === null && redemption.status !== "delivered",
    store_fulfillment: storeFulfillment,
  };
}

export async function POST(req: Request) {
  const denied = await guardStaff();
  if (denied) return denied;

  const session = await getStaffSessionOrNull();
  if (!session || !isUuid(session.sid)) {
    return NextResponse.json(
      { error: "Operatore non valido", code: "INVALID_OPERATOR" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const action = body?.action === "deliver" ? "deliver" : "lookup";
  const credential = rewardCredential(body?.code);

  if (!credential) {
    return NextResponse.json(
      { error: "Codice premio non valido", code: "INVALID_REWARD_CODE" },
      { status: 400 }
    );
  }

  let redemption;
  try {
    redemption = await loadRedemption(credential);
  } catch (error) {
    console.error("Reward delivery lookup failed:", error);
    return NextResponse.json(
      { error: "Verifica premio non riuscita", code: "REWARD_LOOKUP_FAILED" },
      { status: 500 }
    );
  }

  if (!redemption) {
    return NextResponse.json(
      { error: "Codice premio non valido", code: "INVALID_REWARD_CODE" },
      { status: 404 }
    );
  }

  if (action === "lookup") {
    return NextResponse.json({ ok: true, data: redemption });
  }

  if (redemption.requires_manual_review) {
    return NextResponse.json(
      {
        error: "Richiesta storica da verificare manualmente",
        code: "PF08_LEGACY_FULFILLMENT_REQUIRES_ADMIN",
        data: redemption,
      },
      { status: 409 }
    );
  }

  if (["requested", "processing"].includes(redemption.status)) {
    return NextResponse.json(
      {
        error: "Premio non ancora pronto",
        code: "REWARD_NOT_READY",
        data: redemption,
      },
      { status: 409 }
    );
  }

  if (["cancelled", "rejected"].includes(redemption.status)) {
    return NextResponse.json(
      {
        error: "Codice premio non più utilizzabile",
        code: "REWARD_NOT_DELIVERABLE",
        data: redemption,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin().rpc(
    "deliver_moviback_redemption",
    {
      p_actor_id: session.sid,
      p_idempotency_key: stableDeliveryKey(session.sid, redemption.id),
      p_redemption_id: redemption.id,
    }
  );

  if (error || !data) {
    const mapped = mapMovibackRpcError(error);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code, data: redemption },
      { status: mapped.status }
    );
  }

  return NextResponse.json({
    ok: true,
    delivered: true,
    already_delivered: redemption.status === "delivered",
    data: {
      ...redemption,
      status: "delivered",
      deliverable: false,
      already_delivered: true,
    },
    delivery: data,
  });
}
