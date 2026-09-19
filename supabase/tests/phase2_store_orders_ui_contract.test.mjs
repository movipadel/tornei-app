import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canSafelyCancel,
  operationalStatusLabel,
  resolveOperationalStatus,
  resolveOperationalView,
  resolveOrderSource,
  resolvePrimaryAction,
  visibleVariant,
} from "../../src/lib/storeOrderOperational.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function storeOrder(status = "pending") {
  return {
    status,
    order_type: "catalog",
    related_redemption_id: null,
    reward_redemption: null,
  };
}

function movibackOrder(orderStatus = "pending", redemptionStatus = "requested") {
  return {
    status: orderStatus,
    order_type: "reward_redemption",
    related_redemption_id: "00000000-0000-4000-8000-000000000001",
    reward_redemption: {
      id: "00000000-0000-4000-8000-000000000001",
      status: redemptionStatus,
      fulfillment_type: "store_product",
    },
  };
}

test("technical states collapse into the four visible lifecycle labels", () => {
  for (const status of ["pending", "confirmed", "ordered_to_supplier"]) {
    assert.equal(resolveOperationalStatus(storeOrder(status)), "preparing");
    assert.equal(operationalStatusLabel("preparing"), "Da preparare");
  }
  assert.equal(resolveOperationalStatus(storeOrder("ready")), "ready");
  assert.equal(resolveOperationalStatus(storeOrder("delivered")), "delivered");
  assert.equal(resolveOperationalStatus(storeOrder("cancelled")), "cancelled");
});

test("source badges are derived from coherent origin evidence only", () => {
  assert.equal(resolveOrderSource(storeOrder()), "STORE");
  assert.equal(resolveOrderSource(movibackOrder()), "MOVIBACK");
  assert.equal(
    resolveOrderSource({
      ...movibackOrder(),
      reward_redemption: { ...movibackOrder().reward_redemption, fulfillment_type: "service" },
    }),
    "CONFLICT"
  );
  assert.equal(
    resolveOrderSource({ ...storeOrder(), related_redemption_id: "unexpected" }),
    "CONFLICT"
  );
});

test("one primary action follows the operational state", () => {
  assert.equal(resolvePrimaryAction(storeOrder("pending")), "ready");
  assert.equal(resolvePrimaryAction(storeOrder("ready")), "deliver");
  assert.equal(resolvePrimaryAction(storeOrder("delivered")), null);
  assert.equal(resolvePrimaryAction(storeOrder("cancelled")), null);
});

test("MoviBack cancellation is visible only before supplier commitment", () => {
  assert.equal(canSafelyCancel(movibackOrder("pending", "requested")), true);
  assert.equal(canSafelyCancel(movibackOrder("confirmed", "processing")), false);
  assert.equal(canSafelyCancel(movibackOrder("ready", "ready")), false);
  assert.equal(canSafelyCancel(storeOrder("pending")), false);
});

test("Osimani-type delivered/ready mismatch is a conflict with no action", () => {
  const mismatched = movibackOrder("delivered", "ready");
  assert.equal(resolveOperationalStatus(mismatched), "conflict");
  assert.equal(resolveOperationalView(mismatched), "preparing");
  assert.equal(resolvePrimaryAction(mismatched), null);
  assert.equal(canSafelyCancel(mismatched), false);
});

test("history contains terminal coherent rows and exposes no actions", () => {
  for (const order of [storeOrder("delivered"), storeOrder("cancelled"), movibackOrder("delivered", "delivered")]) {
    assert.equal(resolveOperationalView(order), "history");
    assert.equal(resolvePrimaryAction(order), null);
  }
});

test("variant presentation omits fabricated values", () => {
  assert.equal(visibleVariant({ color_name: "Lime", size_label: "UNICA" }), "Lime · UNICA");
  assert.equal(visibleVariant({ color_name: null, size_label: null }), "");
});

test("Ordini Store UI uses command routes and no legacy raw endpoint", async () => {
  const page = await read("src/app/admin/store-orders/page.tsx");
  assert.match(page, /\/api\/admin\/store-orders\/\$\{order\.id\}\/\$\{action\}/);
  assert.doesNotMatch(page, /store-orders\/update-status/);
  assert.doesNotMatch(page, /<select[^>]+value=\{order\.status\}/);
  assert.match(page, /Premio pronto\. Notifica cliente registrata\./);
  assert.match(page, /resolvePrimaryAction/);
  assert.match(page, /canSafelyCancel/);
});

test("list API supplies linked redemption and automatic supplier eligibility", async () => {
  const [listRoute, exportRoute] = await Promise.all([
    read("src/app/api/admin/store-orders/route.ts"),
    read("src/app/api/admin/store-orders/export-summary/route.ts"),
  ]);
  assert.match(listRoute, /\.from\("reward_redemptions"\)/);
  assert.match(listRoute, /reward_redemption:/);
  assert.match(listRoute, /supplier_export_eligible_unit_count/);
  assert.match(exportRoute, /claim_supplier_export_batch/);
  assert.doesNotMatch(exportRoute, /order_ids/);
  assert.doesNotMatch(exportRoute, /status:\s*["']confirmed["']/);
});

test("SERVICE has no physical queue creator in the UI and invalid linked service is blocked", async () => {
  const page = await read("src/app/admin/store-orders/page.tsx");
  assert.doesNotMatch(page, /fulfillment_type\s*===\s*["']service["']/);
  const invalidServiceOrder = {
    ...movibackOrder(),
    reward_redemption: { ...movibackOrder().reward_redemption, fulfillment_type: "service" },
  };
  assert.equal(resolveOperationalStatus(invalidServiceOrder), "conflict");
  assert.equal(resolvePrimaryAction(invalidServiceOrder), null);
});
