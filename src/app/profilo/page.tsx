'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PlayerProfileFields from '@/components/PlayerProfileFields';
import {emptySharedProfile,type SharedPlayerProfile} from '@/lib/playerProfile';
import styles from './profile.module.css';
type Profile={shared:SharedPlayerProfile;version:number|null;updated_at:string|null;movi_level:number|null;movi_level_label:string|null;movi_level_updated_at:string|null};
type Data={account:Record<string,unknown>;identity_state:string;profile:Profile};
export default function ProfilePage(){
 const [data,setData]=useState<Data|null>(null),[form,setForm]=useState<SharedPlayerProfile>(emptySharedProfile()),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const response=await fetch('/api/user/profile',{cache:'no-store'});const json=await response.json();if(response.status===401){window.location.href='/accedi?next=%2Fprofilo';return;}if(!response.ok)throw Error(json.error);setData(json.data);setForm(json.data.profile.shared);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function save(){if(!data||saving)return;setSaving(true);setError('');setMessage('');try{const response=await fetch('/api/user/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:data.profile.version,profile:form})});const json=await response.json();if(!response.ok)throw Error(json.error);setData({...data,identity_state:'linked',profile:json.data.profile});setForm(json.data.profile.shared);setMessage('Profilo di gioco salvato.');}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 const account=data?.account??{};return <><PublicNav/><main className={styles.page}><header><span className={styles.eyebrow}>Area personale</span><h1>Il mio profilo</h1><p>Dati account e preferenze di gioco MOVI.</p></header>{loading&&<p>Caricamento profiloâ€¦</p>}{error&&<div className={styles.error} role="alert">{error}</div>}{message&&<div className={styles.success} role="status">{message}</div>}{data&&<>
  <section className={styles.card}><h2>Dati personali</h2><div className={styles.personal}><Read label="Nome" value={account.full_name}/><Read label="Telefono" value={account.phone}/><Read label="Email" value={account.email}/><Read label="Genere" value={account.gender==='M'?'Uomo':account.gender==='F'?'Donna':'Non indicato'}/></div><p className={styles.muted}>Per correggere email o telefono usa i canali di assistenza MOVI. Da questa pagina non vengono modificati.</p></section>
  <section className={styles.card}><h2>Profilo di gioco</h2>{data.identity_state==='verification_required'&&<p className={styles.warning}>Il collegamento alla tua identitÃ  sportiva richiede una verifica dello staff MOVI.</p>}<PlayerProfileFields value={form} onChange={setForm} disabled={saving||data.identity_state==='verification_required'}/><div className={styles.actions}><button onClick={()=>void save()} disabled={saving||data.identity_state==='verification_required'}>{saving?'Salvataggioâ€¦':'Salva profilo'}</button><button className={styles.secondary} onClick={()=>{setForm(data.profile.shared);setMessage('');}} disabled={saving}>Annulla modifiche</button></div></section>
  <section className={styles.card}><h2>Valutazione MOVI</h2>{data.profile.movi_level===null?<p>Non ancora assegnata.</p>:<p><strong>Livello {data.profile.movi_level.toFixed(1)} Â· {data.profile.movi_level_label}</strong>{data.profile.movi_level_updated_at&&<> Â· aggiornato il {new Date(data.profile.movi_level_updated_at).toLocaleDateString('it-IT')}</>}</p>}<p className={styles.muted}>Questa valutazione Ã¨ assegnata dallo staff ed Ã¨ indipendente dal livello che dichiari.</p></section>
  <Link className={styles.activities} href="/le-mie-attivita">Vai a Le mie attivitÃ </Link>
 </>}</main></>;
}
function Read({label,value}:{label:string;value:unknown}){return <div><span>{label}</span><strong>{String(value??'Non indicato')}</strong></div>}
