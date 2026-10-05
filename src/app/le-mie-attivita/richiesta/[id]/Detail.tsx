'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {formatRequestValues,levels,matchTypes,trainingTypes,goals,type userRequestDTO} from '@/lib/moviRequests';
import {playingSideLabel} from '@/lib/playingSide';
import s from '../../../admin/padelleria/padelleria.module.css';
type Item=ReturnType<typeof userRequestDTO>;
export default function Detail({id}:{id:string}){const [item,setItem]=useState<Item|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{const a=new AbortController();fetch(`/api/user/activities/request/${id}`,{cache:'no-store',signal:a.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setItem(j.data);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>a.abort();},[id,reload]);
 async function cancel(){if(!confirm('Annullare questa richiesta?'))return;setBusy(true);try{const r=await fetch(`/api/user/requests/${id}/cancel`,{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.error);setReload(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className={s.page}><Link href="/le-mie-attivita">← Le mie attività</Link><h1>La mia richiesta</h1>{error&&<p role="alert" className={s.error}>{error}</p>}{item&&<article className={s.card}><h2 className={s.title}>{item.summary}</h2><p className={s.badge}>{item.status_label}</p><p>{levels[item.level]} · Lato: {playingSideLabel(item.playing_side)} · {item.activity_type==='gioca'?`${formatRequestValues(item.match_type,matchTypes)} · ${item.has_partner?'Hai già un compagno':'Cerchi anche il compagno'}`:`${formatRequestValues(item.training_type,trainingTypes)} · ${formatRequestValues(item.training_goal,goals)}`}</p><p>{item.preferred_time_text}</p><p style={{whiteSpace:'pre-wrap'}}>{item.notes}</p>{item.can_cancel?<button className={s.secondary} disabled={busy} onClick={cancel}>Annulla richiesta</button>:<p className={s.muted}>Per informazioni contatta MOVI.</p>}</article>}</main>;
}
