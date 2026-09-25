import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/padelleria';
import { editorialAdmin,editorialJson } from '@/lib/padelleriaServer';
import { notifyRequest } from '@/lib/moviRequestsServer';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return editorialAdmin(req,async()=>{const {id}=await ctx.params;if(!isUuid(id))throw new Error('ID non valido');const row=await supabaseAdmin().from('movi_requests').select('id').eq('id',id).maybeSingle();if(!row.data)return editorialJson({error:'Richiesta non trovata'},404);await notifyRequest(id);return editorialJson({ok:true,message:'Tentativo gestito. Controlla lo stato; attesa minima tra tentativi: 60 secondi.'});});}
