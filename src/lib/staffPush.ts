import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {STAFF_PUSH_EVENTS,isStaffPushEventKey,type StaffPushEventKey} from '@/lib/staffPushCatalog';
export async function resolveStaffPushRecipients(eventKey:StaffPushEventKey){
 if(!isStaffPushEventKey(eventKey))throw Error('STAFF_PUSH_EVENT_INVALID');
 const {data,error}=await supabaseAdmin().rpc('resolve_staff_push_recipients',{p_event_key:eventKey});
 if(error)throw Error('STAFF_PUSH_RESOLUTION_FAILED');
 return [...new Set<string>((data??[]).map((r:{staff_user_id:string})=>r.staff_user_id))];
}
export async function enqueueStaffPushEvent(eventKey:StaffPushEventKey,aggregateId:string){
 if(!isStaffPushEventKey(eventKey)||!aggregateId||aggregateId.length>200)throw Error('STAFF_PUSH_EVENT_INVALID');
 const event=STAFF_PUSH_EVENTS[eventKey];
 const {data,error}=await supabaseAdmin().rpc('enqueue_staff_push_event',{p_event_key:eventKey,p_aggregate_id:aggregateId,p_domain:event.domain,p_display:{title:event.title,body:'Apri MOVI per gestire la nuova attività.',url:event.url}});
 if(error)throw Error('STAFF_PUSH_ENQUEUE_FAILED');return data;
}
