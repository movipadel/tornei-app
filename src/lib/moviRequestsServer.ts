import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentMoviUser } from '@/lib/currentMoviUser';
import { editorialJson } from '@/lib/padelleriaServer';
import { sendTelegramMessage } from '@/lib/telegram';
import { notificationAttempt } from '@/lib/requestNotification';
import { requestTelegramText,type RequestRow } from '@/lib/moviRequests';
export async function requestUser(req:Request,run:(userId:string)=>Promise<Response>){
 const identity=await getCurrentMoviUser();if(identity.conflict_state)return editorialJson({error:'Sessione in conflitto: accedi nuovamente'},409);
 if(!identity.public_user_id)return editorialJson({error:'Accedi per continuare'},401);
 const origin=req.headers.get('origin');if(req.method!=='GET'&&origin&&origin!==new URL(req.url).origin)return editorialJson({error:'Origine non consentita'},403);
 try{return await run(identity.public_user_id);}catch{return editorialJson({error:'Dati non validi o operazione non disponibile'},400);}
}
export async function adminRequests(rows:RequestRow[]){
 if(!rows.length)return [];const {data,error}=await supabaseAdmin().from('users').select('id,full_name,phone').in('id',[...new Set(rows.map(r=>r.user_id))]);if(error)throw new Error('Contatti non disponibili');
 const users=new Map((data??[]).map(u=>[u.id,{full_name:u.full_name,phone:u.phone}]));return rows.map(r=>({...r,user:users.get(r.user_id)??null}));
}
export async function notifyRequest(id:string){
 // Persisted queue remains authoritative even if transport or notification bookkeeping fails.
 try{
  const sb=supabaseAdmin();const {data,error}=await sb.rpc('movi_request_claim_telegram',{p_id:id});if(error)throw new Error('claim');const row=data?.[0] as RequestRow|undefined;if(!row)return;
  const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL;
  const local=url==='http://127.0.0.1:55021';
  if((local&&(process.env.TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_CHAT_ID))||(!local&&process.env.PADELLERIA_LOCAL_VERIFIED==='1')){
   await sb.from('movi_requests').update({telegram_state:'failed',telegram_error:'config_blocked'}).eq('id',id).eq('telegram_attempted_at',row.telegram_attempted_at!);return;
  }
  const mode=local||process.env.MOVI_REQUEST_TELEGRAM_MODE==='disabled'?'disabled':'live';
  await notificationAttempt(mode,async()=>{const {data:user,error:ue}=await sb.from('users').select('full_name,phone').eq('id',row.user_id).single();if(ue)throw new Error('contact');return sendTelegramMessage(requestTelegramText(row,user.full_name??'Utente MOVI',user.phone??''),{safe:true});},async result=>{const saved=await sb.from('movi_requests').update(result).eq('id',id).eq('telegram_attempted_at',row.telegram_attempted_at!);if(saved.error)throw new Error('record');});
 }catch{console.warn('MOVI request notification incomplete; consult admin queue');}
}
