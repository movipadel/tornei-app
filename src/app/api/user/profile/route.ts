import {getCurrentMoviUser} from '@/lib/currentMoviUser';
import {editorialJson} from '@/lib/padelleriaServer';
import {emptySharedProfile,parseExpectedVersion,parseSharedPlayerProfile} from '@/lib/playerProfile';
import {readPlayerProfile} from '@/lib/playerProfileServer';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
export const dynamic='force-dynamic';

async function context(){
 const identity=await getCurrentMoviUser();
 if(identity.conflict_state)return {response:editorialJson({error:'Sessione in conflitto: accedi nuovamente'},409)};
 if(!identity.public_user_id)return {response:editorialJson({error:'Accedi per continuare'},401)};
 return {identity};
}
export async function GET(){
 const auth=await context();if(auth.response)return auth.response;
 const identity=auth.identity!,sb=supabaseAdmin();
 const linked=await sb.from('player_identities').select('id,status').eq('account_user_id',identity.public_user_id!).maybeSingle();
 if(linked.error)return editorialJson({error:'Profilo non disponibile'},503);
 if(!linked.data)return editorialJson({data:{account:identity.profile,identity_state:'ready_to_create',profile:{...await readEmpty()}}});
 const playerId=(await sb.rpc('player_identity_canonical',{p_id:linked.data.id})).data as string|null;
 if(!playerId)return editorialJson({error:'Identità sportiva non disponibile'},409);
 const player=await sb.from('player_identities').select('id,status').eq('id',playerId).single();
 if(player.error||player.data.status!=='active')return editorialJson({data:{account:identity.profile,identity_state:'verification_required',profile:{...await readEmpty()}}});
 try{return editorialJson({data:{account:identity.profile,identity_state:'linked',profile:await readPlayerProfile(playerId)}});}catch{return editorialJson({error:'Profilo non disponibile'},503);}
}
async function readEmpty(){return {shared:emptySharedProfile(),version:null,updated_at:null,movi_level:null,movi_level_label:null,movi_level_updated_at:null};}
export async function PATCH(req:Request){
 const auth=await context();if(auth.response)return auth.response;
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return editorialJson({error:'Origine non consentita'},403);
 try{
  const body=await req.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['expected_version','profile'].includes(key)))throw Error('Richiesta non valida');
  const expected=parseExpectedVersion(body.expected_version),profile=parseSharedPlayerProfile(body.profile);
  const result=await supabaseAdmin().rpc('player_profile_write_user',{p_user:auth.identity!.public_user_id!,p_expected_version:expected,p_data:profile});
  if(result.error){if(result.error.message.includes('STALE_PROFILE'))return editorialJson({code:'STALE_PROFILE',error:'Il profilo è cambiato in un’altra sessione. Ricarica i dati e riprova.'},409);throw result.error;}
  if(result.data?.state==='review')return editorialJson({code:'IDENTITY_VERIFICATION_REQUIRED',error:'Il collegamento al tuo giocatore richiede una verifica dello staff MOVI.'},409);
  return editorialJson({data:{...result.data,profile:await readPlayerProfile(result.data.player_id)}});
 }catch(error){return editorialJson({error:error instanceof Error?error.message:'Dati profilo non validi'},400);}
}
