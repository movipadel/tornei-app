'use client';
import { useCallback,useEffect,useState } from 'react';
import { canonicalPushRegistration,publicKeyBytes,subscriptionKeyMatches } from '@/lib/pushClient';

type State='checking'|'unsupported'|'available'|'denied'|'active'|'repair'|'conflict';
export default function PushEnrollmentCard({ audience }: { audience:'customer'|'staff' }) {
  const [state,setState]=useState<State>('checking');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [iosInstall,setIosInstall]=useState(false);
  const endpoint=audience==='staff'?'/api/staff/push':'/api/user/push';
  const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const api=useCallback(async(action:string,subscription:PushSubscription)=>{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...subscription.toJSON()}),cache:'no-store'});
    const data=await response.json();
    if(response.status===409) { setState('conflict'); throw new Error(data.error); }
    if(!response.ok) throw new Error(data.error||'Operazione non disponibile');
    return data;
  },[endpoint]);
  const refresh=useCallback(async()=>{
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    setIosInstall(ios&&!matchMedia('(display-mode: standalone)').matches);
    if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator)){setState('unsupported');return;}
    if(Notification.permission==='denied'){setState('denied');return;}
    try {
      const registration=await navigator.serviceWorker.getRegistration('/');
      if(registration?.active && new URL(registration.active.scriptURL).pathname!=='/sw.js'){setState('repair');return;}
      const subscription=await registration?.pushManager.getSubscription();
      if(!subscription){setState(Notification.permission==='granted'?'repair':'available');return;}
      if(!publicKey||!subscriptionKeyMatches(subscription,publicKey)){setState('repair');return;}
      const result=await api('status',subscription);
      setState(result.state==='active'?'active':'repair');
    } catch(error){setMessage(error instanceof Error?error.message:'Stato non disponibile');setState(current=>current==='conflict'?current:'repair');}
  },[api,publicKey]);
  useEffect(()=>{void refresh();},[refresh]);
  async function enroll(fresh=false) {
    setBusy(true);setMessage('');
    try {
      if(!publicKey) throw new Error('Notifiche push non ancora configurate.');
      if(await Notification.requestPermission()!=='granted'){setState('denied');return;}
      const registration=await canonicalPushRegistration();
      let subscription=await registration.pushManager.getSubscription();
      if(subscription&&(fresh||!subscriptionKeyMatches(subscription,publicKey))){
        // Never reassign an existing endpoint: discard the browser capability and create a new one.
        if(!fresh) await api('revoke',subscription);
        if(!await subscription.unsubscribe()) throw new Error('Impossibile rinnovare questa iscrizione.');
        subscription=null;
      }
      subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(publicKey)});
      await api('subscribe',subscription);setState('active');setMessage('Dispositivo registrato. L’iscrizione non abilita nuovi avvisi di attività.');
    } catch(error){setMessage(error instanceof Error?error.message:'Iscrizione non riuscita');setState(current=>current==='conflict'?current:'repair');}
    finally{setBusy(false);}
  }
  async function revoke() {
    setBusy(true);setMessage('');
    try{
      const subscription=await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if(subscription){await api('revoke',subscription);await subscription.unsubscribe();}
      setState('available');setMessage('Notifiche disattivate su questo dispositivo.');
    }catch(error){setMessage(error instanceof Error?error.message:'Riprova');}finally{setBusy(false);}
  }
  const labels:Record<State,string>={checking:'Verifica dispositivo…',unsupported:'Non supportate in questo browser',available:'Disponibili su questo dispositivo',denied:'Permesso negato: riattiva le notifiche nelle impostazioni del browser, poi verifica di nuovo.',active:'Attive su questo dispositivo',repair:'Iscrizione da completare o riparare',conflict:'Questo browser ha un’iscrizione di un altro account'};
  return <section aria-label="Notifiche push" style={{padding:20,margin:'16px 0',border:'1px solid #aaa',borderRadius:12}}>
    <h2>Notifiche su questo dispositivo</h2><p>{labels[state]}</p>
    {audience==='staff'&&state!=='active'&&<p>Le precedenti iscrizioni push sono disattivate. Attiva nuovamente questo dispositivo con il tuo account. Gli avvisi operativi continuano su Telegram; gli avvisi push saranno disponibili dopo una successiva attivazione.</p>}
    {iosInstall&&<p>Su iPhone e iPad aggiungi MOVI alla schermata Home e aprila da lì per attivare le notifiche.</p>}
    {message&&<p role="status">{message}</p>}
    {!['unsupported','checking','denied'].includes(state)&&<button type="button" disabled={busy} onClick={()=>void(state==='active'?revoke():enroll(state==='conflict'))}>{busy?'Attendi…':state==='active'?'Disattiva su questo dispositivo':state==='conflict'?'Crea una nuova iscrizione':'Attiva notifiche push'}</button>}
    <button type="button" disabled={busy} onClick={()=>void refresh()}>Verifica stato</button>
  </section>;
}
