import {getCurrentMoviUser} from '@/lib/currentMoviUser';
import {editorialJson} from '@/lib/padelleriaServer';
import {activityPage,activityPagination} from '@/lib/activities';
import {composeActivities} from '@/lib/activitiesServer';
export const dynamic='force-dynamic';
export async function GET(req:Request){const identity=await getCurrentMoviUser();if(identity.conflict_state)return editorialJson({error:'Sessione in conflitto'},409);if(!identity.public_user_id)return editorialJson({error:'Accedi per vedere le tue attività'},401);
 let page;try{page=activityPagination(new URL(req.url).searchParams);}catch{return editorialJson({error:'Parametri non validi'},400);}
 try{return editorialJson(activityPage(await composeActivities(identity.public_user_id),page.tab,page.limit,page.offset));}catch{return editorialJson({error:'Attività temporaneamente non disponibili. Riprova.'},503);}
}
