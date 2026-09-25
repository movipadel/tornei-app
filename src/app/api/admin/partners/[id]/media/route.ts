import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { imageExtension } from '@/lib/padelleria';
import { PARTNER_BUCKET } from '@/lib/partners';
import { editorialAdmin, editorialJson } from '@/lib/padelleriaServer';
import { existingPartner, partnerDTO } from '@/lib/partnersServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
 const id=(await ctx.params).id,p=await existingPartner(id);if(!p)return editorialJson({error:'Partner non trovato'},404);
 if(Number(req.headers.get('content-length')??0)>6*1024*1024)throw new Error('Richiesta troppo grande');
 const f=await req.formData(),file=f.get('file'),role=f.get('role');
 if(!(file instanceof File)||!['logo','cover'].includes(String(role)))throw new Error('File o ruolo non valido');
 if(file.size>5*1024*1024)throw new Error('Immagine: massimo 5 MiB');
 const bytes=new Uint8Array(await file.arrayBuffer()),ext=imageExtension(bytes,file.type),path=`${id}/${randomUUID()}.${ext}`,sb=supabaseAdmin();
 const uploaded=await sb.storage.from(PARTNER_BUCKET).upload(path,bytes,{contentType:file.type,upsert:false});if(uploaded.error)throw new Error('Upload non riuscito');
 const {data,error}=await sb.from('movi_partners').update({[`${role}_path`]:path}).eq('id',id).eq('updated_at',p.updated_at).is('deleted_at',null).select('*').maybeSingle();
 if(error||!data){await sb.storage.from(PARTNER_BUCKET).remove([path]);return editorialJson({error:'Partner modificato altrove: ricarica e riprova'},409);}
 return editorialJson({data:(await partnerDTO([data]))[0]},201);
});}
export async function DELETE(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
 const id=(await ctx.params).id,p=await existingPartner(id);if(!p)return editorialJson({error:'Partner non trovato'},404);
 const b=await req.json();if(!['logo','cover'].includes(b.role)||Object.keys(b).some(k=>k!=='role'))throw new Error('Indica soltanto logo o cover; percorsi non accettati');
 const {data,error}=await supabaseAdmin().from('movi_partners').update({[`${b.role}_path`]:null}).eq('id',id).eq('updated_at',p.updated_at).is('deleted_at',null).select('*').maybeSingle();
 return error||!data?editorialJson({error:'Partner modificato altrove: ricarica'},409):editorialJson({data:(await partnerDTO([data]))[0]});
});}
