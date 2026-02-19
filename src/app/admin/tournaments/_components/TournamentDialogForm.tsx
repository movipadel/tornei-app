"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  const isEdit = !!tournament?.id;
  const title = isEdit ? "Modifica Torneo" : "Nuovo Torneo";

  // Pre-compila / reset
  useEffect(() => {
    if (!open) return;

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

  // Label “Amatoriale Coppie fisse” in UI, valore “Coppie fisse” in payload
  const typeOptions = useMemo(
    () => [
      { value: "Baraonda" as const, label: "Baraonda" },
      { value: "Coppie fisse" as const, label: "Amatoriale Coppie fisse" },
    ],
    []
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      if (!form.name.trim()) throw new Error("Nome torneo obbligatorio");
      if (!form.date) throw new Error("Data obbligatoria");
      if (!form.time) throw new Error("Ora obbligatoria");
      if (!form.max_participants || form.max_participants < 1) throw new Error("Max partecipanti non valido");

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

      const url = isEdit ? `/api/admin/tournaments/${tournament!.id}` : `/api/admin/tournaments`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error || "Errore salvataggio");

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // IMPORTANT: onOpenChange passa true/false.
        // Noi chiudiamo solo quando diventa false.
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={[
          // Mobile: sheet full-height
          "p-0 w-[100vw] max-w-none h-[100dvh] rounded-none",
          // Desktop: dialog classico
          "sm:h-auto sm:max-w-lg sm:rounded-2xl",
          // Evita scroll esterno e bounce
          "overflow-hidden",
        ].join(" ")}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Nascondiamo la X (close button) → usiamo solo "Annulla" */}
        <style>{`
          .absolute.right-4.top-4 { display: none !important; }
        `}</style>

        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-white border-b">
          <DialogHeader className="px-5 py-4">
            <DialogTitle className="text-xl font-extrabold">{title}</DialogTitle>
          </DialogHeader>
        </div>

        <form
          onSubmit={submit}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Body scrollabile */}
          <div
            className="px-5 py-5"
            style={{
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Nome */}
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Nome torneo</div>
                <input
                  className="base44-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Es: Torneo Primavera"
                  required
                  // extra safety anti-zoom (iOS)
                  style={{ fontSize: 16 }}
                />
              </div>

              {/* Tipo / Categoria (su mobile meglio stacked, su sm+ 2 colonne) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 12,
                }}
                className="sm:grid sm:grid-cols-2"
              >
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Tipo</div>
                  <select
                    className="base44-input"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    style={{ fontSize: 16 }}
                  >
                    {typeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Categoria</div>
                  <select
                    className="base44-input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    style={{ fontSize: 16 }}
                  >
                    <option value="Maschile">Maschile</option>
                    <option value="Femminile">Femminile</option>
                    <option value="Misto">Misto</option>
                    <option value="Libero">Libero</option>
                  </select>
                </div>
              </div>

              {/* Livello */}
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Livello</div>
                <select
                  className="base44-input"
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value as any })}
                  style={{ fontSize: 16 }}
                >
                  <option value="principiante">Principiante</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzato">Avanzato</option>
                </select>
              </div>

              {/* Data + Ora affiancati (mobile 2 colonne: è comodo e riduce scroll) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Data</div>
                  <input
                    type="date"
                    className="base44-input"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    style={{ minWidth: 0, fontSize: 16 }}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Ora</div>
                  <input
                    type="time"
                    className="base44-input"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    required
                    style={{ minWidth: 0, fontSize: 16 }}
                  />
                </div>
              </div>

              {/* Luogo */}
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Luogo</div>
                <select
                  className="base44-input"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  style={{ fontSize: 16 }}
                >
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max partecipanti */}
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Max partecipanti</div>
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
                  style={{ fontSize: 16 }}
                />
              </div>

              {/* Spacer per evitare che l’ultimo campo finisca sotto al footer sticky */}
              <div style={{ height: 10 }} />
            </div>
          </div>

          {/* Footer sticky (app-like) */}
          <div
            className="sticky bottom-0 z-10 bg-white border-t"
            style={{
              padding: "14px 16px",
              paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="base44-csv-btn" onClick={onClose} style={{ flex: 1 }}>
                Annulla
              </button>

              <button
                className="base44-primary-btn"
                type="submit"
                disabled={saving}
                style={{ flex: 1, opacity: saving ? 0.75 : 1 }}
              >
                {saving ? "Salvataggio..." : isEdit ? "Salva" : "Crea"}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
