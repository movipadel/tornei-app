import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

const STATUSES = [
  "pending",
  "confirmed",
  "ordered_to_supplier",
  "ready",
  "delivered",
  "cancelled",
];

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const order_id = String(body.order_id ?? "").trim();
  const status = String(body.status ?? "").trim();

  if (!order_id) return NextResponse.json({ error: "ID ordine mancante" }, { status: 400 });
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const dateField =
    status === "confirmed"
      ? { confirmed_at: now }
      : status === "ordered_to_supplier"
        ? { ordered_to_supplier_at: now }
        : status === "ready"
          ? { ready_at: now }
          : status === "delivered"
            ? { delivered_at: now }
            : status === "cancelled"
              ? { cancelled_at: now }
              : {};

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("store_orders")
    .update({
      status,
      updated_at: now,
      ...dateField,
    })
    .eq("id", order_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}