import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/padelleria';
import { editorialOperator, editorialJson } from '@/lib/padelleriaServer';
import { existingPartner, partnerDTO } from '@/lib/partnersServer';
import { uploadPartnerImage } from '@/lib/partnerImageUpload';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){return editorialOperator(req,'partners.manage',async()=>{
 const id=(await ctx.params).id,p=await existingPartner(id);if(!p)return editorialJson({error:'Partner non trovato'},404);
 if(Number(req.headers.get('content-length')??0)>6*1024*1024)throw new Error('Richiesta troppo grande');
 const f=await req.formData(),file=f.get('file'),role=f.get('role');
 if(!(file instanceof File)||!['logo','cover'].includes(String(role)))throw new Error('File o ruolo non valido');
 if(file.size>5*1024*1024)throw new Error('Immagine: massimo 5 MiB');
 const requestId=f.has('request_id')?String(f.get('request_id')):randomUUID();
 if(!isUuid(requestId))throw new Error('ID upload non valido');
 const coverProfile=String(f.get('image_profile')??'poster');
 if(role==='cover'&&!['photo','poster'].includes(coverProfile))throw new Error('Profilo copertina non valido');
 try {
  const result=await uploadPartnerImage({partnerId:id,expectedUpdatedAt:p.updated_at,role:role as 'logo'|'cover',coverProfile:coverProfile as 'photo'|'poster',requestId,file,signal:req.signal});
  const saved=await existingPartner(id);
  if(!saved)throw new Error('Partner non trovato dopo upload');
  return editorialJson({data:(await partnerDTO([saved]))[0]},result.created?201:200);
 } catch(error) {
  const message=error instanceof Error?error.message:'Upload non riuscito';
  if(message.includes('concorrente')||message.includes('modificato altrove')||message.includes('ID upload già utilizzato'))
   return editorialJson({error:message},409);
  throw error;
 }
});}
export async function DELETE(req:Request,ctx:Context){return editorialOperator(req,'partners.manage',async()=>{
 const id=(await ctx.params).id,p=await existingPartner(id);if(!p)return editorialJson({error:'Partner non trovato'},404);
 const b=await req.json();if(!['logo','cover'].includes(b.role)||Object.keys(b).some(k=>k!=='role'))throw new Error('Indica soltanto logo o cover; percorsi non accettati');
 const {data,error}=await supabaseAdmin().from('movi_partners').update({[`${b.role}_path`]:null}).eq('id',id).eq('updated_at',p.updated_at).is('deleted_at',null).select('*').maybeSingle();
 return error||!data?editorialJson({error:'Partner modificato altrove: ricarica'},409):editorialJson({data:(await partnerDTO([data]))[0]});
});}
