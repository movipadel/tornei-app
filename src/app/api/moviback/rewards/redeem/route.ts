import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendAdminPushNotification } from "@/lib/adminPush";

export const runtime = "nodejs";

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function POST(req: Request) {
  const uid = await getUserIdFromCookie();

if (!uid) {
  return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
}

  const body = await req.json().catch(() => ({}));
  const rewardId = String(body.reward_id ?? "").trim();

  if (!rewardId) {
    return NextResponse.json({ error: "Premio mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .select("id,status")
    .eq("user_id", uid)
    .maybeSingle();

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 500 });
  }

  if (!membership || membership.status !== "approved") {
    return NextResponse.json(
      { error: "MoviBack non approvato" },
      { status: 403 }
    );
  }

  const { data: reward, error: rewardErr } = await sb
    .from("rewards_catalog")
    .select("id,name,description,category,points_cost,is_active,stock_qty,reward_type")
    .eq("id", rewardId)
    .single();

  if (rewardErr || !reward) {
    return NextResponse.json(
      { error: rewardErr?.message || "Premio non trovato" },
      { status: 404 }
    );
  }

  if (!reward.is_active) {
    return NextResponse.json({ error: "Premio non disponibile" }, { status: 400 });
  }

  if (reward.stock_qty !== null && reward.stock_qty <= 0) {
    return NextResponse.json({ error: "Premio esaurito" }, { status: 400 });
  }

  const { data: txs, error: txErr } = await sb
    .from("loyalty_transactions")
    .select("points_delta")
    .eq("membership_id", membership.id);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const balance = (txs || []).reduce(
    (sum, tx) => sum + Number(tx.points_delta || 0),
    0
  );

  if (balance < reward.points_cost) {
    return NextResponse.json(
      { error: "Punti insufficienti" },
      { status: 400 }
    );
  }

  const qrToken = makeToken();

  const { data: redemption, error: redemptionErr } = await sb
    .from("reward_redemptions")
    .insert({
      membership_id: membership.id,
      reward_id: reward.id,
      points_cost: reward.points_cost,
      status: "requested",
      qr_token: qrToken,
    })
    .select("id,qr_token")
    .single();

  if (redemptionErr) {
    return NextResponse.json({ error: redemptionErr.message }, { status: 500 });
  }

  const { error: txInsertErr } = await sb.from("loyalty_transactions").insert({
    membership_id: membership.id,
    type: "redeem",
    source: "reward_redemption",
    euro_amount: null,
    points_delta: -Number(reward.points_cost),
    related_redemption_id: redemption.id,
    notes: `Riscatto premio: ${reward.name}`,
  });

  if (txInsertErr) {
    await sb.from("reward_redemptions").delete().eq("id", redemption.id);
    return NextResponse.json({ error: txInsertErr.message }, { status: 500 });
  }

  if (reward.stock_qty !== null) {
    await sb
      .from("rewards_catalog")
      .update({
        stock_qty: Math.max(0, Number(reward.stock_qty) - 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reward.id);
  }

  const rewardCategory = String(reward.category || "").toLowerCase();

const shouldCreateStoreOrder =
  rewardCategory.includes("abbigliamento") ||
  rewardCategory.includes("accessori") ||
  rewardCategory.includes("accessorio") ||
  rewardCategory.includes("store");

if (shouldCreateStoreOrder) {
  const { data: user } = await sb
    .from("users")
    .select("id,full_name,phone,email")
    .eq("id", uid)
    .maybeSingle();

  const { data: storeOrder, error: storeOrderErr } = await sb
    .from("store_orders")
    .insert({
      user_id: uid,
      status: "pending",
      pickup_club: "CENTALLO",
      payment_mode: "points",
      total_euro: 0,
      total_points: Number(reward.points_cost || 0),
      customer_name: user?.full_name || null,
      customer_phone: user?.phone || null,
      customer_email: user?.email || null,
      notes: `Ordine generato automaticamente da riscatto premio MoviBack.`,
      admin_notes: `Riscatto premio: ${reward.name}`,
      order_type: "reward_redemption",
      related_redemption_id: redemption.id,
      special_title: `Premio MoviBack - ${reward.name}`,
      special_notes:
        `Premio riscattato da catalogo MoviBack. ` +
        `Verificare eventuali taglie/colori con il cliente prima dell'ordine al fornitore.`,
    })
    .select("id")
    .single();

  if (storeOrderErr || !storeOrder) {
    console.warn("Store special order creation error:", storeOrderErr);
  } else {
    const { error: storeItemErr } = await sb.from("store_order_items").insert({
      order_id: storeOrder.id,
      product_id: null,
      product_name: reward.name,
      custom_product_name: reward.name,
      custom_variant: reward.category || null,
      quantity: 1,
      unit_price_euro: 0,
      unit_price_points: Number(reward.points_cost || 0),
      total_euro: 0,
      total_points: Number(reward.points_cost || 0),
      supplier_notes:
        reward.description ||
        "Prodotto generato da riscatto premio MoviBack.",
    });

    if (storeItemErr) {
      console.warn("Store special order item creation error:", storeItemErr);
    }
    try {
  await sendTelegramMessage(
    `🎁 NUOVO RISCATTO MOVIBACK\n\n` +
      `👤 ${user?.full_name || "Cliente"}\n` +
      `📞 ${user?.phone || "—"}\n` +
      `🏆 Premio: ${reward.name}\n` +
      `⭐ Punti: ${reward.points_cost}\n\n` +
      `📦 Ordine speciale Store creato\n` +
      `🧾 ID ordine: ${storeOrder.id}`
  );

  await sendAdminPushNotification({
    title: "🎁 Nuovo riscatto MoviBack",
    body: `${user?.full_name || "Cliente"} · ${reward.name}`,
    url: "/admin/store-orders",
  });
} catch (e) {
  console.warn("Reward redemption store notify error (ignored):", e);
}
  }
}

  return NextResponse.json({
    ok: true,
    data: redemption,
  });
}