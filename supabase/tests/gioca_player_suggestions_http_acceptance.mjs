import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

if(process.env.GIOCA_SUGGESTIONS_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55021')throw new Error('Verified local Gioca suggestions runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const base='http://localhost:3100';
const id=n=>`c8603000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(base+'/api/admin/login',{method:'POST',body:form});assert.equal(login.status,200);const session=cookies(login);
const post=async(path,body,cookie=session,origin=base)=>{const response=await fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,json:await response.json()};};
const requestCall=(n,cookie=session,origin=base)=>post(`/api/admin/requests/${id(n)}/player-suggestions`,null,cookie,origin);
assert.equal((await requestCall(1,'')).status,403);
assert.equal((await requestCall(1,session,'http://evil.invalid')).status,403);

const owner=(await db.from('player_identities').select('id').eq('account_user_id','eded6000-0000-4000-8000-000000000001').single()).data.id;
const before=(await db.from('movi_requests').select('status,updated_at').eq('id',id(1)).single()).data;
const a=await requestCall(1);assert.equal(a.status,200);assert.ok(a.json.data.length<=20);assert.ok(a.json.data.every(item=>item.score>=50&&item.id!==owner));
const manualA=await post('/api/admin/players/match',{club:'Manta',target_level_numeric:null,target_level_descriptive:'intermedio',weekday:5,time_window:'evening',match_type:'male',last_minute:false,exclude_player_id:null});assert.equal(manualA.status,200);
assert.deepEqual(a.json.data,manualA.json.data.filter(item=>item.id!==owner));
const after=(await db.from('movi_requests').select('status,updated_at').eq('id',id(1)).single()).data;assert.deepEqual(after,before);

const b=await requestCall(2);assert.equal(b.status,200);
const manualB=await post('/api/admin/players/match',{club:'Costigliole',target_level_numeric:null,target_level_descriptive:'intermedio',weekday:3,time_window:'evening',match_type:'mixed',last_minute:false,exclude_player_id:null});assert.equal(manualB.status,200);
assert.deepEqual(b.json.data,manualB.json.data.filter(item=>item.id!==owner));
const c=await requestCall(3);assert.equal(c.status,200);assert.deepEqual(c.json.context.clubs,['Manta','Costigliole']);assert.ok(c.json.data.some(item=>item.matchedClub==='Manta'));assert.ok(c.json.data.some(item=>item.matchedClub==='Costigliole'));
const d=await requestCall(4);assert.equal(d.status,200);assert.equal(d.json.context.weekday,null);assert.deepEqual(d.json.context.clubs,[]);assert.ok(d.json.data.some(item=>item.fullName==='Matching Demo I Availability mismatch'),'unknown weekday and flexible club do not hard-exclude');
const e=await requestCall(5);assert.equal(e.status,200);assert.equal(e.json.context.matchType,null);assert.ok(e.json.data.some(item=>item.fullName==='Matching Demo J Match type incompatible'),'any match type does not hard-exclude');
const f=await requestCall(6);assert.equal(f.status,200);assert.ok(f.json.data.every(item=>item.id!==owner));
const g=await requestCall(7);assert.equal(g.status,200);assert.deepEqual(g.json.data,[]);
assert.equal((await post('/api/admin/requests/eded7000-0000-4000-8000-000000000006/player-suggestions',null)).status,409);
assert.equal((await post('/api/admin/requests/eded7000-0000-4000-8000-000000000004/player-suggestions',null)).status,409);
for(const item of a.json.data)for(const forbidden of ['tax_code','certificate','moviback','points_balance','internal_notes','auth_user_id'])assert.equal(forbidden in item,false);
console.log('Gioca suggestions HTTP acceptance passed: A-G, equivalence, owner exclusion, read-only request, auth/origin and DTO privacy.');
