'use client';
/* eslint-disable @next/next/no-img-element -- Admin preview uses signed storage URLs. */
import { partnerVisible, membershipCopy, type Partner } from '@/lib/partners';
import s from '../padelleria/padelleria.module.css';
const date=(v:string)=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'medium',timeStyle:'medium'}).format(new Date(v));
export function validityLabel(p:Partner){return `${p.status==='draft'?'Bozza':p.status==='inactive'?'Inattivo':partnerVisible(p)?'Visibile ora':'Fuori validità'} · ${p.valid_from?`dal ${date(p.valid_from)}`:'da subito'} · ${p.valid_until?`fino al ${date(p.valid_until)}`:'nessuna scadenza'} · Europe/Rome`;}
export default function PartnerPreview({item:p}:{item:Partner}){return <article className={s.card} style={{maxWidth:850,margin:'0 auto'}}>
 {p.cover_url&&<img src={p.cover_url} alt={`Copertina ${p.name}`} style={{width:'100%',maxHeight:420,objectFit:'cover',borderRadius:12}}/>}
 {p.logo_url&&<img src={p.logo_url} alt={`Logo ${p.name}`} style={{width:100,height:100,objectFit:'contain',marginTop:16}}/>}
 <p className={s.badge}>{p.category}</p><h2>{p.name}</h2><p>{p.short_description}</p>
 <div className={s.success}><h3>{p.benefit_title}</h3><p style={{whiteSpace:'pre-wrap'}}>{p.benefit_description}</p><strong>{membershipCopy}</strong></div>
 <p style={{whiteSpace:'pre-wrap'}}>{p.full_description}</p>{p.conditions&&<><h3>Condizioni</h3><p style={{whiteSpace:'pre-wrap'}}>{p.conditions}</p></>}
 <p className={s.muted}>{validityLabel(p)}</p><p>{[p.address,p.locality].filter(Boolean).join(' · ')}</p>
 <div className={s.actions}>{p.website_url&&<a className={s.secondary} href={p.website_url} target="_blank" rel="noopener noreferrer">Sito web</a>}{p.contact_url&&<a className={s.secondary} href={p.contact_url} target="_blank" rel="noopener noreferrer">Contatta</a>}{p.phone&&<a className={s.secondary} href={`tel:${p.phone.replace(/[^+0-9]/g,'')}`}>{p.phone}</a>}</div>
 </article>;}
