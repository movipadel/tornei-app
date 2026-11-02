import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// The database address is deliberately fixed to the certified local stack.
const db = 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
const psql = process.env.PSQL_PATH ?? 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const env = { ...process.env, PGPASSWORD: 'postgres' };
const user = randomUUID();
const staff = randomUUID();
const membership = randomUUID();
const sqlArgs = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', db];

function sync(sql) {
  const result = spawnSync(psql, [...sqlArgs, '-c', sql], { env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function concurrent(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [...sqlArgs, '-c', sql], { env, windowsHide: true });
    let output = ''; let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(error || output)));
  });
}

function cleanup() {
  sync(`begin; set local session_replication_role=replica;
    delete from public.user_media_consent_events where user_id='${user}';
    delete from public.medical_certificates where user_id='${user}';
    delete from public.loyalty_memberships where id='${membership}';
    delete from public.users where id='${user}';
    delete from public.staff_users where id='${staff}'; commit;`);
}

test('concurrent replacement, review, and consent changes preserve their invariants', async () => {
  try {
    sync(`insert into public.staff_users(id,full_name,email,role,is_active)
      values('${staff}','Synthetic Certificate Race Admin','certificate-race-${staff}@example.invalid','admin',true);
      insert into public.users(id,full_name,phone,email,gender,age_confirmed_at)
      values('${user}','Synthetic Certificate Race','3400999301','certificate-race-${user}@example.invalid','M',now());
      insert into public.loyalty_memberships(id,user_id,status,membership_code,tax_code,approved_at,approved_by,membership_type)
      values('${membership}','${user}','approved','TEST-CERT-RACE','RSSMRA90A01H501U',now(),'${staff}','ASC');`);

    const insert = label => `insert into public.medical_certificates(user_id,file_path,status,expiry_date)
      values('${user}','synthetic/${label}.pdf','pending_review',current_date+30) returning id`;
    await Promise.all([concurrent(insert('first')), concurrent(insert('second'))]);
    assert.equal(sync(`select count(*) from public.medical_certificates where user_id='${user}' and status='pending_review'`), '1');
    assert.equal(sync(`select count(*) from public.medical_certificates where user_id='${user}' and status='superseded'`), '1');

    const current = sync(`select id from public.medical_certificates where user_id='${user}' and status='pending_review'`);
    const review = `select public.review_moviback_certificate('${membership}','${current}','approve',null,'${staff}')`;
    const results = (await Promise.all([concurrent(review), concurrent(review)])).map(JSON.parse);
    assert.equal(results.filter(item => item.ok === true).length, 1);
    assert.equal(results.filter(item => item.error_code === 'CERTIFICATE_NOT_PENDING').length, 1);

    const pending = sync(insert('review-race'));
    const raceResults = await Promise.all([concurrent(`select public.review_moviback_certificate('${membership}','${pending}','approve',null,'${staff}')`), concurrent(insert('replacement-race'))]);
    assert.equal(raceResults.length, 2);
    assert.ok(Number(sync(`select count(*) from public.medical_certificates where user_id='${user}' and status='pending_review'`)) <= 1);

    await Promise.all([
      concurrent(`select public.record_user_media_consent('${user}','granted','profile','${user}',null,'v1')`),
      concurrent(`select public.record_user_media_consent('${user}','revoked','profile','${user}',null,'v1')`),
    ]);
    assert.equal(sync(`select count(*) from public.user_media_consent_events where user_id='${user}'`), '2');
    assert.equal(sync(`select status from public.current_user_media_consent('${user}')`),
      sync(`select status from public.user_media_consent_events where user_id='${user}' order by effective_at desc,id desc limit 1`));
  } finally {
    cleanup();
  }
});
