import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatManualRewardCode,
  normalizeManualRewardCode,
  publicManualRewardCode,
  publicQrToken,
} from "../../src/lib/movibackContracts.ts";

const rewardDeliveryRoute = readFileSync(
  new URL("../../src/app/api/staff/reward-delivery/route.ts", import.meta.url),
  "utf8"
);
const staffPage = readFileSync(
  new URL("../../src/app/staff/page.tsx", import.meta.url),
  "utf8"
);
const scannerPage = readFileSync(
  new URL("../../src/app/staff/scanner/page.tsx", import.meta.url),
  "utf8"
);
const customerPage = readFileSync(
  new URL("../../src/app/moviback/page.tsx", import.meta.url),
  "utf8"
);
const redeemRoute = readFileSync(
  new URL("../../src/app/api/moviback/rewards/redeem/route.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../migrations/20260918160000_pf08_reward_manual_code.sql",
    import.meta.url
  ),
  "utf8"
);

test("manual reward codes normalize safely and display as 4+4", () => {
  assert.equal(normalizeManualRewardCode("7k4m-2q8r"), "7K4M2Q8R");
  assert.equal(normalizeManualRewardCode(" 7K4M 2Q8R "), "7K4M2Q8R");
  assert.equal(formatManualRewardCode("7K4M2Q8R"), "7K4M-2Q8R");
  assert.equal(normalizeManualRewardCode("O01I-L234"), null);
  assert.equal(normalizeManualRewardCode("too-short"), null);
});

test("QR and manual credentials share readiness and terminal hiding", () => {
  for (const status of ["requested", "processing", "delivered", "cancelled", "rejected"]) {
    assert.equal(publicQrToken(status, "qr-secret"), null);
    assert.equal(publicManualRewardCode(status, "7K4M2Q8R"), null);
  }
  assert.equal(publicQrToken("ready", "qr-secret"), "qr-secret");
  assert.equal(publicManualRewardCode("ready", "7K4M2Q8R"), "7K4M2Q8R");
});

test("database generation is indexed, immutable, bounded and atomic with redemption", () => {
  assert.match(migration, /reward_redemptions_manual_code_unique/);
  assert.match(migration, /FOR v_attempt IN 1\.\.10 LOOP/);
  assert.match(migration, /gen_random_bytes/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /reward_redemptions_manual_code_immutable/);
  assert.match(migration, /redeem_moviback_reward_pf08b2r3/);
  assert.match(migration, /manual_code_deliverable/);
});

test("staff reward endpoint is authenticated, bounded and converges on lifecycle RPC", () => {
  assert.match(rewardDeliveryRoute, /await guardStaff\(\)/);
  assert.match(rewardDeliveryRoute, /value\.length > 512/);
  assert.match(rewardDeliveryRoute, /\.eq\(credential\.kind, credential\.value\)/);
  assert.match(rewardDeliveryRoute, /deliver_moviback_redemption/);
  assert.match(rewardDeliveryRoute, /Premio non ancora pronto/);
  assert.match(rewardDeliveryRoute, /Codice premio non valido/);
  assert.doesNotMatch(rewardDeliveryRoute, /\.update\(\{\s*status/);
});

test("point accreditation and reward delivery remain separate staff flows", () => {
  assert.match(staffPage, /\/api\/staff\/lookup-membership/);
  assert.match(staffPage, /\/api\/staff\/earn-points/);
  assert.match(staffPage, /RewardDeliveryPanel/);
  assert.match(staffPage, /mode=points/);
  assert.match(scannerPage, /mode === "reward"/);
  assert.match(scannerPage, /mode=reward|reward=/);
  assert.match(scannerPage, /usa la sezione Consegna Premio/);
});

test("customer response and UI reveal both credentials only when ready", () => {
  assert.match(redeemRoute, /publicQrToken\(result\.data\.status/);
  assert.match(redeemRoute, /publicManualRewardCode/);
  assert.match(customerPage, /Codice premio/);
  assert.match(customerPage, /Se il QR non viene letto, comunica questo codice allo staff/);
});
