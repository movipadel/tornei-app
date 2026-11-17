import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// This acceptance test intentionally ignores repository env files and inherited URLs.
if (process.env.PADELLERIA_LOCAL_VERIFIED !== '1') throw new Error('Verified local runner required');
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8'}));
if (status.API_URL!=='http://127.0.0.1:55421' || status.DB_URL!=='postgresql://postgres:postgres@127.0.0.1:55422/postgres' || status.linked_project)
  throw new Error('STOP: Supabase target is not exclusively local');
const base='http://127.0.0.1:3101';
const health=await fetch(`${status.API_URL}/auth/v1/health`);
if (!health.ok) throw new Error('Local Supabase health check failed');
const db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false}});
const staffId=randomUUID(),contentId=randomUUID();
const email=`padelleria-a2-${staffId}@example.invalid`;
const password='Padelleria-A2-Local-2026!';
const originals=[],variants=[];
let checks=0;
const check=({error})=>{assert.ifError(error);checks++};
const request=async(path,body,cookie)=>{
  const response=await fetch(base+path,{method:'POST',headers:cookie?{Cookie:cookie}:{},body});
  return {status:response.status,json:await response.json()};
};
const upload=(file,type,role,requestId,replaceId)=>{
  const form=new FormData();
  form.set('file',new Blob([file],{type}),`fixture.${type.split('/')[1]}`);
  form.set('role',role);form.set('request_id',requestId);
  if(replaceId)form.set('replace_media_id',replaceId);
  return form;
};
const path=`/api/admin/padelleria/${contentId}/media`;
try{
  check(await db.from('staff_users').insert({id:staffId,email,full_name:'A2 Admin sintetico',role:'admin',is_active:true}));
  check(await db.rpc('set_staff_password',{p_staff_id:staffId,p_password:password}));
  check(await db.from('padelleria_contents').insert({id:contentId,kind:'succede',status:'draft',title:'A2 varianti private sintetiche'}));
  const loginForm=new FormData();loginForm.set('email',email);loginForm.set('password',password);
  const login=await fetch(`${base}/api/admin/login`,{method:'POST',body:loginForm});
  assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  assert.ok(cookie);checks++;
  assert.equal((await request(path,upload(readFileSync('public/home/padel-court.jpg'),'image/jpeg','gallery',randomUUID()),'')).status,401);checks++;

  const jpeg=readFileSync('public/home/padel-court.jpg');
  const galleryId=randomUUID();
  const first=await request(path,upload(jpeg,'image/jpeg','gallery',galleryId),cookie);
  assert.equal(first.status,201);checks++;
  const firstRow=await db.from('padelleria_content_media').select('id,storage_path,variants,source_width,source_bytes').eq('id',first.json.data.id).single();
  check(firstRow);
  assert.equal(firstRow.data.source_bytes,jpeg.length);
  assert.deepEqual(firstRow.data.variants.map(v=>v.width),[480,720]);checks++;
  const original=await db.storage.from('padelleria-content-media').download(firstRow.data.storage_path);
  check(original);
  assert.deepEqual(Buffer.from(await original.data.arrayBuffer()),jpeg);checks++;
  const variantPath=firstRow.data.variants[0].path;
  assert.ok((await anon.storage.from('padelleria-media-variants').download(variantPath)).error);
  assert.ok((await anon.storage.from('padelleria-media-variants').upload(`${contentId}/unauthorized.webp`,new Uint8Array([1]))).error);checks++;
  const variant=await db.storage.from('padelleria-media-variants').download(variantPath);
  check(variant);
  const variantBytes=Buffer.from(await variant.data.arrayBuffer());
  const variantMeta=await sharp(variantBytes).metadata();
  assert.equal(variantBytes.length,firstRow.data.variants[0].bytes);
  assert.equal(variantMeta.format,'webp');
  assert.equal(variantMeta.width,firstRow.data.variants[0].width);
  assert.equal(variantMeta.height,firstRow.data.variants[0].height);
  assert.equal(variantMeta.exif,undefined);checks++;

  const retry=await request(path,upload(jpeg,'image/jpeg','gallery',galleryId),cookie);
  assert.equal(retry.status,200);assert.equal(retry.json.data.id,first.json.data.id);checks++;
  const sameId=randomUUID();
  const [concurrentA,concurrentB]=await Promise.all([
    request(path,upload(jpeg,'image/jpeg','gallery',sameId),cookie),
    request(path,upload(jpeg,'image/jpeg','gallery',sameId),cookie),
  ]);
  assert.deepEqual([concurrentA.status,concurrentB.status].sort(),[200,201]);
  assert.equal(concurrentA.json.data.id,concurrentB.json.data.id);checks++;

  const coverRequest=randomUUID();
  const cover=await request(path,upload(jpeg,'image/jpeg','cover',coverRequest),cookie);
  assert.equal(cover.status,201);checks++;
  const corrupt=await request(path,upload(Buffer.from([137,80,78,71,13,10,26,10,1]),'image/png','cover',randomUUID(),cover.json.data.id),cookie);
  assert.equal(corrupt.status,400);checks++;
  const before=await db.from('padelleria_content_media').select('id').eq('content_id',contentId).eq('role','cover').is('deleted_at',null);
  check(before);assert.equal(before.data.length,1);assert.equal(before.data[0].id,cover.json.data.id);checks++;
  const replacement=await request(path,upload(readFileSync('public/branding/movi-padelleria.png'),'image/png','cover',randomUUID(),cover.json.data.id),cookie);
  assert.equal(replacement.status,201);checks++;
  const after=await db.from('padelleria_content_media').select('id,deleted_at,variants').eq('content_id',contentId).eq('role','cover');
  check(after);
  assert.equal(after.data.filter(row=>row.deleted_at===null).length,1);
  assert.equal(after.data.find(row=>row.deleted_at===null).id,replacement.json.data.id);
  assert.ok(after.data.find(row=>row.id===cover.json.data.id).deleted_at);checks++;
  const count=await db.from('padelleria_content_media').select('id',{count:'exact',head:true}).eq('content_id',contentId);
  check(count);assert.equal(count.count,4);checks++;

  const publicPath=`/api/padelleria/${contentId}`;
  assert.equal((await fetch(base+publicPath)).status,404);checks++;
  const legacyId=randomUUID(),legacyPath=`${contentId}/${legacyId}.jpg`;
  check(await db.storage.from('padelleria-content-media').upload(legacyPath,jpeg,{contentType:'image/jpeg',upsert:false}));
  check(await db.from('padelleria_content_media').insert({id:legacyId,content_id:contentId,media_type:'image',role:'gallery',storage_path:legacyPath,sort_order:5}));
  check(await db.from('padelleria_contents').update({status:'published',published_at:new Date().toISOString()}).eq('id',contentId));
  const readPublic=async()=>{
    const response=await fetch(`${base}/api/padelleria?kind=succede&limit=6`,{cache:'no-store'});
    assert.equal(response.status,200);
    const payload=await response.json();
    return payload.data.find(item=>item.id===contentId);
  };
  const listing=await readPublic();
  assert.ok(listing);
  const listedCover=listing.media.find(media=>media.role==='cover');
  assert.ok(listedCover.url);
  assert.deepEqual(listedCover.srcSet.split(', ').map(part=>Number(part.match(/ (\d+)w$/)?.[1])),[480,960,1600]);
  assert.equal('variants' in listedCover,false);checks++;
  // A new signing call would produce a different expiry after this boundary.
  await new Promise(resolve=>setTimeout(resolve,1200));
  const repeat=await readPublic();
  assert.equal(repeat.media[0].url,listing.media[0].url);
  assert.equal(repeat.media[0].srcSet,listing.media[0].srcSet);checks++;
  const detailResponse=await fetch(base+publicPath);
  assert.equal(detailResponse.status,200);
  const detail=(await detailResponse.json()).data;
  const detailCover=detail.media.find(media=>media.id===listedCover.id);
  assert.equal(detailCover.url,listedCover.url);
  assert.equal(detailCover.srcSet,listedCover.srcSet);
  assert.equal(detail.media.find(media=>media.id===legacyId).srcSet,null);checks++;
  const fullCover=await db.from('padelleria_content_media').select('source_width,variants').eq('id',replacement.json.data.id).single();
  check(fullCover);
  check(await db.from('padelleria_content_media').update({variants:[fullCover.data.variants[0]]}).eq('id',replacement.json.data.id));
  const partialListing=await readPublic();
  const partial=partialListing.media.find(media=>media.id===replacement.json.data.id);
  assert.deepEqual(partial.srcSet.split(', ').map(part=>Number(part.match(/ (\d+)w$/)?.[1])),[480,fullCover.data.source_width]);
  assert.ok(partial.srcSet.includes(partial.url));checks++;
  check(await db.from('padelleria_content_media').update({variants:fullCover.data.variants}).eq('id',replacement.json.data.id));
  const optimizedUrl=listedCover.srcSet.split(', ')[0].replace(/ 480w$/,'');
  const optimizedResponse=await fetch(optimizedUrl);
  assert.equal(optimizedResponse.status,200);
  const optimizedBytes=(await optimizedResponse.arrayBuffer()).byteLength;
  const originalResponse=await fetch(listedCover.url);
  assert.equal(originalResponse.status,200);
  const originalBytes=(await originalResponse.arrayBuffer()).byteLength;
  assert.equal(optimizedBytes,after.data.find(row=>row.id===replacement.json.data.id).variants[0].bytes);
  assert.equal(originalBytes,readFileSync('public/branding/movi-padelleria.png').length);
  assert.ok(optimizedBytes<originalBytes);checks++;
  console.log(`A3 local transfer: original=${originalBytes} bytes, 480px=${optimizedBytes} bytes, optimized_fetches=1, signed_urls_reused=true, cache_control=${optimizedResponse.headers.get('cache-control')??'absent'}`);
  const alreadyOptimized=await sharp(jpeg).resize(160).webp({quality:20}).toBuffer();
  const zeroRequest=randomUUID();
  const [zeroA,zeroB]=await Promise.all([
    request(path,upload(alreadyOptimized,'image/webp','cover',zeroRequest,replacement.json.data.id),cookie),
    request(path,upload(alreadyOptimized,'image/webp','cover',zeroRequest,replacement.json.data.id),cookie),
  ]);
  assert.deepEqual([zeroA.status,zeroB.status].sort(),[200,201]);
  assert.equal(zeroA.json.data.id,zeroB.json.data.id);checks++;
  const zeroId=zeroA.json.data.id;
  const zeroRow=await db.from('padelleria_content_media').select('id,storage_path,variants,deleted_at').eq('id',zeroId).single();
  check(zeroRow);assert.deepEqual(zeroRow.data.variants,[]);assert.equal(zeroRow.data.deleted_at,null);checks++;
  const zeroOriginal=await db.storage.from('padelleria-content-media').download(zeroRow.data.storage_path);
  check(zeroOriginal);assert.deepEqual(Buffer.from(await zeroOriginal.data.arrayBuffer()),alreadyOptimized);checks++;
  const zeroVariants=await db.storage.from('padelleria-media-variants').list(`${contentId}/${zeroId}`);
  check(zeroVariants);assert.equal(zeroVariants.data.length,0);checks++;
  const activeCovers=await db.from('padelleria_content_media').select('id').eq('content_id',contentId).eq('role','cover').is('deleted_at',null);
  check(activeCovers);assert.deepEqual(activeCovers.data.map(row=>row.id),[zeroId]);checks++;
  const zeroListing=await readPublic();
  const zeroCover=zeroListing.media.find(media=>media.role==='cover');
  assert.equal(zeroCover.id,zeroId);assert.equal(zeroCover.srcSet,null);assert.ok(zeroCover.url);checks++;
  const zeroDetail=(await (await fetch(base+publicPath)).json()).data;
  assert.equal(zeroDetail.media.find(media=>media.role==='cover').srcSet,null);checks++;
  const zeroFetched=await fetch(zeroCover.url);
  assert.equal(zeroFetched.status,200);
  assert.equal((await zeroFetched.arrayBuffer()).byteLength,alreadyOptimized.length);checks++;
  const zeroRetry=await request(path,upload(alreadyOptimized,'image/webp','cover',zeroRequest,replacement.json.data.id),cookie);
  assert.equal(zeroRetry.status,200);assert.equal(zeroRetry.json.data.id,zeroId);checks++;
  check(await db.from('padelleria_contents').update({deleted_at:new Date().toISOString()}).eq('id',contentId));
  assert.equal((await fetch(base+publicPath)).status,404);
  assert.equal(await readPublic(),undefined);checks++;
  console.log(`Padelleria private variants local HTTP PASS: ${checks} checks; private access, responsive URLs, cache reuse, legacy fallback and publication guards`);
}finally{
  const media=await db.from('padelleria_content_media').select('storage_path,variants').eq('content_id',contentId);
  if(media.error)throw media.error;
  for(const item of media.data){
    if(item.storage_path)originals.push(item.storage_path);
    for(const variant of item.variants??[])variants.push(variant.path);
  }
  // Concurrent losing uploads and interrupted assertions may leave paths outside the manifest.
  // This synthetic content ID is unique to this run, so remove every object below its prefix.
  const storedOriginals=await db.storage.from('padelleria-content-media').list(contentId,{limit:100});
  check(storedOriginals);
  for(const item of storedOriginals.data)if(item.id)originals.push(`${contentId}/${item.name}`);
  const storedFolders=await db.storage.from('padelleria-media-variants').list(contentId,{limit:100});
  check(storedFolders);
  for(const folder of storedFolders.data){
    const storedVariants=await db.storage.from('padelleria-media-variants').list(`${contentId}/${folder.name}`,{limit:100});
    check(storedVariants);
    for(const item of storedVariants.data)if(item.id)variants.push(`${contentId}/${folder.name}/${item.name}`);
  }
  if(variants.length)check(await db.storage.from('padelleria-media-variants').remove([...new Set(variants)]));
  if(originals.length)check(await db.storage.from('padelleria-content-media').remove([...new Set(originals)]));
  check(await db.from('padelleria_content_media').delete().eq('content_id',contentId));
  check(await db.from('padelleria_contents').delete().eq('id',contentId));
  check(await db.from('staff_users').delete().eq('id',staffId));
}
