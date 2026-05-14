import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type StoreColorInput = {
  color_name?: string;
  color_hex?: string;
  image_path?: string;
  is_active?: boolean;
  sort_order?: number;
};

type StoreSizeInput = {
  size_label?: string;
  sort_order?: number;
  is_active?: boolean;
};

type StoreStockInput = {
  color_name?: string;
  size_label?: string | null;
  stock_qty?: number | null;
  sku?: string | null;
  is_active?: boolean;
};

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("store_products")
    .select(`
      *,
      category:store_categories(*),
      line:store_lines(*),
      colors:store_product_colors(*),
      sizes:store_product_sizes(*),
      stock:store_product_stock(*)
    `)
    .order("category_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const category_id = String(body.category_id ?? "").trim();
  const line_id = String(body.line_id ?? "").trim();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const base_price_euro = Number(body.base_price_euro ?? 0);
  const base_price_points = Number(body.base_price_points ?? Math.round(base_price_euro * 10));
  const allow_euro = Boolean(body.allow_euro ?? true);
  const allow_points = Boolean(body.allow_points ?? false);
  const allow_mixed = Boolean(body.allow_mixed ?? false);
  const is_active = Boolean(body.is_active ?? true);
  const sort_order = Number(body.sort_order ?? 0);

  const colors = Array.isArray(body.colors) ? (body.colors as StoreColorInput[]) : [];
  const sizes = Array.isArray(body.sizes) ? (body.sizes as StoreSizeInput[]) : [];
  const stock = Array.isArray(body.stock) ? (body.stock as StoreStockInput[]) : [];

  if (!category_id) return NextResponse.json({ error: "Categoria richiesta" }, { status: 400 });
  if (!line_id) return NextResponse.json({ error: "Linea richiesta" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nome prodotto richiesto" }, { status: 400 });

  if (!Number.isFinite(base_price_euro) || base_price_euro < 0) {
    return NextResponse.json({ error: "Prezzo euro non valido" }, { status: 400 });
  }

  if (!Number.isFinite(base_price_points) || base_price_points < 0) {
    return NextResponse.json({ error: "Prezzo punti non valido" }, { status: 400 });
  }

  if (!allow_euro && !allow_points && !allow_mixed) {
    return NextResponse.json({ error: "Abilita almeno un metodo di pagamento" }, { status: 400 });
  }

  if (colors.length === 0) {
    return NextResponse.json({ error: "Inserisci almeno un colore" }, { status: 400 });
  }

  const cleanColors = colors
    .map((c, index) => ({
      color_name: String(c.color_name ?? "").trim(),
      color_hex: String(c.color_hex ?? "").trim() || null,
      image_path: String(c.image_path ?? "").trim() || null,
      is_active: Boolean(c.is_active ?? true),
      sort_order: Number(c.sort_order ?? index),
    }))
    .filter((c) => c.color_name);

  if (cleanColors.length === 0) {
    return NextResponse.json({ error: "Inserisci almeno un colore valido" }, { status: 400 });
  }

  const cleanSizes = sizes
    .map((s, index) => ({
      size_label: String(s.size_label ?? "").trim(),
      sort_order: Number(s.sort_order ?? index),
      is_active: Boolean(s.is_active ?? true),
    }))
    .filter((s) => s.size_label);

  const sb = supabaseAdmin();

  const { data: product, error: productErr } = await sb
    .from("store_products")
    .insert({
      category_id,
      line_id,
      name,
      description: description || null,
      base_price_euro,
      base_price_points,
      allow_euro,
      allow_points,
      allow_mixed,
      is_active,
      sort_order,
    })
    .select()
    .single();

  if (productErr) return NextResponse.json({ error: productErr.message }, { status: 500 });

  const productId = product.id;

  const { data: insertedColors, error: colorsErr } = await sb
    .from("store_product_colors")
    .insert(cleanColors.map((c) => ({ ...c, product_id: productId })))
    .select();

  if (colorsErr) return NextResponse.json({ error: colorsErr.message }, { status: 500 });

  let insertedSizes: any[] = [];

  if (cleanSizes.length > 0) {
    const { data, error } = await sb
      .from("store_product_sizes")
      .insert(cleanSizes.map((s) => ({ ...s, product_id: productId })))
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertedSizes = data ?? [];
  }

  const colorMap = new Map(insertedColors?.map((c) => [c.color_name, c.id]) ?? []);
  const sizeMap = new Map(insertedSizes.map((s) => [s.size_label, s.id]));

  const cleanStock = stock
    .map((row) => {
      const colorName = String(row.color_name ?? "").trim();
      const sizeLabel = row.size_label ? String(row.size_label).trim() : null;

      return {
        product_id: productId,
        color_id: colorMap.get(colorName),
        size_id: sizeLabel ? sizeMap.get(sizeLabel) ?? null : null,
        stock_qty:
          row.stock_qty === null || row.stock_qty === undefined || String(row.stock_qty) === ""
            ? null
            : Number(row.stock_qty),
        sku: row.sku ? String(row.sku).trim() : null,
        is_active: Boolean(row.is_active ?? true),
      };
    })
    .filter((row) => row.color_id);

  if (cleanStock.length > 0) {
    const invalidStock = cleanStock.find(
      (row) => row.stock_qty !== null && (!Number.isFinite(row.stock_qty) || row.stock_qty < 0)
    );

    if (invalidStock) {
      return NextResponse.json({ error: "Stock non valido" }, { status: 400 });
    }

    const { error } = await sb.from("store_product_stock").insert(cleanStock);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: fullProduct, error: fullErr } = await sb
    .from("store_products")
    .select(`
      *,
      category:store_categories(*),
      line:store_lines(*),
      colors:store_product_colors(*),
      sizes:store_product_sizes(*),
      stock:store_product_stock(*)
    `)
    .eq("id", productId)
    .single();

  if (fullErr) return NextResponse.json({ error: fullErr.message }, { status: 500 });

  return NextResponse.json({ data: fullProduct });
}