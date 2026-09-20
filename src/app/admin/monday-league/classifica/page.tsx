"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import LeagueAdminNav from "../_components/LeagueAdminNav";

type Row = { position: number; team_id: string; team_name: string; points: number; played: number; wins: number; losses: number; sets_won: number; sets_lost: number; set_difference: number; games_won: number; games_lost: number; game_difference: number; tie_break_order: number };

export default function LeagueStandingsPage() {
  const [rows, setRows] = useState<Row[]>([]); const [provisional, setProvisional] = useState(false); const [loading, setLoading] = useState(true); const [phaseId,setPhaseId]=useState(""); const [phases,setPhases]=useState<Array<{id:string;name:string}>>([]);
  async function load(selected=""){setLoading(true);const response=await fetch(`/api/admin/monday-league/standings${selected?`?phase_id=${selected}`:""}`,{cache:"no-store"});const json=await response.json();if(response.ok&&json.data){setRows(json.data.rows??[]);setProvisional(Boolean(json.data.has_provisional_results));setPhases(json.data.phases??[]);setPhaseId(json.data.phase.id);}setLoading(false);}
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  if (loading) return <Loader2 className="animate-spin" />;
  return <main style={{ display: "grid", gap: 18, color: "#0f172a" }}><h1 style={{ margin: 0 }}>Classifica Monday League</h1><LeagueAdminNav /><label>Fase<select style={{display:"block",padding:9,marginTop:5}} value={phaseId} onChange={(event)=>void load(event.target.value)}>{phases.map((phase)=><option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>{provisional && <div style={notice}>Classifica provvisoria: include risultati non ancora confermati.</div>}<section style={panel}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Pos</th><th>Team</th><th>PT</th><th>PG</th><th>V</th><th>S</th><th>Set +/-</th><th>Diff Set</th><th>Game +/-</th><th>Diff Game</th><th title="Tie-break persistente">TB</th></tr></thead><tbody>{rows.map((row) => <tr key={row.team_id}><td>{row.position}</td><td><strong>{row.team_name}</strong></td><td><strong>{row.points}</strong></td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.sets_won}–{row.sets_lost}</td><td>{signed(row.set_difference)}</td><td>{row.games_won}–{row.games_lost}</td><td>{signed(row.game_difference)}</td><td>{row.tie_break_order}</td></tr>)}</tbody></table></div></section></main>;
}
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
const panel: React.CSSProperties = { padding: 18, borderRadius: 18, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.06)" }; const notice: React.CSSProperties = { ...panel, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a" };
