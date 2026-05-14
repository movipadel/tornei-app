import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({
      user: null,
      membership: null,
      certificate: null,
      points: 0,
      transactions: [],
      redemptions: [],
    });
  }

  const sb = supabaseAdmin();

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id,full_name,phone,email,gender")
    .eq("id", uid)
    .single();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select(
  "id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,approved_at,suspended_at,suspension_reason,rejection_reason,rejected_at,created_at,updated_at"
)
    .eq("user_id", uid)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  let points = 0;
  let transactions: any[] = [];
  let redemptions: any[] = [];

  if (membership?.id) {
    const { data: txRows, error: txErr } = await sb
      .from("loyalty_transactions")
      .select("id,type,source,euro_amount,points_delta,notes,created_at")
      .eq("membership_id", membership.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    transactions = txRows ?? [];
    points = transactions.reduce(
      (sum, row) => sum + Number(row.points_delta ?? 0),
      0
    );

    const { data: allTxRows, error: allTxErr } = await sb
      .from("loyalty_transactions")
      .select("points_delta")
      .eq("membership_id", membership.id);

    if (allTxErr) {
      return NextResponse.json({ error: allTxErr.message }, { status: 500 });
    }

    points = (allTxRows ?? []).reduce(
      (sum, row) => sum + Number(row.points_delta ?? 0),
      0
    );

    const { data: redemptionRows, error: redemptionErr } = await sb
  .from("reward_redemptions")
  .select(
    `
    id,
    points_cost,
    status,
    qr_token,
    requested_at,
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
  `
  )
  .eq("membership_id", membership.id)
  .order("requested_at", { ascending: false })
  .limit(10);

    if (redemptionErr) {
      return NextResponse.json({ error: redemptionErr.message }, { status: 500 });
    }

    redemptions = redemptionRows ?? [];
  }

  const { data: certificate, error: certErr } = await sb
    .from("medical_certificates")
    .select("id,file_path,status,uploaded_at,reviewed_at,expiry_date,notes")
    .eq("user_id", uid)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (certErr) {
    return NextResponse.json({ error: certErr.message }, { status: 500 });
  }

  return NextResponse.json({
    user,
    membership,
    certificate,
    points,
    transactions,
    redemptions,
  });
}