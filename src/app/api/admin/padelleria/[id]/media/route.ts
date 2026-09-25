import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CONTENT_BUCKET, imageExtension, isUuid, videoUrl } from '@/lib/padelleria';
import { editorialAdmin, editorialJson, existingContent } from '@/lib/padelleriaServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const sb=supabaseAdmin();
  const {count,error:countError}=await sb.from('padelleria_content_media').select('id',{count:'exact',head:true}).eq('content_id',id).is('deleted_at',null);
  if(countError)throw new Error('Lettura media non riuscita');
  if((count??0)>=30)throw new Error('Massimo 30 media per contenuto');
  let payload;
  let uploadedPath:string|null=null;
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
    if(Number(req.headers.get('content-length')??0)>6*1024*1024)throw new Error('Richiesta troppo grande');
    const form=await req.formData(),file=form.get('file'),role=String(form.get('role')??'gallery'),caption=String(form.get('caption')??'').trim();
    if(!(file instanceof File)||!['cover','gallery'].includes(role)||caption.length>300)throw new Error('File, ruolo o didascalia non valido');
    if(file.size>5*1024*1024)throw new Error('Immagine: massimo 5 MiB');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const ext=imageExtension(bytes,file.type),path=`${id}/${randomUUID()}.${ext}`;
    const {error}=await sb.storage.from(CONTENT_BUCKET).upload(path,bytes,{contentType:file.type,upsert:false});
    if(error)throw new Error('Upload non riuscito');
    uploadedPath=path;
    payload={content_id:id,media_type:'image',role,storage_path:path,caption,sort_order:count??0};
  }else{
    const body=await req.json();
    const caption=String(body.caption??'').trim();
    if(caption.length>300)throw new Error('Didascalia troppo lunga');
    payload={content_id:id,media_type:'video',role:'video',external_url:videoUrl(String(body.external_url??'')),caption,sort_order:count??0};
  }
  const {data,error}=await sb.from('padelleria_content_media').insert(payload).select('id').single();
  if(error){
    if(uploadedPath)await sb.storage.from(CONTENT_BUCKET).remove([uploadedPath]);
    return editorialJson({error:'Media non salvato: verifica che non esista già una copertina'},409);
  }
  return editorialJson({data},201);
});}
export async function PATCH(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const body=await req.json();
  if(!Array.isArray(body.ids)||body.ids.length>30||!body.ids.every((v:unknown)=>typeof v==='string'&&isUuid(v)))throw new Error('Ordine media non valido');
  const {error}=await supabaseAdmin().rpc('padelleria_reorder_media',{p_content_id:id,p_ids:body.ids});
  return error?editorialJson({error:'Ordine non salvato: ricarica il contenuto'},409):editorialJson({ok:true});
});}
export async function DELETE(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const body=await req.json();
  if(typeof body.media_id!=='string'||!isUuid(body.media_id)||'storage_path' in body)throw new Error('ID media richiesto; percorsi non accettati');
  const {data,error}=await supabaseAdmin().from('padelleria_content_media').update({deleted_at:new Date().toISOString()}).eq('content_id',id).eq('id',body.media_id).is('deleted_at',null).select('id').maybeSingle();
  if(error)return editorialJson({error:'Rimozione non riuscita'},500);
  return data?editorialJson({ok:true}):editorialJson({error:'Media non trovato'},404);
});}
