import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55021')throw Error('Verified local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base='http://localhost:3100';
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(base+'/api/admin/login',{method:'POST',body:form});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
async function req(action,data){const r=await fetch(base+'/api/admin/player-identities',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:AbortSignal.timeout(25000)});return {status:r.status,json:await r.json()};}
async function pair(label){const ids=[randomUUID(),randomUUID()];const data=ids.map((id,index)=>({id,full_name:label+(index?' B':' A'),normalized_phone:'+39347'+String(Math.floor(Math.random()*10000000)).padStart(7,'0')}));const r=await db.from('player_identities').insert(data).select();assert.ifError(r.error);return r.data;}
async function caseFor(players,label){const r=await db.from('player_identity_cases').insert({dedupe_key:'bugfix-'+randomUUID(),case_type:'sporting_duplicate',source_kind:'merge',source_ref:players.map(p=>p.id).join(':'),player_ids:players.map(p=>p.id),account_ids:[],evidence:{full_name:label}}).select().single();assert.ifError(r.error);return r.data;}
async function readCase(id){const r=await db.from('player_identity_cases').select('*').eq('id',id).single();assert.ifError(r.error);return r.data;}
const testPlayers=await pair('Test bugfix persone distinte');const c=await caseFor(testPlayers,'Test rifiuto idempotente');
const rowsBefore=await db.from('circuit_results').select('*').order('id');assert.ifError(rowsBefore.error);
const reject={case_id:c.id,version:c.version,reason:'Persone diverse: prova locale',decision:'reject'};
const responses=await Promise.all([req('resolve_case',reject),req('resolve_case',reject)]);responses.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.json)));
assert.equal((await req('resolve_case',reject)).status,200);
const after=await readCase(c.id);assert.equal(after.status,'rejected');assert.equal(after.version,c.version+1);
assert.deepEqual((await db.from('player_identities').select('*').in('id',testPlayers.map(p=>p.id)).order('id')).data,[...testPlayers].sort((a,b)=>a.id.localeCompare(b.id)));
assert.deepEqual((await db.from('circuit_results').select('*').order('id')).data,rowsBefore.data);
assert.equal((await req('resolve_case',{...reject,reason:'Decisione differente'})).status,409);
const blockedIds=['efee2000-0000-4000-8000-000000000001','efee2000-0000-4000-8000-000000000008'];
const blockedBefore=(await db.from('player_identities').select('*').in('id',blockedIds).order('id')).data;
const blockedData={source_id:blockedIds[0],canonical_id:blockedIds[1]};const bp=await req('merge_preview',blockedData);assert.equal(bp.status,200);const blocked=await req('merge',{...blockedData,fingerprint:bp.json.data.fingerprint});assert.equal(blocked.status,409);assert.equal(blocked.json.code,'MERGE_BLOCKED');assert.match(blocked.json.error,/due account diversi/);assert.deepEqual((await db.from('player_identities').select('*').in('id',blockedIds).order('id')).data,blockedBefore);
const validPlayers=await pair('Test bugfix unione sicura');const vc=await caseFor(validPlayers,'Test unione inversa');
const merge={source_id:validPlayers[1].id,canonical_id:validPlayers[0].id,case_id:vc.id,version:vc.version};
const vp=await req('merge_preview',merge);assert.equal(vp.status,200);assert.deepEqual(vp.json.data.blockers,[]);
const stale=await req('merge',{...merge,fingerprint:'outdated'});assert.equal(stale.status,409);assert.match(stale.json.error,/aggiornati/);
const merged=await req('merge',{...merge,fingerprint:vp.json.data.fingerprint});assert.equal(merged.status,200,JSON.stringify(merged.json));assert.equal(merged.json.data.state,'merged');assert.equal((await readCase(vc.id)).status,'resolved');
const final=(await db.from('player_identities').select('*').in('id',validPlayers.map(p=>p.id))).data;assert.equal(final.find(p=>p.id===merge.source_id).merged_into_player_id,merge.canonical_id);assert.equal(final.find(p=>p.id===merge.canonical_id).status,'active');
const repeat=await req('merge',{...merge,fingerprint:vp.json.data.fingerprint});assert.equal(repeat.status,409); // Safe stale response; no second merge.
// Leave three fresh, independent scenarios available for the user's visual acceptance.
const distinct=await pair('Retest persone diverse');await caseFor(distinct,'Retest — persone diverse');
const valid=await pair('Retest unione valida');await caseFor(valid,'Retest — unione valida');
await caseFor(blockedBefore,'Retest — unione bloccata');
console.log('Identity actions HTTP PASS: reject, concurrent replay, unchanged identities/accounts/results, blocked 409, stale 409, valid reverse merge and case closure. Three fresh Retest cases ready.');
