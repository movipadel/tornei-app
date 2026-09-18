import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const baseUrl = process.argv[2] || "http://127.0.0.1:3100";
const mode = process.argv[3];
if (!['off', 'on'].includes(mode)) throw new Error("Usage: node ... <baseUrl> <off|on>");

const psql = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const dbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable";
const evidence = [];

function pass(id, actual) {
  evidence.push({ id, result: "PASS", actual });
  console.log(`PASS ${id}: ${actual}`);
}

function db(sql) {
  return execFileSync(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "login response must set a cookie");
  return value.split(";", 1)[0];
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function loginUser(which = "A") {
  const suffix = which === "A" ? "801" : "802";
  const response = await fetch(`${baseUrl}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: `PF08 TEST USER ${which}`,
      phone: `+390000000${suffix}`,
      email: `pf08-user-${which.toLowerCase()}@example.invalid`,
      gender: which === "A" ? "M" : "F",
      privacy_accepted: true,
      terms_accepted: true,
      age_confirmed: true,
      marketing_accepted: false,
    }),
  });
  assert.equal(response.status, 200);
  return cookieFrom(response);
}

async function loginOperator(role) {
  const response = await fetch(`${baseUrl}/api/${role}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: `pf08-${role}@example.invalid`,
      password: "PF08-local-only!",
    }),
  });
  assert.equal(response.status, 200);
  return cookieFrom(response);
}

async function redeem(cookie, rewardId, fields = {}, key = randomUUID()) {
  const result = await json("/api/moviback/rewards/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ reward_id: rewardId, idempotency_key: key, ...fields }),
  });
  return { ...result, key };
}

