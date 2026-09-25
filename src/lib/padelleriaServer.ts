import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { guardAdmin } from '@/lib/adminGuard';
import { CONTENT_BUCKET, isUuid, ownedPath, type ContentItem, type ContentMedia } from '@/lib/padelleria';

export function editorialJson(body:unknown,status=200) { return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}}); }
export async function editorialAdmin(req:Request, action:()=>Promise<Response>) {
  const denied=await guardAdmin(); if(denied)return denied;
  // Same-origin mutation protection, in addition to HttpOnly SameSite session.
  const origin=req.headers.get('origin');
  if(req.method!=='GET' && origin && origin!==new URL(req.url).origin) return editorialJson({error:'Origine non consentita'},403);
  try { return await action(); } catch(e) { return editorialJson({error:e instanceof Error?e.message:'Operazione non riuscita'},400); }
}
export function contentId(id:string) { if(!isUuid(id))throw new Error('ID contenuto non valido'); return id; }
export async function existingContent(id:string) {
  contentId(id);
  const {data,error}=await supabaseAdmin().from('padelleria_contents').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
  if(error)throw new Error('Lettura contenuto non riuscita');
  return data;
}
export async function withMedia(rows:Omit<ContentItem,'media'>[]):Promise<ContentItem[]> {
  if(!rows.length)return [];
  const sb=supabaseAdmin();
  const {data,error}=await sb.from('padelleria_content_media').select('id,content_id,media_type,role,storage_path,external_url,caption,sort_order').in('content_id',rows.map(r=>r.id)).is('deleted_at',null).order('sort_order').order('id');
  if(error)throw new Error('Lettura media non riuscita');
  const paths=(data??[]).flatMap(m=>m.storage_path && ownedPath(m.content_id,m.storage_path)?[m.storage_path as string]:[]);
  const urls=new Map<string,string>();
  if(paths.length){
    const signed=await sb.storage.from(CONTENT_BUCKET).createSignedUrls(paths,300);
    if(signed.error)throw new Error('Anteprima media non disponibile');
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
