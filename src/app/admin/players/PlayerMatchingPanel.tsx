'use client';

import { FormEvent, useState } from 'react';
import { matchTypes, windows } from '@/lib/moviRequests';
import { moviLevels, playerProfileClubs } from '@/lib/playerProfile';
import { playerMatchingWeekdays, type PlayerMatchResult } from '@/lib/playerMatching';
import PlayerMatchResults from './PlayerMatchResults';
import s from './players.module.css';

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
    {results!==null&&<PlayerMatchResults results={results}/>}
  </section>;
}
