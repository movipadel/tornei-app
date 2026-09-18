import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: rewards, error: rewardsErr } = await sb
    .from("rewards_catalog")
    .select(`
  id,
  name,
  description,
  category,
  points_cost,
  image_path,
  stock_qty,
  reward_type,
  fulfillment_type,
  store_product_id,
  requires_store_variant,
  store_products (
    id,
    name,
    description,
    is_active,
    store_product_colors (
      id,
      color_name,
      color_hex,
      image_path,
      is_active,
      sort_order
    ),
    store_product_sizes (
      id,
      size_label,
      is_active,
      sort_order
    ),
    store_product_stock (
      id,
      color_id,
      size_id,
      stock_qty,
      is_active
    )
  )
`)
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (rewardsErr) {
    return NextResponse.json({ error: rewardsErr.message }, { status: 500 });
  }

  const normalizedRewards = (rewards ?? []).map((reward: any) => {
  const product = reward.store_products ?? null;

  if (!product) {
    const { store_products, ...cleanReward } = reward;

return {
  ...cleanReward,
  customer_input_required: false,
  store_product: null,
};
  }

  const colors = (product.store_product_colors ?? [])
    .filter((c: any) => c.is_active)
    .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  const sizes = (product.store_product_sizes ?? [])
    .filter((s: any) => s.is_active)
    .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

  const stock = (product.store_product_stock ?? []).filter((s: any) => s.is_active);
  const activeColorIds = new Set(colors.map((color: any) => color.id));
  const activeSizeIds = new Set(sizes.map((size: any) => size.id));
  const selectableStock = stock.filter((row: any) => {
    if (!activeColorIds.has(row.color_id)) return false;
    if (sizes.length === 0 ? row.size_id !== null : !activeSizeIds.has(row.size_id)) {
      return false;
    }
    if (row.stock_qty === null || row.stock_qty === undefined) return true;
    return Number(row.stock_qty) > 0;
  });
  const customerInputRequired = Boolean(reward.requires_store_variant);
  const selectableColorIds = new Set(selectableStock.map((row: any) => row.color_id));
  const selectableSizeIds = new Set(
    selectableStock.map((row: any) => row.size_id).filter(Boolean)
  );

  const availableColors = customerInputRequired
    ? colors.filter((color: any) => selectableColorIds.has(color.id))
    : [];
  const availableSizes = customerInputRequired
    ? sizes.filter((size: any) => selectableSizeIds.has(size.id))
    : [];

  const { store_products, ...cleanReward } = reward;

return {
  ...cleanReward,
  customer_input_required: customerInputRequired,
  store_product: {
    id: product.id,
    name: product.name,
    description: product.description,
    colors: availableColors,
    sizes: availableSizes,
    variant_options: customerInputRequired
      ? selectableStock.map((row: any) => ({
          color_id: row.color_id,
          size_id: row.size_id ?? null,
        }))
      : [],
  },
};
});

  const { data: categories, error: categoriesErr } = await sb
    .from("reward_categories")
    .select("id,name,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesErr) {
    return NextResponse.json({ error: categoriesErr.message }, { status: 500 });
  }

  const { data: pointRanges, error: rangesErr } = await sb
    .from("reward_point_ranges")
    .select("id,label,min_points,max_points,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (rangesErr) {
    return NextResponse.json({ error: rangesErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: normalizedRewards,
    filters: {
      categories: categories ?? [],
      point_ranges: pointRanges ?? [],
    },
  });
}