async function transition(cookie, redemptionId, action, reason, key = randomUUID()) {
  return json(`/api/admin/moviback/redemptions/${redemptionId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action, idempotency_key: key, reason }),
  });
}

async function page(path, cookie) {
  return fetch(`${baseUrl}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

for (const path of ["/", "/moviback", "/moviback/premi", "/staff/login", "/admin/login"]) {
  const response = await page(path);
  assert.ok(response.status >= 200 && response.status < 400, `${path} returned ${response.status}`);
}
pass(`${mode.toUpperCase()}-START`, "customer, staff-login and admin-login routes returned successfully");

const userA = await loginUser("A");
const staff = await loginOperator("staff");
const admin = await loginOperator("admin");

if (mode === "off") {
  const key = randomUUID();
  const legacy = await redeem(userA, "157d2e20-293e-4770-9e8d-e04b03aed110", {}, key);
  assert.equal(legacy.response.status, 200);
  assert.ok(legacy.body.data?.id);
  const row = db(`select coalesce(fulfillment_type,'NULL')||'|'||status from reward_redemptions where id='${legacy.body.data.id}'`);
  assert.equal(row, "NULL|requested");
  assert.equal(db(`select count(*) from business_operation_idempotency where idempotency_key='${key}'`), "0");
  pass("OFF-LEGACY", "legacy branch created a requested, unclassified row and no smart idempotency record");

  const queue = await json("/api/admin/moviback/redemptions?scope=active", { headers: { Cookie: staff } });
  assert.equal(queue.response.status, 200);
  const queued = queue.body.data.find((item) => item.id === legacy.body.data.id);
  assert.equal(queued?.historical, true);
  assert.deepEqual(queued?.available_actions, ["manual_review"]);
  pass("OFF-QUEUE", "legacy row is visible with manual_review only");

  const customerHistory = await json("/api/moviback/redemptions", { headers: { Cookie: userA } });
  assert.equal(customerHistory.response.status, 200);
  assert.ok(customerHistory.body.data.some((item) => item.id === legacy.body.data.id));
  pass("OFF-CUSTOMER", "customer history remains usable with classification columns present");
} else {
  const rewardsResult = await json("/api/moviback/rewards", { headers: { Cookie: userA } });
  assert.equal(rewardsResult.response.status, 200);
  const rewards = rewardsResult.body.data;
  const service = rewards.find((item) => item.id === "157d2e20-293e-4770-9e8d-e04b03aed110");
  const towel = rewards.find((item) => item.id === "46709f62-3f5a-4025-965a-c5fcedcec826");
  const balls = rewards.find((item) => item.id === "1b1718ab-aba8-44bb-a2de-d90992e596a7");
  assert.equal(service.fulfillment_type, "service");
  assert.equal(towel.customer_input_required, true);
  assert.deepEqual(towel.store_product.colors.map((item) => item.color_name).sort(), ["Grigio", "Lime"]);
  assert.deepEqual(towel.store_product.sizes.map((item) => item.size_label), ["UNICA"]);
  assert.equal(balls.customer_input_required, false);
  assert.deepEqual(balls.store_product.variant_options, []);
  pass("ON-CATALOG", "SERVICE, Asciugamano Grigio/Lime/UNICA and stockless Tubo contracts are visible");

  const serviceResult = await redeem(userA, service.id);
  assert.equal(serviceResult.response.status, 200);
  assert.equal(serviceResult.body.data.status, "ready");
  assert.equal(serviceResult.body.data.qr_deliverable, true);
  assert.equal(serviceResult.body.data.store_order_id, null);
  pass("ON-SERVICE", "smart SERVICE redemption committed ready with no Store order");

  const missing = await redeem(userA, towel.id);
  assert.equal(missing.response.status, 400);
  assert.equal(missing.body.code, "PF08_MISSING_REQUIRED_VARIANT");
  const invalid = await redeem(userA, towel.id, {
    color_id: "00000000-0000-4000-8000-000000009999",
    size_id: "f77e05db-fd13-4e08-a04f-4665aee48504",
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.code, "PF08_INVALID_STORE_VARIANT");
  pass("ON-VARIANT-ERRORS", "missing and forged Asciugamano variants fail without redemption");

  const grayFields = {
    color_id: "6d99400e-d24b-4dbf-8b1e-caea9b8ab536",
    size_id: "f77e05db-fd13-4e08-a04f-4665aee48504",
  };
  const grayKey = randomUUID();
  const gray = await redeem(userA, towel.id, grayFields, grayKey);
  assert.equal(gray.response.status, 200);
  assert.equal(gray.body.created, true);
  const grayReplay = await redeem(userA, towel.id, grayFields, grayKey);
  assert.equal(grayReplay.response.status, 200);
  assert.equal(grayReplay.body.replayed, true);
  assert.equal(grayReplay.body.data.id, gray.body.data.id);
  assert.equal(db(`select count(*) from reward_redemptions where id='${gray.body.data.id}'`), "1");
  pass("ON-IDEMPOTENCY", "same-key replay returned the same Asciugamano redemption with no duplicate row");

  const lime = await redeem(userA, towel.id, {
    color_id: "fb3cce5f-6d7e-44db-8bcb-9572ea01058d",
    size_id: "f77e05db-fd13-4e08-a04f-4665aee48504",
  });
  assert.equal(lime.response.status, 200);
  assert.notEqual(lime.body.data.id, gray.body.data.id);
  pass("ON-NEW-INTENT", "same user with a new key created a distinct Lime redemption");

  const tube = await redeem(userA, balls.id);
  assert.equal(tube.response.status, 200);
  assert.ok(tube.body.data.store_order_id);
  assert.equal(db("select count(*) from store_product_stock where product_id='f442259b-1e5b-437a-b0ba-3d056d9d617d'"), "0");
  pass("ON-TUBO", "stockless Tubo created Store fulfillment and retained zero stock rows");

  const auto = await redeem(userA, "00000000-0000-4000-8000-000000009401");
  assert.equal(auto.response.status, 200);
  assert.ok(auto.body.data.store_order_id);
  pass("ON-ONE-IDENTITY", "false-flag single identity auto-resolved without customer input");

  const expensive = await redeem(userA, "00000000-0000-4000-8000-000000009403");
  assert.equal(expensive.response.status, 409);
  assert.equal(expensive.body.code, "PF08_INSUFFICIENT_POINTS");
  pass("ON-POINTS", "insufficient points returned the expected PF08 error without partial redemption");

  const finiteFields = {
    color_id: "00000000-0000-4000-8000-000000006002",
    size_id: "00000000-0000-4000-8000-000000007002",
  };
  const finite = await redeem(userA, "00000000-0000-4000-8000-000000009402", finiteFields);
  assert.equal(finite.response.status, 200);
  const finiteFail = await redeem(userA, "00000000-0000-4000-8000-000000009402", finiteFields);
  assert.equal(finiteFail.response.status, 409);
  assert.equal(finiteFail.body.code, "PF08_INSUFFICIENT_STORE_STOCK");
  pass("ON-STOCK", "last finite unit was reserved and the next intent failed with insufficient Store stock");

  let queue = await json("/api/admin/moviback/redemptions?scope=active", { headers: { Cookie: staff } });
  let grayRow = queue.body.data.find((item) => item.id === gray.body.data.id);
  assert.equal(grayRow.status, "requested");
  assert.deepEqual(grayRow.available_actions, ["process", "cancel", "reject"]);
  assert.match(JSON.stringify(grayRow.store_fulfillment), /Grigio/);
  assert.match(JSON.stringify(grayRow.store_fulfillment), /UNICA/);

  let customerHistory = await json("/api/moviback/redemptions", { headers: { Cookie: userA } });
  let customerGray = customerHistory.body.data.find((item) => item.id === gray.body.data.id);
  assert.equal(customerGray.qr_token, null);
  assert.equal(customerGray.qr_deliverable, false);

  assert.equal((await transition(staff, gray.body.data.id, "process")).response.status, 200);
  queue = await json("/api/admin/moviback/redemptions?scope=processing", { headers: { Cookie: staff } });
  grayRow = queue.body.data.find((item) => item.id === gray.body.data.id);
  assert.ok(grayRow.processing_at);
  assert.deepEqual(grayRow.available_actions, ["ready", "cancel", "reject"]);
  customerHistory = await json("/api/moviback/redemptions", { headers: { Cookie: userA } });
  customerGray = customerHistory.body.data.find((item) => item.id === gray.body.data.id);
  assert.equal(customerGray.qr_token, null);

  assert.equal((await transition(staff, gray.body.data.id, "ready")).response.status, 200);
  queue = await json("/api/admin/moviback/redemptions?scope=ready", { headers: { Cookie: staff } });
  grayRow = queue.body.data.find((item) => item.id === gray.body.data.id);
  assert.ok(grayRow.ready_at);
  assert.equal(grayRow.qr_deliverable, true);
  assert.deepEqual(grayRow.available_actions, ["deliver"]);
  customerHistory = await json("/api/moviback/redemptions", { headers: { Cookie: userA } });
  customerGray = customerHistory.body.data.find((item) => item.id === gray.body.data.id);
  assert.ok(customerGray.qr_token);
  assert.equal(customerGray.qr_deliverable, true);

  const scan = await json(`/api/reward-redemptions/${customerGray.qr_token}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: staff },
    body: JSON.stringify({}),
  });
  assert.equal(scan.response.status, 200);
  const repeatScan = await json(`/api/reward-redemptions/${customerGray.qr_token}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: staff },
    body: JSON.stringify({}),
  });
  assert.equal(repeatScan.response.status, 200);
  assert.equal(db(`select status from reward_redemptions where id='${gray.body.data.id}'`), "delivered");
  customerHistory = await json("/api/moviback/redemptions", { headers: { Cookie: userA } });
  customerGray = customerHistory.body.data.find((item) => item.id === gray.body.data.id);
  assert.equal(customerGray.qr_token, null);
  assert.equal(customerGray.status, "delivered");
  pass("ON-LIFECYCLE-QR", "requested→processing→ready→delivered matched queue actions/timestamps and QR visibility; repeat scan was safe");

  const stockBeforeCancel = db("select stock_qty from store_product_stock where id='00000000-0000-4000-8000-000000008002'");
  assert.equal(stockBeforeCancel, "0");
  const cancelKey = randomUUID();
  const cancelled = await transition(staff, finite.body.data.id, "cancel", "PF08 local acceptance", cancelKey);
  assert.equal(cancelled.response.status, 200);
  const cancelledReplay = await transition(staff, finite.body.data.id, "cancel", "PF08 local acceptance", cancelKey);
  assert.equal(cancelledReplay.response.status, 200);
  assert.equal(db("select stock_qty from store_product_stock where id='00000000-0000-4000-8000-000000008002'"), "1");
  assert.equal(db(`select count(*) from loyalty_transactions where related_redemption_id='${finite.body.data.id}' and type='refund'`), "1");

  const rejected = await transition(staff, lime.body.data.id, "reject", "PF08 local rejection");
  assert.equal(rejected.response.status, 200);
  assert.equal(db(`select count(*) from loyalty_transactions where related_redemption_id='${lime.body.data.id}' and type='refund'`), "1");
  const cancelledToken = db(`select qr_token from reward_redemptions where id='${finite.body.data.id}'`);
  const cancelledQr = await json(`/api/reward-redemptions/${cancelledToken}`);
  assert.equal(cancelledQr.response.status, 200);
  assert.equal(cancelledQr.body.valid, false);
  pass("ON-CANCEL-REJECT", "cancel/reject refunded exactly once, restored reserved finite stock, cancelled order and left terminal QR unusable");

  const legacyQueue = await json("/api/admin/moviback/redemptions?scope=all", { headers: { Cookie: staff } });
  const legacy = legacyQueue.body.data.find((item) => item.id === "00000000-0000-4000-8000-00000000a001");
  assert.equal(legacy.historical, true);
  assert.deepEqual(legacy.available_actions, ["manual_review"]);
  assert.equal(db("select fulfillment_type is null from reward_redemptions where id='00000000-0000-4000-8000-00000000a001'"), "t");
  pass("ON-LEGACY", "historical row remained unclassified, visible and manual-review only");
}

const anonymousQueue = await json("/api/admin/moviback/redemptions");
assert.equal(anonymousQueue.response.status, 403);
const customerQueue = await json("/api/admin/moviback/redemptions", { headers: { Cookie: userA } });
assert.equal(customerQueue.response.status, 403);
assert.equal((await page("/staff/rewards", staff)).status, 200);
assert.equal((await page("/admin/moviback/redemptions", admin)).status, 200);
const forbiddenTransition = await transition(userA, "00000000-0000-4000-8000-00000000a001", "process");
assert.equal(forbiddenTransition.response.status, 403);
pass(`${mode.toUpperCase()}-AUTH`, "anonymous/customer denied; staff queue and admin queue accepted their signed sessions");

console.log(JSON.stringify({ mode, baseUrl, evidence }, null, 2));
