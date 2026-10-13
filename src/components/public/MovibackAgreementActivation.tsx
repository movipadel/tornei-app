"use client";

import { useState } from "react";
import { BadgeCheck, Building2, Loader2 } from "lucide-react";

import styles from "./MovibackAgreementActivation.module.css";

export type PublicMovibackAgreement = {
  entitlement_id: string;
  name: string;
  multiplier: number;
  status: string;
  effective_from: string;
  effective_until: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function MovibackAgreementActivation({
  agreement,
  enabled,
  onActivated,
}: {
  agreement: PublicMovibackAgreement | null;
  enabled: boolean;
  onActivated: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  if (!enabled) return null;

  if (agreement) {
    const from = dateLabel(agreement.effective_from);
    const until = dateLabel(agreement.effective_until);
    return (
      <section className={styles.card} aria-labelledby="active-agreement-title">
        <div className={styles.icon} aria-hidden="true"><BadgeCheck /></div>
        <div className={styles.content}>
          <div className={styles.eyebrow}>Convenzione attiva</div>
          <h2 id="active-agreement-title" className={styles.title}>{agreement.name}</h2>
          <div className={styles.multiplier}>MoviBack ×{agreement.multiplier}</div>
          {from ? (
            <div className={styles.dates}>
              Attiva dal {from}{until ? ` al ${until}` : ""}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/moviback/agreements/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Attivazione convenzione non riuscita."));
      setMessage({ kind: "success", text: "Convenzione attivata." });
      setCode("");
      await onActivated();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Attivazione convenzione non riuscita.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="agreement-activation-title">
      <div className={styles.icon} aria-hidden="true"><Building2 /></div>
      <div className={styles.content}>
        <h2 id="agreement-activation-title" className={styles.title}>Attiva una convenzione</h2>
        <p className={styles.description}>
          Hai ricevuto un codice convenzione? Inseriscilo qui per attivare i vantaggi associati alla tua tessera MoviBack.
        </p>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="moviback-agreement-code">Codice convenzione</label>
            <input
              id="moviback-agreement-code"
              name="agreement_code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="MOVI-XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={80}
              required
              disabled={submitting}
            />
          </div>
          <button type="submit" disabled={submitting || !code.trim()}>
            {submitting ? <Loader2 className={styles.spinner} aria-hidden="true" /> : null}
            {submitting ? "Attivazione…" : "Attiva convenzione"}
          </button>
        </form>
        {message ? (
          <p className={message.kind === "error" ? styles.error : styles.success} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
