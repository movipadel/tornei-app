import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../migrations/20261021100000_user_email_notifications.sql');
const api=read('../../src/app/api/user/notification-preferences/route.ts');
const worker=read('../../src/app/api/cron/user-email-notifications/route.ts');
const transport=read('../../src/lib/userNotificationEmail.ts');
const profile=read('../../src/components/NotificationPreferencesCard.tsx');
const policy=await import('../../src/lib/userNotificationPolicy.ts');

test('email-only preference is separate from security and marketing consent',()=>{
 assert.match(migration,/transactional_email_enabled boolean not null default true/);
 assert.doesNotMatch(migration,/telegram|marketing_accepted/i);
 assert.match(api,/getCurrentMoviUser/); assert.match(api,/expected_version/); assert.match(api,/Origine non consentita/);
 assert.match(profile,/Le email di sicurezza/); assert.doesNotMatch(profile,/Telegram/);
});
test('channel-neutral event and email delivery outbox are durable and private',()=>{
 assert.match(migration,/create table public\.notification_events/);
 assert.match(migration,/create table public\.notification_deliveries/);
 assert.match(migration,/unique\(event_id,channel\)/);
 assert.match(migration,/channel text not null check \(channel = 'email'\)/);
 assert.match(migration,/for update skip locked/);
 assert.match(migration,/attempts between 0 and 5/);
 assert.match(migration,/revoke all on public\.notification_events from public,anon,authenticated/);
});
test('request and tournament triggers enqueue atomically and idempotently',()=>{
 assert.match(migration,/after insert or update of status on public\.movi_requests/);
 assert.match(migration,/after insert or update of is_reserve or delete on public\.tournament_registrations/);
 assert.match(migration,/on conflict\(idempotency_key\) do nothing/);
 assert.match(migration,/preferences_disabled/);
});
test('worker is protected, bounded and uses local-safe or Resend transport',()=>{
 assert.match(worker,/timingSafeEqual/); assert.match(worker,/p_limit: 25/); assert.match(worker,/userEmailFailureDecision/);
 assert.match(transport,/USER_EMAIL_TRANSPORT/); assert.match(transport,/LOCAL_EMAIL_EXTERNAL_CREDENTIALS_PRESENT/); assert.match(transport,/new Resend/);
 assert.match(transport,/text: input\.text/); assert.doesNotMatch(transport,/STORE_ORDERS_EMAIL/);
});
test('retry policy backs off and terminates at five attempts',()=>{
 const start=Date.parse('2026-10-06T12:00:00Z');
 assert.deepEqual(policy.userEmailFailureDecision(1,false,start),{status:'retry',nextAttemptAt:'2026-10-06T12:05:00.000Z'});
 assert.deepEqual(policy.userEmailFailureDecision(4,false,start),{status:'retry',nextAttemptAt:'2026-10-06T18:00:00.000Z'});
 assert.deepEqual(policy.userEmailFailureDecision(5,false,start),{status:'failed',nextAttemptAt:null});
 assert.deepEqual(policy.userEmailFailureDecision(1,true,start),{status:'failed',nextAttemptAt:null});
});
test('profile control remains accessible and has explicit save state',()=>{
 assert.match(profile,/type="checkbox"/); assert.match(profile,/Salva notifiche/); assert.match(profile,/role="status"/); assert.match(profile,/role="alert"/);
});
