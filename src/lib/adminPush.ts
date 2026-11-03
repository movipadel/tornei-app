import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { legacyAdminPushEnabled, sendLegacyAdminPush } from '@/lib/pushTransport';
import { safePushUrl } from '@/lib/pushUrl';

type AdminPushPayload = { title:string; body:string; url?:string; icon?:string; badge?:string };
/** @deprecated Pre-cutover only. No new legacy rows, ownership inference or outbox enqueue. */
export async function sendAdminPushNotification(payload: AdminPushPayload) {
  if (!legacyAdminPushEnabled()) return { ok:true,sent:0,failed:0,skipped:true };
  const sb=supabaseAdmin();
  const legacy=await sb.from('admin_push_subscriptions').select('id,endpoint,p256dh,auth').eq('is_active',true);
  if(legacy.error) { console.error('[admin-push] subscription lookup failed'); return {ok:false,sent:0,failed:0}; }
  let sent=0,failed=0,skipped=0;
  const seen=new Set<string>();
  for(const sub of legacy.data??[]) {
    if(seen.has(sub.endpoint))continue;
    seen.add(sub.endpoint);
    try {
      // An explicitly enrolled canonical device must not bypass revoke/account switch via legacy fallback.
      const owned=await sb.from('push_subscriptions').select('is_active,revoked_at,public_user_id,staff_user_id').eq('endpoint',sub.endpoint).maybeSingle();
      if(owned.error)throw new Error('PUSH_OWNERSHIP_LOOKUP');
      if(owned.data) {
        if(!owned.data.is_active || owned.data.revoked_at || owned.data.public_user_id || !owned.data.staff_user_id){skipped++;continue;}
        const staff=await sb.from('staff_users').select('is_active,role').eq('id',owned.data.staff_user_id).maybeSingle();
        if(staff.error)throw new Error('PUSH_STAFF_LOOKUP');
        if(!staff.data?.is_active || staff.data.role!=='admin'){skipped++;continue;}
      }
      await sendLegacyAdminPush(sub,{
        title:payload.title,body:payload.body,url:safePushUrl(payload.url??'/admin','https://push.invalid'),
        icon:payload.icon??'/icon-192.png',badge:payload.badge??'/icon-192.png',
      });
      sent++;
    } catch(error) {
      failed++;
      const statusCode=(error as {statusCode?:number}).statusCode;
      if(statusCode===404||statusCode===410){
        const cleanup=await sb.from('admin_push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',sub.id);
        if(cleanup.error)console.error('[admin-push] stale subscription cleanup failed');
      }
      console.error('[admin-push] send failed',{statusCode:statusCode??null});
    }
  }
  return {ok:failed===0,sent,failed,skipped};
}
