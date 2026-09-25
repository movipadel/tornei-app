import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55021')throw new Error('Local runner required');
const base='http://localhost:3100',db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(`${base}/api/admin/login`,{method:'POST',body:form});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const request=async(path,method='GET',body,session=cookie)=>{
 const r=await fetch(base+path,{method,headers:{...(session?{Cookie:session}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 return {status:r.status,json:await r.json()};
};
const sample={status:'draft',name:'HTTP Partner test',slug:`http-partner-${Date.now()}`,category:'Sport',short_description:'local',full_description:'<script>not executable</script>',benefit_title:'10%',benefit_description:'Test',conditions:'manual',website_url:null,contact_url:null,phone:'',address:'',locality:'',valid_from:null,valid_until:null,sort_order:0,featured:false};
const ids=[],paths=[];let checks=0;const ok=()=>checks++;
try{
 for(const role of ['anon','user','staff']){const token=role==='anon'?'':await new SignJWT({sid:`partner-${role}`,role}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));assert.equal((await request('/api/admin/partners','POST',sample,token?`staff_session=${token}`:'')).status,403);ok();}
 let r=await request('/api/admin/partners','POST',sample);assert.equal(r.status,201);let item=r.json.data;ids.push(item.id);ok();
 assert.equal((await request(`/api/partners/${item.slug}`)).status,404);ok();
 assert.equal((await request('/api/admin/partners','POST',sample)).status,409);ok();
 assert.deepEqual((await anon.from('movi_partners').select('id').eq('id',item.id)).data,[]);ok();
 const user=await db.auth.admin.createUser({email:`partner-${Date.now()}@example.invalid`,password:'Local-Partner-2026!',email_confirm:true});assert.ifError(user.error);
 try{const client=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ifError((await client.auth.signInWithPassword({email:user.data.user.email,password:'Local-Partner-2026!'})).error);assert.ok((await client.from('movi_partners').insert({...sample,slug:'denied'})).error);ok();assert.ok((await client.storage.from('movi-partners-media').upload(`${item.id}/bad.png`,new Uint8Array([1]))).error);ok();}finally{await db.auth.admin.deleteUser(user.data.user.id);}
 for(const role of ['logo','cover']){const f=new FormData();f.set('role',role);f.set('file',new Blob([readFileSync('public/home/tournaments.jpg')],{type:'image/jpeg'}),'image.jpg');r=await request(`/api/admin/partners/${item.id}/media`,'POST',f);assert.equal(r.status,201);item=r.json.data;assert.ok(item[`${role}_url`]);ok();}
 const stored=(await db.from('movi_partners').select('logo_path,cover_path').eq('id',item.id).single()).data;paths.push(stored.logo_path,stored.cover_path);
 assert.ok((await anon.storage.from('movi-partners-media').download(paths[0])).error);ok();
 const bad=new FormData();bad.set('role','logo');bad.set('file',new Blob(['<svg/>'],{type:'image/png'}),'bad.png');assert.equal((await request(`/api/admin/partners/${item.id}/media`,'POST',bad)).status,400);ok();
 assert.equal((await request(`/api/admin/partners/${item.id}/media`,'DELETE',{role:'logo',storage_path:'other/path'})).status,400);ok();
 assert.equal((await request(`/api/admin/partners/${item.id}`,'PUT',{...item,website_url:'http://127.0.0.1:55021'})).status,400);ok();
 r=await request(`/api/admin/partners/${item.id}`,'PUT',{...item,status:'active',name:'Updated HTTP partner'});assert.equal(r.status,200);item=r.json.data;ok();
 r=await request(`/api/partners/${item.slug}`);assert.equal(r.status,200);assert.equal(r.json.data.membership_copy,'Mostra la tua tessera MOVI');assert.equal('logo_path' in r.json.data,false);ok();
 r=await request('/api/partners?limit=50');assert.ok(r.json.data.some(p=>p.id===item.id));assert.ok(r.json.data.every(p=>p.status==='active'));ok();
 for(const q of ['limit=51','offset=10001','limit=0']){assert.equal((await request('/api/partners?'+q)).status,400);ok();}
 assert.equal((await request(`/api/admin/partners/${item.id}`,'PUT',{...item,updated_at:'2000-01-01T00:00:00Z'})).status,409);ok();
 for(const patch of [{valid_from:new Date(Date.now()+86400000).toISOString()},{valid_from:null,valid_until:new Date(Date.now()-86400000).toISOString()},{valid_from:null,valid_until:null,status:'inactive'}]){r=await request(`/api/admin/partners/${item.id}`,'PUT',{...item,...patch});assert.equal(r.status,200);item=r.json.data;assert.equal((await request(`/api/partners/${item.slug}`)).status,404);assert.ok(!(await request('/api/partners?limit=50')).json.data.some(p=>p.id===item.id));ok();}
 r=await request(`/api/admin/partners/${item.id}`,'PUT',{...item,status:'active',valid_from:new Date(Date.now()-86400000).toISOString(),valid_until:new Date(Date.now()+86400000).toISOString()});assert.equal(r.status,200);item=r.json.data;assert.equal((await request(`/api/partners/${item.slug}`)).status,200);ok();
 r=await request(`/api/admin/partners/${item.id}/media`,'DELETE',{role:'logo'});assert.equal(r.status,200);assert.equal(r.json.data.logo_url,null);assert.ok(r.json.data.cover_url);ok();
 assert.equal((await request(`/api/admin/partners/${item.id}`,'DELETE')).status,200);assert.equal((await request(`/api/partners/${item.slug}`)).status,404);assert.equal((await request(`/api/admin/partners/${item.id}`)).status,404);ok();
 console.log(`Partner HTTP/security/CRUD/media PASS: ${checks} checks`);
}finally{if(paths.length)await db.storage.from('movi-partners-media').remove(paths);if(ids.length)await db.from('movi_partners').delete().in('id',ids);}
