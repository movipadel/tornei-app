import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if(process.env.PADELLERIA_LOCAL_VERIFIED!=="1"||process.env.SUPABASE_URL!=="http://127.0.0.1:55421")throw new Error("Verified local runner required");
const base=process.env.PADELLERIA_TEST_BASE_URL||"http://127.0.0.1:3101";
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ids=Array.from({length:8},()=>randomUUID());
const [visibleId,archiveId,draftId,deletedId,expiredId,ephemeralExpiredId,internalCtaId,externalCtaId]=ids;
const galleryId=randomUUID(),coverId=randomUUID(),videoId=randomUUID();
const paths=[`${visibleId}/${coverId}.jpg`,`${visibleId}/${galleryId}.jpg`];
const now=Date.now();
const common={excerpt:"Dettaglio locale",body:"Prima riga\n\nSeconda riga",featured:false,delete_on_expiry:false,sort_order:0,occurred_at:null,visible_from:null,visible_until:null,deleted_at:null};
const check=({error})=>assert.ifError(error);

async function get(path){const response=await fetch(base+path,{cache:"no-store"});return {response,json:await response.json().catch(()=>({}))};}

try{
  check(await db.from("padelleria_contents").insert([
    {...common,id:visibleId,kind:"succede",status:"published",title:"Detail visible local",visible_from:new Date(now-3600000).toISOString(),visible_until:new Date(now+3600000).toISOString(),cta_label:null,cta_url:null},
    {...common,id:archiveId,kind:"e_successo",status:"published",title:"Detail archive local",cta_label:null,cta_url:null},
    {...common,id:draftId,kind:"succede",status:"draft",title:"Detail draft local",cta_label:null,cta_url:null},
    {...common,id:deletedId,kind:"succede",status:"published",title:"Detail deleted local",cta_label:null,cta_url:null,deleted_at:new Date().toISOString()},
    {...common,id:expiredId,kind:"succede",status:"published",title:"Detail expired local",visible_until:new Date(now-1000).toISOString(),cta_label:null,cta_url:null},
    {...common,id:ephemeralExpiredId,kind:"succede",status:"published",title:"Detail ephemeral expired local",delete_on_expiry:true,visible_until:new Date(now-1000).toISOString(),cta_label:null,cta_url:null},
    {...common,id:internalCtaId,kind:"e_successo",status:"published",title:"Detail internal CTA local",cta_label:"Vai ai tornei",cta_url:"/tornei"},
    {...common,id:externalCtaId,kind:"e_successo",status:"published",title:"Detail external CTA local",cta_label:"Sito MOVI",cta_url:"https://www.movipadel.it"},
  ]));
  const bytes=readFileSync("public/home/tournaments.jpg");
  for(const path of paths)check(await db.storage.from("padelleria-content-media").upload(path,bytes,{contentType:"image/jpeg",upsert:false}));
  check(await db.from("padelleria_content_media").insert([
    {id:coverId,content_id:visibleId,media_type:"image",role:"cover",storage_path:paths[0],caption:"Cover locale",sort_order:0},
    {id:galleryId,content_id:visibleId,media_type:"image",role:"gallery",storage_path:paths[1],caption:"Gallery locale",sort_order:1},
    {id:videoId,content_id:visibleId,media_type:"video",role:"video",external_url:"https://vimeo.com/76979871",caption:"Video locale",sort_order:2},
  ]));

  const visible=await get(`/api/padelleria/${visibleId}`);
  assert.equal(visible.response.status,200);assert.match(visible.response.headers.get("cache-control")??"",/no-store/);
  assert.equal(visible.json.data.id,visibleId);assert.equal(visible.json.data.media.length,3);
  assert.ok(visible.json.data.media.filter(item=>item.url).every(item=>item.url.includes("token=")));
  for(const field of ["status","featured","sort_order","visible_from","visible_until","deleted_at","delete_on_expiry"])assert.ok(!(field in visible.json.data),`public detail leaked ${field}`);
  assert.equal((await get(`/api/padelleria/${archiveId}`)).response.status,200);
  assert.equal((await get(`/api/padelleria/${expiredId}`)).response.status,200);
  for(const id of [draftId,deletedId,ephemeralExpiredId])assert.equal((await get(`/api/padelleria/${id}`)).response.status,404);
  assert.equal((await get("/api/padelleria/not-a-uuid")).response.status,404);
  assert.equal((await get(`/api/padelleria/${internalCtaId}`)).json.data.cta_url,"/tornei");
  assert.equal((await get(`/api/padelleria/${externalCtaId}`)).json.data.cta_url,"https://www.movipadel.it");
  assert.equal((await fetch(`${base}/padelleria/${visibleId}`,{cache:"no-store"})).status,200);
  assert.equal((await fetch(`${base}/padelleria/${archiveId}`,{cache:"no-store"})).status,200);
  assert.equal((await fetch(`${base}/padelleria/${draftId}`,{cache:"no-store"})).status,404);
  console.log("Padelleria detail HTTP PASS: visibility, minimal DTO, signed media, CTA and direct routes verified.");
}finally{
  await db.storage.from("padelleria-content-media").remove(paths);
  await db.from("padelleria_content_media").delete().in("content_id",ids);
  await db.from("padelleria_contents").delete().in("id",ids);
}
