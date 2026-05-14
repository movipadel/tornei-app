import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();

  const { data: categories, error: categoriesError } = await sb
    .from("store_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  }

  const { data: lines, error: linesError } = await sb
    .from("store_lines")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  const { data: products, error: productsError } = await sb
    .from("store_products")
    .select(`
      *,
      category:store_categories(*),
      line:store_lines(*),
      colors:store_product_colors(*),
      sizes:store_product_sizes(*),
      stock:store_product_stock(*)
    `)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const cleanProducts = (products ?? [])
    .filter((p) => p.category?.is_active !== false && p.line?.is_active !== false)
    .map((p) => ({
      ...p,
      colors: (p.colors ?? [])
        .filter((c: any) => c.is_active)
        .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
      sizes: (p.sizes ?? [])
        .filter((s: any) => s.is_active)
        .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
      stock: (p.stock ?? []).filter((s: any) => s.is_active),
    }))
    .filter((p) => p.colors.length > 0);

  return NextResponse.json({
    data: {
      categories: categories ?? [],
      lines: lines ?? [],
      products: cleanProducts,
    },
  });
}