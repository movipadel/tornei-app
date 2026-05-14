import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendStoreOrderEmail } from "@/lib/email";

export const runtime = "nodejs";

const CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"] as const;
const PAYMENT_MODES = ["euro", "points", "mixed"] as const;

type CheckoutItem = {
  product_id?: string;
  color_id?: string;
  size_id?: string | null;
  quantity?: number;
};

async function getPointsBalance(sb: ReturnType<typeof supabaseAdmin>, membershipId: string) {
  const { data, error } = await sb
    .from("loyalty_transactions")
    .select("points_delta")
    .eq("membership_id", membershipId);

  if (error) throw new Error(error.message);

  return (data ?? []).reduce((sum, row) => sum + Number(row.points_delta ?? 0), 0);
}

async function insertStorePointsTransaction({
  sb,
  membershipId,
  points,
  orderId,
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  membershipId: string;
  points: number;
  orderId: string;
}) {
  const payload = {
    membership_id: membershipId,
    type: "redeem",
    euro_amount: null,
    points_delta: -Math.abs(points),
    notes: `Ordine Store MOVI: ${orderId}`,
  };

  const possibleSources = ["store_order", "manual_adjustment", "correction", "reward_redemption"];

  let lastError = "";

  for (const source of possibleSources) {
    const { error } = await sb.from("loyalty_transactions").insert({
      ...payload,
      source,
    });

    if (!error) return;

    lastError = error.message;
  }

  throw new Error(lastError || "Errore registrazione punti");
}

