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

  const [userResult, membershipResult, certificateResult] = await Promise.all([
    sb
      .from("users")
      .select("id,full_name,phone,email,gender")
      .eq("id", uid)
      .single(),
    sb
      .from("loyalty_memberships")
      .select(
        "id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,approved_at,suspended_at,suspension_reason,rejection_reason,rejected_at,created_at,updated_at"
      )
      .eq("user_id", uid)
      .maybeSingle(),
    sb
      .from("medical_certificates")
      .select("id,file_path,status,uploaded_at,reviewed_at,expiry_date,notes")
      .eq("user_id", uid)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: user, error: userErr } = userResult;

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { data: membership, error: membershipErr } = membershipResult;

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  const { data: certificate, error: certErr } = certificateResult;

  let points = 0;
  let transactions: any[] = [];
  let redemptions: any[] = [];

  if (membership?.id) {
    const [transactionsResult, redemptionsResult] = await Promise.all([
      sb
        .from("loyalty_transactions")
        .select("id,type,source,euro_amount,points_delta,notes,created_at")
        .eq("membership_id", membership.id)
        .order("created_at", { ascending: false }),
      sb
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
        .limit(10),
    ]);

    const { data: txRows, error: txErr } = transactionsResult;

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    const allTransactions = txRows ?? [];
    transactions = allTransactions.slice(0, 20);
    points = allTransactions.reduce(
      (sum, row) => sum + Number(row.points_delta ?? 0),
      0
    );

    const { data: redemptionRows, error: redemptionErr } = redemptionsResult;

    if (redemptionErr) {
      return NextResponse.json({ error: redemptionErr.message }, { status: 500 });
    }

    redemptions = redemptionRows ?? [];
  }

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
