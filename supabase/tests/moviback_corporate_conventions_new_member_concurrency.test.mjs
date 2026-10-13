import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const db = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const staff = "f2610000-0000-4000-8000-000000000001";
const agreement = "c2610000-0000-4000-8000-000000000001";
const u1 = "a2610000-0000-4000-8000-000000000001";
const u2 = "a2610000-0000-4000-8000-000000000002";

function sync(sql) {
  const result = spawnSync(psql, [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8", windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function asyncSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
      windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" },
    });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || out)));
  });
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const submit = (user, token, hash, membershipCode, codeHash, file) =>
  `select public.submit_moviback_membership_request_c5('${user}','${token}','${hash}','${membershipCode}','RSSMRA90A01H501U','ASC',0,true,false,null,null,'${file}',current_date+30,'${codeHash}')`;
const cleanup = `
begin; set local session_replication_role=replica;
delete from public.business_operation_idempotency where user_id in ('${u1}','${u2}');
delete from public.moviback_membership_enrollment_requests where user_id in ('${u1}','${u2}');
delete from public.loyalty_transactions where membership_id in (select id from public.loyalty_memberships where user_id in ('${u1}','${u2}'));
delete from public.moviback_agreement_audit_events where agreement_id='${agreement}';
delete from public.moviback_agreement_entitlements where membership_id in (select id from public.loyalty_memberships where user_id in ('${u1}','${u2}'));
delete from public.moviback_agreement_codes where agreement_id='${agreement}';
delete from public.moviback_agreements where id='${agreement}';
delete from public.medical_certificates where user_id in ('${u1}','${u2}');
delete from public.loyalty_memberships where user_id in ('${u1}','${u2}');
delete from public.users where id in ('${u1}','${u2}');
delete from public.staff_users where id='${staff}';
commit;`;
function seed() {
  sync(`
insert into public.staff_users(id,full_name,email,role,is_active) values('${staff}','Synthetic C5 Concurrent','c5-concurrent@example.invalid','admin',true);
insert into public.users(id,full_name,phone,email,gender) values
('${u1}','Synthetic C5 One','3400000271','c5-one@example.invalid','M'),
('${u2}','Synthetic C5 Two','3400000272','c5-two@example.invalid','F');
update public.users set identity_status='active' where id in ('${u1}','${u2}');
insert into public.moviback_agreements(id,name,slug,status,multiplier,valid_from,valid_until,created_by)
values('${agreement}','TEST C5 CONCURRENT','test-c5-concurrent','active',3,now()-interval '1 day',now()+interval '30 days','${staff}');
insert into public.moviback_agreement_codes(agreement_id,code_hash,code_suffix,status,valid_from,valid_until,created_by) values
('${agreement}','sha256:c5-shared','SHARED','available',now()-interval '1 day',now()+interval '10 days','${staff}'),
('${agreement}','sha256:c5-second','SECOND','available',now()-interval '1 day',now()+interval '10 days','${staff}');`);
}

