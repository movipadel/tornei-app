import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePartner } from '@/lib/partners';
import { editorialOperator, editorialJson } from '@/lib/padelleriaServer';
import { existingPartner, partnerDTO } from '@/lib/partnersServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){return editorialOperator(req,'partners.manage',async()=>{const p=await existingPartner((await ctx.params).id);return p?editorialJson({data:(await partnerDTO([p]))[0]}):editorialJson({error:'Partner non trovato'},404);});}
export async function PUT(req:Request,ctx:Context){return editorialOperator(req,'partners.manage',async()=>{
 const id=(await ctx.params).id;if(!await existingPartner(id))return editorialJson({error:'Partner non trovato'},404);
 const b=await req.json(),{locations,...input}=parsePartner(b);if(typeof b.updated_at!=='string')throw new Error('Versione richiesta');
 const {data,error}=await supabaseAdmin().rpc('movi_partner_save',{p_id:id,p_expected_updated_at:b.updated_at,p_partner:input,p_locations:locations});
 if(error)return editorialJson({error:error.code==='23505'?'Slug già utilizzato':error.code==='40001'?'Partner aggiornato altrove: ricarica prima di salvare':'Salvataggio non riuscito'},['23505','40001'].includes(error.code)?409:500);
 const saved=await existingPartner(data);return saved?editorialJson({data:(await partnerDTO([saved]))[0]}):editorialJson({error:'Partner non trovato'},404);
});}
export async function DELETE(req:Request,ctx:Context){return editorialOperator(req,'partners.manage',async()=>{
 const id=(await ctx.params).id;if(!await existingPartner(id))return editorialJson({error:'Partner non trovato'},404);
 const {error}=await supabaseAdmin().from('movi_partners').update({deleted_at:new Date().toISOString(),status:'inactive'}).eq('id',id).is('deleted_at',null);
 return error?editorialJson({error:'Eliminazione non riuscita'},500):editorialJson({ok:true});
});}
