import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Local runner required');
const base=process.env.PADELLERIA_TEST_BASE_URL||'http://localhost:3100',db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const form=new FormData();form.set('email','padelleria-admin@example.invalid');form.set('password','Padelleria-Local-2026!');
const login=await fetch(`${base}/api/admin/login`,{method:'POST',body:form});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const request=async(path,method='GET',body,session=cookie)=>{
 const r=await fetch(base+path,{method,headers:{...(session?{Cookie:session}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 return {status:r.status,json:await r.json()};
};
const sample={kind:'succede',status:'draft',title:'HTTP local acceptance',excerpt:'test',body:'<script>not executable</script>',featured:false,delete_on_expiry:false,sort_order:0,cta_label:null,cta_url:null,occurred_at:null,visible_from:null,visible_until:null};
const ids=[],paths=[];
let checks=0;const ok=()=>checks++;
try{
 assert.equal((await request('/api/admin/padelleria','POST',sample,'')).status,401);ok();
 const normalToken=await new SignJWT({sid:'local-test-normal',role:'user'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
 assert.equal((await request('/api/admin/padelleria','POST',sample,`staff_session=${normalToken}`)).status,401);ok();
 const staffToken=await new SignJWT({sid:'local-test-staff',role:'staff'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
 assert.equal((await request('/api/admin/padelleria','POST',sample,`staff_session=${staffToken}`)).status,401);ok();
 const created=await request('/api/admin/padelleria','POST',sample);assert.equal(created.status,201);let item=created.json.data;ids.push(item.id);ok();
 const hidden=await anon.from('padelleria_contents').select('id').eq('id',item.id);assert.deepEqual(hidden.data,[]);ok();
 const normalAuth=await db.auth.admin.createUser({email:`padelleria-${Date.now()}@example.invalid`,password:'Local-Acceptance-2026!',email_confirm:true});assert.ifError(normalAuth.error);
 const userClient=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 try{
   assert.ifError((await userClient.auth.signInWithPassword({email:normalAuth.data.user.email,password:'Local-Acceptance-2026!'})).error);
   assert.ok((await userClient.from('padelleria_contents').insert(sample)).error);ok();
   assert.ok((await userClient.storage.from('padelleria-content-media').upload(`${item.id}/test.png`,new Uint8Array([1]))).error);ok();
 }finally{await db.auth.admin.deleteUser(normalAuth.data.user.id);}
 const list=await request('/api/admin/padelleria?status=draft&limit=50');assert.ok(list.json.data.some(v=>v.id===item.id));ok();
 const image=new FormData();image.set('role','cover');image.set('file',new Blob([readFileSync('public/home/tournaments.jpg')],{type:'image/jpeg'}),'cover.jpg');
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'POST',image)).status,201);ok();
 const gallery=new FormData();gallery.set('role','gallery');gallery.set('file',new Blob([readFileSync('public/home/hero-bg.jpg')],{type:'image/jpeg'}),'gallery.jpg');
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'POST',gallery)).status,201);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'POST',{external_url:'https://vimeo.com/123456',caption:'Video'})).status,201);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'POST',{external_url:'http://127.0.0.1:55421'})).status,400);ok();
 const invalid=new FormData();invalid.set('role','gallery');invalid.set('file',new Blob(['<svg/>'],{type:'image/png'}),'bad.png');assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'POST',invalid)).status,400);ok();
 item=(await request(`/api/admin/padelleria/${item.id}`)).json.data;assert.equal(item.media.length,3);assert.ok(item.media[0].url);ok();
 const owned=await db.from('padelleria_content_media').select('storage_path').eq('content_id',item.id);paths.push(...owned.data.flatMap(m=>m.storage_path?[m.storage_path]:[]));
 assert.ok((await anon.storage.from('padelleria-content-media').download(paths[0])).error);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'PATCH',{ids:item.media.map(m=>m.id).reverse()})).status,200);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'PATCH',{ids:['00000000-0000-4000-8000-000000000000']})).status,409);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'DELETE',{media_id:item.media[0].id,storage_path:'other/file.png'})).status,400);ok();
 const update=await request(`/api/admin/padelleria/${item.id}`,'PUT',{...item,status:'published',title:'HTTP published'});assert.equal(update.status,200);item=update.json.data;ok();
 const publicList=await request('/api/padelleria?kind=succede&limit=50','GET',undefined,'');assert.ok(publicList.json.data.some(v=>v.id===item.id));assert.ok(publicList.json.data.every(v=>v.status==='published'));ok();
 assert.equal((await request('/api/padelleria?limit=999','GET',undefined,'')).status,400);ok();
 const stale=await request(`/api/admin/padelleria/${item.id}`,'PUT',{...item,updated_at:'2000-01-01T00:00:00Z'});assert.equal(stale.status,409);ok();
 const unpublish=await request(`/api/admin/padelleria/${item.id}`,'PUT',{...item,status:'draft'});assert.equal(unpublish.status,200);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}/media`,'DELETE',{media_id:item.media[0].id})).status,200);ok();
 assert.equal((await request(`/api/admin/padelleria/${item.id}`,'DELETE')).status,200);assert.equal((await request(`/api/admin/padelleria/${item.id}`)).status,404);ok();
 assert.deepEqual((await anon.from('padelleria_contents').select('id').eq('id',item.id)).data,[]);ok();
 console.log(`Padelleria HTTP/security/CRUD/media PASS: ${checks} checks`);
}finally{
 // Test-owned UUIDs only. Fixture/demo contents remain for visual inspection.
 if(ids.length){const media=await db.from('padelleria_content_media').select('storage_path').in('content_id',ids);const ownPaths=media.data?.flatMap(m=>m.storage_path?[m.storage_path]:[])??[];if(ownPaths.length)await db.storage.from('padelleria-content-media').remove(ownPaths);await db.from('padelleria_content_media').delete().in('content_id',ids);await db.from('padelleria_contents').delete().in('id',ids);}
}