test("C5 reservation and approval races remain atomic", async () => {
  sync(cleanup);
  try {
    seed();
    const shared = await Promise.all([
      asyncSql(submit(u1, "02610000-0000-4000-8000-000000000001", "1".repeat(64), "TEST-C5-CON-1", "sha256:c5-shared", "synthetic/c5-con-1.pdf")),
      asyncSql(submit(u2, "02610000-0000-4000-8000-000000000002", "2".repeat(64), "TEST-C5-CON-2", "sha256:c5-shared", "synthetic/c5-con-2.pdf")),
    ]);
    const sharedResults = shared.map(JSON.parse);
    assert.equal(sharedResults.filter((item) => item.ok).length, 1);
    assert.equal(sharedResults.filter((item) => item.error_code === "CODE_ALREADY_USED").length, 1);
    assert.equal(sync("select count(*) from public.moviback_agreement_codes where code_hash='sha256:c5-shared' and status='reserved'"), "1");

    sync(cleanup); seed();
    const twoCodes = await Promise.all([
      asyncSql(submit(u1, "02610000-0000-4000-8000-000000000003", "3".repeat(64), "TEST-C5-CON-3", "sha256:c5-shared", "synthetic/c5-con-3.pdf")),
      asyncSql(submit(u1, "02610000-0000-4000-8000-000000000004", "4".repeat(64), "TEST-C5-CON-4", "sha256:c5-second", "synthetic/c5-con-4.pdf")),
    ]);
    const twoResults = twoCodes.map(JSON.parse);
    assert.equal(twoResults.filter((item) => item.ok).length, 1);
    assert.equal(sync(`select count(*) from public.moviback_agreement_codes where agreement_id='${agreement}' and status='reserved'`), "1");
    assert.equal(sync(`select count(*) from public.moviback_agreement_codes where agreement_id='${agreement}' and status='available'`), "1");

    sync(cleanup); seed();
    const reserved = JSON.parse(sync(submit(u1, "02610000-0000-4000-8000-000000000005", "5".repeat(64), "TEST-C5-CON-5", "sha256:c5-shared", "synthetic/c5-con-5.pdf")));
    const membership = reserved.membership_id;
    const codeId = sync("select id from public.moviback_agreement_codes where code_hash='sha256:c5-shared'");
    const approvalVsRevoke = await Promise.allSettled([
      asyncSql(`select public.review_moviback_membership_c5('${membership}','approve',null,null,'${staff}')`),
      asyncSql(`select id from public.revoke_moviback_agreement_code('${codeId}','Synthetic concurrent revoke','${staff}')`),
    ]);
    const approvalState = sync(`select status||'|'||(select status from public.moviback_agreement_entitlements where membership_id='${membership}') from public.loyalty_memberships where id='${membership}'`);
    assert.ok(["approved|active", "approved|not_activated"].includes(approvalState));
    const codeState = sync(`select status from public.moviback_agreement_codes where id='${codeId}'`);
    assert.ok(["used", "revoked"].includes(codeState));
    assert.equal(approvalVsRevoke[0].status, "fulfilled");
    if (codeState === "used") assert.equal(approvalVsRevoke[1].status, "rejected");

    sync(cleanup); seed();
    const reservedStatus = JSON.parse(sync(submit(u1, "02610000-0000-4000-8000-000000000006", "6".repeat(64), "TEST-C5-CON-6", "sha256:c5-shared", "synthetic/c5-con-6.pdf")));
    await Promise.all([
      asyncSql(`select public.review_moviback_membership_c5('${reservedStatus.membership_id}','approve',null,null,'${staff}')`),
      asyncSql(`select id from public.update_moviback_agreement('${agreement}','TEST C5 CONCURRENT','test-c5-concurrent','suspended',3,now()-interval '1 day',now()+interval '30 days','${staff}')`),
    ]);
    assert.equal(sync(`select status from public.loyalty_memberships where id='${reservedStatus.membership_id}'`), "approved");
    assert.ok(["active", "not_activated"].includes(sync(`select status from public.moviback_agreement_entitlements where membership_id='${reservedStatus.membership_id}'`)));

    sync(cleanup); seed();
    const rejected = JSON.parse(sync(submit(u1, "02610000-0000-4000-8000-000000000007", "7".repeat(64), "TEST-C5-CON-7", "sha256:c5-shared", "synthetic/c5-con-7.pdf")));
    sync(`select public.review_moviback_membership_c5('${rejected.membership_id}','reject','Synthetic retry race',null,'${staff}')`);
    await Promise.all([
      asyncSql(submit(u1, "02610000-0000-4000-8000-000000000008", "8".repeat(64), "IGNORED-C5-CON-8", "sha256:c5-shared", "synthetic/c5-con-8.pdf")),
      asyncSql(`select public.review_moviback_membership_c5('${rejected.membership_id}','approve',null,null,'${staff}')`),
    ]);
    assert.ok(["pending_review", "approved"].includes(sync(`select status from public.loyalty_memberships where id='${rejected.membership_id}'`)));
    assert.equal(sync(`select count(*) from public.moviback_agreement_entitlements where membership_id='${rejected.membership_id}'`), "1");

    sync(cleanup); seed();
    const approvalEarn = JSON.parse(sync(submit(u1, "02610000-0000-4000-8000-000000000009", "9".repeat(64), "TEST-C5-CON-9", "sha256:c5-shared", "synthetic/c5-con-9.pdf")));
    await Promise.allSettled([
      asyncSql(`select public.review_moviback_membership_c5('${approvalEarn.membership_id}','approve',null,null,'${staff}')`),
      asyncSql(`select public.credit_moviback_points('TEST-C5-CON-9',10,'CENTALLO','02610000-0000-4000-8000-000000000099','c5_concurrency','approval-vs-earn','${staff}')`),
    ]);
    assert.equal(sync(`select status from public.loyalty_memberships where id='${approvalEarn.membership_id}'`), "approved");
    const credited = sync("select coalesce(max(credited_points),0) from public.loyalty_transactions where idempotency_key='02610000-0000-4000-8000-000000000099'");
    assert.ok(["0", "30"].includes(credited));
  } finally {
    sync(cleanup);
  }
});