export async function POST(req: Request) {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const pickup_club = String(body.pickup_club ?? "").trim().toUpperCase();
  const payment_mode = String(body.payment_mode ?? "euro").trim() as "euro" | "points" | "mixed";
  const notes = String(body.notes ?? "").trim();
  const points_to_use = Number(body.points_to_use ?? 0);
  const items = Array.isArray(body.items) ? (body.items as CheckoutItem[]) : [];

  if (!CLUBS.includes(pickup_club as any)) {
    return NextResponse.json({ error: "Club di ritiro non valido" }, { status: 400 });
  }

  if (!PAYMENT_MODES.includes(payment_mode as any)) {
    return NextResponse.json({ error: "Metodo di pagamento non valido" }, { status: 400 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Carrello vuoto" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id,full_name,phone,email")
    .eq("id", uid)
    .single();

  if (userErr || !user) {
    return NextResponse.json(
      { error: userErr?.message || "Utente non trovato" },
      { status: 404 }
    );
  }

  let membership: any = null;
  let pointsBalance = 0;

  if (payment_mode === "points" || payment_mode === "mixed") {
    const { data: membershipRow, error: membershipErr } = await sb
      .from("loyalty_memberships")
      .select("id,status")
      .eq("user_id", uid)
      .maybeSingle();

    if (membershipErr) {
      return NextResponse.json({ error: membershipErr.message }, { status: 500 });
    }

    if (!membershipRow || membershipRow.status !== "approved") {
      return NextResponse.json(
        { error: "MoviBack approvato richiesto per usare i punti" },
        { status: 403 }
      );
    }

    membership = membershipRow;

    try {
      pointsBalance = await getPointsBalance(sb, membership.id);
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Errore saldo punti" }, { status: 500 });
    }
  }

  const normalizedItems = items.map((item) => ({
    product_id: String(item.product_id ?? "").trim(),
    color_id: String(item.color_id ?? "").trim(),
    size_id: item.size_id ? String(item.size_id).trim() : null,
    quantity: Number(item.quantity ?? 0),
  }));

  for (const item of normalizedItems) {
    if (!item.product_id || !item.color_id) {
      return NextResponse.json({ error: "Prodotto o colore mancante" }, { status: 400 });
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return NextResponse.json({ error: "Quantità non valida" }, { status: 400 });
    }
  }

  const orderItems: any[] = [];
  let totalEuro = 0;
  let totalPoints = 0;

  for (const item of normalizedItems) {
    const { data: product, error: productErr } = await sb
      .from("store_products")
      .select("id,name,base_price_euro,base_price_points,is_active,allow_euro,allow_points,allow_mixed")
      .eq("id", item.product_id)
      .single();

    if (productErr || !product || !product.is_active) {
      return NextResponse.json(
        { error: productErr?.message || "Prodotto non disponibile" },
        { status: 400 }
      );
    }

    const paymentAllowed =
      payment_mode === "euro"
        ? product.allow_euro
        : payment_mode === "points"
          ? product.allow_points
          : product.allow_mixed;

    if (!paymentAllowed) {
      return NextResponse.json(
        { error: `Pagamento non disponibile per ${product.name}` },
        { status: 400 }
      );
    }

    const { data: color, error: colorErr } = await sb
      .from("store_product_colors")
      .select("id,color_name,is_active")
      .eq("id", item.color_id)
      .eq("product_id", product.id)
      .single();

    if (colorErr || !color || !color.is_active) {
      return NextResponse.json(
        { error: colorErr?.message || "Colore non disponibile" },
        { status: 400 }
      );
    }

    let size: any = null;

    if (item.size_id) {
      const { data: sizeRow, error: sizeErr } = await sb
        .from("store_product_sizes")
        .select("id,size_label,is_active")
        .eq("id", item.size_id)
        .eq("product_id", product.id)
        .single();

      if (sizeErr || !sizeRow || !sizeRow.is_active) {
        return NextResponse.json(
          { error: sizeErr?.message || "Taglia non disponibile" },
          { status: 400 }
        );
      }

      size = sizeRow;
    }

    let stockQuery = sb
      .from("store_product_stock")
      .select("id,stock_qty,is_active")
      .eq("product_id", product.id)
      .eq("color_id", color.id)
      .eq("is_active", true);

    stockQuery = item.size_id ? stockQuery.eq("size_id", item.size_id) : stockQuery.is("size_id", null);

    const { data: stockRow, error: stockErr } = await stockQuery.maybeSingle();

    if (stockErr) {
      return NextResponse.json({ error: stockErr.message }, { status: 500 });
    }

    if (stockRow?.stock_qty !== null && stockRow?.stock_qty !== undefined) {
      if (Number(stockRow.stock_qty) < item.quantity) {
        return NextResponse.json(
          { error: `Stock insufficiente per ${product.name} - ${color.color_name}` },
          { status: 400 }
        );
      }
    }

    const unitEuro = Number(product.base_price_euro ?? 0);
    const unitPoints = Number(product.base_price_points ?? Math.round(unitEuro * 10));

    orderItems.push({
      product_id: product.id,
      color_id: color.id,
      size_id: size?.id ?? null,
      product_name: product.name,
      color_name: color.color_name,
      size_label: size?.size_label ?? null,
      quantity: item.quantity,
      unit_price_euro: unitEuro,
      unit_price_points: unitPoints,
      total_euro: unitEuro * item.quantity,
      total_points: unitPoints * item.quantity,
      stock_id: stockRow?.id ?? null,
      stock_qty: stockRow?.stock_qty ?? null,
    });

    totalEuro += unitEuro * item.quantity;
    totalPoints += unitPoints * item.quantity;
  }

  let pointsToRedeem = 0;
  let finalEuro = totalEuro;

  if (payment_mode === "points") {
    pointsToRedeem = totalPoints;
    finalEuro = 0;
  }

  if (payment_mode === "mixed") {
    pointsToRedeem = Math.max(0, Math.min(points_to_use, totalPoints));
    finalEuro = Math.max(0, totalEuro - pointsToRedeem / 10);
  }

  if (pointsToRedeem > 0 && pointsBalance < pointsToRedeem) {
    return NextResponse.json({ error: "Punti insufficienti" }, { status: 400 });
  }

  const { data: order, error: orderErr } = await sb
    .from("store_orders")
    .insert({
      user_id: uid,
      status: "pending",
      pickup_club,
      payment_mode,
      total_euro: finalEuro,
      total_points: pointsToRedeem,
      customer_name: user.full_name,
      customer_phone: user.phone,
      customer_email: user.email,
      notes: notes || null,
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message || "Errore creazione ordine" },
      { status: 500 }
    );
  }

  const { error: itemsErr } = await sb.from("store_order_items").insert(
    orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      color_id: item.color_id,
      size_id: item.size_id,
      product_name: item.product_name,
      color_name: item.color_name,
      size_label: item.size_label,
      quantity: item.quantity,
      unit_price_euro: item.unit_price_euro,
      unit_price_points: item.unit_price_points,
      total_euro: item.total_euro,
      total_points: item.total_points,
    }))
  );

  if (itemsErr) {
    await sb.from("store_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  if (pointsToRedeem > 0 && membership?.id) {
    try {
      await insertStorePointsTransaction({
        sb,
        membershipId: membership.id,
        points: pointsToRedeem,
        orderId: order.id,
      });
    } catch (e: any) {
      await sb.from("store_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: e.message || "Errore scalamento punti" },
        { status: 500 }
      );
    }
  }

  for (const item of orderItems) {
    if (item.stock_id && item.stock_qty !== null && item.stock_qty !== undefined) {
      await sb
        .from("store_product_stock")
        .update({
          stock_qty: Math.max(0, Number(item.stock_qty) - Number(item.quantity)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.stock_id);
    }
  }

  // Email notifica ordine alla segreteria.
// Non blocca l'ordine se Resend ha problemi.
try {
  await sendStoreOrderEmail({
    order,
    items: orderItems,
  });
} catch (e) {
  console.error("Errore invio email Store MOVI:", e);
}

  return NextResponse.json({
    ok: true,
    data: {
      order_id: order.id,
      status: order.status,
      total_euro: finalEuro,
      total_points: pointsToRedeem,
    },
  });
}