"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  useEffect(() => {
    if (!open) return;
    setSaving(false);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name, phone, email, gender }),
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

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome e Cognome</div>
            <input className="base44-input" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Sesso</div>
              <select className="base44-input" value={gender} onChange={(e) => setGender(e.target.value as any)}>
                <option value="M">Uomo</option>
                <option value="F">Donna</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Telefono</div>
              <input className="base44-input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Email</div>
            <input className="base44-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" className="base44-csv-btn" onClick={onClose}>
              Annulla
            </button>
            <button className="base44-primary-btn" type="submit" disabled={saving} style={{ opacity: saving ? 0.75 : 1 }}>
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
