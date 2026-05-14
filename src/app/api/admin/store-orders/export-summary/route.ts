import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function csvCell(value: any) {
  const v = String(value ?? "");
  return `"${v.replace(/"/g, '""')}"`;
}

function n(value: unknown) {
  return Number(value || 0);
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const orderIds = Array.isArray(body.order_ids)
    ? body.order_ids.map((x: any) => String(x)).filter(Boolean)
    : [];

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Nessun ordine selezionato" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: orders, error } = await sb
    .from("store_orders")
    .select(
      "id,status,customer_name,pickup_club,payment_mode,total_euro,total_points,created_at,store_order_items(*)"
    )
    .in("id", orderIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "Nessun ordine pending valido" }, { status: 400 });
  }

  const productIds = Array.from(
    new Set(
      orders.flatMap((order: any) =>
        (order.store_order_items ?? [])
          .map((item: any) => item.product_id)
          .filter(Boolean)
      )
    )
  );

  const { data: costs, error: costsError } = await sb
    .from("store_product_costs")
    .select(`
      product_id,
      purchase_cost_euro,
      supplier_name,
      product:store_products(
        id,
        category:store_categories(name),
        line:store_lines(name)
      )
    `)
    .in("product_id", productIds);

  if (costsError) {
    return NextResponse.json({ error: costsError.message }, { status: 500 });
  }

  const costsByProductId = new Map(
    (costs ?? []).map((cost: any) => [
      String(cost.product_id),
      {
        purchase_cost_euro: n(cost.purchase_cost_euro),
        supplier_name: cost.supplier_name || "",
        category_name: cost.product?.category?.name || "",
        line_name: cost.product?.line?.name || "",
      },
    ])
  );

  const aggregate = new Map<string, any>();

  for (const order of orders) {
    for (const item of order.store_order_items ?? []) {
      const productCost = costsByProductId.get(String(item.product_id));
      const unitPurchaseCost = n(productCost?.purchase_cost_euro);
      const quantity = n(item.quantity);
      const purchaseTotal = unitPurchaseCost * quantity;

      const key = [
        item.product_id,
        item.product_name,
        item.color_name,
        item.size_label || "UNICA",
      ].join("|");

      const existing = aggregate.get(key);

      if (existing) {
        existing.quantity += quantity;
        existing.total_euro += n(item.total_euro);
        existing.total_points += n(item.total_points);
        existing.purchase_total_euro += purchaseTotal;
        existing.orders.push(order.id);
      } else {
        aggregate.set(key, {
          product_id: item.product_id,
          product_name: item.product_name,
          category_name: productCost?.category_name || "",
          color_name: item.color_name,
          size_label: item.size_label || "UNICA",
          line_name: productCost?.line_name || "",
          quantity,
          total_euro: n(item.total_euro),
          total_points: n(item.total_points),
          supplier_name: productCost?.supplier_name || "",
          purchase_unit_euro: unitPurchaseCost,
          purchase_total_euro: purchaseTotal,
          cost_missing: unitPurchaseCost <= 0,
          orders: [order.id],
        });
      }
    }
  }

  const rows = [
    [
      "Prodotto",
      "Categoria",
      "Colore",
      "Taglia",
      "Linea",
      "Totale",
      "Costo Pz.",
      "Costo Tot.",
      "Fornitore",
      "Costo mancante",
      "Totale vendita euro",
      "Totale punti",
      "Ordini inclusi",
    ],
    ...Array.from(aggregate.values()).map((row) => [
      row.product_name,
      row.category_name,
      row.color_name,
      row.size_label,
      row.line_name,
      row.quantity,
      row.purchase_unit_euro.toFixed(2).replace(".", ","),
      row.purchase_total_euro.toFixed(2).replace(".", ","),
      row.supplier_name,
      row.cost_missing ? "SI" : "NO",
      row.total_euro.toFixed(2).replace(".", ","),
      row.total_points,
      row.orders.join(", "),
    ]),
    [],
    ["DETTAGLIO ORDINI"],
    ["ID ordine", "Cliente", "Club", "Pagamento", "Totale euro", "Punti", "Data"],
    ...orders.map((o: any) => [
      o.id,
      o.customer_name,
      o.pickup_club,
      o.payment_mode,
      n(o.total_euro).toFixed(2).replace(".", ","),
      n(o.total_points).toFixed(2).replace(".", ","),
      new Date(o.created_at).toLocaleString("it-IT"),
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");

  const now = new Date().toISOString();

  const { error: updateErr } = await sb
    .from("store_orders")
    .update({
      status: "confirmed",
      confirmed_at: now,
      updated_at: now,
    })
    .in(
      "id",
      orders.map((o: any) => o.id)
    );

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="riepilogo-store-movi-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}