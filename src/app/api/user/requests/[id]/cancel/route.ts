import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/padelleria';
import { editorialJson } from '@/lib/padelleriaServer';
import { userRequestDTO } from '@/lib/moviRequests';
import { requestUser } from '@/lib/moviRequestsServer';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return requestUser(req,async user_id=>{
 const {id}=await ctx.params;if(!isUuid(id))return editorialJson({error:'Richiesta non trovata'},404);
 const sb=supabaseAdmin();const {data,error}=await sb.from('movi_requests').update({status:'cancelled'}).eq('id',id).eq('user_id',user_id).in('status',['received','searching']).select('*').maybeSingle();
 if(error)return editorialJson({error:'Annullamento non disponibile'},409);if(data)return editorialJson({data:userRequestDTO(data)});
 const own=await sb.from('movi_requests').select('id').eq('id',id).eq('user_id',user_id).maybeSingle();return editorialJson({error:own.data?'Contatta MOVI per questa richiesta':'Richiesta non trovata'},own.data?409:404);
});}
