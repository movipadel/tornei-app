"use client";

import { useEffect, useState } from "react";
import { Loader2, Split } from "lucide-react";
import { toast } from "sonner";
import LeagueAdminNav from "../_components/LeagueAdminNav";

type Standing = { position: number; team_id: string; team_name: string; points: number; set_difference: number; game_difference: number };
type Readiness = { ready: boolean; already_generated: boolean; fingerprint: string; total_teams: number; total_matches: number; terminal_matches: number; blocking_matches: Array<{ match_id: string; home_team: string; away_team: string; reason: string }>; standings: Standing[]; serie_a: Standing[]; serie_b: Standing[] };
type Payload = { season: null | { id: string; name: string; status: string }; readiness: Readiness | null };

export default function Phase2Page() {
  const [data,setData]=useState<Payload|null>(null); const [loading,setLoading]=useState(true); const [generating,setGenerating]=useState(false);
  async function load(){setLoading(true);const r=await fetch("/api/admin/monday-league/phase2",{cache:"no-store"});const j=await r.json();if(!r.ok)toast.error(j.error);else setData(j.data);setLoading(false);}
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[]);
  async function generate(){if(!data?.readiness||!window.confirm("Generare definitivamente Serie A e Serie B dalla classifica mostrata? La divisione resterà congelata."))return;setGenerating(true);const r=await fetch("/api/admin/monday-league/phase2",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expected_fingerprint:data.readiness.fingerprint})});const j=await r.json();if(!r.ok)toast.error(j.error||"Generazione non riuscita");else{toast.success(j.replayed?"Fase 2 già generata":"Serie A e Serie B generate");await load();}setGenerating(false);}
  if(loading)return <Loader2 className="animate-spin"/>;
  const ready=data?.readiness;
  return <main style={layout}><h1 style={{margin:0}}>Fase 2 · Serie A / Serie B</h1><LeagueAdminNav/>{!ready?<section style={panel}>Crea e genera prima la Fase 1.</section>:<>
    <section style={{...panel,borderColor:ready.ready?"#14b8a6":"#f59e0b"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Split/><strong>{ready.ready?"Fase 1 pronta per la divisione":"Fase 1 non ancora conclusa"}</strong></div><p style={muted}>{ready.terminal_matches} partite terminali su {ready.total_matches} · {ready.total_teams} squadre</p>{ready.blocking_matches.length?<div style={{display:"grid",gap:8}}>{ready.blocking_matches.map(b=><div key={b.match_id} style={block}><strong>{b.home_team} – {b.away_team}</strong><span>{b.reason}</span></div>)}</div>:null}</section>
    <section style={panel}><h2>Classifica finale Fase 1</h2><Division rows={ready.standings}/></section>
    <div style={columns}><section style={panel}><h2>SERIE A · {ready.serie_a.length}</h2><Division rows={ready.serie_a}/></section><section style={panel}><h2>SERIE B · {ready.serie_b.length}</h2><Division rows={ready.serie_b}/></section></div>
    {ready.already_generated?<section style={panel}><strong>Fase 2 generata</strong><p style={muted}>La composizione è congelata. Usa Calendario e Classifica selezionando Serie A o Serie B.</p><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><a href="/admin/monday-league/calendario">Calendari</a><a href="/admin/monday-league/classifica">Classifiche</a><a href="/monday-league">Vista pubblica</a></div></section>:<button style={button} disabled={!ready.ready||generating} onClick={()=>void generate()}>{generating?"Generazione…":"Genera Serie A e Serie B"}</button>}
  </>}</main>;
}
function Division({rows}:{rows:Standing[]}){return <div style={{display:"grid",gap:7}}>{rows.map(r=><div key={r.team_id} style={row}><strong>{r.position}. {r.team_name}</strong><span>{r.points} pt · set {r.set_difference} · game {r.game_difference}</span></div>)}</div>}
const layout:React.CSSProperties={display:"grid",gap:18,color:"#0f172a"};const panel:React.CSSProperties={padding:20,borderRadius:18,background:"white",border:"1px solid #e2e8f0"};const muted:React.CSSProperties={color:"#64748b"};const columns:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16};const row:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:12,padding:10,borderRadius:10,background:"#f8fafc"};const block:React.CSSProperties={...row,background:"#fffbeb",color:"#92400e"};const button:React.CSSProperties={padding:"13px 18px",border:0,borderRadius:12,background:"#14b8a6",fontWeight:900,cursor:"pointer"};
