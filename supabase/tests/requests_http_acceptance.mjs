import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {SignJWT} from 'jose';
import {notificationAttempt} from '../../src/lib/requestNotification.ts';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55021'||process.env.MOVI_REQUEST_TELEGRAM_MODE!=='disabled'||process.env.TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_CHAT_ID)throw new Error('Safe local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base='http://localhost:3100';
const cookie=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function auth(email){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Requests-Local-2026!'})});assert.equal(r.status,200);return cookie(r);}
const u1=await auth('requests-demo-1@example.invalid'),u2=await auth('requests-demo-2@example.invalid');
const f=new FormData();f.set('email','padelleria-admin@example.invalid');f.set('password','Padelleria-Local-2026!');const adminLogin=await fetch(base+'/api/admin/login',{method:'POST',body:f});assert.equal(adminLogin.status,200);const admin=cookie(adminLogin);
async function req(path,method='GET',body,session=u1){const r=await fetch(base+path,{method,headers:{Cookie:session,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,json:await r.json()};}
const sample={request_type:'gioca',clubs:['Manta'],date_mode:'tomorrow',requested_date:null,time_window:'evening',preferred_time_text:'20:00',level:'intermedio',match_type:'mixed',has_partner:false,training_type:null,training_goal:null,notes:'HTTP synthetic',client_request_id:randomUUID()};
const ids=[];let checks=0;const ok=()=>checks++;
try{
 assert.equal((await req('/api/user/requests','POST',sample,'')).status,401);ok();
 assert.equal((await req('/api/user/requests','POST',{...sample,user_id:'eded6000-0000-4000-8000-000000000002'})).status,400);ok();
 let r=await req('/api/user/requests','POST',sample);assert.equal(r.status,201);const id=r.json.data.id;ids.push(id);ok();
 r=await req('/api/user/requests','POST',sample);assert.equal(r.status,200);assert.equal(r.json.data.id,id);ok();
 let row=(await db.from('movi_requests').select('*').eq('id',id).single()).data;assert.equal(row.user_id,'eded6000-0000-4000-8000-000000000001');assert.equal(row.telegram_state,'disabled');assert.equal(row.telegram_notified_at,null);ok();
 for(const fail of [true,false]){await notificationAttempt('live',async()=>{if(fail)throw new Error('secret');return {ok:true};},async patch=>assert.ifError((await db.from('movi_requests').update(patch).eq('id',id)).error));row=(await db.from('movi_requests').select('*').eq('id',id).single()).data;assert.equal(row.status,'received');assert.equal(row.telegram_state,fail?'failed':'sent');assert.equal(row.telegram_error,fail?'send_failed':null);ok();}
 await db.from('movi_requests').update({telegram_state:'failed',telegram_error:'send_failed',telegram_notified_at:null,telegram_attempted_at:'2000-01-01T00:00:00Z'}).eq('id',id);
 assert.equal((await req(`/api/admin/requests/${id}/telegram`,'POST',undefined,admin)).status,200);assert.equal((await db.from('movi_requests').select('telegram_state').eq('id',id).single()).data.telegram_state,'disabled');ok();
 const a1=(await db.from('movi_requests').select('telegram_attempted_at').eq('id',id).single()).data.telegram_attempted_at;await req(`/api/admin/requests/${id}/telegram`,'POST',undefined,admin);assert.equal((await db.from('movi_requests').select('telegram_attempted_at').eq('id',id).single()).data.telegram_attempted_at,a1);ok();
 r=await req('/api/user/requests?limit=50');assert.ok(r.json.data.some(v=>v.id===id));for(const k of ['admin_notes','user_id','telegram_state','telegram_error','telegram_notified_at'])assert.equal(k in r.json.data[0],false);ok();
 assert.ok(!(await req('/api/user/requests?limit=50','GET',undefined,u2)).json.data.some(v=>v.id===id));assert.equal((await req(`/api/user/requests/${id}/cancel`,'POST',undefined,u2)).status,404);ok();
 for(const role of ['user','staff']){const jwt=await new SignJWT({sid:'test',role}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));assert.equal((await req('/api/admin/requests','GET',undefined,role==='user'?u1:`staff_session=${jwt}`)).status,403);ok();}
 r=await req('/api/admin/requests?type=gioca&status=received&limit=50','GET',undefined,admin);assert.ok(r.json.data.some(v=>v.id===id));assert.ok(r.json.data.every(v=>v.request_type==='gioca'&&v.status==='received'));ok();
 async function update(status){const fresh=(await req(`/api/admin/requests/${id}`,'GET',undefined,admin)).json.data;return req(`/api/admin/requests/${id}`,'PATCH',{status,admin_notes:'Internal test',updated_at:fresh.updated_at},admin);}
 assert.equal((await update('completed')).status,409);ok();
 assert.equal((await update('searching')).status,200);assert.equal((await update('found')).status,200);ok();
 assert.equal((await req(`/api/user/requests/${id}/cancel`,'POST')).status,409);ok();
 assert.equal((await update('completed')).status,200);assert.equal((await req(`/api/user/requests/${id}/cancel`,'POST')).status,409);assert.equal((await update('searching')).status,409);ok();
 for(const type of ['gioca','allenati']){r=await req('/api/user/requests','POST',{...sample,client_request_id:randomUUID(),request_type:type,training_type:'group',training_goal:'technique'});assert.equal(r.status,201);const rid=r.json.data.id;ids.push(rid);if(type==='allenati'){const fresh=(await req(`/api/admin/requests/${rid}`,'GET',undefined,admin)).json.data;assert.equal((await req(`/api/admin/requests/${rid}`,'PATCH',{status:'searching',admin_notes:'',updated_at:fresh.updated_at},admin)).status,200);}assert.equal((await req(`/api/user/requests/${rid}/cancel`,'POST')).status,200);assert.equal((await db.from('movi_requests').select('status').eq('id',rid).single()).data.status,'cancelled');ok();}
 assert.equal((await req('/api/user/requests?limit=51')).status,400);ok();
 const normal=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ifError((await normal.auth.signInWithPassword({email:'requests-demo-1@example.invalid',password:'Requests-Local-2026!'})).error);assert.ok((await normal.from('movi_requests').select('*')).error);assert.ok((await normal.from('movi_requests').insert({...sample,user_id:'eded6000-0000-4000-8000-000000000002'})).error);ok();
 // Verify the unchanged legacy resolver with a synthetic legacy profile, then clean up.
 const legacyId=randomUUID();assert.ifError((await db.from('users').insert({id:legacyId,full_name:'HTTP Legacy Synthetic',phone:`+399${Date.now()}`,gender:'M'})).error);
 try{const payload=Buffer.from(JSON.stringify({uid:legacyId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})).toString('base64url'),sig=createHmac('sha256',process.env.USER_COOKIE_SECRET).update(payload).digest('hex');r=await req('/api/user/requests','POST',{...sample,client_request_id:randomUUID()},`user_session=${payload}.${sig}`);assert.equal(r.status,201);assert.equal((await db.from('movi_requests').select('user_id').eq('id',r.json.data.id).single()).data.user_id,legacyId);await db.from('movi_requests').delete().eq('id',r.json.data.id);ok();}finally{await db.from('users').delete().eq('id',legacyId);}
 console.log(`Requests HTTP PASS: ${checks} checks; Telegram success/failure simulated, zero live transport.`);
}finally{if(ids.length)await db.from('movi_requests').delete().in('id',ids);}
