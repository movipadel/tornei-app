"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ReactNode } from "react";

export default function TournamentRegistrationsDialog({
  trigger,
  tournamentName,
  players,
}: {
  trigger: ReactNode;
  tournamentName: string;
  players: string[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Iscritti – {tournamentName}</DialogTitle>
        </DialogHeader>

        <div style={{ marginTop: 12 }}>
          {players.length === 0 ? (
            <div style={{ color: "#64748b" }}>Nessun iscritto.</div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              {players.map((p, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    fontWeight: 600,
                  }}
                >
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}