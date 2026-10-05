import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/padelleria';
import { transitions,type RequestStatus } from '@/lib/moviRequests';
import { editorialOperator,editorialJson } from '@/lib/padelleriaServer';
import { adminRequests } from '@/lib/moviRequestsServer';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){return editorialOperator(req,'requests.manage',async()=>{const {id}=await ctx.params;if(!isUuid(id))throw new Error('ID non valido');const {data,error}=await supabaseAdmin().from('movi_requests').select('*').eq('id',id).maybeSingle();if(error)throw new Error('Lettura non riuscita');return data?editorialJson({data:(await adminRequests([data]))[0]}):editorialJson({error:'Richiesta non trovata'},404);});}
export async function PATCH(req:Request,ctx:Context){return editorialOperator(req,'requests.manage',async()=>{
 const {id}=await ctx.params;if(!isUuid(id))throw new Error('ID non valido');const b=await req.json();if(typeof b.admin_notes!=='string'||b.admin_notes.length>3000||typeof b.updated_at!=='string')throw new Error('Note/versione non valide');
 const sb=supabaseAdmin(),old=await sb.from('movi_requests').select('*').eq('id',id).maybeSingle();if(!old.data)return editorialJson({error:'Richiesta non trovata'},404);
 if(b.status!==old.data.status&&!transitions[old.data.status as RequestStatus].includes(b.status))return editorialJson({error:'Passaggio di stato non consentito'},409);
 const {data,error}=await sb.from('movi_requests').update({status:b.status,admin_notes:b.admin_notes.trim()}).eq('id',id).eq('updated_at',b.updated_at).select('*').maybeSingle();
 return error||!data?editorialJson({error:'Richiesta aggiornata altrove: ricarica'},409):editorialJson({data:(await adminRequests([data]))[0]});
});}
