import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {emptySharedProfile,moviLevelLabel} from '@/lib/playerProfile';

export async function readPlayerProfile(playerId:string,{admin=false}:{admin?:boolean}={}){
 const sb=supabaseAdmin();
 const adminProfilePromise=admin
  ? sb.from('player_admin_profiles').select('movi_level,movi_level_updated_at,internal_notes,updated_at').eq('player_identity_id',playerId).maybeSingle()
  : sb.from('player_admin_profiles').select('movi_level,movi_level_updated_at').eq('player_identity_id',playerId).maybeSingle();
 const [profileResult,availabilityResult,adminResult]=await Promise.all([
  sb.from('player_profiles').select('descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,version,updated_at').eq('player_identity_id',playerId).maybeSingle(),
  sb.from('player_profile_availability').select('weekday,time_window').eq('player_identity_id',playerId).order('weekday').order('time_window'),
  adminProfilePromise,
 ]);
 if(profileResult.error||availabilityResult.error||adminResult.error)throw Error('Profilo di gioco non disponibile');
 const row=profileResult.data;
 const shared=row?{descriptive_level:row.descriptive_level,preferred_clubs:row.preferred_clubs,available_other_clubs:row.available_other_clubs,preferred_match_types:row.preferred_match_types,available_last_minute:row.available_last_minute,availability:availabilityResult.data??[]}:emptySharedProfile();
 const adminRow=adminResult.data as {movi_level:number|string|null;movi_level_updated_at:string|null;internal_notes?:string;updated_at?:string}|null;
 const numeric=adminRow?.movi_level===null||adminRow?.movi_level===undefined?null:Number(adminRow.movi_level);
 return {shared,version:row?.version??null,updated_at:row?.updated_at??null,movi_level:numeric,movi_level_label:moviLevelLabel(numeric),movi_level_updated_at:adminRow?.movi_level_updated_at??null,...(admin?{internal_notes:adminRow?.internal_notes??'',admin_updated_at:adminRow?.updated_at??null}:{})};
}
