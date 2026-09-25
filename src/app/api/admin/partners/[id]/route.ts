import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePartner } from '@/lib/partners';
import { editorialAdmin, editorialJson } from '@/lib/padelleriaServer';
import { existingPartner, partnerDTO } from '@/lib/partnersServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){return editorialAdmin(req,async()=>{const p=await existingPartner((await ctx.params).id);return p?editorialJson({data:(await partnerDTO([p]))[0]}):editorialJson({error:'Partner non trovato'},404);});}
export async function PUT(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
 const id=(await ctx.params).id;if(!await existingPartner(id))return editorialJson({error:'Partner non trovato'},404);
 const b=await req.json(),input=parsePartner(b);if(typeof b.updated_at!=='string')throw new Error('Versione richiesta');
 const {data,error}=await supabaseAdmin().from('movi_partners').update(input).eq('id',id).eq('updated_at',b.updated_at).is('deleted_at',null).select('*').maybeSingle();
 if(error)return editorialJson({error:error.code==='23505'?'Slug già utilizzato':'Salvataggio non riuscito'},error.code==='23505'?409:500);
 return data?editorialJson({data:(await partnerDTO([data]))[0]}):editorialJson({error:'Partner aggiornato altrove: ricarica prima di salvare'},409);
});}
export async function DELETE(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
 const id=(await ctx.params).id;if(!await existingPartner(id))return editorialJson({error:'Partner non trovato'},404);
 const {error}=await supabaseAdmin().from('movi_partners').update({deleted_at:new Date().toISOString(),status:'inactive'}).eq('id',id).is('deleted_at',null);
 return error?editorialJson({error:'Eliminazione non riuscita'},500):editorialJson({ok:true});
});}
