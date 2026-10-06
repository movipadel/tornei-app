import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/20261022100000_store_user_email_notifications.sql", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../../src/lib/userNotificationEmail.ts", import.meta.url), "utf8");
const operationalEmail = readFileSync(new URL("../../src/lib/email.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../../src/app/api/store/orders/route.ts", import.meta.url), "utf8");

test("Store notifications map only authoritative customer-facing transitions", () => {
  for (const event of ["store.order.received", "store.order.ready", "store.order.delivered", "store.order.cancelled"]) {
    assert.match(migration, new RegExp(event.replaceAll(".", "\\.")));
    assert.match(renderer, new RegExp(event.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(migration, /store\.order\.(confirmed|ordered_to_supplier)/);
});

test("Store outbox is idempotent, preference-aware and waits for item persistence", () => {
  assert.match(migration, /'store:'\|\|new\.id\|\|':'\|\|v_event_type\|\|':user:'\|\|new\.user_id/);
  assert.match(migration, /store_order_waiting_for_items/);
  assert.match(migration, /transactional_email_enabled/);
  assert.match(migration, /new\.user_id is null then return new/);
});

test("Store customer payload excludes internal economics and staff notes", () => {
  const payloadFunction = migration.slice(
    migration.indexOf("create function public.store_order_user_notification_payload"),
    migration.indexOf("create function public.enqueue_store_order_user_notification")
  );
  assert.doesNotMatch(payloadFunction, /supplier|margin|admin_notes|customer_email|customer_phone|is_paid|paid_at/i);
  assert.match(payloadFunction, /total_euro/);
  assert.match(payloadFunction, /store_order_items/);
});

test("Existing operational MOVI email remains independent", () => {
  assert.match(operationalEmail, /STORE_ORDERS_EMAIL/);
  assert.match(checkout, /sendStoreOrderEmail\(\{ order, items: orderItems \}\)/);
  assert.doesNotMatch(operationalEmail, /transactional_email_enabled|notification_events/);
});
