import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPhysicalRewardTelegramMessage,
  shouldSchedulePhysicalRewardNotification,
} from "../../src/lib/movibackContracts.ts";

const redemptionId = "00000000-0000-4000-8000-000000000011";

function resultFor(fulfillmentType, overrides = {}) {
  return {
    ok: true,
    created: true,
    replayed: false,
    // The physical rule is derived from authoritative RPC context, not this
    // legacy/generic hint.
    should_notify_staff: false,
    data: {
      id: redemptionId,
      status: fulfillmentType === "service" ? "ready" : "requested",
      qr_deliverable: fulfillmentType === "service",
    },
    notification: {
      reward_name: fulfillmentType === "service" ? "Lezione privata" : "Asciugamano",
      points_cost: 500,
      fulfillment_type: fulfillmentType,
      product_name: fulfillmentType === "store_product" ? "Asciugamano" : null,
      variant_text: fulfillmentType === "store_product" ? "Grigio · UNICA" : null,
      initial_status: fulfillmentType === "service" ? "ready" : "requested",
    },
    ...overrides,
  };
}

test("SERVICE schedules zero physical-preparation Telegram messages", () => {
  assert.equal(shouldSchedulePhysicalRewardNotification(resultFor("service")), false);
});

test("new STORE_PRODUCT with a variant schedules exactly one notification", () => {
  const scheduled = [resultFor("store_product")].filter(
    shouldSchedulePhysicalRewardNotification
  );
  assert.equal(scheduled.length, 1);
});

test("variantless STORE_PRODUCT schedules exactly one notification", () => {
  const result = resultFor("store_product");
  result.notification.reward_name = "Tubo Palline";
  result.notification.product_name = "Tubo Palline";
  result.notification.variant_text = null;

  const scheduled = [result].filter(shouldSchedulePhysicalRewardNotification);
  assert.equal(scheduled.length, 1);

  const message = buildPhysicalRewardTelegramMessage({
    notification: result.notification,
    customerName: "Cliente Test",
    redemptionId,
  });
  assert.match(message, /Tubo Palline/);
  assert.doesNotMatch(message, /Variante:/);
});

test("idempotent replay schedules zero additional notifications", () => {
  const replay = resultFor("store_product", { created: false, replayed: true });
  assert.equal(shouldSchedulePhysicalRewardNotification(replay), false);
});

test("physical message contains operational fields and no delivery credentials", () => {
  const result = resultFor("store_product");
  const message = buildPhysicalRewardTelegramMessage({
    notification: result.notification,
    customerName: "Mario Rossi",
    customerPhone: "000",
    redemptionId,
  });

  assert.match(message, /Mario Rossi/);
  assert.match(message, /Asciugamano/);
  assert.match(message, /500/);
  assert.match(message, /Grigio · UNICA/);
  assert.match(message, /Da preparare/);
  assert.match(message, new RegExp(redemptionId));
  assert.doesNotMatch(message, /qr_token|manual_code|secret/i);
});

test("PF-07 isolates Telegram transport failure from committed redemption success", async () => {
  const route = await readFile(
    new URL("../../src/app/api/moviback/rewards/redeem/route.ts", import.meta.url),
    "utf8"
  );
  const scheduler = await readFile(
    new URL("../../src/lib/postCommitNotifications.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /shouldSchedulePhysicalRewardNotification\(result\)/);
  assert.match(route, /if \(schedulePhysicalTelegram\)/);
  assert.match(route, /schedulePostCommitNotifications/);
  assert.doesNotMatch(route, /status\s*===\s*["']ready["'][\s\S]{0,120}sendTelegramMessage/);
  assert.match(scheduler, /after\(async \(\) =>/);
  assert.match(scheduler, /await perf\.external\(provider, run\)/);
  assert.match(scheduler, /catch \(error\)/);
  assert.ok(
    route.indexOf("schedulePostCommitNotifications") <
      route.lastIndexOf("return NextResponse.json"),
    "post-commit registration must not replace or await the successful response"
  );
});
