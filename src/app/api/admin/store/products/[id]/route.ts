import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (!id) return NextResponse.json({ error: "ID prodotto mancante" }, { status: 400 });

  const category_id = String(body.category_id ?? "").trim();
  const line_id = String(body.line_id ?? "").trim();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const base_price_euro = Number(body.base_price_euro ?? 0);
  const base_price_points = Number(body.base_price_points ?? Math.round(base_price_euro * 10));
  const allow_euro = Boolean(body.allow_euro ?? true);
  const allow_points = Boolean(body.allow_points ?? false);
  const allow_mixed = Boolean(body.allow_mixed ?? false);
  const is_active = Boolean(body.is_active);
  const sort_order = Number(body.sort_order ?? 0);

  if (!category_id) return NextResponse.json({ error: "Categoria richiesta" }, { status: 400 });
  if (!line_id) return NextResponse.json({ error: "Linea richiesta" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nome prodotto richiesto" }, { status: 400 });

  const sb = supabaseAdmin();

  const { error: updateErr } = await sb
    .from("store_products")
    .update({
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (Array.isArray(body.colors) || Array.isArray(body.sizes) || Array.isArray(body.stock)) {
    await sb.from("store_product_stock").delete().eq("product_id", id);
    await sb.from("store_product_sizes").delete().eq("product_id", id);
    await sb.from("store_product_colors").delete().eq("product_id", id);

    const colors = Array.isArray(body.colors) ? body.colors : [];
    const sizes = Array.isArray(body.sizes) ? body.sizes : [];
    const stock = Array.isArray(body.stock) ? body.stock : [];

    const cleanColors = colors
      .map((c: any, index: number) => ({
        product_id: id,
        color_name: String(c.color_name ?? "").trim(),
        color_hex: String(c.color_hex ?? "").trim() || null,
        image_path: String(c.image_path ?? "").trim() || null,
        is_active: Boolean(c.is_active ?? true),
        sort_order: Number(c.sort_order ?? index),
      }))
      .filter((c: any) => c.color_name);

    if (cleanColors.length === 0) {
      return NextResponse.json({ error: "Inserisci almeno un colore valido" }, { status: 400 });
    }

    const { data: insertedColors, error: colorsErr } = await sb
      .from("store_product_colors")
      .insert(cleanColors)
      .select();

    if (colorsErr) return NextResponse.json({ error: colorsErr.message }, { status: 500 });

    const cleanSizes = sizes
      .map((s: any, index: number) => ({
        product_id: id,
        size_label: String(s.size_label ?? "").trim(),
        sort_order: Number(s.sort_order ?? index),
        is_active: Boolean(s.is_active ?? true),
      }))
      .filter((s: any) => s.size_label);

    let insertedSizes: any[] = [];

    if (cleanSizes.length > 0) {
      const { data, error } = await sb.from("store_product_sizes").insert(cleanSizes).select();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      insertedSizes = data ?? [];
    }

    const colorMap = new Map(insertedColors?.map((c) => [c.color_name, c.id]) ?? []);
    const sizeMap = new Map(insertedSizes.map((s) => [s.size_label, s.id]));

    const cleanStock = stock
      .map((row: any) => {
        const colorName = String(row.color_name ?? "").trim();
        const sizeLabel = row.size_label ? String(row.size_label).trim() : null;

        return {
          product_id: id,
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
      .filter((row: any) => row.color_id);

    if (cleanStock.length > 0) {
      const { error } = await sb.from("store_product_stock").insert(cleanStock);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

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
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) return NextResponse.json({ error: "ID prodotto mancante" }, { status: 400 });

  const sb = supabaseAdmin();

  const { error } = await sb.from("store_products").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}