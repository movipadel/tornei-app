"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

type Props = {
  tournamentId: string;
  tournamentType?: string; // "Baraonda" | "Coppie fisse"
  onCreated?: () => void | Promise<void>;
};

const isCouples = (t?: string) => t === "Coppie fisse";
const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

const baseInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  outline: "none",
  background: "white",
};

export default function RegistrationForm({ tournamentId, tournamentType, onCreated }: Props) {
  const showP2 = isCouples(tournamentType);

  const [saving, setSaving] = useState(false);

  const [p1_name, setP1Name] = useState("");
  const [p1_phone, setP1Phone] = useState("");
  const [p1_gender, setP1Gender] = useState<"" | "M" | "F">("");

  const [p2_name, setP2Name] = useState("");
  const [p2_phone, setP2Phone] = useState("");
  const [p2_gender, setP2Gender] = useState<"" | "M" | "F">("");

  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      const payload: any = {
        p1_name: p1_name.trim(),
        p1_phone: normalizePhone(p1_phone),
        p1_gender: p1_gender || null,
        notes: notes.trim() || null,
      };

      if (!payload.p1_name) throw new Error("Nome giocatore 1 obbligatorio");
      if (!payload.p1_phone) throw new Error("Telefono giocatore 1 obbligatorio");

      if (showP2) {
        payload.p2_name = p2_name.trim() || null;
        payload.p2_phone = p2_phone ? normalizePhone(p2_phone) : null;
        payload.p2_gender = p2_gender || null;

        if (!payload.p2_name) throw new Error("Nome giocatore 2 obbligatorio");
        if (!payload.p2_phone) throw new Error("Telefono giocatore 2 obbligatorio");
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore");

      toast.success("Iscrizione aggiunta");

      // reset
      setP1Name("");
      setP1Phone("");
      setP1Gender("");
      setP2Name("");
      setP2Phone("");
      setP2Gender("");
      setNotes("");

      await onCreated?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a" }}>Aggiungi iscrizione</div>
        <div className="text-xs text-slate-500">Tipo: {tournamentType ?? "—"}</div>
      </div>

      {/* PLAYER 1 */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Nome giocatore 1</Label>
          <Input style={baseInputStyle} value={p1_name} onChange={(e) => setP1Name(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label>Telefono giocatore 1</Label>
          <Input style={baseInputStyle} value={p1_phone} onChange={(e) => setP1Phone(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label>Sesso (opz.)</Label>
          {/* ✅ SELECT NATIVO: niente overlay, niente trasparenze */}
          <select
            value={p1_gender}
            onChange={(e) => setP1Gender(e.target.value as any)}
            style={baseInputStyle}
          >
            <option value="">Seleziona</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
      </div>

      {/* PLAYER 2 */}
      {showP2 && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Nome giocatore 2</Label>
            <Input style={baseInputStyle} value={p2_name} onChange={(e) => setP2Name(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Telefono giocatore 2</Label>
            <Input style={baseInputStyle} value={p2_phone} onChange={(e) => setP2Phone(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Sesso (opz.)</Label>
            <select
              value={p2_gender}
              onChange={(e) => setP2Gender(e.target.value as any)}
              style={baseInputStyle}
            >
              <option value="">Seleziona</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Note (opz.)</Label>
        <Textarea style={baseInputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Salvataggio...
          </>
        ) : (
          "Aggiungi"
        )}
      </Button>
    </form>
  );
}
