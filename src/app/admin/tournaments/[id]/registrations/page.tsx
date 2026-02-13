"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import RegistrationForm from "./RegistrationForm";
import RegistrationsTable from "./_components/RegistrationsTable";

type Reg = {
  id: string;
  position: number;
  is_reserve: boolean;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
};

type TournamentLite = {
  id: string;
  name: string;
  type: string;
  category?: string | null;
  location?: string | null;
  date?: string;
  time?: string;
  max_participants?: number;
};

export default function AdminTournamentRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [tournament, setTournament] = useState<TournamentLite | null>(null);
  const [main, setMain] = useState<Reg[]>([]);
  const [reserve, setReserve] = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);

  const showP2 = useMemo(() => tournament?.type === "Coppie fisse", [tournament?.type]);

  async function loadTournament() {
    const res = await fetch(`/api/admin/tournaments/${id}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Errore caricamento torneo");
    setTournament(json);
  }

  async function loadRegs() {
    const res = await fetch(`/api/admin/tournaments/${id}/registrations`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Errore caricamento iscrizioni");
    setMain(json.main ?? []);
    setReserve(json.reserve ?? []);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadTournament(), loadRegs()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function setReserveFlag(regId: string, is_reserve: boolean) {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_reserve }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      await loadRegs();
      toast.success(is_reserve ? "Spostato in riserva" : "Promosso in principale");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function remove(regId: string) {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      await loadRegs();
      toast.success("Iscrizione eliminata");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function promoteFirstReserve() {
    try {
      const res = await fetch(`/api/admin/tournaments/${id}/promote-first-reserve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      await loadRegs();
      toast.success("Prima riserva promossa");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Iscrizioni</h1>

          <div className="text-sm text-slate-600">
            <span className="font-medium">{tournament?.name ?? id}</span>
            {tournament?.type ? (
              <>
                {" "}
                <span className="text-slate-400">•</span>{" "}
                <Badge variant="outline" className="align-middle">
                  {tournament.type}
                </Badge>
              </>
            ) : null}
          </div>

          {tournament?.location || tournament?.date ? (
            <div className="text-xs text-slate-500">
              {[
                tournament.location,
                tournament.date && tournament.time ? `${tournament.date} ${tournament.time}` : tournament.date,
              ]
                .filter(Boolean)
                .join(" • ")}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button asChild variant="outline">
            <a href={`/api/admin/tournaments/${id}/registrations.csv`} target="_blank" rel="noreferrer">
              Scarica CSV
            </a>
          </Button>

          <Button
            variant="outline"
            onClick={promoteFirstReserve}
            disabled={reserve.length === 0}
            title={reserve.length === 0 ? "Nessuna riserva da promuovere" : "Promuovi la prima riserva"}
          >
            Promuovi prima riserva
          </Button>

          <Button asChild variant="outline">
            <Link href="/admin/tournaments">Torna ai tornei</Link>
          </Button>
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-500">Caricamento...</div> : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <RegistrationForm tournamentId={id} tournamentType={tournament?.type} onCreated={loadRegs} />

        {!loading && tournament?.max_participants ? (
          <div className="mt-3 text-xs text-slate-500">
            Lista principale: <b>{main.length}</b> / {tournament.max_participants}
            {showP2 ? " coppie" : " partecipanti"}
            {reserve.length ? (
              <>
                {" "}
                • Riserve: <b>{reserve.length}</b>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <RegistrationsTable
        title="Lista principale"
        emptyLabel="Nessuna iscrizione"
        rows={main}
        showP2={showP2}
        onDemote={(rid) => setReserveFlag(rid, true)}
        onDelete={remove}
      />

      <RegistrationsTable
        title="Lista riserva"
        emptyLabel="Nessuna riserva"
        rows={reserve}
        showP2={showP2}
        onPromote={(rid) => setReserveFlag(rid, false)}
        onDelete={remove}
      />
    </div>
  );
}
