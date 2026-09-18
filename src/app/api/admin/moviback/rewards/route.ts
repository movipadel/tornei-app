import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { isUuid, type MovibackFulfillmentType } from "@/lib/movibackContracts";
import { validateRewardFulfillment } from "@/lib/movibackRewardAdmin";

export const runtime = "nodejs";

/**
 * GET → lista premi
 */
export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("rewards_catalog")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST → crea premio
 */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = String(body.category ?? "").trim();
  const points_cost = Number(body.points_cost ?? 0);
  const image_path = String(body.image_path ?? "").trim();
  const stock_qty =
    body.stock_qty !== null && body.stock_qty !== undefined
      ? Number(body.stock_qty)
      : null;
  const is_active = Boolean(body.is_active ?? true);

  const store_product_id = body.store_product_id
  ? String(body.store_product_id).trim()
  : null;

const requires_store_variant = Boolean(body.requires_store_variant);
  const fulfillment_type = body.fulfillment_type
    ? String(body.fulfillment_type).trim() as MovibackFulfillmentType
    : null;

  if (!name) {
    return NextResponse.json(
      { error: "Nome premio richiesto" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(points_cost) || points_cost <= 0) {
    return NextResponse.json(
      { error: "Costo punti non valido" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();
  const allowedTypes = new Set(["service", "store_product", "custom_physical", "partner"]);
  if ((fulfillment_type && !allowedTypes.has(fulfillment_type)) || (store_product_id && !isUuid(store_product_id))) {
    return NextResponse.json({ error: "Configurazione premio non valida" }, { status: 400 });
  }
  const fulfillmentError = await validateRewardFulfillment(sb, {
    isActive: is_active,
    fulfillmentType: fulfillment_type,
    storeProductId: store_product_id,
    requiresStoreVariant: requires_store_variant,
  });
  if (fulfillmentError) {
    return NextResponse.json({ error: fulfillmentError }, { status: 400 });
  }

  const { data, error } = await sb
    .from("rewards_catalog")
    .insert({
  name,
  description,
  category,
  points_cost,
  image_path: image_path || null,
  stock_qty,
  is_active,
  reward_type: "club",
  fulfillment_type,
  store_product_id,
  requires_store_variant: store_product_id ? requires_store_variant : false,
})
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
