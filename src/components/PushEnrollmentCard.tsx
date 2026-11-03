'use client';
import { useCallback,useEffect,useState } from 'react';
import { canonicalPushRegistration,publicKeyBytes,subscriptionKeyMatches } from '@/lib/pushClient';
import styles from './PushEnrollmentCard.module.css';

type State='checking'|'unsupported'|'available'|'denied'|'active'|'repair'|'conflict';
export default function PushEnrollmentCard({ audience, variant='compact', preferenceEnabled=false, preferencePending=false }: { audience:'customer'|'staff'; variant?:'profile'|'compact'; preferenceEnabled?:boolean; preferencePending?:boolean }) {
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
  const labels:Record<State,string>={checking:'Verifica in corso…',unsupported:'Non supportate',available:'Da attivare',denied:'Permesso negato',active:'Attive su questo dispositivo',repair:'Da riparare',conflict:'Dispositivo di un altro account'};
  const profile=variant==='profile';
  const helper=state==='denied'?'Le notifiche sono bloccate nelle impostazioni del browser.'
    :state==='conflict'?'Attiva di nuovo questo dispositivo per usarlo con il tuo account.'
    :profile&&preferencePending?'Salva notifiche per applicare la preferenza modificata.'
    :profile&&!preferenceEnabled?'La preferenza Push è disattivata. Puoi comunque gestire questo dispositivo.'
    :profile&&state==='active'?'Notifiche push attive su questo dispositivo.'
    :profile&&['available','repair'].includes(state)?'Push abilitate nelle preferenze, ma questo dispositivo non è ancora attivo.'
    :!profile&&['available','repair'].includes(state)?'Attiva le push su questo dispositivo. Telegram resta disponibile.' :'';
  const displayMessage=message&&(/service worker|VAPID|endpoint|subscription/i.test(message)?'Aggiorna la pagina e riprova ad attivare le notifiche.':message);
  return <div className={profile?styles.profile:styles.compact} role="group" aria-label={profile?'Stato dispositivo push':'Notifiche push'}>
    <div className={styles.heading}>{profile?<span>Stato dispositivo</span>:<h2>Notifiche push</h2>}<span className={styles.badge} role="status" aria-live="polite">{labels[state]}</span></div>
    {helper&&<p className={styles.helper}>{helper}</p>}
    {iosInstall&&<p className={styles.helper}>Su iPhone e iPad aggiungi MOVI alla schermata Home e aprila da lì per attivare le notifiche.</p>}
    {displayMessage&&<p className={styles.helper} role="status">{displayMessage}</p>}
    <div className={styles.actions}>
      {!['unsupported','checking','denied'].includes(state)&&<button type="button" disabled={busy} onClick={()=>void(state==='active'?revoke():enroll(state==='conflict'))}>{busy?'Attendi…':state==='active'?(profile?'Disattiva su questo dispositivo':'Disattiva'):state==='conflict'?'Attiva per questo account':profile?'Attiva notifiche push':'Attiva'}</button>}
      <button type="button" disabled={busy} onClick={()=>void refresh()}>{profile?'Verifica stato':'Verifica'}</button>
    </div>
  </div>;
}
