"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TournamentDTO = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  level?: string | null;
  location: string | null;
  date: string;
  time: string;
  max_participants: number;
  image_url?: string | null;
};

type FormState = {
  name: string;
  type: "Baraonda" | "Coppie fisse";
  category: "Maschile" | "Femminile" | "Misto" | "Libero";
  level: "principiante" | "intermedio" | "avanzato";
  date: string;
  time: string;
  location: string;
  max_participants: number;
};

const DEFAULTS: FormState = {
  name: "",
  type: "Baraonda",
  category: "Maschile",
  level: "intermedio",
  date: "",
  time: "",
  location: "Movi Club Centallo",
  max_participants: 16,
};

const LOCATIONS = [
  "Movi Club Saluzzo",
  "Movi Club Manta",
  "Movi Club Costigliole",
  "Movi Club Centallo",
  "Movi Club Revello",
];

export default function TournamentDialogForm({
  open,
  onClose,
  tournament,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tournament: TournamentDTO | null;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tournament) {
      setForm({
        name: tournament.name ?? "",
        type: (tournament.type as any) ?? "Baraonda",
        category: (tournament.category as any) ?? "Maschile",
        level: (tournament.level as any) ?? "intermedio",
        date: tournament.date ?? "",
        time: tournament.time ?? "",
        location: tournament.location ?? "Movi Club Centallo",
        max_participants: tournament.max_participants ?? 16,
      });
    } else {
      setForm(DEFAULTS);
    }
  }, [tournament, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      if (!form.name.trim()) throw new Error("Nome torneo obbligatorio");
      if (!form.date) throw new Error("Data obbligatoria");
      if (!form.time) throw new Error("Ora obbligatoria");
      if (!form.max_participants || form.max_participants < 1)
        throw new Error("Max partecipanti non valido");

      const payload = {
        name: form.name.trim(),
        type: form.type,
        category: form.category,
        level: form.level,
        location: form.location,
        date: form.date,
        time: form.time,
        max_participants: form.max_participants,
      };

      const isEdit = Boolean(tournament?.id);
      const url = isEdit
        ? `/api/admin/tournaments/${tournament!.id}`
        : `/api/admin/tournaments`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success(isEdit ? "Torneo aggiornato" : "Torneo creato");
      await onSaved();
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
        {/* Nascondiamo la X (close button) → usiamo solo "Annulla" */}
        <style>{`
          .absolute.right-4.top-4 {
            display: none !important;
          }
        `}</style>

        <DialogHeader>
          <DialogTitle>
            {tournament ? "Modifica Torneo" : "Nuovo Torneo"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={submit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginTop: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome torneo</div>
            <input
              className="base44-input"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              placeholder="Es: Torneo Primavera"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Tipo</div>
              <select
                className="base44-input"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as any })
                }
              >
                <option value="Baraonda">Baraonda</option>
                <option value="Coppie fisse">Amatoriale Coppie fisse</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Categoria</div>
              <select
                className="base44-input"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as any })
                }
              >
                <option value="Maschile">Maschile</option>
                <option value="Femminile">Femminile</option>
                <option value="Misto">Misto</option>
                <option value="Libero">Libero</option>
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Livello</div>
            <select
              className="base44-input"
              value={form.level}
              onChange={(e) =>
                setForm({ ...form, level: e.target.value as any })
              }
            >
              <option value="principiante">Principiante</option>
              <option value="intermedio">Intermedio</option>
              <option value="avanzato">Avanzato</option>
            </select>
          </div>

          {/* 🔥 FIX DEFINITIVO DATA / ORA */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Data</div>
              <input
                type="date"
                className="base44-input"
                value={form.date}
                onChange={(e) =>
                  setForm({ ...form, date: e.target.value })
                }
                required
                style={{ minWidth: 0 }}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Ora</div>
              <input
                type="time"
                className="base44-input"
                value={form.time}
                onChange={(e) =>
                  setForm({ ...form, time: e.target.value })
                }
                required
                style={{ minWidth: 0 }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Luogo</div>
            <select
              className="base44-input"
              value={form.location}
              onChange={(e) =>
                setForm({ ...form, location: e.target.value })
              }
            >
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Max partecipanti
            </div>
            <input
              type="number"
              min={2}
              className="base44-input"
              value={form.max_participants}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_participants: Number(e.target.value) || 0,
                })
              }
              required
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              className="base44-csv-btn"
              onClick={onClose}
            >
              Annulla
            </button>

            <button
              className="base44-primary-btn"
              type="submit"
              disabled={saving}
              style={{ opacity: saving ? 0.75 : 1 }}
            >
              {saving
                ? "Salvataggio..."
                : tournament
                ? "Salva"
                : "Crea"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
