import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMovibackStaffTelegramMessage,
  isQrDeliverable,
  isUuid,
  mapMovibackRpcError,
  publicQrToken,
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

test("only a newly committed redemption schedules staff notification", () => {
  assert.equal(shouldScheduleStaffNotification(result), true);
  assert.equal(
    shouldScheduleStaffNotification({
      ...result,
      created: false,
      replayed: true,
      should_notify_staff: false,
      notification: null,
    }),
    false
  );
});

test("service Telegram alert points staff to the authoritative queue", () => {
  const message = buildMovibackStaffTelegramMessage({
    notification: result.notification,
    customerName: "Cliente Test",
    customerPhone: "000",
  });
  assert.match(message, /Cliente Test/);
  assert.match(message, /Nessuna gestione ordine Store richiesta/);
  assert.match(message, /Richieste premio/);
  assert.match(message, /Telegram è solo un avviso/);
});
