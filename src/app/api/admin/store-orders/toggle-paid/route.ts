import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const order_id = String(body.order_id ?? "").trim();
  const is_paid = Boolean(body.is_paid);

  if (!order_id) {
    return NextResponse.json({ error: "ID ordine mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("store_orders")
    .update({
      is_paid,
      paid_at: is_paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}