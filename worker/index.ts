/// <reference lib="webworker" />
import { safePushUrl } from '../src/lib/pushUrl';
declare const self: ServiceWorkerGlobalScope;
self.addEventListener("activate", (event) => {
  const activationEvent = event as Event & {
    waitUntil(promise: Promise<unknown>): void;
  };

  activationEvent.waitUntil(caches.delete("apis"));
});

self.addEventListener('push', event => {
  let data: Record<string, unknown> = {};
  try { data = event.data?.json() ?? {}; } catch { /* Generic visible notification */ }
  event.waitUntil(self.registration.showNotification(typeof data.title==='string'?data.title.slice(0,120):'MOVI', {
    body:typeof data.body==='string'?data.body.slice(0,300):'Hai un nuovo aggiornamento.',
    icon:typeof data.icon==='string' && safePushUrl(data.icon,self.location.origin)!=='/' ? safePushUrl(data.icon,self.location.origin) : '/icon-192.png',
    badge:typeof data.badge==='string' && safePushUrl(data.badge,self.location.origin)!=='/' ? safePushUrl(data.badge,self.location.origin) : '/icon-192.png',
    data:{url:safePushUrl(data.url,self.location.origin)},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(safePushUrl(event.notification.data?.url,self.location.origin),self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const match=windows.find(client=>client.url===target);
    if(match) { try { await match.focus(); return; } catch { /* Try another window */ } }
    const relevant=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(relevant) {
      try { const navigated=await relevant.navigate(target); if(navigated){await navigated.focus();return;} } catch { /* Open a new window */ }
    }
    await self.clients.openWindow(target);
  })());
});
