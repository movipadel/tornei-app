"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "../agreements.module.css";

type Agreement = { id:string; name:string; slug:string; status:string; multiplier:number; valid_from:string; valid_until:string|null };
type CodeRow = { id:string; code_suffix:string; batch_id:string|null; status:string; created_at:string };
type EntitlementRow = { id:string; membership_id:string; status:string; activation_source:string };
type AuditRow = { id:string; event_type:string; created_at:string; reason:string|null };
type Data = { agreement:Agreement; codes:CodeRow[]; entitlements:EntitlementRow[]; audit_events:AuditRow[] };
type Metrics = Record<string,number>;
type ReportBatch = Metrics & { id:string; generated_at:string; generated_by:string|null; quantity:number };
type ReportMember = Metrics & { entitlement_id:string; membership_id:string; member_name:string; status:string; activation_source:string; code_suffix:string|null; created_at:string; activated_at:string|null; effective_from:string|null; effective_until:string|null; revoked_at:string|null; revocation_reason:string|null; not_activation_reason:string|null };
type PointActivity = { transaction_id:string; membership_id:string; member_name:string; created_at:string; club:string|null; euro_amount:number|null; base_points:number; applied_multiplier:number; credited_points:number; bonus_points:number; entitlement_id:string; earning_rule_version:string; source_event_type:string; source_event_id:string };
type Report = { codes:Metrics; entitlements:Metrics; memberships:Metrics; points:Metrics; batches:ReportBatch[]; membership_history:ReportMember[]; point_activity:PointActivity[] };

const date=(value:string|null|undefined,withTime=false)=>value?new Date(value).toLocaleString("it-IT",withTime?{dateStyle:"short",timeStyle:"short"}:{dateStyle:"short"}):"—";
const csvCell=(value:string)=>{const safe=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;return `"${safe.replaceAll('"','""')}"`;};

