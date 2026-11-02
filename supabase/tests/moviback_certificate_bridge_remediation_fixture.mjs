// Run only after a LOCAL reset --version 20261102095000 --no-seed.
// This probes bridge -> synthetic remediation -> hardening in one rolled-back
// transaction, leaving the local intermediate database unchanged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

assert.equal(existsSync('supabase/.temp/project-ref'), false, 'Refuse a linked project');
const psql = process.env.PSQL_PATH ?? 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const hardening = readFileSync('supabase/migrations/20261102100000_moviback_certificate_review_hardening.sql', 'utf8');
assert.match(hardening, /^begin;\s*/i);
assert.match(hardening, /\s*commit;\s*$/i);
const hardeningBody = hardening.replace(/^begin;\s*/i, '').replace(/\s*commit;\s*$/i, '');

const sql = `
begin;
set local statement_timeout = '90s';

do $$
declare
  v_users uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_certs uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
                         gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_approved uuid := gen_random_uuid();
  v_misc uuid := gen_random_uuid();
  v_before text;
  v_count int;
  v_check text;
begin
  select pg_get_constraintdef(oid) into v_check from pg_constraint
    where conrelid='public.medical_certificates'::regclass and conname='medical_status_check';
  if v_check is null or position('superseded' in v_check)=0 or
     position('uploaded' in v_check)=0 or position('pending_review' in v_check)=0 or
     position('approved' in v_check)=0 or position('rejected' in v_check)=0 or
     position('expired' in v_check)=0 then
    raise exception 'bridge status constraint missing or incompatible';
  end if;
  if to_regclass('public.medical_certificates_one_pending_per_user') is not null then
    raise exception 'unique pending index installed before remediation';
  end if;
  for i in 1..4 loop
    insert into public.users(id,full_name,phone,email,gender)
      values(v_users[i],'Synthetic Bridge User',
        '39'||lpad(((abs(hashtext(v_users[i]::text)::bigint))%100000000)::text,8,'0'),
        'bridge-'||v_users[i]||'@example.invalid','M');
    insert into public.medical_certificates(id,user_id,file_path,status,expiry_date,uploaded_at)
      values(v_certs[2*i-1],v_users[i],'synthetic/bridge-'||v_certs[2*i-1]||'.pdf','pending_review',current_date+100,now()-interval '1 day'),
            (v_certs[2*i],v_users[i],'synthetic/bridge-'||v_certs[2*i]||'.pdf','pending_review',current_date+120,now());
  end loop;
  insert into public.medical_certificates(id,user_id,file_path,status,expiry_date)
    values(v_approved,v_users[3],'synthetic/bridge-approved.pdf','approved',current_date+90);
  select md5(row_to_json(c)::text) into v_before from public.medical_certificates c where id=v_approved;
  insert into public.users(id,full_name,phone,email,gender)
    values(v_misc,'Synthetic Bridge Status User',
      '39'||lpad(((abs(hashtext(v_misc::text)::bigint))%100000000)::text,8,'0'),
      'bridge-'||v_misc||'@example.invalid','F');
  insert into public.medical_certificates(user_id,file_path,status,expiry_date)
    values(v_misc,'synthetic/bridge-uploaded.pdf','uploaded',current_date+10),
          (v_misc,'synthetic/bridge-rejected.pdf','rejected',current_date+10),
          (v_misc,'synthetic/bridge-expired.pdf','expired',current_date-10);
  select count(*) into v_count from (
    select user_id from public.medical_certificates
      where user_id=any(v_users) and status='pending_review' group by user_id having count(*)>1
  ) q;
  if v_count<>4 then raise exception 'fixture did not create four duplicate groups'; end if;

  -- Explicit allowlist: one older row in groups 1, 2 and 4; both rows in group 3.
  update public.medical_certificates set status='superseded'
    where id=any(array[v_certs[2],v_certs[4],v_certs[5],v_certs[6],v_certs[8]])
      and status='pending_review';
  get diagnostics v_count = row_count;
  if v_count<>5 then raise exception 'expected five superseded rows, got %',v_count; end if;
  if (select count(*) from public.medical_certificates where user_id=v_users[1] and status='pending_review')<>1 or
     (select count(*) from public.medical_certificates where user_id=v_users[2] and status='pending_review')<>1 or
     (select count(*) from public.medical_certificates where user_id=v_users[3] and status='pending_review')<>0 or
     (select count(*) from public.medical_certificates where user_id=v_users[4] and status='pending_review')<>1 then
    raise exception 'per-group pending counts differ from decisions';
  end if;
  if (select md5(row_to_json(c)::text) from public.medical_certificates c where id=v_approved)<>v_before then
    raise exception 'approved certificate changed';
  end if;
  if exists(select 1 from public.medical_certificates where id=any(array[v_certs[2],v_certs[4],v_certs[5],v_certs[6],v_certs[8]]) and status<>'superseded') then
    raise exception 'explicitly selected rows not superseded';
  end if;
end $$;

-- Exercise the exact later migration against the just-remediated fixture.
${hardeningBody}

do $$
begin
  if to_regclass('public.medical_certificates_one_pending_per_user') is null then
    raise exception 'unique pending index not installed after remediation';
  end if;
  if exists(select 1 from public.medical_certificates where status='pending_review' group by user_id having count(*)>1) then
    raise exception 'duplicate pending rows remain';
  end if;
end $$;
rollback;
`;

const file = join(tmpdir(), `movi-certificate-bridge-${randomUUID()}.sql`);
try {
  writeFileSync(file, sql, { encoding: 'utf8', flag: 'wx' });
  const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55422', '-U', 'postgres', '-d', 'postgres', '-f', file], {
    env: { ...process.env, PGPASSWORD: 'postgres', PGCONNECT_TIMEOUT: '3' },
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  process.stdout.write('LOCAL_BRIDGE_REMEDIATION_FIXTURE=PASS\n');
} finally {
  if (existsSync(file)) unlinkSync(file);
}
