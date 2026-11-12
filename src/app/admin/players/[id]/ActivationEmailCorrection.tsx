"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import s from "../players.module.css";

export type ActivationRepairView = {
  current_email: string | null;
  auth_migration_state: string;
  auth_linked: boolean;
  open_access_requests: number;
  repair: {
    state: "eligible" | "prepared" | "completed" | "active" | "blocked";
    reason?: string;
    operation_id?: string;
    new_email?: string;
  };
};

export default function ActivationEmailCorrection({
  playerId, access, busy, onCompleted,
}: {
  playerId: string;
  access: ActivationRepairView;
  busy: boolean;
  onCompleted: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);
  const pending = access.repair.state === "prepared";
  const eligible = access.repair.state === "eligible";

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) setOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, submitting]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/players/${playerId}/activation-email-correction`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: pending ? access.repair.operation_id : crypto.randomUUID(),
          resume: pending, new_email: pending ? undefined : newEmail,
          reason: pending ? undefined : reason, confirmed: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.state !== "completed") throw new Error(data.error ?? "Correzione non completata");
      setOpen(false);
      setNewEmail("");
      setReason("");
      setConfirmed(false);
      await onCompleted("Email corretta. L'attivazione può essere riavviata.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Correzione non completata");
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {access.repair.state === "active"
      ? <p className={s.muted}>Modifica email non disponibile da questo flusso.</p>
      : access.repair.state === "completed"
        ? <div className={s.info} role="status"><strong>Email corretta. L’attivazione può essere riavviata.</strong>
          <p>Chiedi al cliente di usare “Crea la tua password MOVI” nella normale pagina di attivazione.</p>
          <Link className={s.secondary} href="/attiva-account">Avvia nuova attivazione</Link></div>
        : eligible || pending
          ? <div className={s.repairPanel}>
              <strong>{pending ? "Correzione in corso" : "Attivazione non completata"}</strong>
              <p>{pending ? "Riprendi la correzione sospesa. Il vecchio accesso resta bloccato fino alla finalizzazione."
                : "L’attivazione del nuovo accesso non è stata completata. L’indirizzo attuale non è automaticamente considerato errato."}</p>
              <p><b>Email attuale:</b> {access.current_email ?? "—"}</p>
              <p><b>Stato:</b> {pending ? "Riparazione da completare" : "Email non verificata"}</p>
              {pending && <p><b>Nuova email richiesta:</b> {access.repair.new_email}</p>}
              <button type="button" className={s.primary} disabled={busy || submitting} onClick={() => { setError(""); setOpen(true); }}>
                {pending ? "Riprendi correzione" : "Correggi email e riavvia attivazione"}
              </button>
            </div>
          : access.auth_migration_state === "legacy"
            ? <p className={s.muted}>Nuovo accesso da completare. Il cliente può creare la propria password MOVI.</p>
            : <p className={s.muted}>Correzione email non disponibile in questo stato. Verifica il caso prima di intervenire.</p>}
    {access.open_access_requests > 0 && <p className={s.muted}>
      {access.open_access_requests} richiesta/e di assistenza aperta/e. <Link href="/admin/users/access-problems">Apri problemi di accesso</Link>.
      La correzione non chiude automaticamente queste richieste.
    </p>}
    {open && <div className={s.repairBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setOpen(false); }}>
      <div className={s.repairDialog} role="dialog" aria-modal="true" aria-labelledby="repair-title">
        <h2 id="repair-title">{pending ? "Riprendi correzione email" : "Correggi email e riavvia attivazione"}</h2>
        <p>Questa operazione annulla l’attivazione incompleta corrente. La password scelta in precedenza non sarà più valida e il cliente dovrà crearne una nuova.</p>
        <form onSubmit={(event) => void submit(event)} className={s.repairForm}>
          <label className={s.field}>Email attuale<input value={access.current_email ?? ""} readOnly /></label>
          {pending
            ? <label className={s.field}>Nuova email<input ref={firstField} value={access.repair.new_email ?? ""} readOnly /></label>
            : <>
              <label className={s.field}>Nuova email<input ref={firstField} type="email" required maxLength={254}
                value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
              <label className={s.field}>Motivo della correzione<textarea required minLength={8} maxLength={1000}
                value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            </>}
          <p className={s.muted}>Usa soltanto un indirizzo verificato direttamente con il cliente.</p>
          <label className={s.repairConfirm}><input type="checkbox" checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)} />
            Confermo l’indirizzo e l’annullamento dell’attivazione incompleta.</label>
          {error && <p className={s.error} role="alert">{error}</p>}
          <div className={s.repairActions}>
            <button type="button" className={s.secondary} disabled={submitting} onClick={() => setOpen(false)}>Annulla</button>
            <button type="submit" className={s.primary} disabled={!confirmed || submitting}>
              {submitting ? "Correzione in corso…" : "Conferma correzione"}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}
