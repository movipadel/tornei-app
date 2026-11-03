import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentMoviUser } from '@/lib/currentMoviUser';
import { getCurrentOperator } from '@/lib/operatorAuthorization';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { readPushBody, validatePushEndpoint, validatePushSubscription, type PushOwner } from '@/lib/pushValidation';
export type PushAudience = 'customer' | 'staff';
export async function pushOwner(audience: PushAudience): Promise<PushOwner | null> {
  if (audience === 'staff') { const operator = await getCurrentOperator(); return operator ? { publicUserId:null,staffUserId:operator.sid } : null; }
  const user = await getCurrentMoviUser();
  return user.public_user_id && !user.conflict_state ? { publicUserId:user.public_user_id,staffUserId:null } : null;
}
export async function handlePushRequest(req: Request, audience: PushAudience) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error:'Origine non consentita' },{ status:403 });
  const owner = await pushOwner(audience);
  if (!owner) return NextResponse.json({ error:'Accesso richiesto' },{ status:401 });
  try {
    const body = await readPushBody(req);
    if (!['subscribe','revoke','status'].includes(String(body.action))) throw new Error('PUSH_ACTION_INVALID');
    const endpoint = validatePushEndpoint(body.endpoint);
    const keys = body.action==='subscribe'?validatePushSubscription(body):null;
    const sb = supabaseAdmin();
    const { data,error } = await sb.rpc('manage_push_subscription',{ p_action:body.action,p_endpoint:endpoint,p_public_user_id:owner.publicUserId,p_staff_user_id:owner.staffUserId,p_p256dh:keys?.p256dh??null,p_auth:keys?.auth??null,p_user_agent:req.headers.get('user-agent')?.slice(0,512)??null });
    if(error) return NextResponse.json({ error:'Registrazione non disponibile' },{ status:503 });
    if(data.state==='ownership_conflict') return NextResponse.json({ state:data.state,error:'Dispositivo associato a un altro account. Crea una nuova iscrizione.' },{ status:409 });
    if(data.state==='active') {
      (await cookies()).set(`movi_push_${audience}`,data.id,{ httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*24*180 });
    }
    if(body.action==='revoke') (await cookies()).delete(`movi_push_${audience}`);
    return NextResponse.json({state:data.state},{ headers:{'Cache-Control':'no-store'} });
  } catch(error) {
    const code=error instanceof Error?error.message:'';
    return NextResponse.json({ error:'Dati push non validi' },{ status:code==='PUSH_BODY_TOO_LARGE'?413:code==='PUSH_CONTENT_TYPE'?415:400 });
  }
}
export async function revokePushOnLogout(audience: PushAudience) {
  const jar=await cookies(); const id=jar.get(`movi_push_${audience}`)?.value;
  if(!id) return;
  const owner=await pushOwner(audience);
  if(owner) {
    const result=await supabaseAdmin().from('push_subscriptions').update({ is_active:false,revoked_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('id',id).eq(audience==='staff'?'staff_user_id':'public_user_id',owner.staffUserId??owner.publicUserId!);
    if(result.error) throw new Error('PUSH_LOGOUT_REVOKE_FAILED');
  }
  jar.delete(`movi_push_${audience}`);
}
