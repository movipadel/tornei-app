import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPhysicalRewardTelegramMessage,
  isQrDeliverable,
  isUuid,
  mapMovibackRpcError,
  publicQrToken,
  shouldSchedulePhysicalRewardNotification,
  shouldScheduleStaffNotification,
} from "../../src/lib/movibackContracts.ts";

const result = {
  ok: true,
  created: true,
  replayed: false,
  should_notify_staff: true,
  data: {
    id: "00000000-0000-4000-8000-000000000001",
    status: "ready",
    qr_deliverable: true,
  },
  notification: {
    reward_name: "Lezione privata",
    points_cost: 500,
    fulfillment_type: "service",
    initial_status: "ready",
    action_required: "Erogare il servizio",
  },
};

test("UUID and PF08 errors have stable public contracts", () => {
  assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.deepEqual(mapMovibackRpcError({ message: "PF08_INSUFFICIENT_POINTS" }), {
    status: 409,
    code: "PF08_INSUFFICIENT_POINTS",
    message: "Punti insufficienti",
  });
  assert.equal(mapMovibackRpcError({ message: "raw database detail" }).code, "MOVIBACK_OPERATION_FAILED");
});

test("QR tokens are exposed only for READY redemptions", () => {
  assert.equal(isQrDeliverable("requested"), false);
  assert.equal(isQrDeliverable("processing"), false);
  assert.equal(publicQrToken("requested", "secret-token"), null);
  assert.equal(publicQrToken("ready", "secret-token"), "secret-token");
  assert.equal(isQrDeliverable("delivered"), false);
});

test("SERVICE does not schedule a physical preparation notification", () => {
  assert.equal(shouldSchedulePhysicalRewardNotification(result), false);
  assert.equal(shouldScheduleStaffNotification(result), true);
});

test("only a newly committed STORE_PRODUCT schedules preparation notification", () => {
  const storeResult = {
    ...result,
    data: { ...result.data, status: "requested" },
    notification: {
      ...result.notification,
      fulfillment_type: "store_product",
      product_name: "Asciugamano",
      variant_text: "Grigio · UNICA",
      initial_status: "requested",
    },
  };

  assert.equal(shouldSchedulePhysicalRewardNotification(storeResult), true);
  assert.equal(
    shouldSchedulePhysicalRewardNotification({
      ...storeResult,
      created: false,
      replayed: true,
      should_notify_staff: false,
      notification: null,
    }),
    false
  );
});

test("physical Telegram alert points staff to the authoritative queue", () => {
  const message = buildPhysicalRewardTelegramMessage({
    notification: {
      ...result.notification,
      fulfillment_type: "store_product",
      product_name: "Asciugamano",
      variant_text: "Grigio · UNICA",
    },
    customerName: "Cliente Test",
    customerPhone: "000",
    redemptionId: result.data.id,
  });
  assert.match(message, /Cliente Test/);
  assert.match(message, /Asciugamano/);
  assert.match(message, /Grigio · UNICA/);
  assert.match(message, /Da preparare/);
  assert.match(message, /Richieste premio/);
  assert.match(message, /Telegram è solo un avviso/);
});
