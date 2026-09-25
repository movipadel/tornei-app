import {guardAdmin} from '@/lib/adminGuard';
import {getStaffSessionFromCookie} from '@/lib/staffSession';
import {editorialJson} from '@/lib/padelleriaServer';
import {moviLevelLabel} from '@/lib/playerProfile';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
export const dynamic='force-dynamic';
const statuses=new Set(['active','archived','merged','all']),accounts=new Set(['all','linked','unlinked']);
export async function GET(req:Request){
 const denied=await guardAdmin();if(denied)return denied;
 const session=await getStaffSessionFromCookie(),sb=supabaseAdmin();
 const active=await sb.rpc('player_identity_admin',{p_actor:session!.sid});if(active.error)return editorialJson({error:'Admin attivo richiesto'},403);
 const params=new URL(req.url).searchParams,q=(params.get('q')??'').trim(),status=params.get('status')??'active',account=params.get('account')??'all';
 if(q.length>100||!statuses.has(status)||!accounts.has(account))return editorialJson({error:'Filtri non validi'},400);
 if(!q)return editorialJson({data:[],limit:50,query_required:true});
 let query=sb.from('player_identities').select('id,full_name,normalized_phone,gender,account_user_id,status,updated_at,merged_into_player_id').order('full_name').order('id').limit(50);
 if(status!=='all')query=query.eq('status',status);
 if(account==='linked')query=query.not('account_user_id','is',null);else if(account==='unlinked')query=query.is('account_user_id',null);
 if(/^[+\d\s()-]+$/.test(q))query=query.ilike('normalized_phone',`%${q.replace(/[^+\d]/g,'')}%`);else query=query.ilike('full_name',`%${q.replace(/[%_]/g,'')}%`);
 const players=await query;if(players.error)return editorialJson({error:'Ricerca giocatori non disponibile'},503);
 const ids=(players.data??[]).map(player=>player.id);
 const [profiles,adminProfiles]=await Promise.all([
  ids.length?sb.from('player_profiles').select('player_identity_id,descriptive_level').in('player_identity_id',ids):Promise.resolve({data:[],error:null}),
  ids.length?sb.from('player_admin_profiles').select('player_identity_id,movi_level').in('player_identity_id',ids):Promise.resolve({data:[],error:null}),
 ]);
 if(profiles.error||adminProfiles.error)return editorialJson({error:'Riepilogo profili non disponibile'},503);
 const shared=new Map((profiles.data??[]).map(profile=>[profile.player_identity_id,profile.descriptive_level]));
 const numeric=new Map((adminProfiles.data??[]).map(profile=>[profile.player_identity_id,profile.movi_level===null?null:Number(profile.movi_level)]));
 return editorialJson({data:(players.data??[]).map(player=>{const level=numeric.get(player.id)??null;return {...player,descriptive_level:shared.get(player.id)??null,movi_level:level,movi_level_label:moviLevelLabel(level)};}),limit:50,query_required:false});
}
