import 'server-only';
import webPush from 'web-push';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createECDH } from 'node:crypto';
import { validatePushSubscription } from '@/lib/pushValidation';

export function pushVapidPreflight(legacy = false) {
  const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey=process.env.VAPID_PRIVATE_KEY;
  const subject=process.env.VAPID_SUBJECT || (legacy ? 'mailto:movipadel@gmail.com' : undefined);
  if(!publicKey||!privateKey||!subject) throw new Error('PUSH_CONFIG_MISSING');
  try {
    webPush.setVapidDetails(subject,publicKey,privateKey);
    const pair=createECDH('prime256v1');pair.setPrivateKey(Buffer.from(privateKey,'base64url'));
    if(pair.getPublicKey().toString('base64url')!==publicKey.replace(/=+$/,''))throw new Error('Key pair mismatch');
  } catch { throw new Error('PUSH_CONFIG_INVALID'); }
  return {subject,publicKey,privateKey};
}
function productionPushTarget() {
  const db=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL??'';
  let host=''; try{host=new URL(db).hostname;}catch{return false;}
  return process.env.NODE_ENV==='production' && !['127.0.0.1','localhost','[::1]'].includes(host);
}
export function legacyAdminPushEnabled() {
  return productionPushTarget() && (process.env.PUSH_BUSINESS_TRANSPORT ?? 'legacy')==='legacy'
    && process.env.PUSH_TRANSPORT!=='disabled';
}
export function pushTransportEnabled() {
  // A single transport mode prevents legacy and canonical business sends coexisting.
  return productionPushTarget() && process.env.PUSH_BUSINESS_TRANSPORT==='canonical'
    && process.env.PUSH_DELIVERY_ENABLED==='true' && process.env.PUSH_TRANSPORT==='web-push';
}
export function publicNetworkAddress(address:string) {
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return a!==0&&a!==10&&a!==127&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127);}
  // Conservative IPv6 global-unicast only, excluding mapped IPv4 and local/link-local.
  return isIP(address)===6 && /^[23][0-9a-f]{3}:/i.test(address);
}
type Subscription = {endpoint:string;p256dh:string;auth:string};
export type PushDisplay = {title:string;body:string;url:string;icon?:string;badge?:string};
export async function sendOwnedPush(subscription:Subscription,payload:PushDisplay) {
  if(!pushTransportEnabled()) throw new Error('PUSH_TRANSPORT_DISABLED');
  return sendValidatedPush(subscription,payload,false);
}
export async function sendLegacyAdminPush(subscription:Subscription,payload:PushDisplay) {
  if(!legacyAdminPushEnabled()) throw new Error('PUSH_TRANSPORT_DISABLED');
  return sendValidatedPush(subscription,payload,true);
}
async function sendValidatedPush(subscription:Subscription,payload:PushDisplay,legacy:boolean) {
  const valid=validatePushSubscription({endpoint:subscription.endpoint,keys:subscription});
  const host=new URL(valid.endpoint).hostname;
  const addresses=await lookup(host,{all:true});
  if(!addresses.length||addresses.some(item=>!publicNetworkAddress(item.address))) throw new Error('PUSH_NETWORK_TARGET_INVALID');
  const config=pushVapidPreflight(legacy);
  // Pin the validated address to prevent a second DNS lookup/rebinding at connection time.
  const selected=addresses[0];
  return webPush.sendNotification({endpoint:valid.endpoint,keys:{p256dh:valid.p256dh,auth:valid.auth}},JSON.stringify(payload),{
    vapidDetails:config,timeout:10000,...(legacy?{}:{TTL:3600}),
    agent:new (await import('node:https')).Agent({lookup:(_host,options,callback)=>{
      if(options.all) callback(null,[selected]);
      else callback(null,selected.address,selected.family);
    }}),
  });
}
