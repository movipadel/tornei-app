import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base=process.env.ACTIVITIES_TEST_BASE_URL??'http://localhost:3100';
if(!['http://localhost:3100','http://127.0.0.1:3101'].includes(base))throw new Error('Local activities test URL required');
async function login(n){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`requests-demo-${n}@example.invalid`,password:'Requests-Local-2026!'})});assert.equal(r.status,200);return r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
const cookie=await login(1),other=await login(2);let checks=0;const ok=()=>checks++;
async function req(path,session=cookie){const r=await fetch(base+path,{headers:{Cookie:session}});return {status:r.status,json:await r.json(),cache:r.headers.get('cache-control')};}
assert.equal((await req('/api/user/activities','')).status,401);ok();
for(const path of ['/api/user/me','/api/tournaments','/api/circuits','/api/monday-league','/api/moviback/me','/api/store/products','/api/user/communications']){assert.equal((await req(path)).status,200,path);ok();}
for(const q of ['limit=51','tab=unknown','tab=action','user_id=other']){assert.equal((await req('/api/user/activities?'+q)).status,400);ok();}
const begin=Date.now(),up=await req('/api/user/activities?limit=50');assert.equal(up.status,200);assert.equal(up.cache,'no-store');const data=up.json.data;ok();
assert.ok(data.some(a=>a.type==='gioca'&&a.status==='searching'));assert.ok(data.some(a=>a.type==='allenati'&&a.status==='received'));ok();
assert.ok(data.some(a=>a.type==='tournament'&&a.source_id==='edee4000-0000-4000-8000-000000000001'));assert.ok(data.some(a=>a.type==='monday_league'));ok();
const circuits=data.filter(a=>a.type==='circuit'&&a.title==='PadelSeries Demo Attività');assert.equal(circuits.length,2);assert.deepEqual(circuits.map(c=>c.points).sort((a,b)=>a-b),[430,820]);assert.equal(new Set(circuits.map(c=>c.classification_id)).size,2);ok();
const publicCircuit=await req('/api/circuits/padelseries-demo-attivita','');for(const c of circuits){const r=publicCircuit.json.ranking_groups.find(g=>g.id===c.classification_id).ranking.find(r=>r.player_name==='Utente Richieste Demo 1');assert.equal(c.position,r.position);assert.equal(c.points,r.total_points);assert.equal(c.events_played,r.events_played);}ok();
assert.equal(new Set(data.map(a=>a.id)).size,data.length);const forbidden=['user_id','admin_notes','phone','telegram_state','player_key'];for(const a of data)for(const k of forbidden)assert.equal(k in a,false);ok();
const history=(await req('/api/user/activities?tab=history&limit=50')).json.data;assert.ok(history.some(a=>a.type==='gioca'&&a.status==='completed'));assert.ok(history.some(a=>a.type==='allenati'&&a.status==='completed'));assert.ok(history.some(a=>a.type==='tournament'&&a.source_id==='edee4000-0000-4000-8000-000000000003'));assert.ok(!history.some(a=>a.type==='circuit'));ok();
const otherData=(await req('/api/user/activities?limit=50',other)).json.data;const privateFixtureIds=new Set(data.filter(a=>(['gioca','allenati'].includes(a.type)&&a.source_id.startsWith('eded7000-'))||(a.type==='tournament'&&a.source_id.startsWith('edee4000-'))||(a.type==='circuit'&&a.title==='PadelSeries Demo Attività')).map(a=>a.id));assert.ok(!otherData.some(a=>privateFixtureIds.has(a.id)));ok();
assert.equal((await req('/api/user/activities/request/eded7000-0000-4000-8000-000000000001',other)).status,404);assert.equal((await req('/api/user/activities/request/eded7000-0000-4000-8000-000000000001')).status,200);ok();
const p1=(await req('/api/user/activities?limit=2')).json,p2=(await req('/api/user/activities?limit=2&offset=2')).json;assert.ok(p1.has_more);assert.equal(new Set([...p1.data,...p2.data].map(a=>a.id)).size,4);ok();
// All mutations below are scoped to disposable fixture rows and restored in finally.
const season='edee8000-0000-4000-8000-000000000001',cid='edee1000-0000-4000-8000-000000000001',duplicate=randomUUID();
try{
 assert.ifError((await db.from('league_seasons').update({public_visibility:'hidden'}).eq('id',season)).error);assert.ok(!(await req('/api/user/activities?limit=50')).json.data.some(a=>a.source_id==='edee8600-0000-4000-8000-000000000001'));ok();
 assert.ifError((await db.from('circuits').update({status:'draft'}).eq('id',cid)).error);assert.ok(!(await req('/api/user/activities?limit=50')).json.data.some(a=>a.type==='circuit'&&a.title==='PadelSeries Demo Attività'));ok();
 await db.from('circuits').update({status:'closed'}).eq('id',cid);assert.equal((await req('/api/user/activities?tab=history&limit=50')).json.data.filter(a=>a.type==='circuit'&&a.title==='PadelSeries Demo Attività').length,2);ok();
 const reg=(await db.from('tournament_registrations').select('*').eq('id','edee5000-0000-4000-8000-000000000001').single()).data;assert.ifError((await db.from('tournament_registrations').insert({...reg,id:duplicate})).error);assert.equal((await req('/api/user/activities?limit=50')).json.data.filter(a=>a.source_id===reg.tournament_id).length,1);ok();
}finally{await db.from('league_seasons').update({public_visibility:'public'}).eq('id',season);await db.from('circuits').update({status:'active'}).eq('id',cid);await db.from('tournament_registrations').delete().eq('id',duplicate);}
console.log(`Activities HTTP PASS: ${checks} checks; full test ${Date.now()-begin}ms; no external transport.`);
