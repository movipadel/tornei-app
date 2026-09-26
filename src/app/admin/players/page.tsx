'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PlayerMatchingPanel from './PlayerMatchingPanel';
import s from './players.module.css';

type GameProfile = { score:number; total:5; status:'complete'|'partial'|'incomplete'; label:string; missing:string[] };
type Player = {
  id:string; full_name:string; normalized_phone:string; account_user_id:string|null; status:string;
  merged_into_player_id:string|null; descriptive_level:string|null; movi_level:number|null; movi_level_label:string|null;
  moviback_state:string; compliance_badge:string; identity_warning:boolean; game_profile:GameProfile;
};
const levels:Record<string,string>={principiante:'Principiante',intermedio:'Intermedio',avanzato:'Avanzato'};
const movibackLabels:Record<string,string>={none:'Assente',active:'Attivo',grace_period:'Tolleranza',standby:'Stand-by',pending_review:'In revisione',blocked:'Bloccato'};
const complianceLabels:Record<string,string>={none:'Assente',valid:'Valida',approved:'Approvata',expired_grace:'Tolleranza',expired:'Scaduta',pending_review:'Da verificare',rejected:'Rifiutata'};

export default function PlayersPage(){
  const [mode,setMode]=useState<'list'|'matching'>('list');
  const [q,setQ]=useState(''),[status,setStatus]=useState('active'),[account,setAccount]=useState('all'),[moviback,setMoviback]=useState('all'),[profile,setProfile]=useState('all');
  const [page,setPage]=useState(1),[items,setItems]=useState<Player[]>([]),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');

  useEffect(()=>{if(new URLSearchParams(window.location.search).get('mode')==='matching')setMode('matching');},[]);
  const load=useCallback(async(requestedPage=1)=>{
    setBusy(true);setError('');
    try{
      const params=new URLSearchParams({q:q.trim(),status,account,moviback,profile,page:String(requestedPage),limit:'50'});
      const response=await fetch(`/api/admin/players?${params}`,{cache:'no-store'});
      const json=await response.json();
      if(!response.ok)throw Error(json.error);
      setItems(json.data);setTotal(json.total);setHasMore(json.has_more);setPage(requestedPage);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  },[q,status,account,moviback,profile]);

  useEffect(()=>{void load(1);},[status,account,moviback,profile]); // eslint-disable-line react-hooks/exhaustive-deps
  function search(event?:FormEvent){event?.preventDefault();void load(1);}
  function reset(){setQ('');setStatus('active');setAccount('all');setMoviback('all');setProfile('all');}
  function incomplete(){setProfile('incomplete');}

  return <main className={s.page}>
    <header className={s.header}><div><h1>Customer Hub</h1><p className={s.muted}>Giocatori, account e stato MoviBack in un unico punto operativo.</p></div><Link className={s.secondary} href="/admin/users/duplicates">Duplicati e identità da verificare</Link></header>
    <div className={s.modeTabs} role="tablist" aria-label="Modalità Customer Hub"><button type="button" role="tab" aria-selected={mode==='list'} className={mode==='list'?s.modeActive:s.modeTab} onClick={()=>setMode('list')}>Elenco giocatori</button><button type="button" role="tab" aria-selected={mode==='matching'} className={mode==='matching'?s.modeActive:s.modeTab} onClick={()=>setMode('matching')}>Trova giocatori compatibili</button></div>
    {mode==='list'?<>
    <form className={s.search} onSubmit={search}>
      <label className={s.field}>Nome o telefono<input value={q} onChange={event=>setQ(event.target.value)} maxLength={100} placeholder="Cerca nome o telefono"/></label>
      <label className={s.field}>Stato<select value={status} onChange={event=>setStatus(event.target.value)}><option value="active">Attivi</option><option value="archived">Archiviati</option><option value="merged">Fusi</option><option value="all">Tutti</option></select></label>
      <label className={s.field}>Account<select value={account} onChange={event=>setAccount(event.target.value)}><option value="all">Tutti</option><option value="linked">Con account</option><option value="unlinked">Senza account</option></select></label>
      <label className={s.field}>MoviBack<select value={moviback} onChange={event=>setMoviback(event.target.value)}><option value="all">Tutti</option><option value="member">Con MoviBack</option><option value="active">Attivi</option><option value="grace_period">Tolleranza</option><option value="standby">Stand-by</option><option value="pending_review">In revisione</option><option value="none">Senza MoviBack</option></select></label>
      <label className={s.field}>Profilo gioco<select value={profile} onChange={event=>setProfile(event.target.value)}><option value="all">Tutti</option><option value="complete">Completi</option><option value="partial">Parziali</option><option value="incomplete">Da completare</option></select></label>
      <div className={s.filterActions}><button className={s.primary} disabled={busy}>{busy?'Caricamento…':'Applica'}</button><button className={s.secondary} type="button" disabled={busy} onClick={reset}>Azzera</button></div>
    </form>
    <div className={s.quickBar}><button type="button" className={profile==='incomplete'?s.quickActive:s.quick} onClick={incomplete}>Profilo di gioco incompleto</button><span>{total} giocatori · pagina {page}</span></div>
    {error&&<div className={s.error} role="alert">{error}</div>}
    {!busy&&!items.length&&!error&&<div className={s.empty}>Nessun giocatore trovato con questi filtri.</div>}
    {!!items.length&&<div className={s.tableWrap}><table className={s.table}>
      <thead><tr><th>Nome</th><th>Telefono</th><th>Account</th><th>Livello</th><th>MoviBack</th><th>Profilo gioco</th><th>Compliance</th><th>Azione</th></tr></thead>
      <tbody>{items.map(player=>{
        const href=`/admin/players/${player.status==='merged'&&player.merged_into_player_id?player.merged_into_player_id:player.id}`;
        return <tr key={player.id}>
          <td data-label="Nome"><strong>{player.full_name}</strong>{player.identity_warning&&<Link className={s.warningLink} href="/admin/users/duplicates">Identità da verificare</Link>}</td>
          <td data-label="Telefono">{player.normalized_phone}</td>
          <td data-label="Account"><span className={s.badge}>{player.account_user_id?'Collegato':'Assente'}</span></td>
          <td data-label="Livello">{player.movi_level!==null?`MOVI ${player.movi_level.toFixed(1)}`:player.descriptive_level?levels[player.descriptive_level]:'Da definire'}</td>
          <td data-label="MoviBack"><span className={`${s.badge} ${s[player.moviback_state]??''}`}>{movibackLabels[player.moviback_state]??player.moviback_state}</span></td>
          <td data-label="Profilo gioco"><span className={`${s.profileBadge} ${s[player.game_profile.status]}`}>{player.game_profile.label} · {player.game_profile.score}/5</span>{player.game_profile.missing.length>0&&<small className={s.missing}>Manca: {player.game_profile.missing.join(', ')}</small>}</td>
          <td data-label="Compliance"><span className={s.badge}>{complianceLabels[player.compliance_badge]??player.compliance_badge}</span></td>
          <td data-label="Azione"><Link className={s.openAction} href={href}>{player.status==='merged'?'Apri identità mantenuta':'Apri cliente'}</Link></td>
        </tr>;
      })}</tbody>
    </table></div>}
    <div className={s.pagination}><button className={s.secondary} disabled={busy||page<=1} onClick={()=>void load(page-1)}>Precedente</button><button className={s.secondary} disabled={busy||!hasMore} onClick={()=>void load(page+1)}>Successiva</button></div></>:<PlayerMatchingPanel/>}
  </main>;
}
