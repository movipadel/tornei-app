import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

// 📥 LISTA richieste
export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("loyalty_memberships")
    .select(`
      id,
      user_id,
      membership_code,
      membership_type,
      has_existing_membership,
      existing_membership_type,
      existing_membership_number,
      fee_points,
      fee_paid,
      created_at,
      status,
      users (
        full_name,
        phone
      )
    `)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (data || []).map(async (row: any) => {
      const { data: cert } = await sb
        .from("medical_certificates")
        .select("id,status,expiry_date,file_path,uploaded_at")
        .eq("user_id", row.user_id)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...row,
        certificate: cert || null,
      };
    })
  );

  return NextResponse.json({ data: enriched });
}

// ✅ AZIONI approva/rifiuta
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id, action, rejection_reason } = await req.json().catch(() => ({}));

  if (!id || !action) {
    return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
  }

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  if (action === "approve") {
    const { data: membership, error: readErr } = await sb
      .from("loyalty_memberships")
      .select("id,status,fee_points,fee_paid,membership_type")
      .eq("id", id)
      .single();

    if (readErr || !membership) {
      return NextResponse.json(
        { error: readErr?.message || "Richiesta non trovata" },
        { status: 404 }
      );
    }

    if (membership.status !== "pending_review") {
      return NextResponse.json(
        { error: "La richiesta non è più in revisione" },
        { status: 400 }
      );
    }

    const feePoints = Number(membership.fee_points || 0);
    const shouldChargeFee = feePoints > 0 && !membership.fee_paid;

    // Scala i punti anche se il saldo va negativo.
    // Esempio: saldo 0, tessera FITP 15 punti => saldo -15.
    if (shouldChargeFee) {
      const { error: feeTxErr } = await sb.from("loyalty_transactions").insert({
        membership_id: membership.id,
        type: "redeem",
        source: "membership_fee",
        euro_amount: null,
        points_delta: -feePoints,
        notes: `Costo tessera ${membership.membership_type}: ${feePoints} punti`,
      });

      if (feeTxErr) {
        return NextResponse.json({ error: feeTxErr.message }, { status: 500 });
      }
    }

    const now = new Date().toISOString();

    const { error } = await sb
      .from("loyalty_memberships")
      .update({
        status: "approved",
        approved_at: now,
        fee_paid: true,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "reject") {
  const rejectionReason = String(rejection_reason ?? "").trim();

  if (!rejectionReason) {
    return NextResponse.json(
      { error: "Motivo rifiuto obbligatorio" },
      { status: 400 }
    );
  }

  const { data: membership, error: readErr } = await sb
    .from("loyalty_memberships")
    .select("id,status")
    .eq("id", id)
    .single();

  if (readErr || !membership) {
    return NextResponse.json(
      { error: readErr?.message || "Richiesta non trovata" },
      { status: 404 }
    );
  }

  if (membership.status !== "pending_review") {
    return NextResponse.json(
      { error: "La richiesta non è più in revisione" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error } = await sb
    .from("loyalty_memberships")
    .update({
      status: "rejected",
      rejection_reason: rejectionReason,
      rejected_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

return NextResponse.json({ ok: true });
}