"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import s from "../../players.module.css";

type Hub = {
  account_user_id: string;
  can_manage_identity: boolean;
  account: { full_name: string; phone: string; email: string | null; identity_status: string; auth_access: { key: string; label: string } };
  membership: { id: string; status: string; membership_code: string; membership_type: string | null; approved_at: string | null } | null;
  membership_count: number;
  eligibility: { certificate_state: string; grace_days_remaining: number | null; eligibility_state: string; human_message: string | null } | null;
  certificate: { id: string; expiry_date: string | null; uploaded_at: string; reviewed_at: string | null; reviewed_by: string | null; status: string } | null;
  points_balance: number;
  transactions: { id: string; created_at: string; notes: string | null; type: string; points_delta: number }[];
  redemptions: { id: string; reward: { name: string } | null; status: string; points_cost: number }[];
};

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("it-IT") : "—";

export default function AccountOnlyCustomerDetail({ id }: { id: string }) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/admin/players/account/${id}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.status === 409 && json.player_identity_id) {
      window.location.replace(`/admin/players/${json.player_identity_id}`);
      return;
    }
    if (!response.ok) { setError(json.error ?? "Cliente non disponibile"); return; }
    setHub(json.data);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function resolveIdentity() {
    if (busy || !window.confirm("Vuoi avviare la verifica per creare o collegare l’identità giocatore di questo cliente?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/players/account/${id}`, { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Verifica non completata");
      if (json.data?.state === "linked" && json.data.player_id) {
        window.location.href = `/admin/players/${json.data.player_id}`;
        return;
      }
      setMessage("La corrispondenza richiede una verifica Admin. Il cliente non è stato collegato automaticamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verifica non completata");
    } finally { setBusy(false); }
  }

  async function previewCertificate() {
    if (!hub?.certificate?.id) return;
    const response = await fetch("/api/admin/moviback/certificate-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certificate_id: hub.certificate.id }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setError(json.error ?? "Certificato non disponibile"); return; }
    window.open(json.url, "_blank", "noopener,noreferrer");
  }

  const membership = hub?.membership;
  const eligibility = hub?.eligibility;
  return <main className={s.page}>
    <header className={s.header}><div><h1>{hub?.account.full_name ?? "Customer Hub"}</h1><p className={s.muted}>Account cliente e MoviBack, senza identità sportiva collegata.</p></div><Link className={s.secondary} href="/admin/players">Customer Hub</Link></header>
    {error && <div className={s.error} role="alert">{error}</div>}
    {message && <div className={s.warning} role="status">{message} <Link href="/admin/users/duplicates">Apri la coda verifiche</Link>.</div>}
    {hub ? <>
      <section className={s.summary} aria-label="Riepilogo cliente"><Info label="Identità giocatore" value="Non collegata"/><Info label="Account" value="Attivo"/><Info label="Nuovo accesso" value={hub.account.auth_access.label.replace("Nuovo accesso: ", "")}/><Info label="MoviBack" value={membership ? eligibility?.eligibility_state ?? membership.status : "Assente"}/><Info label="Compliance" value={membership ? eligibility?.certificate_state ?? "Da verificare" : "Assente"}/></section>
      <div className={s.warning}><strong>Identità giocatore non collegata.</strong> I dati cliente e MoviBack sono disponibili; livello e profilo di gioco non esistono ancora.</div>
      <section className={s.section}><h2>1 · Account cliente</h2><div className={s.form}><Info label="Nome" value={hub.account.full_name}/><Info label="Telefono" value={hub.account.phone}/><Info label="Email · sola lettura" value={hub.account.email ?? "—"}/><Info label="Stato account" value={hub.account.identity_status}/><Info label="Nuovo accesso" value={hub.account.auth_access.label.replace("Nuovo accesso: ", "")}/></div></section>
      <section className={s.section}><h2>2 · Identità giocatore</h2><div className={s.empty}>Nessun livello o profilo di gioco disponibile finché un Admin non crea o collega esplicitamente l’identità sportiva.</div>{hub.can_manage_identity ? <div className={s.actions}><button className={s.primary} disabled={busy} onClick={() => void resolveIdentity()}>{busy ? "Verifica…" : "Crea o collega identità giocatore"}</button><Link className={s.secondary} href="/admin/users/duplicates">Gestisci verifiche identità</Link></div> : <p className={s.muted}>Solo un Admin può creare o collegare l’identità giocatore.</p>}</section>
      <section className={s.section}><h2>3 · MoviBack e compliance</h2>{membership ? <><div className={s.form}><Info label="Membership" value={membership.status}/><Info label="Codice tessera" value={membership.membership_code}/><Info label="Tipo" value={membership.membership_type ?? "—"}/><Info label="Saldo" value={`${hub.points_balance} punti`}/><Info label="Attivazione" value={date(membership.approved_at)}/><Info label="Certificato" value={eligibility?.certificate_state ?? "—"}/><Info label="Scadenza" value={date(hub.certificate?.expiry_date)}/><Info label="Caricato il" value={date(hub.certificate?.uploaded_at)}/></div>{eligibility?.human_message ? <div className={eligibility.eligibility_state === "standby" ? s.warning : s.success}>{eligibility.human_message}</div> : null}<div className={s.actions}>{hub.certificate ? <button className={s.secondary} onClick={() => void previewCertificate()}>Anteprima certificato</button> : null}<Link className={s.secondary} href={`/admin/moviback/users/${membership.id}`}>Apri gestione MoviBack</Link></div><h3>Movimenti recenti</h3><div className={s.compactList}>{hub.transactions.length ? hub.transactions.map((tx) => <div key={tx.id} className={s.row}><span>{date(tx.created_at)} · {tx.notes || tx.type}</span><strong>{Number(tx.points_delta) > 0 ? "+" : ""}{tx.points_delta} pt</strong></div>) : <span className={s.muted}>Nessun movimento.</span>}</div><h3>Riscatti recenti</h3><div className={s.compactList}>{hub.redemptions.length ? hub.redemptions.map((item) => <div key={item.id} className={s.row}><span>{item.reward?.name ?? "Premio"} · {item.status}</span><strong>{item.points_cost} pt</strong></div>) : <span className={s.muted}>Nessun riscatto.</span>}</div></> : <div className={s.empty}>Nessuna membership MoviBack collegata.</div>}</section>
    </> : null}
  </main>;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className={s.readonly}><span>{label}</span><strong>{String(value ?? "—")}</strong></div>;
}
