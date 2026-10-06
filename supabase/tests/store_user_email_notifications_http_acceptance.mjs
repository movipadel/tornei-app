import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (
  process.env.USER_EMAIL_LOCAL_VERIFIED !== "1" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:55421" ||
  process.env.USER_EMAIL_TRANSPORT !== "local"
) throw new Error("Verified local user-email runner required");

const base = process.env.USER_EMAIL_TEST_BASE_URL ?? "http://127.0.0.1:3101";
if (!["http://127.0.0.1:3101", "http://localhost:3100"].includes(base)) {
  throw new Error("Local user-email URL required");
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const userId = randomUUID();
const orderIds = [randomUUID(), randomUUID(), randomUUID()];

async function createOrder(orderId, total = 24) {
  const order = await db.from("store_orders").insert({
    id: orderId,
    user_id: userId,
    status: "pending",
    pickup_club: "MANTA",
    payment_mode: "euro",
    total_euro: total,
    total_points: 0,
    customer_email: "untrusted-payload@example.invalid",
    admin_notes: "Internal margin: never notify",
  });
  assert.ifError(order.error);
  const item = await db.from("store_order_items").insert({
    order_id: orderId,
    product_name: "Felpa MOVI",
    color_name: "Blu",
    size_label: "M",
    quantity: 1,
    total_euro: total,
  });
  assert.ifError(item.error);
}

async function runWorker() {
  const response = await fetch(`${base}/api/cron/user-email-notifications`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  assert.equal(response.status, 200);
  return response.json();
}

try {
  assert.ifError((await db.from("users").insert({
    id: userId,
    full_name: "Store notification acceptance",
    phone: "+390000009992",
    email: `store-${userId}@example.test`,
    gender: "M",
  })).error);

  await createOrder(orderIds[0]);
  const receivedKey = `store:${orderIds[0]}:store.order.received:user:${userId}`;
  let received = await db.from("notification_deliveries")
    .select("status,notification_events!inner(idempotency_key,payload)")
    .eq("notification_events.idempotency_key", receivedKey).single();
  assert.ifError(received.error);
  assert.equal(received.data.status, "pending");
  assert.equal(received.data.notification_events.payload.items[0].name, "Felpa MOVI");
  assert.equal(received.data.notification_events.payload.customer_email, undefined);
  const firstWorker = await runWorker();
  assert.ok(firstWorker.delivered >= 1);
  received = await db.from("notification_deliveries")
    .select("status,provider_message_id,destination_fingerprint,notification_events!inner(idempotency_key)")
    .eq("notification_events.idempotency_key", receivedKey).single();
  assert.equal(received.data.status, "delivered");
  assert.match(received.data.provider_message_id, /^local-/);
  assert.match(received.data.destination_fingerprint, /^[a-f0-9]{64}$/);

  assert.ifError((await db.from("user_notification_preferences")
    .update({ transactional_email_enabled: false })
    .eq("user_id", userId)).error);
  await createOrder(orderIds[1], 12);
  const disabledKey = `store:${orderIds[1]}:store.order.received:user:${userId}`;
  const disabled = await db.from("notification_deliveries")
    .select("status,last_error_code,notification_events!inner(idempotency_key)")
    .eq("notification_events.idempotency_key", disabledKey).single();
  assert.equal(disabled.data.status, "skipped");
  assert.equal(disabled.data.last_error_code, "preferences_disabled");

  assert.ifError((await db.from("user_notification_preferences")
    .update({ transactional_email_enabled: true })
    .eq("user_id", userId)).error);
  assert.ifError((await db.from("store_orders")
    .update({ status: "ready", ready_at: new Date().toISOString() })
    .eq("id", orderIds[0])).error);
  assert.ifError((await db.from("store_orders")
    .update({ status: "ready" }).eq("id", orderIds[0])).error);
  assert.ifError((await db.from("store_orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", orderIds[0])).error);

  await createOrder(orderIds[2], 8);
  assert.ifError((await db.from("store_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: "Internal reason" })
    .eq("id", orderIds[2])).error);
  const transitionEvents = await db.from("notification_events")
    .select("event_type,payload")
    .in("aggregate_id", [orderIds[0], orderIds[2]])
    .in("event_type", ["store.order.ready", "store.order.delivered", "store.order.cancelled"]);
  assert.ifError(transitionEvents.error);
  assert.deepEqual(
    transitionEvents.data.map(event => event.event_type).sort(),
    ["store.order.cancelled", "store.order.delivered", "store.order.ready"]
  );
  assert.ok(transitionEvents.data.every(event => event.payload.cancellation_reason === undefined));

  const failureKey = `store:unsupported:${randomUUID()}`;
  assert.ifError((await db.rpc("enqueue_user_notification", {
    p_event_type: "store.order.unsupported",
    p_domain: "store",
    p_recipient_user_id: userId,
    p_idempotency_key: failureKey,
    p_aggregate_type: "store_order",
    p_aggregate_id: orderIds[0],
    p_payload: {},
  })).error);
  await runWorker();
  const failed = await db.from("notification_deliveries")
    .select("status,notification_events!inner(idempotency_key)")
    .eq("notification_events.idempotency_key", failureKey).single();
  assert.equal(failed.data.status, "failed");
  const business = await db.from("store_orders").select("status").eq("id", orderIds[0]).single();
  assert.equal(business.data.status, "delivered");

  console.log("Store user email HTTP PASS: local receipt, preference skip, ready/delivered/cancelled idempotency, minimized payload and delivery failure isolation.");
} finally {
  await db.from("notification_events").delete().eq("recipient_user_id", userId);
  await db.from("store_orders").delete().in("id", orderIds);
  await db.from("users").delete().eq("id", userId);
}
