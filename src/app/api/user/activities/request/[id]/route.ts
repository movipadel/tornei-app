import {getCurrentMoviUser} from '@/lib/currentMoviUser';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {editorialJson} from '@/lib/padelleriaServer';
import {isUuid} from '@/lib/padelleria';
import {userRequestDTO} from '@/lib/moviRequests';
export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}){
 const identity=await getCurrentMoviUser();if(identity.conflict_state)return editorialJson({error:'Sessione in conflitto'},409);if(!identity.public_user_id)return editorialJson({error:'Accedi per continuare'},401);
 const {id}=await ctx.params;if(!isUuid(id))return editorialJson({error:'Richiesta non trovata'},404);
 const sb=supabaseAdmin(),scope=await sb.rpc('movi_activity_identity_scope',{p_user_id:identity.public_user_id});if(scope.error)return editorialJson({error:'Lettura non disponibile'},503);
 const {data,error}=await sb.from('movi_requests').select('*').eq('id',id).in('user_id',scope.data.user_ids).maybeSingle();if(error)return editorialJson({error:'Lettura non disponibile'},503);
 return data?editorialJson({data:{...userRequestDTO(data),can_cancel:data.user_id===identity.public_user_id&&userRequestDTO(data).can_cancel}}):editorialJson({error:'Richiesta non trovata'},404);
}
