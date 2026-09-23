"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import LegacyAccessForm, { type LegacyUser } from "@/components/LegacyAccessForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function UserLoginDialog({
  open,
  onClose,
  onSaved,
  existingUser = null,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (user: LegacyUser) => void;
  existingUser?: LegacyUser | null;
}) {
  const [saving, setSaving] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  useEffect(() => {
    if (!open || !existingUser) return;
    setSaving(false);
    setPrivacyAccepted(Boolean(existingUser.privacy_accepted_at));
    setTermsAccepted(Boolean(existingUser.terms_accepted_at));
    setAgeConfirmed(Boolean(existingUser.age_confirmed_at));
    setMarketingAccepted(Boolean(existingUser.marketing_accepted));
  }, [open, existingUser]);

  async function saveConsents(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/user/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privacy_accepted: privacyAccepted,
          terms_accepted: termsAccepted,
          age_confirmed: ageConfirmed,
          marketing_accepted: marketingAccepted,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Aggiornamento non riuscito");
      onSaved(data.user as LegacyUser);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aggiornamento non riuscito");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{existingUser ? "Completa i consensi" : "Accedi a MOVI"}</DialogTitle>
      </DialogHeader>

      {existingUser ? <form onSubmit={saveConsents} style={{ display: "grid", gap: 11, marginTop: 8 }}>
        <p style={copyStyle}>Il profilo è già identificato dalla sessione. Qui puoi aggiornare soltanto i consensi, senza cambiare email, telefono o identità.</p>
        <ConsentCheck checked={privacyAccepted} onChange={setPrivacyAccepted} required>Accetto la <Link href="/privacy" target="_blank">Privacy Policy</Link></ConsentCheck>
        <ConsentCheck checked={termsAccepted} onChange={setTermsAccepted} required>Accetto i <Link href="/termini" target="_blank">Termini di utilizzo</Link></ConsentCheck>
        <ConsentCheck checked={ageConfirmed} onChange={setAgeConfirmed} required>Confermo di avere almeno 18 anni</ConsentCheck>
        <ConsentCheck checked={marketingAccepted} onChange={setMarketingAccepted}>Acconsento alle comunicazioni marketing</ConsentCheck>
        <button className="base44-primary-btn" disabled={saving}>{saving ? "Salvataggio…" : "Salva consensi"}</button>
      </form> : <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
        <p style={copyStyle}>Usa email e password per ritrovare il tuo profilo MOVI.</p>
        <Link href="/accedi" className="base44-primary-btn" style={{ minHeight: 46, display: "grid", placeItems: "center", textDecoration: "none" }}>
          Accedi con email e password
        </Link>
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
          <strong>Usi ancora l’accesso precedente?</strong>
          <p style={copyStyle}>Inserisci telefono ed email del tuo profilo.</p>
        </div>
        <LegacyAccessForm onSaved={onSaved} />
        <p style={{ ...copyStyle, marginBottom: 0 }}>Non hai ancora un profilo? <Link href="/registrati" style={{ fontWeight: 850 }}>Registrati con il nuovo accesso MOVI</Link>.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}

function ConsentCheck({ checked, onChange, children, required = false }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13 }}>
    <input type="checkbox" checked={checked} required={required} onChange={(event) => onChange(event.target.checked)} />
    <span>{children}</span>
  </label>;
}

const copyStyle: React.CSSProperties = { color: "#475569", fontSize: 13, lineHeight: 1.45, margin: 0 };
