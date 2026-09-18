import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSmartRedemptionMode } from "../../src/lib/movibackContracts.ts";
import {
  actionLabel,
  fulfillmentLabel,
  needsReason,
  safeAvailableActions,
  STAFF_QUEUE_FILTERS,
  statusLabel,
  storeVariantText,
} from "../../src/lib/movibackStaffQueue.ts";

const queueRoute = readFileSync(
  new URL("../../src/app/api/admin/moviback/redemptions/route.ts", import.meta.url),
  "utf8"
);
const queueComponent = readFileSync(
  new URL("../../src/components/moviback/RewardRequestsQueue.tsx", import.meta.url),
  "utf8"
);

test("staff filters and Italian status labels cover the operational queue", () => {
  assert.deepEqual(
    STAFF_QUEUE_FILTERS.map((filter) => filter.value),
    ["active", "requested", "processing", "ready", "delivered", "terminal", "all"]
  );
  assert.equal(statusLabel("requested"), "Richiesto");
  assert.equal(statusLabel("processing"), "In lavorazione");
  assert.equal(statusLabel("ready"), "Pronto");
  assert.equal(statusLabel("delivered"), "Consegnato");
  assert.equal(statusLabel("cancelled"), "Annullato");
  assert.equal(statusLabel("rejected"), "Rifiutato");
});

test("UI exposes only backend lifecycle actions and blocks historical rows", () => {
  assert.deepEqual(
    safeAvailableActions(["process", "cancel", "manual_review", "invented"], false),
    ["process", "cancel"]
  );
  assert.deepEqual(safeAvailableActions(["deliver"], true), []);
  assert.equal(needsReason("cancel"), true);
  assert.equal(needsReason("reject"), true);
  assert.equal(needsReason("ready"), false);
});

test("fulfillment copy distinguishes services, Store delivery and variants", () => {
  assert.equal(fulfillmentLabel("service"), "Servizio");
  assert.equal(fulfillmentLabel("store_product"), "Prodotto Store");
  assert.equal(actionLabel("deliver", "service"), "Erogato");
  assert.equal(actionLabel("deliver", "store_product"), "Consegnato");
  assert.equal(
    storeVariantText({ color_name: "Grigio", size_label: "UNICA" }),
    "Grigio · UNICA"
  );
  assert.equal(storeVariantText({}), "Nessuna variante cliente");
});

test("smart redemption flag has explicit safe ON/OFF behavior", () => {
  assert.equal(resolveSmartRedemptionMode("false", "development"), false);
  assert.equal(resolveSmartRedemptionMode("true", "production"), true);
  assert.equal(resolveSmartRedemptionMode(undefined, "development"), true);
  assert.equal(resolveSmartRedemptionMode(undefined, "production"), false);
});

test("queue API is guarded, bounded, filtered and batches Store fulfillment", () => {
  assert.match(queueRoute, /await guardStaff\(\)/);
  assert.match(queueRoute, /Math\.min\(Math\.max\(requestedLimit, 1\), 200\)/);
  assert.match(queueRoute, /query\.in\("status", statuses\)/);
  assert.match(queueRoute, /\.in\("related_redemption_id", ids\)/);
  assert.match(queueRoute, /has_more/);
});

test("queue refreshes authoritatively without polling", () => {
  assert.match(queueComponent, /await load\(0\)/);
  assert.match(queueComponent, /available_actions/);
  assert.doesNotMatch(queueComponent, /setInterval|setTimeout/);
});
