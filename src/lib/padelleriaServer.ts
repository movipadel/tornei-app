import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { guardOperatorPermission } from '@/lib/operatorAuthorization';
import type { OperatorPermissionKey } from '@/lib/operatorPermissions';
import { CONTENT_BUCKET, isUuid, ownedPath, type ContentMedia, type PublicContentDetail } from '@/lib/padelleria';

export function editorialJson(body:unknown,status=200) { return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}}); }
export async function editorialOperator(req:Request, permission:OperatorPermissionKey, action:()=>Promise<Response>) {
  const denied=await guardOperatorPermission(permission); if(denied)return denied;
  // Same-origin mutation protection, in addition to HttpOnly SameSite session.
  const origin=req.headers.get('origin');
  if(req.method!=='GET' && origin && origin!==new URL(req.url).origin) return editorialJson({error:'Origine non consentita'},403);
  try { return await action(); } catch(e) { return editorialJson({error:e instanceof Error?e.message:'Operazione non riuscita'},400); }
}
export function contentId(id:string) { if(!isUuid(id))throw new Error('ID contenuto non valido'); return id; }
function publicReadClient() {
  const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Configurazione lettura pubblica non disponibile');
  return createClient(url,key,{auth:{persistSession:false}});
}
export async function existingContent(id:string) {
  contentId(id);
  const {data,error}=await supabaseAdmin().from('padelleria_contents').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
  if(error)throw new Error('Lettura contenuto non riuscita');
  return data;
}
export async function withMedia<T extends {id:string}>(rows:T[],options?:{tolerateErrors?:boolean;coverOnly?:boolean}):Promise<Array<T & {media:ContentMedia[]}>> {
  if(!rows.length)return [];
  const sb=supabaseAdmin();
  let mediaQuery=sb.from('padelleria_content_media').select('id,content_id,media_type,role,storage_path,external_url,caption,sort_order').in('content_id',rows.map(r=>r.id)).is('deleted_at',null);
  if(options?.coverOnly)mediaQuery=mediaQuery.eq('role','cover');
  const {data,error}=await mediaQuery.order('sort_order').order('id');
  if(error){if(options?.tolerateErrors)return rows.map(r=>({...r,media:[]}));throw new Error('Lettura media non riuscita');}
  const paths=(data??[]).flatMap(m=>m.storage_path && ownedPath(m.content_id,m.storage_path)?[m.storage_path as string]:[]);
  const urls=new Map<string,string>();
  if(paths.length){
    const signed=await sb.storage.from(CONTENT_BUCKET).createSignedUrls(paths,300);
    if(signed.error&&!options?.tolerateErrors)throw new Error('Anteprima media non disponibile');
    for(const item of signed.data??[])if(item.path&&item.signedUrl)urls.set(item.path,item.signedUrl);
  }
  const grouped=new Map<string,ContentMedia[]>();
  for(const m of data??[]){
    const list=grouped.get(m.content_id)??[];
    list.push({id:m.id,content_id:m.content_id,media_type:m.media_type,role:m.role,caption:m.caption,sort_order:m.sort_order,external_url:m.external_url,url:m.storage_path?urls.get(m.storage_path)??null:null});
    grouped.set(m.content_id,list);
  }
  return rows.map(r=>({...r,media:grouped.get(r.id)??[]}));
}

export async function publicContentDetail(id:string):Promise<PublicContentDetail|null> {
  if(!isUuid(id))return null;
  // The anon read intentionally relies on padelleria_public_read, whose
  // padelleria_is_public() predicate uses the database clock.
  const {data,error}=await publicReadClient().from('padelleria_contents')
    .select('id,kind,title,excerpt,body,cta_label,cta_url,occurred_at,published_at')
    .eq('id',id).maybeSingle();
  if(error)throw new Error('Lettura contenuto non riuscita');
  if(!data)return null;
  const [item]=await withMedia([data],{tolerateErrors:true});
  return {id:item.id,kind:item.kind,title:item.title,excerpt:item.excerpt,body:item.body,occurred_at:item.occurred_at,published_at:item.published_at,cta_label:item.cta_label,cta_url:item.cta_url,media:item.media};
}
