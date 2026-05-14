import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { guardStaff, getStaffSessionOrNull } from "@/lib/staffGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

async function getOperator() {
  const adminDenied = await guardAdmin();

  if (!adminDenied) {
    return {
      ok: true,
      handledBy: null,
      role: "admin",
      denied: null,
    };
  }

  const staffDenied = await guardStaff();

  if (!staffDenied) {
    const staff = await getStaffSessionOrNull();

    return {
      ok: true,
      handledBy: staff?.sid ?? null,
      role: "staff",
      denied: null,
    };
  }

  return {
    ok: false,
    handledBy: null,
    role: null,
    denied: staffDenied,
  };
}

export async function POST(_req: Request, { params }: Params) {
  const operator = await getOperator();

  if (!operator.ok) {
  return (
    operator.denied ??
    NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
  );
}

  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: redemption, error: readErr } = await sb
    .from("reward_redemptions")
    .select("id,status")
    .eq("qr_token", token)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (!redemption) {
    return NextResponse.json({ error: "QR non valido" }, { status: 404 });
  }

  if (redemption.status !== "requested") {
    return NextResponse.json(
      { error: "QR già usato o non più valido" },
      { status: 400 }
    );
  }

  const { data, error } = await sb
    .from("reward_redemptions")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      handled_by: operator.handledBy,
      notes:
        operator.role === "staff"
          ? "Premio consegnato da staff"
          : "Premio consegnato da admin",
    })
    .eq("id", redemption.id)
    .eq("status", "requested")
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data,
  });
}