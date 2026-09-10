import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRuntimePerf } from "@/lib/runtimePerf";

export const runtime = "nodejs";

type StoreLookupRow = {
  id: string;
  name: string;
  slug: string;
};

type StoreColorRow = {
  id: string;
  color_name: string;
  color_hex: string | null;
  image_path: string | null;
  is_active: boolean;
  sort_order: number | null;
};

type StoreSizeRow = {
  id: string;
  size_label: string;
  is_active: boolean;
  sort_order: number | null;
};

type StoreStockRow = {
  color_id: string;
  size_id: string | null;
  stock_qty: number | null;
  is_active: boolean;
};

type StoreProductRow = {
  id: string;
  category_id: string;
  line_id: string | null;
  name: string;
  description: string | null;
  base_price_euro: number;
  base_price_points: number | null;
  colors: StoreColorRow[] | null;
  sizes: StoreSizeRow[] | null;
  stock: StoreStockRow[] | null;
};

export async function GET() {
  const perf = createRuntimePerf("/api/store/products");
  try {
  const sb = supabaseAdmin();

  const { data: categories, error: categoriesError } = await perf.db(() =>
    sb
      .from("store_categories")
      .select("id,name,slug")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  );

  if (categoriesError) {
    return perf.json({ error: categoriesError.message }, { status: 500 });
  }

  const { data: lines, error: linesError } = await perf.db(() =>
    sb
      .from("store_lines")
      .select("id,name,slug")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  );

  if (linesError) {
    return perf.json({ error: linesError.message }, { status: 500 });
  }

  const { data: products, error: productsError } = await perf.db(() =>
    sb
      .from("store_products")
      .select(`
        id,
        category_id,
        line_id,
        name,
        description,
        base_price_euro,
        base_price_points,
        colors:store_product_colors(id,color_name,color_hex,image_path,is_active,sort_order),
        sizes:store_product_sizes(id,size_label,is_active,sort_order),
        stock:store_product_stock(color_id,size_id,stock_qty,is_active)
      `)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
  );

  if (productsError) {
    return perf.json({ error: productsError.message }, { status: 500 });
  }

  const cleanCategories = (categories ?? []) as StoreLookupRow[];
  const cleanLines = (lines ?? []) as StoreLookupRow[];
  const categoryById = new Map(cleanCategories.map((category) => [category.id, category]));
  const lineById = new Map(cleanLines.map((line) => [line.id, line]));

  const cleanProducts = ((products ?? []) as StoreProductRow[])
    .filter(
      (product) =>
        categoryById.has(product.category_id) &&
        (!product.line_id || lineById.has(product.line_id))
    )
    .map((product) => ({
      id: product.id,
      category_id: product.category_id,
      line_id: product.line_id,
      name: product.name,
      description: product.description,
      base_price_euro: product.base_price_euro,
      base_price_points: product.base_price_points,
      category: categoryById.get(product.category_id) ?? null,
      line: product.line_id ? lineById.get(product.line_id) ?? null : null,
      colors: (product.colors ?? [])
        .filter((color) => color.is_active)
        .sort(
          (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        )
        .map((color) => ({
          id: color.id,
          color_name: color.color_name,
          color_hex: color.color_hex,
          image_path: color.image_path,
        })),
      sizes: (product.sizes ?? [])
        .filter((size) => size.is_active)
        .sort(
          (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
        )
        .map((size) => ({
          id: size.id,
          size_label: size.size_label,
        })),
      stock: (product.stock ?? [])
        .filter((stock) => stock.is_active)
        .map((stock) => ({
          color_id: stock.color_id,
          size_id: stock.size_id,
          stock_qty: stock.stock_qty,
        })),
    }))
    .filter((p) => p.colors.length > 0);

  return perf.json({
    data: {
      categories: cleanCategories,
      lines: cleanLines,
      products: cleanProducts,
    },
  });
  } finally {
    perf.finish();
  }
}
