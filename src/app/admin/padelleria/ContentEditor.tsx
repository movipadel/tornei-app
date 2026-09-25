'use client';
/* eslint-disable @next/next/no-img-element -- Existing admin preview pattern. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { type ContentItem, type ContentInput, type ContentMedia, parseContent, romeInput, romeToUtc } from '@/lib/padelleria';
import ContentPreview from './ContentPreview';
import s from './padelleria.module.css';
const empty:ContentInput={kind:'succede',status:'draft',title:'',excerpt:'',body:'',featured:false,sort_order:0,cta_label:'',cta_url:'',occurred_at:null,visible_from:null,visible_until:null};
export default function ContentEditor({id,previewOnly=false}:{id?:string;previewOnly?:boolean}){
  const router=useRouter();
  const [input,setInput]=useState<ContentInput>(empty),[item,setItem]=useState<ContentItem|null>(null),[media,setMedia]=useState<ContentMedia[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(Boolean(id)),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[localPreview,setLocalPreview]=useState(false);
  const [from,setFrom]=useState(''),[until,setUntil]=useState(''),[occurred,setOccurred]=useState(''),[noExpiry,setNoExpiry]=useState(true),[video,setVideo]=useState(''),[caption,setCaption]=useState('');
  useEffect(()=>{
    if(!id)return;
    const ac=new AbortController();
    fetch(`/api/admin/padelleria/${id}`,{cache:'no-store',signal:ac.signal}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);const data=j.data as ContentItem;setItem(data);setInput({...data,cta_label:data.cta_label??'',cta_url:data.cta_url??''});setMedia(data.media);setFrom(romeInput(data.visible_from));setUntil(romeInput(data.visible_until));setOccurred(romeInput(data.occurred_at));setNoExpiry(!data.visible_until);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!ac.signal.aborted)setLoading(false);});
    return()=>ac.abort();
  },[id]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function change<K extends keyof ContentInput>(key:K,value:ContentInput[K]){setInput(v=>({...v,[key]:value}));setDirty(true);setMessage('');}
  function payload(){return parseContent({...input,occurred_at:romeToUtc(occurred),visible_from:input.kind==='succede'?romeToUtc(from):null,visible_until:input.kind==='succede'&&!noExpiry?romeToUtc(until):null});}
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{
    if(input.kind==='succede'&&!noExpiry&&!until)throw new Error('Scegli la fine visibilità oppure Nessuna scadenza');
    const data=payload();const r=await fetch(id?`/api/admin/padelleria/${id}`:'/api/admin/padelleria',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,updated_at:item?.updated_at})});const j=await r.json();if(!r.ok)throw new Error(j.error);
    setItem(j.data);setMedia(j.data.media);setDirty(false);setMessage('Contenuto salvato.');if(!id)router.replace(`/admin/padelleria/${j.data.id}`);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function mediaAction(method:string,body:FormData|object){if(!id)return;setBusy(true);setError('');try{
    const r=await fetch(`/api/admin/padelleria/${id}/media`,{method,headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);
    const res=await fetch(`/api/admin/padelleria/${id}`,{cache:'no-store'});const fresh=await res.json();if(!res.ok)throw new Error(fresh.error);setMedia(fresh.data.media);setMessage('Media aggiornati.');return true;
  }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
  async function upload(file:File|undefined,role:string){if(!file)return;const f=new FormData();f.set('file',file);f.set('role',role);f.set('caption',caption);await mediaAction('POST',f);}
  async function move(index:number,delta:number){const ids=media.map(m=>m.id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];await mediaAction('PATCH',{ids});}
  if(loading)return <main className={s.page}><p role="status">Caricamento…</p></main>;
  if(id&&!item)return <main className={s.page}><Link href="/admin/padelleria">← Contenuti</Link><p className={s.error} role="alert">{error||'Contenuto non trovato'}</p></main>;
  let preview:ContentItem|null=item?{...item,media}:null;
  if(localPreview){try{preview={...payload(),id:id??'anteprima',media,created_at:item?.created_at??new Date().toISOString(),updated_at:item?.updated_at??'',published_at:item?.published_at??null};}catch{preview=null;}}
  return <main className={s.page}>
    <div className={s.header}><div><Link className={s.link} href="/admin/padelleria" onClick={e=>{if(dirty&&!confirm('Uscire senza salvare le modifiche al testo?'))e.preventDefault();}}>← Contenuti Padelleria</Link><h1>{previewOnly?'Anteprima contenuto':id?'Modifica contenuto':'Nuovo contenuto'}</h1></div>{previewOnly?<Link className={s.button} href={`/admin/padelleria/${id}`}>Modifica</Link>:<button type="button" className={s.secondary} onClick={()=>setLocalPreview(v=>!v)}>{localPreview?'Torna all’editor':'Anteprima modifiche'}</button>}</div>
    {error&&<div className={s.error} role="alert">{error}</div>}{message&&<div className={s.success} role="status">{message}</div>}
    {previewOnly||localPreview?<><p className={s.muted}>Anteprima amministrativa{localPreview?' · include modifiche non salvate':''}. Non è la Home definitiva. I video esterni si caricano solo al clic.</p>{preview?<ContentPreview item={preview}/>:<p className={s.error}>Completa titolo e date valide prima dell’anteprima.</p>}</>:<>
      <form className={s.card} onSubmit={save}><div className={s.form}>
        <label className={s.field}>Tipo<select value={input.kind} onChange={e=>change('kind',e.target.value as ContentInput['kind'])}><option value="succede">Succede in Padelleria</option><option value="e_successo">È successo in Padelleria</option></select></label>
        <label className={s.field}>Stato<select value={input.status} onChange={e=>change('status',e.target.value as ContentInput['status'])}><option value="draft">Bozza</option><option value="published">Pubblicato</option></select></label>
        <label className={`${s.field} ${s.wide}`}>Titolo<input required maxLength={180} value={input.title} onChange={e=>change('title',e.target.value)}/></label>
        <label className={`${s.field} ${s.wide}`}>Estratto / testo breve<textarea maxLength={500} value={input.excerpt} onChange={e=>change('excerpt',e.target.value)}/></label>
        <label className={`${s.field} ${s.wide}`}>Contenuto<textarea rows={9} maxLength={30000} value={input.body} onChange={e=>change('body',e.target.value)}/><span className={s.muted}>Testo semplice, con paragrafi. HTML non interpretato.</span></label>
        <label className={s.field}>Testo CTA (opzionale)<input maxLength={100} value={input.cta_label??''} onChange={e=>change('cta_label',e.target.value)}/></label>
        <label className={s.field}>URL CTA<input placeholder="/tornei oppure https://…" maxLength={2000} value={input.cta_url??''} onChange={e=>change('cta_url',e.target.value)}/></label>
        <label className={s.field}>Data evento / accaduto · Europe/Rome<input type="datetime-local" step="1" value={occurred} onChange={e=>{setOccurred(e.target.value);setDirty(true);}}/></label>
        <label className={s.field}>Ordine<input type="number" min={-100000} max={100000} value={input.sort_order} onChange={e=>change('sort_order',Number(e.target.value))}/></label>
        <label className={s.check}><input type="checkbox" checked={input.featured} onChange={e=>change('featured',e.target.checked)}/>In evidenza</label>
        {input.kind==='succede'?<><label className={`${s.check} ${s.wide}`}><input type="checkbox" checked={noExpiry} onChange={e=>{setNoExpiry(e.target.checked);setDirty(true);}}/>Nessuna scadenza</label><label className={s.field}>Visibile dal · Europe/Rome<input type="datetime-local" step="1" value={from} onChange={e=>{setFrom(e.target.value);setDirty(true);}}/><span className={s.muted}>Vuoto = da subito, una volta pubblicato.</span></label><label className={s.field}>Visibile fino al · Europe/Rome<input disabled={noExpiry} required={!noExpiry} type="datetime-local" step="1" value={until} onChange={e=>{setUntil(e.target.value);setDirty(true);}}/><span className={s.muted}>Istante finale incluso. Per il 6 gennaio: 06/01 ore 23:59:59.</span></label></>:<p className={`${s.muted} ${s.wide}`}>Archivio senza scadenza automatica. Rimane disponibile fino a Nascondi o Elimina.</p>}
      </div><div className={s.actions}><button disabled={busy} className={s.button} type="submit">{busy?'Salvataggio…':id?'Salva modifiche':'Crea contenuto'}</button><span className={s.muted}>{dirty?'Modifiche non salvate':''}</span></div></form>
      <h2 className={s.section}>Copertina, gallery e video</h2>
      {!id?<div className={s.card}>Salva prima il contenuto per allegare i media.</div>:<>
        <div className={`${s.card} ${s.form}`}><label className={`${s.field} ${s.wide}`}>Didascalia / descrizione del prossimo media<input maxLength={300} value={caption} onChange={e=>setCaption(e.target.value)}/></label>
          <label className={`${s.field} ${s.upload}`}>Copertina<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||media.some(m=>m.role==='cover')} onChange={e=>{void upload(e.target.files?.[0],'cover');e.target.value='';}}/><span className={s.muted}>Rimuovi la copertina attuale per sostituirla.</span></label>
          <label className={`${s.field} ${s.upload}`}>Immagine gallery<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void upload(e.target.files?.[0],'gallery');e.target.value='';}}/></label>
          <p className={`${s.muted} ${s.wide}`}>PNG, JPEG, WebP · max 5 MiB. Consigliato 1600×900, minimo editoriale 960×540. Nessuna conversione automatica. Media salvati immediatamente; massimo 30.</p>
          <label className={`${s.field} ${s.wide}`}>Video YouTube / Vimeo<input type="url" placeholder="https://www.youtube.com/watch?v=…" value={video} onChange={e=>setVideo(e.target.value)}/></label>
          <div><button type="button" disabled={busy||!video} className={s.secondary} onClick={async()=>{if(await mediaAction('POST',{external_url:video,caption}))setVideo('');}}>Aggiungi video</button></div>
        </div>
        <div className={s.mediaGrid} style={{marginTop:16}}>{media.map((m,index)=><article key={m.id} className={s.card}>{m.url?<img className={s.mediaImage} src={m.url} alt={m.caption||m.role}/>:<p>Video esterno</p>}<strong>{m.role==='cover'?'Copertina':m.role==='gallery'?'Gallery':'Video'}</strong><p className={s.muted}>{m.caption||m.external_url||'Senza didascalia'}</p><div className={s.actions}><button aria-label={`Sposta media ${index+1} prima`} className={s.secondary} disabled={busy||index===0} onClick={()=>move(index,-1)}>↑</button><button aria-label={`Sposta media ${index+1} dopo`} className={s.secondary} disabled={busy||index===media.length-1} onClick={()=>move(index,1)}>↓</button><button className={`${s.secondary} ${s.danger}`} disabled={busy} onClick={()=>{if(confirm('Rimuovere questo media dal contenuto?'))void mediaAction('DELETE',{media_id:m.id});}}>Rimuovi</button></div></article>)}</div>
      </>}
    </>}
  </main>;
}
