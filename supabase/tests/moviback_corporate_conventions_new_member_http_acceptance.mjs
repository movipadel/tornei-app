import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const app = process.env.MOVI_TEST_APP_URL ?? "http://127.0.0.1:3102";
const db = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const local = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(local.API_URL, "http://127.0.0.1:55421");
assert.ok(!local.linked_project);

const staff = "f2620000-0000-4000-8000-000000000001";
const agreement = "c2620000-0000-4000-8000-000000000001";
const users = ["a2620000-0000-4000-8000-000000000001", "a2620000-0000-4000-8000-000000000002"];
const tokens = ["02620000-0000-4000-8000-000000000001", "02620000-0000-4000-8000-000000000002", "02620000-0000-4000-8000-000000000003"];
const paths = [
  `${users[0]}/enrollment-${tokens[0]}-invalid.pdf`,
  `${users[0]}/enrollment-${tokens[1]}-valid.pdf`,
  `${users[1]}/enrollment-${tokens[2]}-plain.pdf`,
];
const storageHeaders = {
  apikey: local.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
function sql(statement) {
  const result = spawnSync(psql, [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], {
    encoding: "utf8", windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function hash(code) {
  return `sha256:${createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex")}`;
}
function cookies(response) {
  return (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean))
    .map((value) => value.split(";", 1)[0]).join("; ");
}
async function login(index) {
  const response = await fetch(`${app}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: `340000028${index + 1}`, email: `c5-http-${index + 1}@example.invalid` }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return cookies(response);
}
async function adminLogin() {
  const form = new FormData();
  form.set("email", "c5-http-operator@example.invalid");
  form.set("password", "C5-local-pass");
  const response = await fetch(`${app}/api/admin/login`, { method: "POST", body: form });
  assert.equal(response.status, 200, await response.clone().text());
  return cookies(response);
}
function enrollmentForm(token, filename, code = "") {
  const form = new FormData();
  form.set("tax_code", "RSSMRA90A01H501U");
  form.set("membership_type", "ASC");
  form.set("has_existing_membership", "false");
  form.set("existing_membership_type", "");
  form.set("existing_membership_number", "");
  form.set("expiry_date", "2027-12-31");
  form.set("agreement_code", code);
  form.set("idempotency_key", token);
  form.set("certificate", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], filename, { type: "application/pdf" }));
  return form;
}
const cleanup = `
begin; set local session_replication_role=replica;
delete from public.moviback_membership_enrollment_requests where user_id in ('${users.join("','")}');
delete from public.moviback_agreement_audit_events where agreement_id='${agreement}';
delete from public.moviback_agreement_entitlements where membership_id in (select id from public.loyalty_memberships where user_id in ('${users.join("','")}'));
delete from public.moviback_agreement_codes where agreement_id='${agreement}';
delete from public.moviback_agreements where id='${agreement}';
delete from public.medical_certificates where user_id in ('${users.join("','")}');
delete from public.loyalty_memberships where user_id in ('${users.join("','")}');
delete from public.users where id in ('${users.join("','")}');
delete from public.staff_users where id='${staff}';
commit;`;
const bucketsBefore = new Set(sql("select bucket_key from public.legacy_login_rate_limits").split(/\s+/).filter(Boolean));
sql(cleanup);
const bucketCreate = await fetch(`${local.API_URL}/storage/v1/bucket`, {
  method: "POST",
  headers: storageHeaders,
  body: JSON.stringify({ id: "medical-certificates", name: "medical-certificates", public: false }),
});
const createdBucket = bucketCreate.ok;
const bucketCreateBody = await bucketCreate.text();
assert.ok(bucketCreate.ok || bucketCreate.status === 409 || bucketCreateBody.includes("BucketAlreadyExists"), bucketCreateBody);
try {
  sql(`
insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
values('${staff}','Synthetic C5 HTTP','c5-http-operator@example.invalid',crypt('C5-local-pass',gen_salt('bf')),'admin',true);
insert into public.users(id,full_name,phone,email,gender) values
('${users[0]}','Synthetic C5 HTTP One','3400000281','c5-http-1@example.invalid','M'),
('${users[1]}','Synthetic C5 HTTP Two','3400000282','c5-http-2@example.invalid','F');
update public.users set identity_status='active' where id in ('${users.join("','")}');
insert into public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
values('${agreement}','TEST C5 HTTP X3','test-c5-http-x3','active',3,now()-interval '1 day',now()+interval '30 days','${staff}');
insert into public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,valid_until,created_by)
values('${agreement}','${hash("MOVI-ABCDE-FGHJK-LMNPQ-RSTUV")}','QRSTUV','available',now()-interval '1 day',now()+interval '10 days','${staff}');`);

  const cookie1 = await login(0);
  const invalid = await fetch(`${app}/api/moviback/request-membership`, { method: "POST", headers: { Cookie: cookie1 }, body: enrollmentForm(tokens[0], "invalid.pdf", "MOVI-NOT-VALID") });
  assert.equal(invalid.status, 400, await invalid.clone().text());
  assert.equal(sql(`select count(*) from public.loyalty_memberships where user_id='${users[0]}'`), "0");

  const valid = await fetch(`${app}/api/moviback/request-membership`, { method: "POST", headers: { Cookie: cookie1 }, body: enrollmentForm(tokens[1], "valid.pdf", " movi abcde fghjk lmnpq rstuv ") });
  assert.equal(valid.status, 200, await valid.clone().text());
  const validBody = await valid.json();
  assert.equal(validBody.agreement.status, "pending");
  assert.equal(JSON.stringify(validBody).includes("sha256:"), false);
  const replay = await fetch(`${app}/api/moviback/request-membership`, { method: "POST", headers: { Cookie: cookie1 }, body: enrollmentForm(tokens[1], "valid.pdf", "MOVI-ABCDE-FGHJK-LMNPQ-RSTUV") });
  assert.equal(replay.status, 200, await replay.clone().text());
  assert.equal((await replay.json()).replayed, true);
  const me = await (await fetch(`${app}/api/moviback/me`, { headers: { Cookie: cookie1 } })).json();
  assert.equal(me.active_agreement, null);
  assert.equal(me.agreement_state.status, "pending");
  assert.equal(me.agreement_state.name, "TEST C5 HTTP X3");
  assert.equal("code_hash" in me.agreement_state, false);
  const adminCookie = await adminLogin();
  const approved = await fetch(`${app}/api/admin/moviback/requests`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ id: validBody.membership.id, action: "approve" }),
  });
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal((await approved.json()).convention_status, "active");
  const approvedMe = await (await fetch(`${app}/api/moviback/me`, { headers: { Cookie: cookie1 } })).json();
  assert.equal(approvedMe.active_agreement.status, "active");
  assert.equal(approvedMe.agreement_state.status, "active");

  const cookie2 = await login(1);
  const plain = await fetch(`${app}/api/moviback/request-membership`, { method: "POST", headers: { Cookie: cookie2 }, body: enrollmentForm(tokens[2], "plain.pdf") });
  assert.equal(plain.status, 200, await plain.clone().text());
  assert.equal((await plain.json()).agreement, null);
  assert.equal(sql(`select count(*) from public.moviback_agreement_entitlements where membership_id=(select id from public.loyalty_memberships where user_id='${users[1]}')`), "0");
  console.log("MoviBack C5 HTTP acceptance PASS: optional code, invalid rollback, reservation, replay, approval activation and safe /me state.");
} finally {
  sql(cleanup);
  const newBuckets = sql("select bucket_key from public.legacy_login_rate_limits").split(/\s+/).filter(Boolean).filter((key) => !bucketsBefore.has(key));
  if (newBuckets.length) sql(`delete from public.legacy_login_rate_limits where bucket_key in ('${newBuckets.join("','")}')`);
  for (const path of paths) {
    const removed = await fetch(`${local.API_URL}/storage/v1/object/medical-certificates/${path}`, {
      method: "DELETE",
      headers: { apikey: local.SERVICE_ROLE_KEY, Authorization: `Bearer ${local.SERVICE_ROLE_KEY}` },
    });
    const removedBody = await removed.text();
    assert.ok(removed.ok || removed.status === 404 || removedBody.includes("NoSuchKey"), removedBody);
  }
  if (createdBucket) {
    await fetch(`${local.API_URL}/storage/v1/bucket/medical-certificates`, {
      method: "DELETE",
      headers: storageHeaders,
    });
  }
}
