import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const local = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(local.API_URL, "http://127.0.0.1:55421");
assert.equal(local.DB_URL, "postgresql://postgres:postgres@127.0.0.1:55422/postgres");
assert.ok(!local.linked_project);
const app = process.env.MOVI_TEST_APP_URL ?? "http://127.0.0.1:3102";
assert.equal(new URL(app).hostname, "127.0.0.1");
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const db = local.DB_URL;
const [staff, auth, user, player, membership, certificate] = Array.from({ length: 6 }, () => randomUUID());
const phone = `340${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`;
const path = `${user}/synthetic-customer-admin-${certificate}.pdf`;
const headers = { apikey: local.SERVICE_ROLE_KEY, Authorization: `Bearer ${local.SERVICE_ROLE_KEY}` };
function sql(statement) {
  const result = spawnSync(psql, [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], {
    encoding: "utf8", windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function cookies(response) {
  return (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean))
    .map((value) => value.split(";", 1)[0]).join("; ");
}
const bucket = await fetch(`${local.API_URL}/storage/v1/bucket`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ id: "medical-certificates", name: "medical-certificates", public: false }) });
const bucketBody = await bucket.text();
assert.ok(bucket.ok || bucket.status === 409 || bucketBody.includes("BucketAlreadyExists"), bucketBody);
let fixtureCreated = false;
try {
  sql(`
    insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
      values('${staff}','Synthetic Customer Admin','customer-admin-${staff}@example.invalid',crypt('Local-only-test-password',gen_salt('bf')),'admin',true);
    insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
      values('${auth}','customer-${user}@example.invalid',now(),now(),now());
    insert into public.users(id,full_name,phone,email,gender,auth_user_id,auth_migration_state)
      values('${user}','Synthetic Linked Customer','${phone}','customer-${user}@example.invalid','F','${auth}','linked');
    insert into public.player_identities(id,full_name,normalized_phone,gender,account_user_id)
      values('${player}','Synthetic Linked Customer','+39${phone}','F','${user}');
    insert into public.loyalty_memberships(id,user_id,status,suspension_reason,suspended_at,membership_code,tax_code,membership_type,fee_paid,approved_at)
      values('${membership}','${user}','suspended','Uscita volontaria utente',now()-interval '1 day','TEST-CUST-${membership.slice(0,8)}','RSSMRA90A01H501U','ASC',true,now()-interval '90 days');
    insert into public.medical_certificates(id,user_id,file_path,status,expiry_date)
      values('${certificate}','${user}','${path}','pending_review',current_date+90);
    insert into public.loyalty_transactions(membership_id,type,source,points_delta)
      select '${membership}','earn','club_payment',1 from generate_series(1,81);
  `);
  fixtureCreated = true;
  const uploaded = await fetch(`${local.API_URL}/storage/v1/object/medical-certificates/${path}`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: Buffer.from("%PDF-1.4\n% synthetic LOCAL certificate\n%%EOF\n"),
  });
  assert.ok(uploaded.ok, await uploaded.text());
  const form = new FormData(); form.set("email", `customer-admin-${staff}@example.invalid`); form.set("password", "Local-only-test-password");
  const login = await fetch(`${app}/api/admin/login`, { method: "POST", body: form });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = cookies(login);
  const json = async (url, options = {}) => { const response = await fetch(`${app}${url}`, { ...options, headers: { Cookie: cookie, ...(options.headers ?? {}) } }); return { status: response.status, body: await response.json() }; };
  const detailUrl = `/api/admin/players/${player}/customer`;
  let detail = await json(detailUrl);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.account.auth_linked, true);
  assert.equal(detail.body.data.player.account_user_id, user);
  assert.equal(detail.body.data.account_identity_consistency.severity, "CONSISTENT");
  assert.deepEqual(detail.body.data.account_identity_consistency.findings, []);
  assert.equal(detail.body.data.account_drift.phone, false);
  assert.equal(detail.body.data.points_balance, 81);
  assert.equal(detail.body.data.transactions.length, 20);
  assert.equal(detail.body.data.certificate_review_allowed, true);
  assert.equal(detail.body.data.reactivation.allowed, false);
  const reactivateUrl = `/api/admin/moviback/users/${membership}/reactivate`;
  let action = await json(reactivateUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Rientro richiesto dal cliente" }) });
  assert.equal(action.status, 409);
  action = await json(`/api/admin/moviback/certificates/${certificate}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", membership_id: membership }) });
  assert.equal(action.status, 200, JSON.stringify(action.body));
  assert.equal(action.body.data.membership_status, "suspended");
  detail = await json(detailUrl);
  assert.equal(detail.body.data.membership.status, "suspended");
  assert.equal(detail.body.data.reactivation.allowed, true);
  assert.equal(detail.body.data.eligibility.can_use_card, false);
  action = await json(reactivateUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Rientro richiesto dal cliente" }) });
  assert.equal(action.status, 200, JSON.stringify(action.body));
  detail = await json(detailUrl);
  assert.equal(detail.body.data.membership.status, "approved");
  assert.equal(detail.body.data.eligibility.can_use_card, true);
  assert.equal(detail.body.data.eligibility.can_earn_points, true);
  assert.equal(detail.body.data.eligibility.can_redeem, true);
  assert.equal(detail.body.data.points_balance, 81);
  assert.equal(detail.body.data.audit_events.length, 2);
  assert.equal(sql(`select coalesce(sum(points_delta),0) from public.loyalty_transactions where membership_id='${membership}'`), "81");
  console.log("MoviBack Customer Admin HTTP acceptance PASS: linked synthetic profile, review, explicit reactivation, audit, 81-row balance.");
} finally {
  if (fixtureCreated) sql(`begin;
    alter table public.moviback_customer_audit_events disable trigger moviback_customer_audit_append_only;
    delete from public.moviback_customer_audit_events where membership_id='${membership}';
    alter table public.moviback_customer_audit_events enable trigger moviback_customer_audit_append_only;
    delete from public.loyalty_transactions where membership_id='${membership}';
    delete from public.medical_certificates where id='${certificate}';
    delete from public.loyalty_memberships where id='${membership}';
    alter table public.player_identities disable trigger player_identity_guard;
    delete from public.player_identities where id='${player}';
    alter table public.player_identities enable trigger player_identity_guard;
    delete from public.users where id='${user}';
    delete from auth.users where id='${auth}';
    delete from public.staff_users where id='${staff}';
    commit;`);
  await fetch(`${local.API_URL}/storage/v1/object/medical-certificates/${path}`, { method: "DELETE", headers });
}
