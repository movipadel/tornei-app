"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Participant = {
  id?: string | number;
  name?: string;
  full_name?: string;
  display_name?: string;
};

function normalizeName(p: Participant): string {
  const raw =
    p.display_name ??
    p.full_name ??
    p.name ??
    (typeof p === "string" ? (p as any) : "");
  return String(raw ?? "").trim();
}

export default function TournamentParticipantsDialog({
  tournamentId,
  tournamentName,
  currentCount,
  maxCount,
  triggerText,
}: {
  tournamentId: string;
  tournamentName: string;
  currentCount: number;
  maxCount: number;
  triggerText?: string; // es: "👥 2/16 iscritti →"
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 👇 endpoint: se non ce l’hai ancora, lo creiamo dopo
      const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || "Errore caricamento iscritti";
        throw new Error(String(msg));
      }

      // accetta sia array diretto, sia { participants: [...] }
      const arr = Array.isArray(json) ? json : Array.isArray(json?.participants) ? json.participants : [];
      setParticipants(arr);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tournamentId]);

  const title = useMemo(() => {
    const n = String(tournamentName ?? "").trim();
    return n ? `Iscritti – ${n}` : "Iscritti";
  }, [tournamentName]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
            color: "#0f172a",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          aria-label="Apri iscritti"
        >
          {triggerText ?? `👥 ${currentCount}/${maxCount} iscritti →`}
        </button>
      </DialogTrigger>

      {/* ✅ DialogTitle presente (accessibilità) */}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            {currentCount}/{maxCount} iscritti
          </div>

          <DialogClose asChild>
            <button
              type="button"
              className="base44-csv-btn"
              style={{ padding: "10px 14px", borderRadius: 999 }}
            >
              Chiudi
            </button>
          </DialogClose>
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ color: "#64748b" }}>Caricamento…</div>
          ) : errorMsg ? (
            <div style={{ color: "#dc2626", fontWeight: 700 }}>{errorMsg}</div>
          ) : participants.length === 0 ? (
            <div style={{ color: "#64748b" }}>Nessun iscritto.</div>
          ) : (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {participants
                .map((p, i) => ({ p, i, name: normalizeName(p) }))
                .filter((x) => x.name)
                .map(({ p, i, name }, idx, arr) => (
                  <div
                    key={(p.id ?? `${name}-${i}`) as any}
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: idx === arr.length - 1 ? "none" : "1px solid #eef2f7",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{name}</div>
                    <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 12 }}>#{idx + 1}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {!loading && !errorMsg ? (
          <button
            type="button"
            onClick={load}
            className="base44-csv-btn"
            style={{ marginTop: 12, padding: "10px 14px", borderRadius: 999 }}
          >
            Aggiorna
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}