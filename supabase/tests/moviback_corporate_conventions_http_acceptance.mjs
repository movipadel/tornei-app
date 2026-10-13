import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const appUrl = process.env.MOVIBACK_C1C2_APP_URL ?? "http://127.0.0.1:3102";
const dbUrl = process.env.MOVIBACK_C1C2_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
if (appUrl !== "http://127.0.0.1:3102" || dbUrl !== "postgresql://postgres:postgres@127.0.0.1:55422/postgres") {
  throw new Error("Refusing HTTP acceptance: certified localhost endpoints required");
}
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const staffId = "f2320000-0000-4000-8000-000000000001";
const userId = "a2320000-0000-4000-8000-000000000001";
const membershipId = "b2320000-0000-4000-8000-000000000001";
const operationKey = "02320000-0000-4000-8000-000000000001";
const email = "moviback-c1c2-http@example.invalid";
const password = "Synthetic-C1C2-2026!";

function runSql(sql, tuplesOnly = false) {
  const args = [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", ...(tuplesOnly ? ["-At"] : []), "-c", sql];
  const result = spawnSync(psql, args, { encoding: "utf8", windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql failed");
  return result.stdout.trim();
}

const cleanup = `
  begin;
  set local session_replication_role=replica;
  delete from public.business_operation_idempotency where user_id='${userId}'::uuid;
  delete from public.loyalty_transactions where membership_id='${membershipId}'::uuid;
  delete from public.medical_certificates where user_id='${userId}'::uuid;
  delete from public.loyalty_memberships where id='${membershipId}'::uuid;
  delete from public.users where id='${userId}'::uuid;
  delete from public.staff_permissions where staff_user_id='${staffId}'::uuid;
  delete from public.staff_users where id='${staffId}'::uuid;
  commit;
`;

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

runSql(cleanup);
try {
  runSql(`
    insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
      values('${staffId}','Synthetic HTTP Operator','${email}',extensions.crypt('${password}',extensions.gen_salt('bf')),'staff',true);
    insert into public.staff_permissions(staff_user_id,permission_key,granted_by_staff_id)
      values('${staffId}','scanner.manage','${staffId}');
    insert into public.users(id,full_name,phone,email,gender)
      values('${userId}','Synthetic HTTP Member','3400000021','moviback-c1c2-http-member@example.invalid','M');
    insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
      values('${membershipId}','${userId}','approved','TEST-C1C2-HTTP','RSSMRA90A01H501U',now(),'${staffId}','ASC');
    insert into public.medical_certificates(user_id,file_path,status,expiry_date,reviewed_at,reviewed_by)
      values('${userId}','synthetic/http.pdf','approved',current_date+30,now(),'${staffId}');
  `);

  let response = await fetch(`${appUrl}/api/staff/earn-points`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ membership_code: "TEST-C1C2-HTTP", euro_amount: 10, club: "CENTALLO", idempotency_key: operationKey }),
  });
  assert.equal(response.status, 403, "unauthorized credit was not denied");

  const loginForm = new FormData();
  loginForm.set("email", email);
  loginForm.set("password", password);
  response = await fetch(`${appUrl}/api/staff/login`, { method: "POST", body: loginForm });
  assert.equal(response.status, 200, await response.text());
  const cookie = responseCookies(response);
  assert.ok(cookie.includes("staff_session="), "staff session cookie missing");

  response = await fetch(`${appUrl}/api/staff/earn-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ membership_code: "TEST-C1C2-HTTP", euro_amount: 10, club: "CENTALLO" }),
  });
  assert.equal(response.status, 400, "missing idempotency token was accepted");

  const payload = { membership_code: "TEST-C1C2-HTTP", euro_amount: 10, club: "CENTALLO", idempotency_key: operationKey };
  response = await fetch(`${appUrl}/api/staff/earn-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(payload),
  });
  const first = await response.json();
  assert.equal(response.status, 200, JSON.stringify(first));
  assert.equal(first.points_added, 10);
  assert.equal(first.new_balance, 10);
  assert.equal(first.effective_incentive_source, "none");
  assert.equal(first.replayed, false);

  response = await fetch(`${appUrl}/api/staff/earn-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(payload),
  });
  const replay = await response.json();
  assert.equal(response.status, 200, JSON.stringify(replay));
  assert.equal(replay.transaction_id, first.transaction_id);
  assert.equal(replay.replayed, true);
  assert.equal(runSql(`select count(*) from public.loyalty_transactions where idempotency_key='${operationKey}'::uuid;`, true), "1");

  console.log("MoviBack C1+C2 HTTP acceptance PASS: auth, validation, credit compatibility and replay.");
} finally {
  runSql(cleanup);
}
