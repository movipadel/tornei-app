import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("cancel API requires an explicit stock decision", async () => {
  const helper = await read("src/lib/storeFulfillmentContracts.ts");
  assert.match(helper, /typeof reintegrateStock !== "boolean"/);
  assert.match(helper, /p_reintegrate_stock = reintegrateStock/);
  assert.match(helper, /STOCK_DECISION_REQUIRED/);
  assert.doesNotMatch(helper, /sendTelegram|sendAdminPush|web-push/);
});

test("Ordini Store exposes a unified secondary cancellation modal", async () => {
  const page = await read("src/app/admin/store-orders/page.tsx");
  assert.match(page, /Sì, aggiungi allo stock/);
  assert.match(page, /No, non modificare lo stock/);
  assert.match(page, /I punti MoviBack verranno reintegrati automaticamente/);
  assert.match(page, /reintegrate_stock: reintegrateStock/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test("physical MoviBack cancellation cannot bypass the stock decision", async () => {
  const [transition, queue] = await Promise.all([
    read("src/app/api/admin/moviback/redemptions/[id]/transition/route.ts"),
    read("src/app/api/admin/moviback/redemptions/route.ts"),
  ]);
  assert.match(transition, /PHYSICAL_CANCELLATION_USE_STORE_ORDERS/);
  assert.match(transition, /store_product/);
  assert.match(transition, /custom_physical/);
  assert.match(queue, /isPhysical/);
});

test("operational policy allows pre-delivery Store and MoviBack cancellation", async () => {
  const policy = await read("src/lib/storeOrderOperational.ts");
  assert.match(policy, /status === "preparing" \|\| status === "ready"/);
  assert.match(policy, /source !== "CONFLICT"/);
});
