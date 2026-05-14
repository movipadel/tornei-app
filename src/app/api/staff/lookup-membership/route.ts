import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardStaff } from "@/lib/staffGuard";

export const runtime = "nodejs";

function isExpired(date?: string | null) {
  if (!date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${date}T00:00:00`);
  expiry.setHours(0, 0, 0, 0);

  return expiry < today;
}

export async function POST(req: Request) {
  const denied = await guardStaff();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const membershipCode = String(body.membership_code ?? "").trim();

  if (!membershipCode) {
    return NextResponse.json({ error: "Codice richiesto" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id,user_id,status,membership_code,membership_type,fee_points,fee_paid")
    .eq("membership_code", membershipCode)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: "Membership non trovata" }, { status: 404 });
  }

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id,full_name,phone,email")
    .eq("id", membership.user_id)
    .single();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { data: transactions, error: txErr } = await sb
    .from("loyalty_transactions")
    .select("points_delta")
    .eq("membership_id", membership.id);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const points = (transactions ?? []).reduce(
    (sum, t) => sum + Number(t.points_delta ?? 0),
    0
  );

  const { data: cert, error: certErr } = await sb
    .from("medical_certificates")
    .select("status,expiry_date,uploaded_at")
    .eq("user_id", membership.user_id)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (certErr) {
    return NextResponse.json({ error: certErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      membership_id: membership.id,
      membership_code: membership.membership_code,
      membership_type: membership.membership_type,
      membership_status: membership.status,
      fee_points: membership.fee_points,
      fee_paid: membership.fee_paid,

      full_name: user.full_name,
      phone: user.phone,
      email: user.email,

      points,

      certificate_status: cert?.status ?? "none",
      certificate_expiry_date: cert?.expiry_date ?? null,
      certificate_is_expired: isExpired(cert?.expiry_date),
    },
  });
}