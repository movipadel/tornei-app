import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const app = process.env.MOVI_TEST_APP_URL ?? "http://127.0.0.1:3102";
const db = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const local = JSON.parse(execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(local.API_URL, "http://127.0.0.1:55421");
assert.ok(!local.linked_project);

const staff = "f2730000-0000-4000-8000-000000000001";
const agreement = "c2730000-0000-4000-8000-000000000001";

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

async function adminLogin() {
  const form = new FormData();
  form.set("email", "c6-report-operator@example.invalid");
  form.set("password", "C6-local-pass");
  const response = await fetch(`${app}/api/admin/login`, { method: "POST", body: form });
  assert.equal(response.status, 200, await response.clone().text());
  return cookies(response);
}

const cleanup = `
begin; set local session_replication_role=replica;
delete from public.moviback_agreement_audit_events where agreement_id='${agreement}';
delete from public.moviback_agreement_codes where agreement_id='${agreement}';
delete from public.moviback_agreement_code_batches where agreement_id='${agreement}';
delete from public.moviback_agreement_entitlements where agreement_id='${agreement}';
delete from public.moviback_agreements where id='${agreement}';
delete from public.staff_users where id='${staff}';
commit;`;

sql(cleanup);
try {
  sql(`
insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
values('${staff}','Synthetic C6 Report','c6-report-operator@example.invalid',crypt('C6-local-pass',gen_salt('bf')),'admin',true);
insert into public.moviback_agreements(id,name,slug,status,multiplier,valid_from,created_by)
values('${agreement}','Synthetic C6 HTTP','synthetic-c6-http','active',3,now()-interval '1 day','${staff}');`);

  test("C6 report denies unauthenticated access", async () => {
    const response = await fetch(`${app}/api/admin/moviback/agreements/${agreement}/report`);
    assert.equal(response.status, 401);
  });

  test("C6 report returns structured, privacy-safe metrics to moviback manager", async () => {
    const cookie = await adminLogin();
    const response = await fetch(`${app}/api/admin/moviback/agreements/${agreement}/report`, { headers: { cookie } });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.data.agreement.name, "Synthetic C6 HTTP");
    assert.equal(body.data.codes.total, 0);
    assert.equal(body.data.points.bonus_points, 0);
    assert.ok(Array.isArray(body.data.batches));
    assert.ok(Array.isArray(body.data.membership_history));
    assert.ok(Array.isArray(body.data.point_activity));
    assert.doesNotMatch(JSON.stringify(body), /code_hash|sha256:/i);
  });

  test("C6 report validates agreement identifiers", async () => {
    const cookie = await adminLogin();
    const response = await fetch(`${app}/api/admin/moviback/agreements/not-a-uuid/report`, { headers: { cookie } });
    assert.equal(response.status, 400);
  });
} finally {
  process.on("exit", () => { try { sql(cleanup); } catch {} });
}
