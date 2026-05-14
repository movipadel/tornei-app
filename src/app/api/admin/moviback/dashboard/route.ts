import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    membershipsRes,
    pendingRes,
    approvedRes,
    rewardsRes,
    transactionsRes,
    monthTransactionsRes,
    certificatesRes,
  ] = await Promise.all([
    sb.from("loyalty_memberships").select("id,status", { count: "exact", head: true }),
    sb.from("loyalty_memberships").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    sb.from("loyalty_memberships").select("id", { count: "exact", head: true }).eq("status", "approved"),
    sb.from("rewards_catalog").select("id,is_active,points_cost"),
    sb.from("loyalty_transactions").select("id,points_delta,euro_amount,club,type,created_at,notes,loyalty_memberships(membership_code,users(full_name,phone))").order("created_at", { ascending: false }).limit(20),
    sb.from("loyalty_transactions").select("points_delta,euro_amount,club,type,created_at").gte("created_at", monthStart.toISOString()),
    sb.from("medical_certificates").select("id,expiry_date,status,user_id"),
  ]);

  const firstError =
    membershipsRes.error ||
    pendingRes.error ||
    approvedRes.error ||
    rewardsRes.error ||
    transactionsRes.error ||
    monthTransactionsRes.error ||
    certificatesRes.error;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const rewards = rewardsRes.data || [];
  const allTx = transactionsRes.data || [];
  const monthTx = monthTransactionsRes.data || [];
  const certs = certificatesRes.data || [];

  const totalPointsBalance = allTx.reduce(
    (sum: number, tx: any) => sum + Number(tx.points_delta || 0),
    0
  );

  const monthEarnedPoints = monthTx
    .filter((tx: any) => tx.type === "earn")
    .reduce((sum: number, tx: any) => sum + Math.max(0, Number(tx.points_delta || 0)), 0);

  const monthEuroAmount = monthTx
    .filter((tx: any) => tx.type === "earn")
    .reduce((sum: number, tx: any) => sum + Number(tx.euro_amount || 0), 0);

  const byClub = CLUBS.map((club) => {
    const rows = monthTx.filter((tx: any) => tx.club === club && tx.type === "earn");

    return {
      club,
      points: rows.reduce((sum: number, tx: any) => sum + Math.max(0, Number(tx.points_delta || 0)), 0),
      euro: rows.reduce((sum: number, tx: any) => sum + Number(tx.euro_amount || 0), 0),
      count: rows.length,
    };
  });

  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);

  const expiringCertificates = certs.filter((c: any) => {
    if (!c.expiry_date) return false;
    const d = new Date(c.expiry_date);
    return d >= now && d <= in30;
  }).length;

  const expiredCertificates = certs.filter((c: any) => {
    if (!c.expiry_date) return false;
    return new Date(c.expiry_date) < now;
  }).length;

  return NextResponse.json({
    data: {
      kpi: {
        total_memberships: membershipsRes.count || 0,
        pending_requests: pendingRes.count || 0,
        approved_memberships: approvedRes.count || 0,
        total_points_balance: totalPointsBalance,
        month_earned_points: monthEarnedPoints,
        month_euro_amount: monthEuroAmount,
        active_rewards: rewards.filter((r: any) => r.is_active).length,
        hidden_rewards: rewards.filter((r: any) => !r.is_active).length,
      },
      clubs: byClub,
      latest_transactions: allTx,
      alerts: {
        expiring_certificates: expiringCertificates,
        expired_certificates: expiredCertificates,
      },
    },
  });
}