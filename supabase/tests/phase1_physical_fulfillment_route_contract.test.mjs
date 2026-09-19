import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("operator routes expose commands rather than a raw status mutation", async () => {
  const [ready, deliver, cancel, legacy] = await Promise.all([
    read("src/app/api/admin/store-orders/[id]/ready/route.ts"),
    read("src/app/api/admin/store-orders/[id]/deliver/route.ts"),
    read("src/app/api/admin/store-orders/[id]/cancel/route.ts"),
    read("src/app/api/admin/store-orders/update-status/route.ts"),
  ]);
  assert.match(ready, /runStoreFulfillmentCommand\(req, id, "ready"\)/);
  assert.match(deliver, /runStoreFulfillmentCommand\(req, id, "deliver"\)/);
  assert.match(cancel, /runStoreFulfillmentCommand\(req, id, "cancel"\)/);
  assert.match(legacy, /RAW_STATUS_MUTATION_DISABLED/);
  assert.doesNotMatch(legacy, /\.from\("store_orders"\)\.update/);
});

test("supplier export cannot mutate MoviBack fulfillment orders", async () => {
  const route = await read("src/app/api/admin/store-orders/export-summary/route.ts");
  assert.match(route, /\.eq\("order_type", "catalog"\)/);
});

test("command adapter is admin-only and has no notification transport", async () => {
  const helper = await read("src/lib/storeFulfillmentContracts.ts");
  assert.match(helper, /session\.role !== "admin"/);
  assert.match(helper, /mark_physical_store_order_ready/);
  assert.match(helper, /deliver_physical_store_order/);
  assert.match(helper, /cancel_physical_store_order/);
  assert.doesNotMatch(helper, /sendTelegram|sendAdminPush|web-push/);
});

test("customer feed includes recipient-scoped events", async () => {
  const route = await read("src/app/api/user/communications/route.ts");
  assert.match(route, /\.eq\("target", "user"\)/);
  assert.match(route, /\.eq\("recipient_user_id", uid\)/);
});
