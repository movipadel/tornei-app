'use client';
/* eslint-disable @next/next/no-img-element -- Existing admin thumbnail pattern. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type Partner } from '@/lib/partners';
import { validityLabel } from './PartnerPreview';
import s from '../padelleria/padelleria.module.css';
export default function PartnersPage(){
  const [items,setItems]=useState<Partner[]>([]),[filter,setFilter]=useState(''),[offset,setOffset]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    const p=new URLSearchParams({limit:'12',offset:String(offset)});

    if(['draft','active','inactive'].includes(filter))p.set('status',filter);
    setLoading(true);setError('');
    fetch(`/api/admin/partners?${p}`,{cache:'no-store',signal:abort.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setItems(j.data);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[filter,offset,reload]);
  async function action(item:Partner,remove=false){
    if(remove&&!confirm(`Eliminare â€œ${item.name}â€? Il contenuto sarÃ  nascosto e i media conservati.`))return;
    setBusy(true);setError('');
    try{const r=await fetch(`/api/admin/partners/${item.id}`,{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:remove?undefined:JSON.stringify({...item,status:item.status==='active'?'inactive':'active'})});const j=await r.json();if(!r.ok)throw new Error(j.error);setReload(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className={s.page}>
    <div className={s.header}><div><h1>Partner MOVI</h1><p className={s.muted}>Gestisci i vantaggi riservati alla community MOVI.</p></div><Link className={s.button} href="/admin/partners/nuovo">Nuovo Partner</Link></div>
    <nav className={s.toolbar} aria-label="Filtra contenuti">{[['','Tutti'],['active','Attivi'],['draft','Bozze'],['inactive','Inattivi']].map(([value,label])=><button key={value} className={`${s.secondary} ${filter===value?s.active:''}`} aria-pressed={filter===value} onClick={()=>{setFilter(value);setOffset(0);}}>{label}</button>)}</nav>
    {error&&<div role="alert" className={s.error}>{error} <button className={s.secondary} onClick={()=>setReload(v=>v+1)}>Riprova</button></div>}
    {loading?<p role="status">Caricamento contenutiâ€¦</p>:<div className={s.grid}>{items.map(item=>{return <article className={s.card} key={item.id}><div className={s.row}>{item.logo_url?<img className={s.thumb} src={item.logo_url} alt=""/>:<div className={s.thumb}/> }<div className={s.grow}><h2 className={s.title}>{item.name}</h2><span className={s.badge}>{item.category}</span><span className={s.badge}>{item.status==='draft'?'Bozza':item.status==='active'?'Attivo':'Inattivo'}</span>{item.featured&&<span className={s.badge}>In evidenza</span>}<p className={s.muted}>{validityLabel(item)}</p><p><strong>{item.benefit_title}</strong></p><p className={s.muted}>Ordine: {item.sort_order}</p><div className={s.actions}><Link className={s.secondary} href={`/admin/partners/${item.id}`}>Modifica</Link><Link className={s.secondary} href={`/admin/partners/${item.id}/preview`}>Anteprima</Link><button disabled={busy} className={s.secondary} onClick={()=>action(item)}>{item.status==='active'?'Disattiva':'Attiva'}</button><button disabled={busy} className={`${s.secondary} ${s.danger}`} onClick={()=>action(item,true)}>Elimina</button></div></div></div></article>})}{!items.length&&!error&&<div className={s.card}>Nessun contenuto in questa vista.</div>}</div>}
    <div className={s.actions}><button className={s.secondary} disabled={offset===0||loading} onClick={()=>setOffset(v=>Math.max(0,v-12))}>Precedenti</button><button className={s.secondary} disabled={items.length<12||loading} onClick={()=>setOffset(v=>v+12)}>Successivi</button></div>
  </main>;
}
