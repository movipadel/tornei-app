import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const club = searchParams.get("club");

  const sb = supabaseAdmin();

  let query = sb
    .from("store_orders")
    .select(`
      *,
      store_order_items (*)
    `)
    .order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (club && club !== "all") query = query.eq("pickup_club", club);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const redemptionIds = Array.from(
    new Set(
      (data ?? [])
        .map((order) => order.related_redemption_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const redemptionById = new Map<
    string,
    { id: string; status: string; fulfillment_type: string | null }
  >();

  if (redemptionIds.length > 0) {
    const { data: redemptions, error: redemptionError } = await sb
      .from("reward_redemptions")
      .select("id,status,fulfillment_type")
      .in("id", redemptionIds);

    if (redemptionError) {
      return NextResponse.json({ error: redemptionError.message }, { status: 500 });
    }

    for (const redemption of redemptions ?? []) {
      redemptionById.set(redemption.id, redemption);
    }
  }

  return NextResponse.json({
    data: (data ?? []).map((order) => ({
      ...order,
      reward_redemption: order.related_redemption_id
        ? redemptionById.get(order.related_redemption_id) ?? null
        : null,
    })),
  });
}