function Kpis({values}:{values:Array<[string,number]>}) {
  return <div className={styles.kpiGrid}>{values.map(([label,value])=><div className={styles.kpi} key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

export default function AgreementDetail({params}:{params:Promise<{id:string}>}) {
  const [id,setId]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [generatedBatch,setGeneratedBatch]=useState<{batchId:string;codes:string[]}|null>(null);
  const [quantity,setQuantity]=useState("10");
  const [membership,setMembership]=useState("");
  const [reason,setReason]=useState("");
  const key=useRef<string|null>(null);

  useEffect(()=>{params.then(value=>setId(value.id));},[params]);
  const load=useCallback(async()=>{
    if(!id)return;
    const [detailResponse,reportResponse]=await Promise.all([
      fetch(`/api/admin/moviback/agreements/${id}`,{cache:"no-store"}),
      fetch(`/api/admin/moviback/agreements/${id}/report`,{cache:"no-store"}),
    ]);
    const [detailJson,reportJson]=await Promise.all([detailResponse.json(),reportResponse.json()]);
    if(!detailResponse.ok)throw Error(detailJson.error);
    if(!reportResponse.ok)throw Error(reportJson.error);
    setData(detailJson.data); setReport(reportJson.data);
  },[id]);
  useEffect(()=>{load().catch(cause=>setError(cause.message));},[load]);
  const form=useMemo(()=>data?.agreement??null,[data]);

  async function mutate(url:string,body:Record<string,unknown>,success:string){setBusy(true);setError("");try{const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const json=await response.json();if(!response.ok)throw Error(json.error);setMessage(success);await load();return json;}catch(cause){setError((cause as Error).message);return null;}finally{setBusy(false);}}
  async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!form)return;setBusy(true);const values=new FormData(event.currentTarget);try{const response=await fetch(`/api/admin/moviback/agreements/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:values.get("name"),slug:values.get("slug"),status:values.get("status"),multiplier:Number(values.get("multiplier")),valid_from:new Date(String(values.get("valid_from"))).toISOString(),valid_until:values.get("valid_until")?new Date(String(values.get("valid_until"))).toISOString():null})});const json=await response.json();if(!response.ok)throw Error(json.error);setMessage("Convenzione aggiornata. Le modifiche valgono solo per accrediti futuri.");await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  async function generate(){if(!key.current)key.current=crypto.randomUUID();const json=await mutate(`/api/admin/moviback/agreements/${id}/codes/generate`,{quantity:Number(quantity),idempotency_key:key.current},"Batch creato.");if(json?.data?.created){setGeneratedBatch({batchId:json.data.batch_id,codes:json.data.codes});key.current=null;}else if(json)setMessage(json.warning);}
  function downloadCsv(){if(!generatedBatch||!form)return;const rows=["agreement,batch_reference,code",...generatedBatch.codes.map(code=>[form.name,generatedBatch.batchId,code].map(csvCell).join(","))];const url=URL.createObjectURL(new Blob([rows.join("\r\n")],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`codici-${form.slug}.csv`;link.click();URL.revokeObjectURL(url);}

  if(!data||!form||!report)return <main className={styles.page}><div className={styles.inner}>{error||"Caricamento…"}</div></main>;
  return <main className={styles.page}><div className={`${styles.inner} ${styles.stack}`}>
    <header className={styles.header}><div><h1>{form.name}</h1><p className={styles.muted}>Dettaglio operativo e reporting della convenzione</p></div><Link className={styles.secondary} href="/admin/moviback/agreements">Tutte le convenzioni</Link></header>
    {error&&<div className={styles.error} role="alert">{error}</div>}{message&&<div className={styles.notice} role="status">{message}</div>}
    <section className={styles.panel} aria-labelledby="report-title"><div className={styles.header}><div><h2 id="report-title">Reporting</h2><p className={styles.muted}>Dati calcolati dalle tabelle autorevoli, senza contatori duplicati.</p></div></div>
      <h3>Utilizzo codici</h3><Kpis values={[["Generati",report.codes.total],["Disponibili",report.codes.available],["Riservati",report.codes.reserved],["Acquisiti",report.codes.claimed],["Usati",report.codes.used],["Chiusi",report.codes.closed],["Revocati",report.codes.revoked],["Scaduti",report.codes.expired]]}/>
      <h3>Membership</h3><Kpis values={[["Coinvolte",report.memberships.unique_involved],["Attive (stato)",report.entitlements.active],["Attive ora",report.memberships.currently_active],["Attivazioni",report.memberships.activations],["Pending",report.entitlements.pending],["Programmate",report.entitlements.scheduled],["Non attivate",report.entitlements.not_activated],["Revocate",report.entitlements.revoked],["Scadute",report.entitlements.expired],["Assegnazioni Admin",report.memberships.admin_assignments],["Attivazioni con codice",report.memberships.code_activations]]}/>
      <h3>Punti</h3><Kpis values={[["Accrediti con convenzione",report.points.earn_transactions],["Punti base",report.points.base_points],["Punti accreditati",report.points.credited_points],["Bonus convenzione",report.points.bonus_points],["Righe legacy non classificate",report.points.legacy_unclassified_rows]]}/>
      <p className={styles.muted}>Il bonus convenzione è punti accreditati − punti base solo quando la convenzione è l’incentivo vincente. I punti base includono già l’eventuale fattore FITP.</p>
    </section>
    {generatedBatch&&<section className={styles.panel} aria-live="polite"><h2>Batch creato · {generatedBatch.codes.length} codici</h2><p className={styles.muted}>Riferimento batch: {generatedBatch.batchId}</p><div className={styles.notice}>Salva ora questi codici. Per sicurezza non potranno essere visualizzati di nuovo.</div><div className={styles.codes}>{generatedBatch.codes.map(code=><div className={styles.code} key={code}>{code}</div>)}</div><div className={styles.actions}><button className={styles.primary} onClick={downloadCsv}>Scarica CSV</button><button className={styles.secondary} onClick={()=>navigator.clipboard.writeText(generatedBatch.codes.join("\n"))}>Copia codici</button><button className={styles.secondary} onClick={()=>setGeneratedBatch(null)}>Ho salvato · Chiudi</button></div></section>}
    <div className={styles.twoCol}>
      <section className={styles.panel}><h2>Accordo</h2><form className={styles.form} onSubmit={save}><label className={styles.field}>Nome<input name="name" defaultValue={form.name}/></label><label className={styles.field}>Slug<input name="slug" defaultValue={form.slug}/></label><label className={styles.field}>Moltiplicatore<input name="multiplier" type="number" step="0.01" min="0.01" defaultValue={form.multiplier}/></label><label className={styles.field}>Stato<select name="status" defaultValue={form.status}>{["draft","active","suspended","expired","revoked"].map(value=><option key={value}>{value}</option>)}</select></label><label className={styles.field}>Valida dal<input name="valid_from" type="datetime-local" defaultValue={new Date(form.valid_from).toISOString().slice(0,16)}/></label><label className={styles.field}>Valida fino al<input name="valid_until" type="datetime-local" defaultValue={form.valid_until?new Date(form.valid_until).toISOString().slice(0,16):""}/></label><button className={styles.primary} disabled={busy}>Salva modifiche</button></form></section>
      <section className={styles.panel}><h2>Genera codici</h2><p className={styles.muted}>Da 1 a 500 codici crittograficamente casuali. Il testo completo compare una sola volta.</p><div className={styles.form}><label className={styles.field}>Quantità<input type="number" min="1" max="500" value={quantity} onChange={event=>{setQuantity(event.target.value);key.current=null;}}/></label><button className={styles.primary} disabled={busy} onClick={generate}>Genera batch</button></div></section>
    </div>
    <section className={styles.panel}><h2>Batch</h2><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Riferimento</th><th>Generato</th><th>Generato da</th><th>Totale</th><th>Disponibili</th><th>Riservati</th><th>Usati</th><th>Chiusi</th><th>Revocati</th><th>Scaduti</th></tr></thead><tbody>{report.batches.map(batch=><tr key={batch.id}><td><code>{batch.id.slice(0,8)}</code></td><td>{date(batch.generated_at,true)}</td><td><code>{batch.generated_by?.slice(0,8)??"—"}</code></td><td>{batch.total}</td><td>{batch.available}</td><td>{batch.reserved}</td><td>{batch.used}</td><td>{batch.closed}</td><td>{batch.revoked}</td><td>{batch.expired}</td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><h2>Assegnazione manuale</h2><div className={styles.form}><label className={styles.field}>ID membership approvata<input value={membership} onChange={event=>setMembership(event.target.value)}/></label><button className={styles.primary} disabled={busy||!membership} onClick={()=>mutate(`/api/admin/moviback/agreements/${id}/assign`,{membership_id:membership},"Convenzione assegnata.")}>Assegna convenzione</button></div></section>
    <section className={styles.panel}><h2>Codici sicuri</h2><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Suffisso</th><th>Stato</th><th>Batch</th><th>Creato</th><th>Azione</th></tr></thead><tbody>{data.codes.map(code=><tr key={code.id}><td>••••{code.code_suffix}</td><td>{code.status}</td><td>{code.batch_id?.slice(0,8)??"—"}</td><td>{date(code.created_at)}</td><td>{["available","reserved"].includes(code.status)&&<button className={styles.danger} onClick={async()=>{const why=window.prompt("Motivo obbligatorio della revoca");if(why)await mutate(`/api/admin/moviback/agreements/${id}/codes/${code.id}/revoke`,{reason:why},"Codice revocato.");}}>Revoca</button>}</td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><h2>Storico membership</h2><label className={styles.field}>Motivo revoca<input value={reason} onChange={event=>setReason(event.target.value)}/></label><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Persona</th><th>Stato</th><th>Origine</th><th>Codice</th><th>Creata</th><th>Attivata</th><th>Decorrenza</th><th>Termine</th><th>Impatto punti</th><th>Azione</th></tr></thead><tbody>{report.membership_history.map(item=><tr key={item.entitlement_id}><td>{item.member_name}<br/><code>{item.membership_id.slice(0,8)}</code></td><td>{item.status}{item.not_activation_reason?<small className={styles.cellNote}>{item.not_activation_reason}</small>:null}{item.revocation_reason?<small className={styles.cellNote}>{item.revocation_reason}</small>:null}</td><td>{item.activation_source}</td><td>{item.code_suffix?`••••${item.code_suffix}`:"—"}</td><td>{date(item.created_at)}</td><td>{date(item.activated_at)}</td><td>{date(item.effective_from)}</td><td>{date(item.effective_until)}</td><td>{item.earn_count} accrediti · +{item.bonus_points} bonus</td><td>{["active","scheduled"].includes(item.status)&&<button className={styles.danger} disabled={!reason.trim()} onClick={()=>mutate(`/api/admin/moviback/entitlements/${item.entitlement_id}/revoke`,{reason},"Entitlement revocato.")}>Revoca</button>}</td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><h2>Accrediti attribuiti alla convenzione</h2><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Data</th><th>Membership</th><th>Club</th><th>Euro</th><th>Base</th><th>Moltiplicatore</th><th>Accreditati</th><th>Bonus</th><th>Regola / evento</th></tr></thead><tbody>{report.point_activity.map(item=><tr key={item.transaction_id}><td>{date(item.created_at,true)}</td><td>{item.member_name}<br/><code>{item.membership_id.slice(0,8)}</code></td><td>{item.club??"—"}</td><td>{item.euro_amount??"—"}</td><td>{item.base_points}</td><td>x{item.applied_multiplier}</td><td>{item.credited_points}</td><td>+{item.bonus_points}</td><td>{item.earning_rule_version}<small className={styles.cellNote}>{item.source_event_type} · {item.source_event_id}</small></td></tr>)}</tbody></table></div></section>
    <section className={styles.panel}><h2>Audit recente</h2><div className={styles.stack}>{data.audit_events.map(event=><div className={styles.row} key={event.id}><strong>{event.event_type}</strong><span>{date(event.created_at,true)}{event.reason?` · ${event.reason}`:""}</span></div>)}</div></section>
  </div></main>;
}
