import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw Error('Verified local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),base='http://localhost:3100';
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(base+'/api/admin/login',{method:'POST',body:form});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function post(path,body){const response=await fetch(base+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});return {status:response.status,json:await response.json()};}
async function identity(action,data){return post('/api/admin/player-identities',{action,data});}
async function players(label,accounts=[]){
 const ids=[randomUUID(),randomUUID()];
 const rows=[{id:ids[0],full_name:`${label} corretta`,normalized_phone:'+39347910'+String(Math.floor(Math.random()*1000)).padStart(3,'0'),gender:'M',account_user_id:accounts[0]??null},{id:ids[1],full_name:`${label} errata`,normalized_phone:'+39347920'+String(Math.floor(Math.random()*1000)).padStart(3,'0'),gender:'F',account_user_id:accounts[1]??null}];
 const inserted=await db.from('player_identities').insert(rows).select();assert.ifError(inserted.error);return inserted.data;
}
async function sportingCase(pair,label){const inserted=await db.from('player_identity_cases').insert({dedupe_key:randomUUID(),case_type:'sporting_duplicate',source_kind:'merge',source_ref:pair.map(player=>player.id).join(':'),player_ids:pair.map(player=>player.id),account_ids:[],evidence:{full_name:label}}).select().single();assert.ifError(inserted.error);return inserted.data;}
async function prepare(pair,c){return identity('prepare_merge',{case_id:c.id,version:c.version,source_id:pair[1].id,canonical_id:pair[0].id});}

// Descriptive differences never block a safe sporting merge; canonical fields survive.
const noAccount=await players('Workflow senza account'),noAccountCase=await sportingCase(noAccount,'Workflow A — dato sportivo errato');
let prepared=await prepare(noAccount,noAccountCase);assert.equal(prepared.status,200);assert.equal(prepared.json.data.state,'ready');
let merged=await identity('merge',{case_id:noAccountCase.id,version:prepared.json.data.case_version,source_id:noAccount[1].id,canonical_id:noAccount[0].id,fingerprint:prepared.json.data.fingerprint});assert.equal(merged.status,200,JSON.stringify(merged.json));
let canonical=await db.from('player_identities').select('*').eq('id',noAccount[0].id).single();assert.equal(canonical.data.gender,'M');assert.match(canonical.data.full_name,/corretta/);

// A single account follows the canonical sporting identity.
const oneUser=randomUUID(),onePhone=`+39348${String(Math.floor(Math.random()*10000000)).padStart(7,'0')}`;assert.ifError((await db.from('users').insert({id:oneUser,full_name:'Workflow account singolo',phone:onePhone,email:`${oneUser}@example.invalid`,gender:'M'})).error);
const oneAccount=await players('Workflow account singolo',[null,oneUser]),oneAccountCase=await sportingCase(oneAccount,'Workflow B — un account');
prepared=await prepare(oneAccount,oneAccountCase);assert.equal(prepared.json.data.state,'ready');
merged=await identity('merge',{case_id:oneAccountCase.id,version:prepared.json.data.case_version,source_id:oneAccount[1].id,canonical_id:oneAccount[0].id,fingerprint:prepared.json.data.fingerprint});assert.equal(merged.status,200);
canonical=await db.from('player_identities').select('account_user_id').eq('id',oneAccount[0].id).single();assert.equal(canonical.data.account_user_id,oneUser);

// Two accounts pause, use the certified Auth2 flow, then resume the same sporting case.
const accountIds=[randomUUID(),randomUUID()],mailSeed=randomUUID(),accountLabel=`Workflow ${mailSeed.slice(0,8)}`;
assert.ifError((await db.from('users').insert(accountIds.map((id,index)=>({id,full_name:accountLabel,phone:`+3934794${String(Math.floor(Math.random()*1000000)+index).padStart(6,'0')}`,email:`workflow-${index}-${mailSeed}@example.invalid`,gender:index?'F':'M'})))).error);
const twoAccounts=await players(accountLabel,accountIds),twoAccountCase=await sportingCase(twoAccounts,'Workflow C — due account');
prepared=await prepare(twoAccounts,twoAccountCase);assert.equal(prepared.status,200);assert.equal(prepared.json.data.state,'requires_account_resolution');assert.equal(prepared.json.data.accounts.length,2);
const beforeLinks=await db.from('player_identities').select('id,account_user_id').in('id',twoAccounts.map(player=>player.id)).order('id');
assert.deepEqual(beforeLinks.data.map(player=>player.account_user_id).sort(),[...accountIds].sort());
const selected=await identity('select_account_resolution',{case_id:twoAccountCase.id,version:prepared.json.data.case_version,selected_account_id:accountIds[1]});assert.equal(selected.status,200,JSON.stringify(selected.json));
const groupId=selected.json.data.auth_group_id;
const authPreview=await post('/api/admin/users/duplicates/preview',{group_id:groupId,keep_user_id:accountIds[1],field_choices:{}});assert.equal(authPreview.status,200,JSON.stringify(authPreview.json));assert.equal(authPreview.json.data.state,'ready',JSON.stringify(authPreview.json));
const authResolved=await post('/api/admin/users/duplicates/resolve',{group_id:groupId,keep_user_id:accountIds[1],field_choices:{}});assert.equal(authResolved.status,200,JSON.stringify(authResolved.json));assert.equal(authResolved.json.data.state,'completed',JSON.stringify(authResolved.json));
const accountRows=await db.from('users').select('id,identity_status,merged_into_user_id').in('id',accountIds);assert.equal(accountRows.data.find(row=>row.id===accountIds[0]).merged_into_user_id,accountIds[1]);
const inReview=await db.from('player_identity_cases').select('*').eq('id',twoAccountCase.id).single();assert.equal(inReview.data.status,'in_review');assert.equal(inReview.data.decision.state,'account_resolved');
prepared=await identity('prepare_merge',{case_id:twoAccountCase.id,version:inReview.data.version,source_id:twoAccounts[1].id,canonical_id:twoAccounts[0].id});assert.equal(prepared.json.data.state,'ready',JSON.stringify(prepared.json));
merged=await identity('merge',{case_id:twoAccountCase.id,version:prepared.json.data.case_version,source_id:twoAccounts[1].id,canonical_id:twoAccounts[0].id,fingerprint:prepared.json.data.fingerprint});assert.equal(merged.status,200,JSON.stringify(merged.json));
canonical=await db.from('player_identities').select('*').eq('id',twoAccounts[0].id).single();assert.equal(canonical.data.account_user_id,accountIds[1]);assert.equal(canonical.data.gender,'M');
assert.equal((await db.from('player_identity_cases').select('status').eq('id',twoAccountCase.id).single()).data.status,'resolved');

console.log('Player Identity account resolution PASS: wrong data, no/one/two accounts, Auth2 reuse, same-case resume, canonical fields and account preserved.');
