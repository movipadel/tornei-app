import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

if(process.env.USER_EMAIL_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421'||process.env.USER_EMAIL_TRANSPORT!=='local')throw new Error('Verified local user-email runner required');
const base=process.env.USER_EMAIL_TEST_BASE_URL??'http://127.0.0.1:3101';
if(!['http://127.0.0.1:3101','http://localhost:3100'].includes(base))throw new Error('Local user-email URL required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const cookie=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function login(n){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`requests-demo-${n}@example.invalid`,password:'Requests-Local-2026!'})});assert.equal(response.status,200);return cookie(response);}
const first=await login(1),second=await login(2),user='eded6000-0000-4000-8000-000000000001';
const requestIds=[],keys=[];
async function api(path,session=first,method='GET',body){const response=await fetch(base+path,{method,headers:{Cookie:session,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,json:await response.json()};}
async function setPreference(value,session=first){const current=await api('/api/user/notification-preferences',session);assert.equal(current.status,200);return api('/api/user/notification-preferences',session,'PATCH',{transactional_email_enabled:value,expected_version:current.json.data.version});}
const sample=()=>({request_type:'gioca',playing_side:'left',clubs:['Manta'],date_mode:'flexible',requested_date:null,time_window:'evening',preferred_time_text:'20:00',level:'intermedio',match_type:['male'],group_size:3,required_player_side:'right',training_type:null,training_goal:null,notes:'User email acceptance LOCAL ONLY',client_request_id:randomUUID()});
try{
 const p1=await api('/api/user/notification-preferences',first),p2=await api('/api/user/notification-preferences',second);assert.equal(p1.status,200);assert.equal(p2.status,200);
 assert.equal((await setPreference(false)).status,200);assert.equal((await api('/api/user/notification-preferences',second)).json.data.transactional_email_enabled,p2.json.data.transactional_email_enabled);
 let created=await api('/api/user/requests',first,'POST',sample());assert.equal(created.status,201);requestIds.push(created.json.data.id);let key=`requests:${created.json.data.id}:status:received:user:${user}`;keys.push(key);
 let delivery=(await db.from('notification_deliveries').select('status,last_error_code,notification_events!inner(idempotency_key)').eq('notification_events.idempotency_key',key).single()).data;assert.equal(delivery.status,'skipped');assert.equal(delivery.last_error_code,'preferences_disabled');
 assert.equal((await setPreference(true)).status,200);
 created=await api('/api/user/requests',first,'POST',sample());assert.equal(created.status,201);requestIds.push(created.json.data.id);key=`requests:${created.json.data.id}:status:received:user:${user}`;keys.push(key);
 assert.equal((await fetch(base+'/api/cron/user-email-notifications',{method:'POST'})).status,401);
 const worker=await fetch(base+'/api/cron/user-email-notifications',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});assert.equal(worker.status,200);const workerResult=await worker.json();assert.ok(workerResult.delivered>=1);
 delivery=(await db.from('notification_deliveries').select('status,provider_message_id,destination_fingerprint,notification_events!inner(idempotency_key)').eq('notification_events.idempotency_key',key).single()).data;assert.equal(delivery.status,'delivered');assert.match(delivery.provider_message_id,/^local-/);assert.match(delivery.destination_fingerprint,/^[a-f0-9]{64}$/);
 const failureKey='local:email-failure:'+randomUUID();keys.push(failureKey);const inserted=await db.rpc('enqueue_user_notification',{p_event_type:'unsupported_local_test',p_domain:'requests',p_recipient_user_id:user,p_idempotency_key:failureKey,p_aggregate_type:'movi_request',p_aggregate_id:created.json.data.id,p_payload:{}});assert.ifError(inserted.error);
 const failedWorker=await fetch(base+'/api/cron/user-email-notifications',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});assert.equal(failedWorker.status,200);
 const failed=(await db.from('notification_deliveries').select('status,notification_events!inner(idempotency_key)').eq('notification_events.idempotency_key',failureKey).single()).data;assert.equal(failed.status,'failed');assert.ok((await db.from('movi_requests').select('id').eq('id',created.json.data.id).single()).data,'email failure must not roll back business row');
 console.log('User email HTTP PASS: preference default/read/update/privacy, disabled skip, request outbox, protected worker, local delivery and business-failure isolation.');
}finally{
 await setPreference(true).catch(()=>undefined);
 if(requestIds.length)await db.from('movi_requests').delete().in('id',requestIds);
 if(keys.length)await db.from('notification_events').delete().in('idempotency_key',keys);
}
