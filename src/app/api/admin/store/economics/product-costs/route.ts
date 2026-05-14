import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStoreEconomicsAccess } from "@/lib/storeEconomicsAccess";

export async function POST(req: NextRequest) {
  const { allowed, session } = await getStoreEconomicsAccess();

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const product_id = String(body.product_id || "");
  const purchase_cost_euro = Number(body.purchase_cost_euro || 0);
  const supplier_name = body.supplier_name ? String(body.supplier_name) : null;
  const notes = body.notes ? String(body.notes) : null;

  if (!product_id) {
    return NextResponse.json({ error: "Prodotto mancante" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("store_product_costs")
    .upsert(
      {
        product_id,
        purchase_cost_euro,
        supplier_name,
        notes,
        updated_by: session?.email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}