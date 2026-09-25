import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds } from '@/lib/padelleria';
import { editorialJson } from '@/lib/padelleriaServer';
import { parseRequest,userRequestDTO } from '@/lib/moviRequests';
import { requestUser,notifyRequest } from '@/lib/moviRequestsServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){return requestUser(req,async user_id=>{const {limit,offset}=pageBounds(new URL(req.url).searchParams);const {data,error}=await supabaseAdmin().from('movi_requests').select('*').eq('user_id',user_id).order('created_at',{ascending:false}).order('id').range(offset,offset+limit-1);if(error)return editorialJson({error:'Richieste non disponibili'},500);return editorialJson({data:(data??[]).map(userRequestDTO),limit,offset});});}
export async function POST(req:Request){return requestUser(req,async user_id=>{
 const input=parseRequest(await req.json()),sb=supabaseAdmin();
 const {data,error}=await sb.from('movi_requests').insert({...input,user_id}).select('*').single();
 if(error){if(error.code==='23505'){const existing=await sb.from('movi_requests').select('*').eq('user_id',user_id).eq('client_request_id',input.client_request_id).single();if(existing.data)return editorialJson({data:userRequestDTO(existing.data)},200);}return editorialJson({error:'Richiesta non salvata, riprova'},500);}
 await notifyRequest(data.id);return editorialJson({data:userRequestDTO(data)},201);
});}
