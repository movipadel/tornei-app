import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardStaff } from "@/lib/staffGuard";

export const runtime = "nodejs";

function availableActions(redemption: {
  status: string;
  fulfillment_type: string | null;
}) {
  if (!redemption.fulfillment_type) return ["manual_review"];
  if (redemption.status === "requested") return ["process", "cancel", "reject"];
  if (redemption.status === "processing") return ["ready", "cancel", "reject"];
  if (redemption.status === "ready") return ["deliver"];
  return [];
}

export async function GET() {
  const denied = await guardStaff();
  if (denied) return denied;

  const sb = supabaseAdmin();
  const { data: redemptions, error } = await sb
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
      cancelled_at,
      terminal_reason,
      notes,
      reward:rewards_catalog (
        id,
        name,
        description,
        image_path
      ),
      membership:loyalty_memberships (
        id,
        membership_code,
        user:users (
          id,
          full_name,
          phone,
          email
        )
      )
    `)
    .order("requested_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (redemptions ?? []).map((redemption) => redemption.id);
  const orderByRedemption = new Map<string, object>();

  if (ids.length > 0) {
    const { data, error: orderError } = await sb
      .from("store_orders")
      .select(`
        id,
        related_redemption_id,
        status,
        special_title,
        special_notes,
        created_at,
        confirmed_at,
        ordered_to_supplier_at,
        ready_at,
        delivered_at,
        store_order_items (
          id,
          product_name,
          color_name,
          size_label,
          custom_product_name,
          custom_variant,
          quantity
        )
      `)
      .eq("order_type", "reward_redemption")
      .in("related_redemption_id", ids);

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }
    for (const order of data ?? []) {
      if (order.related_redemption_id) {
        orderByRedemption.set(order.related_redemption_id, order);
      }
    }
  }

  return NextResponse.json({
    data: (redemptions ?? []).map((redemption) => ({
      ...redemption,
      qr_deliverable: redemption.status === "ready",
      available_actions: availableActions(redemption),
      store_fulfillment: orderByRedemption.get(redemption.id) ?? null,
      historical: redemption.fulfillment_type === null,
    })),
  });
}
