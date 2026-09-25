import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55021')throw Error('Verified local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base='http://localhost:3100';
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(base+'/api/admin/login',{method:'POST',body:form});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
const ul=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'requests-demo-1@example.invalid',password:'Requests-Local-2026!'})});assert.equal(ul.status,200);const user=ul.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
let checks=0;const ok=()=>checks++;
async function req(path,body,session=cookie){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:session,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json()};}
for(const session of ['',user]){assert.equal((await req('/api/admin/player-identities',undefined,session)).status,403);assert.equal((await req('/api/admin/player-identities',{action:'create',data:{full_name:'Forbidden',phone:'+393470099001'}},session)).status,403);ok();}
const anon=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.from('player_identity_cases').select('*')).error);ok();
let r=await req('/api/admin/player-identities');assert.equal(r.status,200);assert.ok(r.json.players.some(p=>p.account_user_id));assert.ok(r.json.players.some(p=>!p.account_user_id));assert.ok(r.json.players.every(p=>p.status==='active'));ok();
for(const type of ['circuit_identity_ambiguity','league_identity_confirmation','sporting_merge_conflict']){assert.ok(r.json.cases.some(c=>c.case_type===type));ok();}
assert.ok((await req('/api/admin/player-identities?status=archived')).json.players.some(p=>p.id==='efee2000-0000-4000-8000-000000000003'));ok();
assert.ok((await req('/api/admin/player-identities?status=merged')).json.players.some(p=>p.merged_into_player_id));ok();
assert.equal((await req('/api/admin/player-identities',{action:'create',data:{email:'forbidden@example.invalid'}})).status,400);ok();
r=await req('/api/admin/player-identities',{action:'merge_preview',data:{source_id:'efee2000-0000-4000-8000-000000000006',canonical_id:'efee2000-0000-4000-8000-000000000007'}});assert.equal(r.status,200);assert.ok(r.json.data.fingerprint);assert.deepEqual(r.json.data.blockers,[]);ok();
const publicBefore=(await req('/api/circuits/circuito-identita-demo')).json;
const adminBefore=(await req('/api/admin/circuits/efee3000-0000-4000-8000-000000000001/rankings')).json;
const pid='efee2000-0000-4000-8000-000000000001',uid='eded6000-0000-4000-8000-000000000001';
const existing=(await db.from('player_identities').select('*').eq('id',pid).single()).data;
const snapshot=(await db.from('circuit_results').select('*').eq('source_tournament_id','efee4000-0000-4000-8000-000000000001')).data;
let ambiguousRow;
try{
 assert.ifError((await db.from('player_identities').update({account_user_id:uid}).eq('id',pid)).error);
 const data=(await req('/api/user/activities?limit=50',undefined,user)).json.data;
 assert.equal(data.filter(a=>a.title==='Circuito Identità Demo').length,2);ok();
 assert.equal(data.filter(a=>a.title==='PadelSeries Demo Attività').length,2);ok();
 const materialize={p_tournament:'efee4000-0000-4000-8000-000000000001',p_run:'efee4200-0000-4000-8000-000000000001',p_rows:snapshot};
 for(const result of await Promise.all([db.rpc('player_identity_materialize_circuit',materialize),db.rpc('player_identity_materialize_circuit',materialize)]))assert.ifError(result.error);ok();
 assert.ifError((await db.from('tournament_runs').update({status:'running'}).eq('id',materialize.p_run)).error);
 try{
  const closed=await req('/api/admin/tournaments/efee4000-0000-4000-8000-000000000001/run/close',{});assert.equal(closed.status,200,JSON.stringify(closed.json));assert.equal(closed.json.circuitRowsInserted,4);ok();
  assert.equal((await req('/api/admin/tournaments/efee4000-0000-4000-8000-000000000001/run/close',{})).json.alreadyClosed,true);ok();
 }finally{assert.ifError((await db.from('tournament_runs').update({status:'completed'}).eq('id',materialize.p_run)).error);}
 const publicAfter=(await req('/api/circuits/circuito-identita-demo')).json;
 const adminAfter=(await req('/api/admin/circuits/efee3000-0000-4000-8000-000000000001/rankings')).json;
 assert.deepEqual(publicAfter.ranking_groups.map(g=>g.ranking),publicBefore.ranking_groups.map(g=>g.ranking));ok();
 assert.deepEqual(adminAfter.data.ranking_groups.map(g=>g.ranking),adminBefore.data.ranking_groups.map(g=>g.ranking));ok();
 const inserted=await db.from('circuit_results').insert({circuit_id:'efee3000-0000-4000-8000-000000000001',ranking_group_id:'efee3100-0000-4000-8000-000000000001',tournament_name:'HTTP ambiguity',tournament_type:'Coppie fisse',player_key:'3470005199',player_name:existing.full_name,points:1,player_identity_id:'efee2000-0000-4000-8000-000000000002'}).select('id').single();assert.ifError(inserted.error);ambiguousRow=inserted.data.id;
 const ambiguous=(await req('/api/user/activities?limit=50',undefined,user)).json.data.find(a=>a.classification_id==='efee3100-0000-4000-8000-000000000001');assert.equal(ambiguous.primary_meta,'Classifica personale da verificare');ok();
}finally{if(ambiguousRow)assert.ifError((await db.from('circuit_results').delete().eq('id',ambiguousRow)).error);assert.ifError((await db.from('player_identities').update({account_user_id:existing.account_user_id}).eq('id',pid)).error);}
// A stale command may not mutate an identity. No permanent fixture change here.
assert.equal((await req('/api/admin/player-identities',{action:'archive',data:{player_id:pid,updated_at:'2000-01-01T00:00:00Z'}})).status,409);ok();
for(const path of ['/api/tournaments','/api/monday-league','/api/user/me','/api/moviback/me','/api/store/products','/api/user/communications']){assert.equal((await req(path,undefined,user)).status,200);ok();}
console.log(`Player Identity HTTP PASS: ${checks} checks`);
