import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { isQrDeliverable, publicQrToken } from "@/lib/movibackContracts";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ data: [] });
  }

  const { data, error } = await sb
    .from("reward_redemptions")
    .select(`
      id,
      status,
      fulfillment_type,
      points_cost,
      qr_token,
      requested_at,
      processing_at,
      ready_at,
      approved_at,
      delivered_at,
      cancelled_at,
      notes,
      reward:rewards_catalog (
        id,
        name,
        description,
        category,
        image_path,
        points_cost,
        reward_type
      )
    `)
    .eq("membership_id", membership.id)
    .order("requested_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const redemptions = (data ?? []).map((redemption) => ({
    ...redemption,
    qr_deliverable: isQrDeliverable(redemption.status),
    qr_token: publicQrToken(redemption.status, redemption.qr_token),
  }));

  return NextResponse.json({ data: redemptions });
}
