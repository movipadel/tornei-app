import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function numberValue(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);

  const club = String(searchParams.get("club") ?? "").trim().toUpperCase();
  const supplierPaid = String(searchParams.get("supplier_paid") ?? "").trim();

  const sb = supabaseAdmin();

  let query = sb
    .from("store_orders")
    .select(
      `
      id,
      pickup_club,
      payment_mode,
      total_euro,
      total_points,
      status,
      is_paid,
      paid_at,
      supplier_paid,
      supplier_paid_at,
      supplier_paid_by_type,
      supplier_paid_by_name,
      supplier_paid_by_club,
      supplier_payment_notes,
      created_at,
      store_order_items (
        id,
        product_name,
        color_name,
        size_label,
        quantity,
        total_euro,
        total_points
      )
    `
    )
    .order("created_at", { ascending: false });

  if (club && club !== "ALL") {
    query = query.eq("pickup_club", club);
  }

  if (supplierPaid === "true") {
    query = query.eq("supplier_paid", true);
  }

  if (supplierPaid === "false") {
    query = query.eq("supplier_paid", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];

  const validOrders = orders.filter(
    (o: any) => String(o.status ?? "") !== "cancelled"
  );

  const kpis = {
    orders_count: validOrders.length,

    customer_paid_count: validOrders.filter((o: any) => Boolean(o.is_paid)).length,

    supplier_paid_count: validOrders.filter((o: any) => Boolean(o.supplier_paid)).length,

    supplier_unpaid_count: validOrders.filter((o: any) => !Boolean(o.supplier_paid)).length,

    customer_total_euro: validOrders.reduce(
      (sum: number, o: any) => sum + numberValue(o.total_euro),
      0
    ),

    customer_collected_euro: validOrders
      .filter((o: any) => Boolean(o.is_paid))
      .reduce((sum: number, o: any) => sum + numberValue(o.total_euro), 0),

    customer_to_collect_euro: validOrders
      .filter((o: any) => !Boolean(o.is_paid))
      .reduce((sum: number, o: any) => sum + numberValue(o.total_euro), 0),

    points_used: validOrders.reduce(
      (sum: number, o: any) => sum + numberValue(o.total_points),
      0
    ),
  };

  const bySupplierPayer = new Map<string, any>();

  for (const o of validOrders as any[]) {
    if (!o.supplier_paid) continue;

    const key = [
      o.supplier_paid_by_type ?? "unknown",
      o.supplier_paid_by_name ?? "Non specificato",
      o.supplier_paid_by_club ?? "",
    ].join("__");

    const current = bySupplierPayer.get(key) ?? {
      supplier_paid_by_type: o.supplier_paid_by_type ?? null,
      supplier_paid_by_name: o.supplier_paid_by_name ?? "Non specificato",
      supplier_paid_by_club: o.supplier_paid_by_club ?? null,
      orders_count: 0,
      customer_total_euro: 0,
      points_used: 0,
    };

    current.orders_count += 1;
    current.customer_total_euro += numberValue(o.total_euro);
    current.points_used += numberValue(o.total_points);

    bySupplierPayer.set(key, current);
  }

  const byClub = new Map<string, any>();

  for (const o of validOrders as any[]) {
    const key = String(o.pickup_club ?? "NON DEFINITO");

    const current = byClub.get(key) ?? {
      club: key,
      orders_count: 0,
      supplier_paid_count: 0,
      supplier_unpaid_count: 0,
      customer_total_euro: 0,
      customer_collected_euro: 0,
      customer_to_collect_euro: 0,
      points_used: 0,
    };

    current.orders_count += 1;
    current.customer_total_euro += numberValue(o.total_euro);
    current.points_used += numberValue(o.total_points);

    if (o.supplier_paid) current.supplier_paid_count += 1;
    else current.supplier_unpaid_count += 1;

    if (o.is_paid) current.customer_collected_euro += numberValue(o.total_euro);
    else current.customer_to_collect_euro += numberValue(o.total_euro);

    byClub.set(key, current);
  }

  return NextResponse.json({
    data: {
      kpis,
      by_club: Array.from(byClub.values()).sort((a, b) =>
        String(a.club).localeCompare(String(b.club), "it")
      ),
      by_supplier_payer: Array.from(bySupplierPayer.values()).sort(
        (a, b) => b.orders_count - a.orders_count
      ),
      orders: validOrders,
    },
  });
}