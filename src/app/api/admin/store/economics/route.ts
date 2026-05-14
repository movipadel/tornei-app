import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStoreEconomicsAccess } from "@/lib/storeEconomicsAccess";

function n(value: unknown) {
  return Number(value || 0);
}

function getMonthKey(value?: string | null) {
  if (!value) return "Senza data";
  return value.slice(0, 7);
}

function pointsToEuro(points: unknown) {
  return n(points) / 10;
}

export async function GET(req: NextRequest) {
  const { allowed } = await getStoreEconomicsAccess();

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);

  const month = searchParams.get("month");
  const includeInactiveProducts =
    searchParams.get("include_inactive_products") === "true";

  let productsQuery = supabase
    .from("store_products")
    .select(`
      id,
      name,
      description,
      category_id,
      line_id,
      base_price_euro,
      base_price_points,
      allow_euro,
      allow_points,
      allow_mixed,
      is_active,
      sort_order,
      created_at,
      category:store_categories(id,name),
      line:store_lines(id,name)
    `)
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeInactiveProducts) {
    productsQuery = productsQuery.eq("is_active", true);
  }

  const costsQuery = supabase
    .from("store_product_costs")
    .select(`
      id,
      product_id,
      purchase_cost_euro,
      supplier_name,
      notes,
      updated_at
    `);

  const ordersQuery = supabase
    .from("store_orders")
    .select(`
      id,
      user_id,
      pickup_club,
      payment_mode,
      total_euro,
      total_points,
      customer_name,
      customer_phone,
      customer_email,
      status,
      is_paid,
      paid_at,
      created_at,
      store_order_items(
        id,
        product_id,
        product_name,
        color_name,
        size_label,
        quantity,
        unit_price_euro,
        unit_price_points,
        total_euro,
        total_points
      ),
      economics:store_order_economics(
        id,
        supplier_paid_by,
        supplier_paid_by_name,
        is_supplier_paid,
        supplier_paid_at,
        notes
      )
    `)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  let specialOrdersQuery = supabase
    .from("store_special_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (month) {
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString().slice(0, 10);

    specialOrdersQuery = specialOrdersQuery
      .gte("order_month", start)
      .lt("order_month", end);
  }

  const [productsRes, costsRes, ordersRes, specialsRes] = await Promise.all([
    productsQuery,
    costsQuery,
    ordersQuery,
    specialOrdersQuery,
  ]);

  if (productsRes.error) {
    return NextResponse.json({ error: productsRes.error.message }, { status: 500 });
  }

  if (costsRes.error) {
    return NextResponse.json({ error: costsRes.error.message }, { status: 500 });
  }

  if (ordersRes.error) {
    return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });
  }

  if (specialsRes.error) {
    return NextResponse.json({ error: specialsRes.error.message }, { status: 500 });
  }

  const products = productsRes.data || [];
  const costs = costsRes.data || [];
  const orders = ordersRes.data || [];
  const specialOrders = specialsRes.data || [];

  const costsByProductId = new Map(
    costs.map((cost: any) => [String(cost.product_id), cost])
  );

  const productCosts = new Map<string, number>();

  const productRows = products.map((product: any) => {
    const costRow = costsByProductId.get(String(product.id));
    const purchaseCost = n(costRow?.purchase_cost_euro);

    productCosts.set(String(product.id), purchaseCost);

    const salePriceEuro = n(product.base_price_euro);
    const salePricePoints = n(product.base_price_points);
    const saleValueFromPointsEuro = pointsToEuro(salePricePoints);

    const marginEuro =
      purchaseCost > 0 && salePriceEuro > 0 ? salePriceEuro - purchaseCost : null;

    const marginPercent =
      purchaseCost > 0 && salePriceEuro > 0
        ? ((salePriceEuro - purchaseCost) / salePriceEuro) * 100
        : null;

    return {
      id: product.id,
      name: product.name,
      category_name: product.category?.name || "",
      line_name: product.line?.name || "",
      base_price_euro: salePriceEuro,
      base_price_points: salePricePoints,
      base_points_value_euro: saleValueFromPointsEuro,
      allow_euro: Boolean(product.allow_euro),
      allow_points: Boolean(product.allow_points),
      allow_mixed: Boolean(product.allow_mixed),
      is_active: Boolean(product.is_active),
      purchase_cost_euro: purchaseCost,
      supplier_name: costRow?.supplier_name || "",
      cost_notes: costRow?.notes || "",
      cost_updated_at: costRow?.updated_at || null,
      cost_status: purchaseCost > 0 ? "ok" : "missing",
      margin_euro: marginEuro,
      margin_percent: marginPercent,
    };
  });

  const missingCosts = productRows.filter((p) => p.cost_status === "missing");

  let storeCashRevenue = 0;
  let storeCashCollected = 0;
  let storeCashReceivable = 0;
  let storePointsUsed = 0;
  let storePointsValueEuro = 0;
  let storePurchaseCosts = 0;

  const orderRows = orders.map((order: any) => {
    const orderEconomics = Array.isArray(order.economics)
      ? order.economics[0]
      : order.economics;

    const items = order.store_order_items || [];

    const purchaseCost = items.reduce((sum: number, item: any) => {
      const unitCost = productCosts.get(String(item.product_id)) || 0;
      return sum + unitCost * n(item.quantity);
    }, 0);

    const cashValueEuro = n(order.total_euro);
    const pointsUsed = n(order.total_points);
    const pointsValueEuro = pointsToEuro(pointsUsed);

    const cashCollectedEuro = order.is_paid ? cashValueEuro : 0;
    const cashReceivableEuro = order.is_paid ? 0 : cashValueEuro;

    storeCashRevenue += cashValueEuro;
    storeCashCollected += cashCollectedEuro;
    storeCashReceivable += cashReceivableEuro;
    storePointsUsed += pointsUsed;
    storePointsValueEuro += pointsValueEuro;
    storePurchaseCosts += purchaseCost;

    const economicValueEuro = cashValueEuro + pointsValueEuro;
    const economicCollectedValueEuro =
      cashCollectedEuro + (pointsUsed > 0 ? pointsValueEuro : 0);

    return {
      id: order.id,
      created_at: order.created_at,
      month: getMonthKey(order.created_at),
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      customer_email: order.customer_email || "",
      pickup_club: order.pickup_club,
      payment_mode: order.payment_mode,
      status: order.status,
      is_paid: Boolean(order.is_paid),
      paid_at: order.paid_at,

      total_euro: cashValueEuro,
      total_points: pointsUsed,
      points_value_euro: pointsValueEuro,

      cash_value_euro: cashValueEuro,
      cash_collected_euro: cashCollectedEuro,
      cash_receivable_euro: cashReceivableEuro,

      economic_value_euro: economicValueEuro,
      economic_collected_value_euro: economicCollectedValueEuro,

      purchase_cost_euro: purchaseCost,
      profit_cash_euro: cashCollectedEuro - purchaseCost,
      profit_economic_euro: economicCollectedValueEuro - purchaseCost,

      supplier_paid_by: orderEconomics?.supplier_paid_by || "",
      supplier_paid_by_name: orderEconomics?.supplier_paid_by_name || "",
      is_supplier_paid: Boolean(orderEconomics?.is_supplier_paid),
      supplier_paid_at: orderEconomics?.supplier_paid_at || null,

      items_count: items.reduce((sum: number, item: any) => sum + n(item.quantity), 0),
      items: items.map((item: any) => {
        const unitCost = productCosts.get(String(item.product_id)) || 0;
        const quantity = n(item.quantity);
        const itemCost = unitCost * quantity;
        const itemCashEuro = n(item.total_euro);
        const itemPoints = n(item.total_points);
        const itemPointsValueEuro = pointsToEuro(itemPoints);

        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          color_name: item.color_name,
          size_label: item.size_label,
          quantity,
          unit_price_euro: n(item.unit_price_euro),
          unit_price_points: n(item.unit_price_points),
          total_euro: itemCashEuro,
          total_points: itemPoints,
          points_value_euro: itemPointsValueEuro,
          purchase_unit_cost_euro: unitCost,
          purchase_total_cost_euro: itemCost,
          profit_cash_euro: itemCashEuro - itemCost,
          profit_economic_euro: itemCashEuro + itemPointsValueEuro - itemCost,
          cost_status: unitCost > 0 ? "ok" : "missing",
        };
      }),
    };
  });

  let specialRevenue = 0;
  let specialCollected = 0;
  let specialReceivable = 0;
  let specialCosts = 0;

  const specialRows = specialOrders.map((order: any) => {
    const sale = n(order.sale_price_euro);
    const cost = n(order.purchase_cost_euro);
    const collected = order.is_customer_paid ? sale : 0;
    const receivable = order.is_customer_paid ? 0 : sale;

    specialRevenue += sale;
    specialCollected += collected;
    specialReceivable += receivable;
    specialCosts += cost;

    return {
      ...order,
      sale_price_euro: sale,
      purchase_cost_euro: cost,
      collected_euro: collected,
      receivable_euro: receivable,
      profit_euro: collected - cost,
      margin_percent: sale > 0 ? ((sale - cost) / sale) * 100 : null,
      month: getMonthKey(order.order_month),
    };
  });

  const monthlyMap = new Map<string, any>();

  for (const row of orderRows) {
    const key = row.month;
    const current = monthlyMap.get(key) || {
      month: key,
      cash_revenue_euro: 0,
      cash_collected_euro: 0,
      cash_receivable_euro: 0,
      points_used: 0,
      points_value_euro: 0,
      economic_value_euro: 0,
      purchase_cost_euro: 0,
      profit_cash_euro: 0,
      profit_economic_euro: 0,
      orders: 0,
    };

    current.cash_revenue_euro += row.cash_value_euro;
    current.cash_collected_euro += row.cash_collected_euro;
    current.cash_receivable_euro += row.cash_receivable_euro;
    current.points_used += row.total_points;
    current.points_value_euro += row.points_value_euro;
    current.economic_value_euro += row.economic_value_euro;
    current.purchase_cost_euro += row.purchase_cost_euro;
    current.profit_cash_euro += row.profit_cash_euro;
    current.profit_economic_euro += row.profit_economic_euro;
    current.orders += 1;

    monthlyMap.set(key, current);
  }

  for (const row of specialRows) {
    const key = row.month;
    const current = monthlyMap.get(key) || {
      month: key,
      cash_revenue_euro: 0,
      cash_collected_euro: 0,
      cash_receivable_euro: 0,
      points_used: 0,
      points_value_euro: 0,
      economic_value_euro: 0,
      purchase_cost_euro: 0,
      profit_cash_euro: 0,
      profit_economic_euro: 0,
      orders: 0,
    };

    current.cash_revenue_euro += row.sale_price_euro;
    current.cash_collected_euro += row.collected_euro;
    current.cash_receivable_euro += row.receivable_euro;
    current.economic_value_euro += row.sale_price_euro;
    current.purchase_cost_euro += row.purchase_cost_euro;
    current.profit_cash_euro += row.profit_euro;
    current.profit_economic_euro += row.profit_euro;
    current.orders += 1;

    monthlyMap.set(key, current);
  }

  return NextResponse.json({
    kpis: {
      products_total: productRows.length,
      products_missing_cost: missingCosts.length,

      store_cash_revenue_euro: storeCashRevenue,
      store_cash_collected_euro: storeCashCollected,
      store_cash_receivable_euro: storeCashReceivable,

      store_points_used: storePointsUsed,
      store_points_value_euro: storePointsValueEuro,

      store_economic_value_euro: storeCashRevenue + storePointsValueEuro,
      store_purchase_cost_euro: storePurchaseCosts,

      store_profit_cash_euro: storeCashCollected - storePurchaseCosts,
      store_profit_economic_euro:
        storeCashCollected + storePointsValueEuro - storePurchaseCosts,

      special_revenue_euro: specialRevenue,
      special_collected_euro: specialCollected,
      special_receivable_euro: specialReceivable,
      special_purchase_cost_euro: specialCosts,
      special_profit_euro: specialCollected - specialCosts,

      total_cash_collected_euro: storeCashCollected + specialCollected,
      total_cash_receivable_euro: storeCashReceivable + specialReceivable,
      total_points_used: storePointsUsed,
      total_points_value_euro: storePointsValueEuro,
      total_purchase_cost_euro: storePurchaseCosts + specialCosts,
      total_profit_cash_euro:
        storeCashCollected + specialCollected - storePurchaseCosts - specialCosts,
      total_profit_economic_euro:
        storeCashCollected +
        specialCollected +
        storePointsValueEuro -
        storePurchaseCosts -
        specialCosts,

      profit_incomplete: missingCosts.length > 0,
    },
    products: productRows,
    missing_costs: missingCosts,
    orders: orderRows,
    special_orders: specialRows,
    monthly: Array.from(monthlyMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
  });
}