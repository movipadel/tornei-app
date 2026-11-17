import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CONTENT_BUCKET, PRIVATE_VARIANT_BUCKET, isUuid, videoUrl } from '@/lib/padelleria';
import { imageProfileForPadelleriaRole, processPadelleriaImage } from '@/lib/padelleriaImageVariants';
import { storeAndRegisterPrivateImage } from '@/lib/padelleriaPrivateImageUpload';
import { editorialOperator, editorialJson, existingContent } from '@/lib/padelleriaServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){return editorialOperator(req,'padelleria.manage',async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const sb=supabaseAdmin();
  if(req.headers.get('content-type')?.includes('multipart/form-data')){
    if(Number(req.headers.get('content-length')??0)>6*1024*1024)throw new Error('Richiesta troppo grande');
    const form=await req.formData(),file=form.get('file'),role=String(form.get('role')??'gallery'),caption=String(form.get('caption')??'').trim();
    const requestId=String(form.get('request_id')??randomUUID());
    const replaceMediaId=String(form.get('replace_media_id')??'');
    if(!(file instanceof File)||!['cover','gallery'].includes(role)||caption.length>300)throw new Error('File, ruolo o didascalia non valido');
    if(!isUuid(requestId)||(replaceMediaId&&!isUuid(replaceMediaId)))throw new Error('ID upload non valido');
    if(file.size>5*1024*1024)throw new Error('Immagine: massimo 5 MiB');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const processed=await processPadelleriaImage(bytes,file.type,{profile:imageProfileForPadelleriaRole(role),signal:req.signal});
    const previous=await sb.from('padelleria_content_media')
      .select('id,content_id,role,source_sha256').eq('upload_request_id',requestId).maybeSingle();
    if(previous.error)throw new Error('Verifica upload non riuscita');
    if(previous.data){
      if(previous.data.content_id!==id||previous.data.role!==role||previous.data.source_sha256!==processed.sha256)
        return editorialJson({error:'ID upload già utilizzato per un altro file'},409);
      return editorialJson({data:{id:previous.data.id}},200);
    }

    const {count,error:countError}=await sb.from('padelleria_content_media')
      .select('id',{count:'exact',head:true}).eq('content_id',id).is('deleted_at',null);
    if(countError)throw new Error('Lettura media non riuscita');
    if((count??0)>=30&&!replaceMediaId)throw new Error('Massimo 30 media per contenuto');
    const mediaId=randomUUID(),originalPath=`${id}/${mediaId}.${processed.extension}`;
    const variants=processed.variants.map(v=>({
      width:v.width,height:v.height,bytes:v.bytes,format:v.format,encoding:v.encoding,
      path:`${id}/${mediaId}/w${v.width}.webp`,
    }));
    try{
      const result=await storeAndRegisterPrivateImage({
        storage:{
          uploadOriginal:(path,content,mime)=>sb.storage.from(CONTENT_BUCKET).upload(path,content,{contentType:mime,upsert:false}),
          uploadVariant:(path,content)=>sb.storage.from(PRIVATE_VARIANT_BUCKET).upload(path,content,{contentType:'image/webp',cacheControl:'300',upsert:false}),
          removeOriginal:paths=>sb.storage.from(CONTENT_BUCKET).remove(paths),
          removeVariants:paths=>sb.storage.from(PRIVATE_VARIANT_BUCKET).remove(paths),
        },
        originalPath,originalBytes:bytes,originalMime:file.type,
        variants:variants.map((v,i)=>({path:v.path,bytes:processed.variants[i].buffer})),mediaId,signal:req.signal,
        register:async()=>{
          const registered=await sb.rpc('padelleria_register_processed_image',{
            p_content_id:id,p_media_id:mediaId,p_request_id:requestId,p_role:role,
            p_original_path:originalPath,p_caption:caption,p_sort_order:count??0,
            p_source_sha256:processed.sha256,p_source_width:processed.sourceWidth,
            p_source_height:processed.sourceHeight,p_source_bytes:processed.sourceBytes,
            p_variants:variants,p_replace_media_id:replaceMediaId||null,
          });
          if(registered.error||!registered.data)throw new Error('Registrazione media non riuscita');
          return registered.data;
        },
      });
      if(!result.cleanupComplete)console.error('Padelleria private image cleanup incomplete',mediaId);
      return editorialJson({data:{id:result.id}},result.created?201:200);
    }catch(error){
      return editorialJson({error:error instanceof Error?error.message:'Upload non riuscito'},409);
    }
  }
  const {count,error:countError}=await sb.from('padelleria_content_media').select('id',{count:'exact',head:true}).eq('content_id',id).is('deleted_at',null);
  if(countError)throw new Error('Lettura media non riuscita');
  if((count??0)>=30)throw new Error('Massimo 30 media per contenuto');
  const body=await req.json();
  const caption=String(body.caption??'').trim();
  if(caption.length>300)throw new Error('Didascalia troppo lunga');
  const payload={content_id:id,media_type:'video',role:'video',external_url:videoUrl(String(body.external_url??'')),caption,sort_order:count??0};
  const {data,error}=await sb.from('padelleria_content_media').insert(payload).select('id').single();
  if(error)return editorialJson({error:'Media non salvato'},409);
  return editorialJson({data},201);
});}
export async function PATCH(req:Request,ctx:Context){return editorialOperator(req,'padelleria.manage',async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const body=await req.json();
  if(!Array.isArray(body.ids)||body.ids.length>30||!body.ids.every((v:unknown)=>typeof v==='string'&&isUuid(v)))throw new Error('Ordine media non valido');
  const {error}=await supabaseAdmin().rpc('padelleria_reorder_media',{p_content_id:id,p_ids:body.ids});
  return error?editorialJson({error:'Ordine non salvato: ricarica il contenuto'},409):editorialJson({ok:true});
});}
export async function DELETE(req:Request,ctx:Context){return editorialOperator(req,'padelleria.manage',async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const body=await req.json();
  if(typeof body.media_id!=='string'||!isUuid(body.media_id)||'storage_path' in body)throw new Error('ID media richiesto; percorsi non accettati');
  const {data,error}=await supabaseAdmin().from('padelleria_content_media').update({deleted_at:new Date().toISOString()}).eq('content_id',id).eq('id',body.media_id).is('deleted_at',null).select('id').maybeSingle();
  if(error)return editorialJson({error:'Rimozione non riuscita'},500);
  return data?editorialJson({ok:true}):editorialJson({error:'Media non trovato'},404);
});}
