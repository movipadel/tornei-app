"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, User as UserIcon, Users as UsersIcon } from "lucide-react";

type Tournament = {
  id: string;
  name: string;
  type: string;
  category: string;
};

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender: "M" | "F";
};

type PlayerSuggestion = {
  player_key: string;
  player_name: string;
  player_phone: string;
  masked_phone: string;
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

  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [formData, setFormData] = useState({
    p2_name: "",
    p2_phone: "",
    p2_gender: "M" as "M" | "F",
  });

  const isCouple = useMemo(() => tournament?.type === "Coppie fisse", [tournament?.type]);
  const isMisto = useMemo(() => catLower(tournament) === "misto", [tournament]);

  useEffect(() => {
    if (!open || !tournament) return;

    const defaultP2Gender: "M" | "F" =
      tournament.category === "Femminile" ? "F" : "M";

    setFormData({
      p2_name: "",
      p2_phone: "",
      p2_gender: defaultP2Gender,
    });
  }, [open, tournament?.id]);

    useEffect(() => {
    if (!open || !tournament || !isCouple) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const q = formData.p2_name.trim();

    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoadingSuggestions(true);

        const res = await fetch(
          `/api/tournaments/${tournament.id}/circuit-player-suggestions?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setSuggestions([]);
          setSuggestionsOpen(false);
          return;
        }

        const rows = Array.isArray(json.data) ? json.data : [];
        setSuggestions(rows);
        setSuggestionsOpen(rows.length > 0);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, tournament?.id, isCouple, formData.p2_name]);

  if (!tournament) return null;
  if (!user) return null;

  const tournamentId = tournament.id;
  const currentUser = user;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      const payload: any = {
        p1_name: currentUser.full_name.trim().toUpperCase(),
        p1_phone: normalizePhone(currentUser.phone),
        p1_gender: isMisto ? currentUser.gender : null,
      };

      if (!payload.p1_name) throw new Error("Nome obbligatorio");
      if (!payload.p1_phone) throw new Error("Telefono obbligatorio");

      if (isCouple) {
        payload.p2_name = formData.p2_name.trim().toUpperCase();
        payload.p2_phone = normalizePhone(formData.p2_phone);
        payload.p2_gender = formData.p2_gender;

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

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 800, color: "#0f172a" }}>
              {currentUser.full_name}
            </div>

            <div style={{ color: "#475569", fontSize: 14 }}>
              {currentUser.phone}
            </div>

            {isMisto && (
              <div style={{ color: "#475569", fontSize: 14 }}>
                {currentUser.gender === "M" ? "Uomo" : "Donna"}
              </div>
            )}
          </div>

          {isCouple && (
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#4f46e5", fontWeight: 800 }}>
                <UsersIcon className="w-4 h-4" />
                Giocatore 2
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ position: "relative" }}>
  <div style={{ fontWeight: 700, marginBottom: 6 }}>Nome e Cognome</div>
  <input
    className="base44-input"
    value={formData.p2_name}
    onChange={(e) => {
      setFormData({ ...formData, p2_name: e.target.value });
      setSuggestionsOpen(true);
    }}
    onFocus={() => {
      if (suggestions.length > 0) setSuggestionsOpen(true);
    }}
    required
    placeholder="Inizia a digitare il nome..."
  />

  {loadingSuggestions ? (
    <div style={suggestionHint}>Cerco giocatori del circuito...</div>
  ) : null}

  {suggestionsOpen && suggestions.length > 0 ? (
    <div style={suggestionsBox}>
      {suggestions.map((s) => (
        <button
          key={s.player_key}
          type="button"
          style={suggestionItem}
          onClick={() => {
            setFormData({
              ...formData,
              p2_name: s.player_name,
              p2_phone: s.player_phone,
            });
            setSuggestionsOpen(false);
          }}
        >
          <span style={{ fontWeight: 900, color: "#0f172a" }}>
            {s.player_name}
          </span>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>
            Tel. {s.masked_phone}
          </span>
        </button>
      ))}
    </div>
  ) : null}
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

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Sesso</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="base44-csv-btn"
                      style={{
                        borderColor: formData.p2_gender === "M" ? "#c7d2fe" : "#e2e8f0",
                        background: formData.p2_gender === "M" ? "#eef2ff" : "#fff",
                      }}
                      onClick={() => setFormData({ ...formData, p2_gender: "M" })}
                    >
                      Uomo
                    </button>

                    <button
                      type="button"
                      className="base44-csv-btn"
                      style={{
                        borderColor: formData.p2_gender === "F" ? "#c7d2fe" : "#e2e8f0",
                        background: formData.p2_gender === "F" ? "#eef2ff" : "#fff",
                      }}
                      onClick={() => setFormData({ ...formData, p2_gender: "F" })}
                    >
                      Donna
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="base44-csv-btn" onClick={onClose}>
              Annulla
            </button>

            <button
              className="base44-primary-btn"
              type="submit"
              disabled={saving}
              style={{ opacity: saving ? 0.75 : 1 }}
            >
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

const suggestionHint: React.CSSProperties = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const suggestionsBox: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 30,
  borderRadius: 16,
  overflow: "hidden",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 40px rgba(15,23,42,0.16)",
};

const suggestionItem: React.CSSProperties = {
  width: "100%",
  border: 0,
  background: "#ffffff",
  padding: "11px 13px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 3,
  cursor: "pointer",
  textAlign: "left",
};