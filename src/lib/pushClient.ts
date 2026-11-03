export function publicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
  return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
export function subscriptionKeyMatches(subscription: PushSubscription, key: string) {
  const actual=subscription.options.applicationServerKey;
  const expected=publicKeyBytes(key);
  return !!actual && actual.byteLength===expected.length && new Uint8Array(actual).every((byte,i)=>byte===expected[i]);
}
export async function canonicalPushRegistration() {
  const registration=await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Apri la versione PWA aggiornata e riprova.')),8000)),
  ]);
  if(registration.scope!==new URL('/',location.origin).href || new URL(registration.active?.scriptURL??'/',location.origin).pathname!=='/sw.js') throw new Error('Aggiorna la pagina per attivare il nuovo service worker.');
  return registration;
}
