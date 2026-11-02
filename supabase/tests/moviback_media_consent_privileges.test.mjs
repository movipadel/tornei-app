import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Use only the certified local Supabase database, regardless of env files.
const db = 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
const psql = process.env.PSQL_PATH ?? 'C:/Program Files/PostgreSQL/17/bin/psql.exe';

test('media consent service role can read and use RPCs but cannot mutate event history directly', () => {
  const user = randomUUID();
  const staff = randomUUID();
  const phone = `340${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
  const sql = `
    begin;
    set local statement_timeout = '5s';
    insert into public.staff_users(id,full_name,email,role,is_active)
      values('${staff}','Synthetic Media Privilege Admin','media-admin-${staff}@example.invalid','admin',true);
    insert into public.users(id,full_name,phone,email,gender,age_confirmed_at)
      values('${user}','Synthetic Media Privilege User','${phone}','media-user-${user}@example.invalid','M',now());
    set local role service_role;
    do $$
    declare v_user uuid := '${user}'; v_staff uuid := '${staff}'; v_status text;
    begin
      if current_user <> 'service_role' then raise exception 'service role not assumed'; end if;
      if not has_table_privilege(current_user,'public.user_media_consent_events','SELECT') or
         not has_table_privilege(current_user,'public.user_media_consent_current','SELECT') then
        raise exception 'consent read path blocked';
      end if;
      if has_table_privilege(current_user,'public.user_media_consent_events','INSERT') or
         has_table_privilege(current_user,'public.user_media_consent_events','UPDATE') or
         has_table_privilege(current_user,'public.user_media_consent_events','DELETE') or
         has_table_privilege(current_user,'public.user_media_consent_events','TRUNCATE') then
        raise exception 'direct consent history mutation remains permitted';
      end if;
      if has_table_privilege('anon','public.user_media_consent_events','INSERT') or
         has_table_privilege('authenticated','public.user_media_consent_events','INSERT') then
        raise exception 'public consent write escalation';
      end if;
      perform public.record_user_media_consent(v_user,'granted','profile',v_user,null,'v1');
      select status into v_status from public.user_media_consent_current where user_id=v_user;
      if v_status <> 'granted' then raise exception 'RPC insert or current view failed'; end if;
      perform public.record_user_media_consent(v_user,'revoked','profile',v_user,null,'v1');
      if (select status from public.current_user_media_consent(v_user)) <> 'revoked' then
        raise exception 'revoke or latest-event selection failed';
      end if;
      perform public.record_user_media_consent(v_user,'granted','admin_assisted',null,v_staff,'v1','synthetic-evidence');
      if (select status from public.user_media_consent_current where user_id=v_user) <> 'granted' or
         (select count(*) from public.user_media_consent_events where user_id=v_user) <> 3 then
        raise exception 'admin consent or event history failed';
      end if;
      begin
        insert into public.user_media_consent_events default values;
        raise exception 'direct INSERT allowed';
      exception when insufficient_privilege then null; end;
      begin
        update public.user_media_consent_events set status=status where false;
        raise exception 'direct UPDATE allowed';
      exception when insufficient_privilege then null; end;
      begin
        delete from public.user_media_consent_events where false;
        raise exception 'direct DELETE allowed';
      exception when insufficient_privilege then null; end;
      begin
        truncate public.user_media_consent_events;
        raise exception 'direct TRUNCATE allowed';
      exception when insufficient_privilege then null; end;
    end $$;
    rollback;
  `;
  const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', db, '-c', sql], {
    env: { ...process.env, PGPASSWORD: 'postgres', PGCONNECT_TIMEOUT: '3' },
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
