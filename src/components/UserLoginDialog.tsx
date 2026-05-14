"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
};

export default function UserLoginDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [saving, setSaving] = useState(false);

  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");

  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSaving(false);
    setPrivacyAccepted(false);
    setTermsAccepted(false);
    setAgeConfirmed(false);
    setMarketingAccepted(false);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!privacyAccepted) {
      toast.error("Devi accettare la Privacy Policy");
      return;
    }

    if (!termsAccepted) {
      toast.error("Devi accettare i Termini di utilizzo");
      return;
    }

    if (!ageConfirmed) {
      toast.error("Devi confermare di avere almeno 18 anni");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name,
          phone,
          email,
          gender,
          privacy_accepted: privacyAccepted,
          terms_accepted: termsAccepted,
          age_confirmed: ageConfirmed,
          marketing_accepted: marketingAccepted,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore");

      toast.success("Dati salvati");
      onSaved(json.user);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>I miei dati</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={submit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome e Cognome</div>
            <input
              className="base44-input"
              value={full_name}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Sesso</div>
              <select
                className="base44-input"
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
              >
                <option value="M">Uomo</option>
                <option value="F">Donna</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Telefono</div>
              <input
                className="base44-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Email</div>
            <input
              className="base44-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={consentBox}>
            <ConsentCheck
              checked={privacyAccepted}
              onChange={setPrivacyAccepted}
              required
            >
              Accetto la{" "}
              <Link href="/privacy" target="_blank" style={consentLink}>
                Privacy Policy
              </Link>
            </ConsentCheck>

            <ConsentCheck
              checked={termsAccepted}
              onChange={setTermsAccepted}
              required
            >
              Accetto i{" "}
              <Link href="/termini" target="_blank" style={consentLink}>
                Termini di utilizzo
              </Link>
            </ConsentCheck>

            <ConsentCheck
              checked={ageConfirmed}
              onChange={setAgeConfirmed}
              required
            >
              Confermo di avere almeno 18 anni
            </ConsentCheck>

            <ConsentCheck
              checked={marketingAccepted}
              onChange={setMarketingAccepted}
            >
              Acconsento a ricevere comunicazioni promozionali, newsletter,
              notifiche push, email commerciali e WhatsApp promo da MoviPadel
            </ConsentCheck>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="base44-csv-btn" onClick={onClose}>
              Annulla
            </button>

            <button
              className="base44-primary-btn"
              type="submit"
              disabled={saving}
              style={{ opacity: saving ? 0.75 : 1 }}
            >
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConsentCheck({
  checked,
  onChange,
  children,
  required = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label style={consentRow}>
      <input
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span>{children}</span>
    </label>
  );
}

const consentBox: React.CSSProperties = {
  display: "grid",
  gap: 9,
  padding: 12,
  borderRadius: 16,
  background: "rgba(15,23,42,0.04)",
  border: "1px solid rgba(15,23,42,0.10)",
};

const consentRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  fontSize: 12,
  lineHeight: 1.35,
  color: "#334155",
  fontWeight: 650,
};

const consentLink: React.CSSProperties = {
  color: "#2563eb",
  fontWeight: 850,
  textDecoration: "underline",
};