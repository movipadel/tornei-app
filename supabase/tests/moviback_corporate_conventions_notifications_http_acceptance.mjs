import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (
  process.env.USER_EMAIL_LOCAL_VERIFIED !== "1" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:55421" ||
  process.env.USER_EMAIL_TRANSPORT !== "local" ||
  process.env.RESEND_API_KEY !== "re_local_disabled"
) throw new Error("Verified synthetic local email runner required");

const base = process.env.USER_EMAIL_TEST_BASE_URL;
if (base !== "http://127.0.0.1:3101") throw new Error("C7 acceptance requires the isolated local app on 3101");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const staff = randomUUID();
const agreement = randomUUID();
const enabledUser = randomUUID();
const skippedUser = randomUUID();
const failedUser = randomUUID();
const enabledMembership = randomUUID();
const skippedMembership = randomUUID();
const failedMembership = randomUUID();

async function insert(table, rows) {
  const result = await db.from(table).insert(rows);
  assert.ifError(result.error);
}

await insert("staff_users", { id: staff, full_name: "Synthetic C7 HTTP Operator", email: `c7-${staff}@example.invalid`, role: "admin", is_active: true });
await insert("users", [
  { id: enabledUser, full_name: "Synthetic C7 Delivered", phone: `34${enabledUser.replaceAll("-", "").slice(0, 8)}`, email: `c7-delivered-${enabledUser}@example.invalid`, gender: "M" },
  { id: skippedUser, full_name: "Synthetic C7 Skipped", phone: `35${skippedUser.replaceAll("-", "").slice(0, 8)}`, email: `c7-skipped-${skippedUser}@example.invalid`, gender: "F" },
  { id: failedUser, full_name: "Synthetic C7 Failed", phone: `36${failedUser.replaceAll("-", "").slice(0, 8)}`, email: null, gender: "M" },
]);
await insert("loyalty_memberships", [
  { id: enabledMembership, user_id: enabledUser, status: "approved", membership_code: `C7E-${enabledMembership.slice(0, 8)}`, tax_code: "RSSMRA90A01H501U", approved_at: new Date().toISOString(), approved_by: staff, membership_type: "ASC" },
  { id: skippedMembership, user_id: skippedUser, status: "approved", membership_code: `C7S-${skippedMembership.slice(0, 8)}`, tax_code: "VRDLGI90A01H501W", approved_at: new Date().toISOString(), approved_by: staff, membership_type: "ASC" },
  { id: failedMembership, user_id: failedUser, status: "approved", membership_code: `C7F-${failedMembership.slice(0, 8)}`, tax_code: "RSSPLA90A01H501A", approved_at: new Date().toISOString(), approved_by: staff, membership_type: "ASC" },
]);
await insert("moviback_agreements", { id: agreement, name: "Synthetic C7 HTTP Agreement", slug: `synthetic-c7-${agreement}`, status: "active", multiplier: 3, valid_from: new Date(Date.now() - 3600000).toISOString(), valid_until: new Date(Date.now() + 86400000).toISOString(), created_by: staff });

assert.ifError((await db.from("user_notification_preferences").update({ transactional_email_enabled: false }).eq("user_id", skippedUser)).error);

const assigned = [];
for (const membership of [enabledMembership, skippedMembership, failedMembership]) {
  const result = await db.rpc("assign_moviback_agreement", { p_membership_id: membership, p_agreement_id: agreement, p_effective_from: null, p_effective_until: null, p_actor_staff_id: staff });
  assert.ifError(result.error);
  assigned.push(result.data.id);
}

const events = await db.from("notification_events").select("id,event_type,recipient_user_id,aggregate_id,payload").in("aggregate_id", assigned);
assert.ifError(events.error);
assert.equal(events.data.length, 3);
assert.ok(events.data.every(event => event.event_type === "moviback.agreement.activated"));
assert.ok(events.data.every(event => event.payload.agreement_name === "Synthetic C7 HTTP Agreement"));
assert.ok(events.data.every(event => event.payload.email === undefined));

const skippedBefore = await db.from("notification_deliveries").select("status,last_error_code,notification_events!inner(aggregate_id)").eq("notification_events.aggregate_id", assigned[1]).single();
assert.ifError(skippedBefore.error);
assert.equal(skippedBefore.data.status, "skipped");
assert.equal(skippedBefore.data.last_error_code, "preferences_disabled");

const response = await fetch(`${base}/api/cron/user-email-notifications`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
assert.equal(response.status, 200);
const worker = await response.json();
assert.ok(worker.delivered >= 1);
assert.ok(worker.failed >= 1);

const deliveries = await db.from("notification_deliveries").select("status,provider_message_id,destination_fingerprint,notification_events!inner(aggregate_id)").in("notification_events.aggregate_id", assigned);
assert.ifError(deliveries.error);
const byAggregate = new Map(deliveries.data.map(item => [item.notification_events.aggregate_id, item]));
assert.equal(byAggregate.get(assigned[0]).status, "delivered");
assert.match(byAggregate.get(assigned[0]).provider_message_id, /^local-/);
assert.match(byAggregate.get(assigned[0]).destination_fingerprint, /^[a-f0-9]{64}$/);
assert.equal(byAggregate.get(assigned[1]).status, "skipped");
assert.equal(byAggregate.get(assigned[2]).status, "failed");

const business = await db.from("moviback_agreement_entitlements").select("id,status").in("id", assigned);
assert.ifError(business.error);
assert.equal(business.data.length, 3);
assert.ok(business.data.every(row => row.status === "active"), "delivery failure must not roll back an entitlement");

console.log("MoviBack C7 HTTP PASS: shared worker, synthetic delivery, preference skip, safe payload and provider-failure isolation.");
