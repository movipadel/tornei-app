import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendOwnedPush } from '@/lib/pushTransport';
import { safePushUrl } from '@/lib/pushUrl';

export function pushFailure(statusCode: number | undefined) {
  if(statusCode===404||statusCode===410) return {status:'failed',code:`endpoint_${statusCode}`,stale:true};
  if(statusCode===429||statusCode===undefined||statusCode>=500) return {status:'retry',code:'provider_transient',stale:false};
  return {status:'failed',code:'provider_rejected',stale:false};
}
type Sender=typeof sendOwnedPush;
// Dependency injection is used only by local tests; the HTTP route never accepts a sender/payload.
export async function processPushDeliveries(sb= supabaseAdmin(),send:Sender=sendOwnedPush) {
  const worker=crypto.randomUUID();
  async function rpc(name:string,args:Record<string,unknown>) {
    const result=await sb.rpc(name,args);if(result.error)throw new Error(`PUSH_DB_${name}`);return result.data;
  }
  const deliveries=await rpc('claim_push_deliveries',{p_worker_id:worker,p_limit:10});
  const outcomes:Record<string,number>={};
  for(const delivery of deliveries??[]) {
    const event=await sb.from('notification_events').select('payload').eq('id',delivery.event_id).single();
    if(event.error) throw new Error('PUSH_EVENT_UNAVAILABLE');
    const targets=await rpc('claim_push_targets',{p_delivery_id:delivery.id,p_worker_id:worker});
    for(const target of targets??[]) {
      const eligible=await rpc('push_subscription_eligible',{p_subscription_id:target.subscription_id,p_event_id:delivery.event_id});
      if(!eligible){await rpc('finish_push_target',{p_target_id:target.id,p_worker_id:worker,p_status:'skipped',p_error_code:'recipient_ineligible'});continue;}
      const subscription=await sb.from('push_subscriptions').select('endpoint,p256dh,auth').eq('id',target.subscription_id).single();
      if(subscription.error) throw new Error('PUSH_SUBSCRIPTION_UNAVAILABLE');
      let result={status:'accepted',code:null as string|null,stale:false};
      try {
        // No new business templates enabled. Future reviewed producers provide push display data.
        const display=event.data.payload?.push??{};
        await send(subscription.data,{title:typeof display.title==='string'?display.title.slice(0,120):'MOVI',body:typeof display.body==='string'?display.body.slice(0,300):'Hai un nuovo aggiornamento.',url:safePushUrl(display.url,'https://push.invalid')});
      }catch(error){result=pushFailure((error as {statusCode?:number}).statusCode);}
      // Persist separately: a bookkeeping error must not be mistaken for a provider failure.
      await rpc('finish_push_target',{p_target_id:target.id,p_worker_id:worker,p_status:result.status,p_error_code:result.code,p_stale:result.stale});
    }
    const status=await rpc('finish_push_delivery',{p_delivery_id:delivery.id,p_worker_id:worker});
    outcomes[status]=(outcomes[status]??0)+1;
  }
  return {claimed:deliveries?.length??0,outcomes};
}