test("C5 credit uses a post-lock instant after concurrent membership approval", async () => {
  sync(cleanup);
  try {
    seed();
    const submitted = JSON.parse(sync(submit(
      u1,
      "02610000-0000-4000-8000-000000000010",
      "a".repeat(64),
      "TEST-C5-CON-10",
      "sha256:c5-shared",
      "synthetic/c5-con-10.pdf",
    )));
    const membership = submitted.membership_id;
    const operationKey = "02610000-0000-4000-8000-000000000100";

    const credit = asyncSql(`
      begin;
      select pg_sleep(0.20);
      select public.credit_moviback_points('TEST-C5-CON-10',10,'CENTALLO','${operationKey}','c5_concurrency','post-lock-time','${staff}');
      commit;
    `);
    await delay(50);
    const approval = asyncSql(`
      begin;
      select id from public.loyalty_memberships where id='${membership}' for update;
      select pg_sleep(0.35);
      select public.review_moviback_membership_c5('${membership}','approve',null,null,'${staff}');
      commit;
    `);
    await Promise.all([credit, approval]);

    const ledger = JSON.parse(sync(`
      select jsonb_build_object(
        'base_points',base_points,
        'applied_multiplier',applied_multiplier,
        'credited_points',credited_points,
        'points_delta',points_delta,
        'agreement_id',agreement_id,
        'entitlement_id',entitlement_id,
        'incentive_source',incentive_source,
        'created_at',created_at
      )
      from public.loyalty_transactions
      where idempotency_key='${operationKey}'
    `));
    assert.equal(ledger.base_points, 10);
    assert.equal(ledger.applied_multiplier, 3);
    assert.equal(ledger.credited_points, 30);
    assert.equal(ledger.points_delta, 30);
    assert.ok(ledger.agreement_id);
    assert.ok(ledger.entitlement_id);
    assert.equal(ledger.incentive_source, "agreement");
    assert.equal(sync(`
      select t.created_at >= e.effective_from
      from public.loyalty_transactions t
      join public.moviback_agreement_entitlements e on e.id=t.entitlement_id
      where t.idempotency_key='${operationKey}'
    `), "t");

    const replay = JSON.parse(sync(`
      select public.credit_moviback_points('TEST-C5-CON-10',10,'CENTALLO','${operationKey}','c5_concurrency','post-lock-time','${staff}')
    `));
    assert.equal(replay.replayed, true);
    assert.equal(sync(`select count(*) from public.loyalty_transactions where idempotency_key='${operationKey}'`), "1");
  } finally {
    sync(cleanup);
  }
});
