import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseContent } from '@/lib/padelleria';
import { editorialAdmin, editorialJson, existingContent, withMedia } from '@/lib/padelleriaServer';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const row=await existingContent((await ctx.params).id);
  return row?editorialJson({data:(await withMedia([row]))[0]}):editorialJson({error:'Contenuto non trovato'},404);
});}
export async function PUT(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  const body=await req.json(),input=parseContent(body);
  if(typeof body.updated_at!=='string')throw new Error('Versione contenuto richiesta');
  const {data,error}=await supabaseAdmin().from('padelleria_contents').update(input).eq('id',id).eq('updated_at',body.updated_at).is('deleted_at',null).select('*').maybeSingle();
  if(error)return editorialJson({error:'Salvataggio non riuscito'},500);
  if(!data)return editorialJson({error:'Contenuto aggiornato altrove: ricarica prima di salvare'},409);
  return editorialJson({data:(await withMedia([data]))[0]});
});}
export async function DELETE(req:Request,ctx:Context){return editorialAdmin(req,async()=>{
  const id=(await ctx.params).id;
  if(!await existingContent(id))return editorialJson({error:'Contenuto non trovato'},404);
  // Logical deletion: media are retained, never delete an arbitrary path or unrelated object.
  const {error}=await supabaseAdmin().from('padelleria_contents').update({deleted_at:new Date().toISOString(),status:'draft'}).eq('id',id).is('deleted_at',null);
  return error?editorialJson({error:'Eliminazione non riuscita'},500):editorialJson({ok:true});
});}
