import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const dbUrl = process.env.MOVIBACK_C1C2_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
if (dbUrl !== "postgresql://postgres:postgres@127.0.0.1:55422/postgres") {
  throw new Error("Refusing concurrency test: certified local PostgreSQL required");
}
const psql = process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const ids = {
  staff: "f2310000-0000-4000-8000-000000000001",
  user: "a2310000-0000-4000-8000-000000000001",
  membership: "b2310000-0000-4000-8000-000000000001",
  agreement: "c2310000-0000-4000-8000-000000000001",
  entitlement: "d2310000-0000-4000-8000-000000000001",
  reward: "e2310000-0000-4000-8000-000000000001",
  duplicateKey: "02310000-0000-4000-8000-000000000001",
  creditKey: "02310000-0000-4000-8000-000000000002",
  redemptionKey: "02310000-0000-4000-8000-000000000003",
};

function sql(strings, ...values) {
  return String.raw({ raw: strings }, ...values);
}

function runSql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], {
      env: { ...process.env, PGPASSWORD: "postgres" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || stdout || `psql exited ${code}`));
    });
  });
}

const cleanup = sql`
  begin;
  set local session_replication_role=replica;
  delete from public.business_operation_idempotency where user_id='${ids.user}'::uuid;
  delete from public.loyalty_transactions where membership_id='${ids.membership}'::uuid;
  delete from public.reward_redemptions where membership_id='${ids.membership}'::uuid;
  delete from public.moviback_agreement_entitlements where id='${ids.entitlement}'::uuid;
  delete from public.moviback_agreements where id='${ids.agreement}'::uuid;
  delete from public.medical_certificates where user_id='${ids.user}'::uuid;
  delete from public.loyalty_memberships where id='${ids.membership}'::uuid;
  delete from public.rewards_catalog where id='${ids.reward}'::uuid;
  delete from public.users where id='${ids.user}'::uuid;
  delete from public.staff_users where id='${ids.staff}'::uuid;
  commit;
`;

test("duplicate credit and credit-vs-redemption serialize on the membership ledger", async () => {
  await runSql(cleanup);
  try {
    await runSql(sql`
      insert into public.staff_users(id,full_name,email,role,is_active) values('${ids.staff}','Synthetic Concurrency Operator','moviback-c1c2-concurrency@example.invalid','staff',true);
      insert into public.users(id,full_name,phone,email,gender) values('${ids.user}','Synthetic Concurrency Member','3400000011','moviback-c1c2-concurrency-member@example.invalid','M');
      insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
        values('${ids.membership}','${ids.user}','approved','TEST-C1C2-CONCURRENCY','RSSMRA90A01H501U',now(),'${ids.staff}','ASC');
      insert into public.medical_certificates(user_id,file_path,status,expiry_date,reviewed_at,reviewed_by)
        values('${ids.user}','synthetic/concurrency.pdf','approved',current_date+30,now(),'${ids.staff}');
      insert into public.loyalty_transactions(membership_id,type,source,points_delta,notes)
        values('${ids.membership}','adjustment','manual_adjustment',100,'Synthetic concurrency opening balance');
      insert into public.moviback_agreements(id,name,slug,status,multiplier,valid_from,created_by)
        values('${ids.agreement}','TEST AGREEMENT CONCURRENCY X3','test-agreement-concurrency-x3','active',3,now()-interval '1 day','${ids.staff}');
      insert into public.moviback_agreement_entitlements(id,membership_id,agreement_id,status,activation_source,activated_at,effective_from)
        values('${ids.entitlement}','${ids.membership}','${ids.agreement}','active','admin',now(),now()-interval '1 day');
      insert into public.rewards_catalog(id,name,points_cost,is_active,reward_type,fulfillment_type)
        values('${ids.reward}','Synthetic Service Reward',10,true,'club','service');
    `);

    const duplicateCall = sql`select public.credit_moviback_points('TEST-C1C2-CONCURRENCY',10,'CENTALLO','${ids.duplicateKey}','concurrency','duplicate-event','${ids.staff}');`;
    const duplicateResults = await Promise.all([runSql(duplicateCall), runSql(duplicateCall)]);
    assert.equal(duplicateResults.length, 2);
    const duplicateCount = await runSql(sql`select count(*) from public.loyalty_transactions where idempotency_key='${ids.duplicateKey}'::uuid;`);
    assert.equal(duplicateCount, "1", "concurrent duplicate created multiple earn rows");

    const creditCall = sql`select public.credit_moviback_points('TEST-C1C2-CONCURRENCY',10,'CENTALLO','${ids.creditKey}','concurrency','credit-vs-redemption','${ids.staff}');`;
    const redemptionCall = sql`select public.redeem_moviback_reward('${ids.user}','${ids.redemptionKey}','${ids.reward}',null,null);`;
    await Promise.all([runSql(creditCall), runSql(redemptionCall)]);

    const state = await runSql(sql`
      select concat_ws('|',
        (select count(*) from public.loyalty_transactions where idempotency_key='${ids.creditKey}'::uuid),
        (select count(*) from public.reward_redemptions where membership_id='${ids.membership}'::uuid),
        (select sum(points_delta) from public.loyalty_transactions where membership_id='${ids.membership}'::uuid)
      );
    `);
    assert.equal(state, "1|1|150", "credit/redemption ledger result is inconsistent");
  } finally {
    await runSql(cleanup);
  }
});
