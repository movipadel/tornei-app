import {guardAdmin} from '@/lib/adminGuard';
import {getStaffSessionFromCookie} from '@/lib/staffSession';
import {editorialJson} from '@/lib/padelleriaServer';
import {parseExpectedVersion,parseMoviLevel,parseSharedPlayerProfile} from '@/lib/playerProfile';
import {readPlayerProfile} from '@/lib/playerProfileServer';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const dynamic='force-dynamic';
async function target(id:string,allowMerged=false){
 if(!uuid.test(id))return null;const sb=supabaseAdmin();
 const player=await sb.from('player_identities').select('id,full_name,normalized_phone,gender,account_user_id,status,updated_at,merged_into_player_id').eq('id',id).maybeSingle();if(player.error||!player.data||player.data.status==='merged'&&!allowMerged)return null;
 const account=player.data.account_user_id?await sb.from('users').select('email').eq('id',player.data.account_user_id).maybeSingle():{data:null};
 return {...player.data,email:account.data?.email??null};
}
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await guardAdmin();if(denied)return denied;const {id}=await params;const player=await target(id,true);if(!player)return editorialJson({error:'Giocatore non trovato'},404);
 if(player.status==='merged')return editorialJson({data:{player,profile:null}});
 try{return editorialJson({data:{player,profile:await readPlayerProfile(id,{admin:true})}});}catch{return editorialJson({error:'Profilo non disponibile'},503);}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await guardAdmin();if(denied)return denied;const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return editorialJson({error:'Origine non consentita'},403);
 const {id}=await params,player=await target(id);if(!player)return editorialJson({error:'Giocatore non trovato'},404);
 try{
  const body=await req.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['expected_version','profile','movi_level','internal_notes'].includes(key)))throw Error('Richiesta non valida');
  const expected=parseExpectedVersion(body.expected_version),profile=parseSharedPlayerProfile(body.profile),level=parseMoviLevel(body.movi_level),notes=String(body.internal_notes??'');if(notes.length>5000)throw Error('Le note interne superano 5000 caratteri');
  const session=await getStaffSessionFromCookie();const saved=await supabaseAdmin().rpc('player_profile_write_admin',{p_actor:session!.sid,p_player:id,p_expected_version:expected,p_data:profile,p_movi_level:level,p_internal_notes:notes});
  if(saved.error){if(saved.error.message.includes('STALE_PROFILE'))return editorialJson({code:'STALE_PROFILE',error:'Il profilo è stato modificato nel frattempo. Ricarica i dati prima di salvare.'},409);throw saved.error;}
  return editorialJson({data:{...saved.data,profile:await readPlayerProfile(id,{admin:true})}});
 }catch(error){return editorialJson({error:error instanceof Error?error.message:'Dati profilo non validi'},400);}
}
