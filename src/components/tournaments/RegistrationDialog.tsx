"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, User as UserIcon, Users as UsersIcon } from "lucide-react";

type Tournament = {
  id: string;
  name: string;
  type: string;     // "Baraonda" | "Coppie fisse"
  category: string; // "Maschile" | "Femminile" | "Misto" | "Libero"
};

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
};

const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

function catLower(t?: Tournament | null) {
  return String(t?.category ?? "").toLowerCase();
}

export default function RegistrationDialog({
  tournament,
  open,
  onClose,
  onSuccess,
  user,
}: {
  tournament: Tournament | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  user: User | null;
}) {
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    p1_name: "",
    p1_phone: "",
    p1_gender: "M" as "M" | "F",
    p2_name: "",
    p2_phone: "",
  });

  const isCouple = useMemo(() => tournament?.type === "Coppie fisse", [tournament?.type]);
  const isMisto = useMemo(() => catLower(tournament) === "misto", [tournament]);

  useEffect(() => {
    if (!open || !tournament) return;

    // default gender by category if not loggato
    const defaultGender: "M" | "F" =
      tournament.category === "Femminile" ? "F" : "M";

    // se loggato: prefill
    if (user) {
      setFormData((prev) => ({
        ...prev,
        p1_name: user.full_name ?? "",
        p1_phone: user.phone ?? "",
        p1_gender: user.gender ?? defaultGender,
        p2_name: "",
        p2_phone: "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        p1_gender: defaultGender,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tournament?.id, user?.id]);

  if (!tournament) return null;
  const tournamentId = tournament.id;


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      const payload: any = {
        p1_name: formData.p1_name.trim(),
        p1_phone: normalizePhone(formData.p1_phone),
        p1_gender: isMisto ? formData.p1_gender : null,
      };

      if (!payload.p1_name) throw new Error("Nome obbligatorio");
      if (!payload.p1_phone) throw new Error("Telefono obbligatorio");

      if (isCouple) {
        payload.p2_name = formData.p2_name.trim();
        payload.p2_phone = normalizePhone(formData.p2_phone);

        if (!payload.p2_name) throw new Error("Nome giocatore 2 obbligatorio");
        if (!payload.p2_phone) throw new Error("Telefono giocatore 2 obbligatorio");
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore durante l'iscrizione");

      toast.success(json?.data?.is_reserve ? "Inserito in lista riserva!" : "Iscrizione completata!");
      await onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>Iscrizione a {tournament.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4f46e5", fontWeight: 800 }}>
            <UserIcon className="w-4 h-4" />
            {isCouple ? "Giocatore 1" : "I tuoi dati"}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome e Cognome</div>
            <input
              className="base44-input"
              value={formData.p1_name}
              onChange={(e) => setFormData({ ...formData, p1_name: e.target.value })}
              required
            />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Telefono</div>
            <input
              className="base44-input"
              value={formData.p1_phone}
              onChange={(e) => setFormData({ ...formData, p1_phone: e.target.value })}
              required
            />
          </div>

          {isMisto ? (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Sesso</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="base44-csv-btn"
                  style={{
                    borderColor: formData.p1_gender === "M" ? "#c7d2fe" : "#e2e8f0",
                    background: formData.p1_gender === "M" ? "#eef2ff" : "#fff",
                    color: formData.p1_gender === "M" ? "#4338ca" : "#334155",
                  }}
                  onClick={() => setFormData({ ...formData, p1_gender: "M" })}
                >
                  Uomo
                </button>
                <button
                  type="button"
                  className="base44-csv-btn"
                  style={{
                    borderColor: formData.p1_gender === "F" ? "#c7d2fe" : "#e2e8f0",
                    background: formData.p1_gender === "F" ? "#eef2ff" : "#fff",
                    color: formData.p1_gender === "F" ? "#4338ca" : "#334155",
                  }}
                  onClick={() => setFormData({ ...formData, p1_gender: "F" })}
                >
                  Donna
                </button>
              </div>
            </div>
          ) : null}

          {isCouple ? (
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4f46e5", fontWeight: 800 }}>
                <UsersIcon className="w-4 h-4" />
                Giocatore 2
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome e Cognome</div>
                  <input
                    className="base44-input"
                    value={formData.p2_name}
                    onChange={(e) => setFormData({ ...formData, p2_name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Telefono</div>
                  <input
                    className="base44-input"
                    value={formData.p2_phone}
                    onChange={(e) => setFormData({ ...formData, p2_phone: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="base44-csv-btn" onClick={onClose}>
              Annulla
            </button>
            <button className="base44-primary-btn" type="submit" disabled={saving} style={{ opacity: saving ? 0.75 : 1 }}>
              {saving ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Iscrizione...
                </span>
              ) : (
                "Conferma"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
