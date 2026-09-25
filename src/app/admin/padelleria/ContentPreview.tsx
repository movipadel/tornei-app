'use client';
/* eslint-disable @next/next/no-img-element -- Existing admin media pattern; signed URLs expire. */
import { useState } from 'react';
import { type ContentItem, visible, videoEmbed } from '@/lib/padelleria';
import s from './padelleria.module.css';
export function formatRome(value:string|null){return value?new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';}
export function visibilityLabel(item:ContentItem){
  if(item.status==='draft')return 'Bozza · non visibile al pubblico';
  if(item.kind==='e_successo')return 'Archivio pubblicato · nessuna scadenza';
  return `${visible(item)?'Visibile ora':'Fuori finestra di visibilità'} · dal ${item.visible_from?formatRome(item.visible_from):'subito'} · ${item.visible_until?`fino al ${formatRome(item.visible_until)}`:'nessuna scadenza'}`;
}
function Video({url,title}:{url:string;title:string}){
  const [play,setPlay]=useState(false);
  return <div>{play?<iframe className={s.video} src={videoEmbed(url)} title={title||'Video editoriale'} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" className={s.secondary} onClick={()=>setPlay(true)}>Carica video esterno</button>} <a className={s.link} href={url} target="_blank" rel="noopener noreferrer">Apri video</a></div>;
}
export default function ContentPreview({item}:{item:ContentItem}){
  const cover=item.media.find(m=>m.role==='cover');
  return <article className={s.preview}>
    {cover?.url?<img className={s.cover} src={cover.url} alt={cover.caption||item.title}/>:<div className={s.card}>Copertina non presente</div>}
    <div className={s.previewBody}>
      <span className={s.badge}>{item.kind==='succede'?'Succede in Padelleria':'È successo in Padelleria'}</span>
      {item.featured&&<span className={s.badge}>In evidenza</span>}
      <p className={s.muted}>{visibilityLabel(item)} · Europe/Rome</p>
      <h1>{item.title}</h1><p>{item.excerpt}</p>
      {item.occurred_at&&<p className={s.muted}>Data evento: {formatRome(item.occurred_at)}</p>}
      <div className={s.body}>{item.body}</div>
      <div className={s.grid} style={{marginTop:24}}>{item.media.filter(m=>m.role!=='cover').map(m=><figure key={m.id} style={{margin:0}}>
        {m.media_type==='image'?(m.url?<img className={s.cover} src={m.url} alt={m.caption||'Immagine della gallery'} loading="lazy"/>:<p>Immagine non disponibile</p>):m.external_url?<Video url={m.external_url} title={m.caption}/>:null}
        {m.caption&&<figcaption className={s.muted}>{m.caption}</figcaption>}
      </figure>)}</div>
      {item.cta_url&&<a className={s.button} style={{marginTop:24}} href={item.cta_url} target="_blank" rel="noopener noreferrer">{item.cta_label}</a>}
    </div>
  </article>;
}
