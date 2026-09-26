'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { matchTypes, windows } from '@/lib/moviRequests';
import { moviLevels, playerProfileClubs } from '@/lib/playerProfile';
import { playerMatchingWeekdays, type PlayerMatchResult } from '@/lib/playerMatching';
import s from './players.module.css';

const levelLabels:Record<string,string>={principiante:'Principiante',intermedio:'Intermedio',avanzato:'Avanzato'};
const lastMinuteLabel=(value:boolean|null)=>value===true?'Sì':value===false?'No':'Non indicato';

export default function PlayerMatchingPanel(){
  const [club,setClub]=useState<(typeof playerProfileClubs)[number]>('Manta');
  const [level,setLevel]=useState('3.5');
  const [weekday,setWeekday]=useState('5');
  const [timeWindow,setTimeWindow]=useState('evening');
  const [matchType,setMatchType]=useState('male');
  const [lastMinute,setLastMinute]=useState(false);
  const [results,setResults]=useState<PlayerMatchResult[]|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');

  async function search(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/players/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        club,target_level_numeric:Number(level),target_level_descriptive:null,weekday:Number(weekday),time_window:timeWindow,match_type:matchType,last_minute:lastMinute,exclude_player_id:null,
      })});
      const json=await response.json();
      if(!response.ok)throw Error(json.error);
      setResults(json.data);
    }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }

  return <section className={s.matchingPanel} aria-labelledby="matching-title">
    <div className={s.matchingIntro}><div><h2 id="matching-title">Trova giocatori compatibili</h2><p>Ricerca sportiva deterministica. I risultati sopra 50/100 restano una proposta: la scelta finale è dell’Admin.</p></div><span className={s.sportOnly}>Solo dati sportivi</span></div>
    <form className={s.matchingForm} onSubmit={search}>
      <label className={s.field}>Club<select value={club} onChange={event=>setClub(event.target.value as typeof club)}>{playerProfileClubs.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className={s.field}>Livello MOVI obiettivo<select value={level} onChange={event=>setLevel(event.target.value)}>{moviLevels.map(value=><option key={value} value={value}>{value.toFixed(1)}</option>)}</select></label>
      <label className={s.field}>Giorno<select value={weekday} onChange={event=>setWeekday(event.target.value)}>{playerMatchingWeekdays.map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></label>
      <label className={s.field}>Fascia oraria<select value={timeWindow} onChange={event=>setTimeWindow(event.target.value)}>{Object.entries(windows).filter(([key])=>key!=='any').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className={s.field}>Tipo partita<select value={matchType} onChange={event=>setMatchType(event.target.value)}>{Object.entries(matchTypes).filter(([key])=>key!=='any').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className={s.checkField}><input type="checkbox" checked={lastMinute} onChange={event=>setLastMinute(event.target.checked)}/><span>Ricerca last minute</span></label>
      <button className={s.primary} disabled={busy}>{busy?'Ricerca…':'Trova compatibili'}</button>
    </form>
    {error&&<div className={s.error} role="alert">{error}</div>}
    {results!==null&&<div className={s.matchMeta}>{results.length} candidati mostrati · soglia 50/100 · massimo 20</div>}
    {results?.length===0&&<div className={s.empty}>Nessun candidato supera la soglia con questi criteri.</div>}
    <div className={s.matchResults}>{results?.map(candidate=><article className={s.matchCard} key={candidate.id}>
      <div className={s.matchIdentity}><div><h3>{candidate.fullName}</h3><p>{candidate.normalizedPhone} · {candidate.accountState==='linked'?'Account collegato':'Senza account'}</p></div><strong className={s.score}>{candidate.score}/100</strong></div>
      {candidate.identityWarning&&<Link className={s.warningLink} href="/admin/users/duplicates">Identità da verificare</Link>}
      <div className={s.matchFacts}>
        <span><b>Livello</b>{candidate.moviLevel!==null?`MOVI ${candidate.moviLevel.toFixed(1)}`:candidate.descriptiveLevel?levelLabels[candidate.descriptiveLevel]:'Non indicato'}</span>
        <span><b>Club</b>{candidate.preferredClubs.length?candidate.preferredClubs.join(', '):'Nessuna restrizione'}</span>
        <span><b>Disponibilità</b>{candidate.availability.length?candidate.availability.slice(0,4).map(slot=>`${playerMatchingWeekdays[slot.weekday-1]} · ${windows[slot.time_window]}`).join('; '):'Non indicata'}</span>
        <span><b>Partita</b>{candidate.preferredMatchTypes.length?candidate.preferredMatchTypes.map(type=>matchTypes[type as keyof typeof matchTypes]).join(', '):'Non indicata'}</span>
        <span><b>Last minute</b>{lastMinuteLabel(candidate.availableLastMinute)}</span>
      </div>
      <details className={s.explanation}><summary>Come è calcolato il punteggio</summary><div className={s.scoreGrid}>
        <Score label="Livello" part={candidate.scoreParts.level}/><Score label="Disponibilità" part={candidate.scoreParts.availability}/><Score label="Club" part={candidate.scoreParts.club}/><Score label="Tipo partita" part={candidate.scoreParts.matchType}/><Score label="Last minute" part={candidate.scoreParts.lastMinute}/>
      </div></details>
      <Link className={s.openAction} href={`/admin/players/${candidate.id}`}>Apri giocatore</Link>
    </article>)}</div>
  </section>;
}

function Score({label,part}:{label:string;part:{score:number;max:number;detail:string}}){
  return <div><strong>{label}: {part.score}/{part.max}</strong><span>{part.detail}</span></div>;
}
