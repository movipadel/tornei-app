import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

if (process.env.PADELLERIA_LOCAL_VERIFIED !== '1') throw new Error('Verified local runner required');
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8'}));
if(status.API_URL!=='http://127.0.0.1:55421'||status.DB_URL!=='postgresql://postgres:postgres@127.0.0.1:55422/postgres'||status.linked_project)
 throw new Error('STOP: target is not local Supabase');
const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false}});
const base='http://127.0.0.1:3100';
const photo=readFileSync('public/home/tournaments.jpg');
const logo=readFileSync('public/branding/movi-padelleria.png');
const slug=`partner-b4-${randomUUID()}`;
const sample={status:'draft',name:'Partner B4 sintetico',slug,category:'Sport',short_description:'Locale',full_description:'',benefit_title:'Test',benefit_description:'',conditions:'',website_url:null,contact_url:null,phone:'',address:'',locality:'',valid_from:null,valid_until:null,sort_order:0,featured:false};
let id,checks=0;
const request=async(path,method='GET',body,cookie='')=>{
 const r=await fetch(base+path,{method,headers:cookie?{Cookie:cookie}:undefined,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 return {status:r.status,json:await r.json()};
};
const form=(bytes,mime,role,requestId,profile)=>{const f=new FormData();f.set('role',role);f.set('file',new Blob([bytes],{type:mime}),`b4.${mime.split('/')[1]}`);f.set('request_id',requestId);if(profile)f.set('image_profile',profile);return f;};
const checked=result=>{assert.ifError(result.error);return result.data;};
const row=async path=>checked(await db.from('movi_image_variants').select('*').eq('bucket_id','movi-partners-media').eq('original_path',path).single());
try{
 const login=new FormData();login.set('email','padelleria-admin@example.invalid');login.set('password','Padelleria-Local-2026!');
 const auth=await fetch(`${base}/api/admin/login`,{method:'POST',body:login});assert.equal(auth.status,200);
 const cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 assert.ok(cookie);checks++;
 assert.equal((await request('/api/admin/partners','POST',sample,cookie)).status,201);
 id=checked(await db.from('movi_partners').select('id').eq('slug',slug).single()).id;checks++;
 const endpoint=`/api/admin/partners/${id}/media`;
 assert.equal((await request(endpoint,'POST',form(photo,'image/jpeg','cover',randomUUID(),'photo'))).status,401);checks++;
 const coverRequest=randomUUID();
 const cover=await request(endpoint,'POST',form(photo,'image/jpeg','cover',coverRequest,'poster'),cookie);
 assert.equal(cover.status,201,JSON.stringify(cover.json));
 const initial=checked(await db.from('movi_partners').select('cover_path,logo_path').eq('id',id).single());
 const coverRow=await row(initial.cover_path);
 assert.equal(coverRow.profile,'poster');assert.equal(coverRow.source_sha256,createHash('sha256').update(photo).digest('hex'));
 assert.deepEqual(coverRow.variants.map(v=>v.width),[480,960,1200]);
 assert.ok(coverRow.variants.every(v=>v.bytes<photo.length&&v.encoding==='lossy'));
 assert.deepEqual(Buffer.from(await checked(await db.storage.from('movi-partners-media').download(initial.cover_path)).arrayBuffer()),photo);checks++;
 const same=await request(endpoint,'POST',form(photo,'image/jpeg','cover',coverRequest,'poster'),cookie);
 assert.equal(same.status,200);assert.equal((await row(initial.cover_path)).request_id,coverRequest);checks++;
 const logoUpload=await request(endpoint,'POST',form(logo,'image/png','logo',randomUUID()),cookie);
 assert.equal(logoUpload.status,201,JSON.stringify(logoUpload.json));
 const afterLogo=checked(await db.from('movi_partners').select('cover_path,logo_path').eq('id',id).single());
 const logoRow=await row(afterLogo.logo_path);
 assert.equal(logoRow.profile,'logo');assert.ok(logoRow.variants.every(v=>v.encoding==='lossless'&&v.bytes<logo.length));
 assert.deepEqual(Buffer.from(await checked(await db.storage.from('movi-partners-media').download(afterLogo.logo_path)).arrayBuffer()),logo);checks++;
 assert.equal((await request(`/api/partners/${slug}`)).status,404);
 assert.ok((await anon.storage.from('movi-partners-media').download(afterLogo.logo_path)).error);
 assert.ok((await anon.storage.from('movi-partners-media').download(logoRow.variants[0].path)).error);
 assert.ok((await anon.from('movi_image_variants').select('original_path')).error);checks++;
 const adminFirst=(await request(`/api/admin/partners/${id}`,'GET',undefined,cookie)).json.data;
 const adminAgain=(await request(`/api/admin/partners/${id}`,'GET',undefined,cookie)).json.data;
 assert.equal(adminFirst.cover_url,adminAgain.cover_url);assert.equal(adminFirst.logo_srcset,adminAgain.logo_srcset);
 assert.ok(adminFirst.cover_srcset&&adminFirst.logo_srcset);checks++;
 const malformed=await request(endpoint,'POST',form(Buffer.from([137,80,78,71,1]),'image/png','cover',randomUUID()),cookie);
 assert.equal(malformed.status,400);
 assert.equal(checked(await db.from('movi_partners').select('cover_path').eq('id',id).single()).cover_path,initial.cover_path);checks++;
 const concurrentId=randomUUID();
 const concurrent=await Promise.all([request(endpoint,'POST',form(photo,'image/jpeg','cover',concurrentId,'photo'),cookie),request(endpoint,'POST',form(photo,'image/jpeg','cover',concurrentId,'photo'),cookie)]);
 assert.ok(concurrent.some(x=>x.status===201),JSON.stringify(concurrent.map(x=>x.status)));
 assert.ok(concurrent.every(x=>[200,201,409].includes(x.status)));
 const winners=checked(await db.from('movi_image_variants').select('original_path').eq('bucket_id','movi-partners-media').eq('request_id',concurrentId));
 assert.equal(winners.length,1);checks++;
 const ready=(await request(`/api/admin/partners/${id}`,'GET',undefined,cookie)).json.data;
 const activation=await request(`/api/admin/partners/${id}`,'PUT',{...ready,status:'active'},cookie);
 assert.equal(activation.status,200,JSON.stringify(activation.json));
 const publicOptimized=(await request(`/api/partners/${slug}`)).json.data;
 assert.ok(publicOptimized?.cover_srcset&&publicOptimized?.logo_srcset);
 assert.equal('cover_path' in publicOptimized,false);checks++;
 if(process.env.B4_VISUAL_HOLD==='1'){
  console.log('Synthetic LOCAL Partner ready for viewport inspection; press Enter to clean up.');
  await new Promise(resolve=>process.stdin.once('data',resolve));
 }
 const optimized=await sharp(photo).resize(160).webp({quality:20}).toBuffer();
 const zero=await request(endpoint,'POST',form(optimized,'image/webp','cover',randomUUID(),'photo'),cookie);
 assert.equal(zero.status,201,JSON.stringify(zero.json));
 const zeroPath=checked(await db.from('movi_partners').select('cover_path').eq('id',id).single()).cover_path;
 assert.deepEqual((await row(zeroPath)).variants,[]);assert.equal(zero.json.data.cover_srcset,null);
 assert.ok((await db.storage.from('movi-partners-media').download(initial.cover_path)).data);checks++;
 const publicRow=(await request(`/api/partners/${slug}`)).json.data;
 assert.ok(publicRow);assert.equal('cover_path' in publicRow,false);assert.equal(publicRow.cover_srcset,null);assert.ok(publicRow.logo_srcset);checks++;
 const logoSigned=publicRow.logo_srcset.split(', ')[0].split(' ')[0];
 assert.equal((await fetch(logoSigned)).status,200);
 assert.equal((await fetch(publicRow.cover_url)).status,200);checks++;
 const inactive=await request(`/api/admin/partners/${id}`,'PUT',{...zero.json.data,status:'inactive'},cookie);
 assert.equal(inactive.status,200);assert.equal((await request(`/api/partners/${slug}`)).status,404);checks++;
 console.log(`Partner B4 LOCAL HTTP PASS: ${checks} checks; cover_original=${photo.length} bytes; cover_variants=${coverRow.variants.map(v=>v.bytes).join('/')}; logo_original=${logo.length} bytes; logo_variants=${logoRow.variants.map(v=>v.bytes).join('/')}`);
}finally{
 if(id){
  const manifests=(await db.from('movi_image_variants').select('original_path,variants').eq('bucket_id','movi-partners-media').like('original_path',`${id}/%`)).data??[];
  const objects=[...new Set(manifests.flatMap(m=>[m.original_path,...m.variants.map(v=>v.path)]))];
  await db.from('movi_partners').delete().eq('id',id);
  if(manifests.length)await db.from('movi_image_variants').delete().eq('bucket_id','movi-partners-media').like('original_path',`${id}/%`);
  if(objects.length)await db.storage.from('movi-partners-media').remove(objects);
 }
}
