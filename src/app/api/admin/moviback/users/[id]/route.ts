import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID membership mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select(`
      id,
      user_id,
      status,
      membership_code,
      tax_code,
      membership_type,
      fee_points,
      fee_paid,
      has_existing_membership,
      existing_membership_type,
      existing_membership_number,
      approved_at,
      suspended_at,
      suspension_reason,
      created_at,
      updated_at,
      users (
        id,
        full_name,
        phone,
        email,
        gender,
        created_at
      )
    `)
    .eq("id", id)
    .single();

  if (membershipErr || !membership) {
    return NextResponse.json(
      { error: membershipErr?.message || "Utente MoviBack non trovato" },
      { status: 404 }
    );
  }

  const { data: txRows, error: txErr } = await sb
    .from("loyalty_transactions")
    .select(`
      id,
      type,
      source,
      euro_amount,
      points_delta,
      club,
      notes,
      created_at
    `)
    .eq("membership_id", id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const pointsBalance = (txRows || []).reduce(
    (sum: number, tx: any) => sum + Number(tx.points_delta || 0),
    0
  );

  const { data: certificate, error: certErr } = await sb
    .from("medical_certificates")
    .select("id,file_path,status,uploaded_at,reviewed_at,expiry_date,notes")
    .eq("user_id", membership.user_id)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (certErr) {
    return NextResponse.json({ error: certErr.message }, { status: 500 });
  }

  const { data: redemptions, error: redemptionsErr } = await sb
    .from("reward_redemptions")
    .select(`
      id,
      points_cost,
      status,
      requested_at,
      approved_at,
      delivered_at,
      cancelled_at,
      notes,
      reward:rewards_catalog (
        id,
        name,
        category,
        image_path,
        points_cost
      )
    `)
    .eq("membership_id", id)
    .order("requested_at", { ascending: false })
    .limit(40);

  if (redemptionsErr) {
    return NextResponse.json({ error: redemptionsErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();

  const { data: promos, error: promosErr } = await sb
    .from("loyalty_user_promos")
    .select("*")
    .eq("membership_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (promosErr) {
    return NextResponse.json({ error: promosErr.message }, { status: 500 });
  }

  const activePromo =
    (promos || []).find(
      (p: any) =>
        p.is_active &&
        String(p.starts_at) <= now &&
        String(p.ends_at) >= now
    ) || null;

  return NextResponse.json({
    data: {
      membership,
      points_balance: pointsBalance,
      transactions: txRows || [],
      certificate: certificate || null,
      redemptions: redemptions || [],
      promos: promos || [],
      active_promo: activePromo,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID membership mancante" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();

  const { data: membership, error: readErr } = await sb
    .from("loyalty_memberships")
    .select("id,user_id")
    .eq("id", id)
    .single();

  if (readErr || !membership) {
    return NextResponse.json(
      { error: readErr?.message || "Utente MoviBack non trovato" },
      { status: 404 }
    );
  }

  const fullName = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  const gender = String(body.gender ?? "").trim();

  const taxCode = String(body.tax_code ?? "").trim().toUpperCase();
  const membershipType = String(body.membership_type ?? "").trim();
  const status = String(body.status ?? "").trim();
  const feePoints = Number(body.fee_points ?? 0);
  const feePaid = Boolean(body.fee_paid);

  const hasExistingMembership = Boolean(body.has_existing_membership);
  const existingMembershipType = String(body.existing_membership_type ?? "").trim();
  const existingMembershipNumber = String(body.existing_membership_number ?? "")
    .trim()
    .toUpperCase();

  if (!fullName) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  }

  if (gender && !["M", "F"].includes(gender)) {
    return NextResponse.json({ error: "Genere non valido" }, { status: 400 });
  }

  if (!["ASC", "FITP"].includes(membershipType)) {
    return NextResponse.json({ error: "Tipo tessera non valido" }, { status: 400 });
  }

  if (!["pending_review", "approved", "rejected", "suspended"].includes(status)) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }

  if (!Number.isFinite(feePoints) || feePoints < 0) {
    return NextResponse.json({ error: "Quota punti non valida" }, { status: 400 });
  }

  if (
    hasExistingMembership &&
    existingMembershipType &&
    !["ASC", "FITP"].includes(existingMembershipType)
  ) {
    return NextResponse.json(
      { error: "Tipo tessera già posseduta non valido" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: userErr } = await sb
    .from("users")
    .update({
      full_name: fullName,
      phone,
      email: email || null,
      gender: gender || null,
      updated_at: now,
    })
    .eq("id", membership.user_id);

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { data, error } = await sb
    .from("loyalty_memberships")
    .update({
      status,
      tax_code: taxCode || null,
      membership_type: membershipType,
      fee_points: feePoints,
      fee_paid: feePaid,
      has_existing_membership: hasExistingMembership,
      existing_membership_type: hasExistingMembership
        ? existingMembershipType || membershipType
        : null,
      existing_membership_number:
        hasExistingMembership && (existingMembershipType || membershipType) === "FITP"
          ? existingMembershipNumber || null
          : null,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}