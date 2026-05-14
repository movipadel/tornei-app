import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const CLUBS = new Set(["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"]);

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));

    const orderId = String(body?.order_id ?? "").trim();
    const supplierPaid = Boolean(body?.supplier_paid);

    if (!orderId) {
      return NextResponse.json({ error: "order_id mancante" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    if (!supplierPaid) {
      const { data, error } = await sb
        .from("store_orders")
        .update({
          supplier_paid: false,
          supplier_paid_at: null,
          supplier_paid_by_type: null,
          supplier_paid_by_name: null,
          supplier_paid_by_club: null,
          supplier_payment_notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ data });
    }

    const paidByType = String(body?.supplier_paid_by_type ?? "").trim();
    const paidByName = String(body?.supplier_paid_by_name ?? "").trim();
    const paidByClub = String(body?.supplier_paid_by_club ?? "").trim().toUpperCase();
    const notes = String(body?.supplier_payment_notes ?? "").trim();

    if (!["club", "person"].includes(paidByType)) {
      return NextResponse.json(
        { error: "Tipo pagante non valido" },
        { status: 400 }
      );
    }

    if (!paidByName) {
      return NextResponse.json(
        { error: "Nome pagante obbligatorio" },
        { status: 400 }
      );
    }

    if (paidByClub && !CLUBS.has(paidByClub)) {
      return NextResponse.json(
        { error: "Club pagante non valido" },
        { status: 400 }
      );
    }

    const { data, error } = await sb
      .from("store_orders")
      .update({
        supplier_paid: true,
        supplier_paid_at: new Date().toISOString(),
        supplier_paid_by_type: paidByType,
        supplier_paid_by_name: paidByName,
        supplier_paid_by_club: paidByClub || null,
        supplier_payment_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore pagamento fornitore" },
      { status: 500 }
    );
  }
}