"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import RegistrationForm from "./RegistrationForm";
import RegistrationsTable from "./_components/RegistrationsTable";
import HistoricalIdentityDialog, { registrationIdentityTarget, type RegistrationIdentityTarget } from "./_components/HistoricalIdentityDialog";
import type { RegistrationAccountStatus } from "@/lib/tournamentRegistrationAccountStatus";

type Reg = {
  id: string;
  position: number;
  is_reserve: boolean;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p1_gender_suggestion?: "M" | "F" | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
  p2_gender_suggestion?: "M" | "F" | null;
  p1_account_status: RegistrationAccountStatus;
  p2_account_status: RegistrationAccountStatus | null;
  p1_player_identity_id: string | null;
  p2_player_identity_id: string | null;
};

type TournamentLite = {
  id: string;
  name: string;
  type: string;
  category?: string | null;
  circuit_ranking_group_id?: string | null;
  registrations_open?: boolean;
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
  const [verifyTarget, setVerifyTarget] = useState<RegistrationIdentityTarget | null>(null);
  const [mixed, setMixed] = useState<{ eligible: boolean; reason: string | null; male_count: number; female_count: number; unknown_count: number; player_count: number; ranking_category: string | null; ranking_level: string | null } | null>(null);

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
    await loadMixed();
  }

  async function loadMixed() {
    const response = await fetch(`/api/admin/tournaments/${id}/mixed-preparation`, { cache: "no-store" });
    if (response.ok) setMixed((await response.json()).data);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadTournament(), loadRegs()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore");
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function remove(regId: string) {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      await loadRegs();
      toast.success("Iscrizione eliminata");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function promoteFirstReserve() {
    try {
      const res = await fetch(`/api/admin/tournaments/${id}/promote-first-reserve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Errore");
      await loadRegs();
      toast.success("Prima riserva promossa");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function prepareMixed(action: "set_gender" | "convert_misto" | "convert_libero", registrationId?: string, slot?: "p1" | "p2", gender?: "M" | "F") {
    const message = action === "set_gender"
      ? `Confermi ${gender} come genere per questa iscrizione? Il profilo MOVI non sarà modificato.`
      : action === "convert_misto"
        ? `Imposta la tappa come Misto? Giocatori: ${mixed?.player_count ?? 0}, uomini: ${mixed?.male_count ?? 0}, donne: ${mixed?.female_count ?? 0}, genere non indicato: ${mixed?.unknown_count ?? 0}. I punti resteranno nella classifica ${mixed?.ranking_category ?? "selezionata"} · ${mixed?.ranking_level ?? ""}.`
        : "Riporta la tappa a Libero prima della run? La classifica di destinazione resterà invariata.";
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/admin/tournaments/${id}/mixed-preparation`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, registration_id: registrationId, slot, gender, confirm: true }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error(json.error ?? "Operazione non riuscita"); return; }
    await Promise.all([loadTournament(), loadRegs()]);
    toast.success(action === "set_gender" ? "Genere iscrizione aggiornato" : "Categoria tappa aggiornata");
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

      {tournament?.type === "Baraonda" && mixed && <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <h2 className="text-lg font-semibold">Preparazione tappa Misto</h2>
        <p>Giocatori: {mixed.player_count} · Uomini: {mixed.male_count} · Donne: {mixed.female_count} · Genere non indicato: {mixed.unknown_count}</p>
        <p>Classifica: {mixed.ranking_category ?? "da selezionare"} · {mixed.ranking_level ?? ""}</p>
        {mixed.reason && <p role="status">Conversione non disponibile: {mixed.reason.replaceAll("_", " ").toLowerCase()}.</p>}
        {tournament.category === "Libero" && <Button disabled={!mixed.eligible} onClick={() => void prepareMixed("convert_misto")}>Imposta tappa come Misto</Button>}
        {tournament.category === "Misto" && <Button variant="outline" onClick={() => void prepareMixed("convert_libero")}>Riporta tappa a Libero</Button>}
      </section>}

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
        onVerify={(row, slot) => setVerifyTarget(registrationIdentityTarget(id, row, slot))}
        onGender={(row, slot, value) => void prepareMixed("set_gender", row.id, slot, value)}
      />

      <RegistrationsTable
        title="Lista riserva"
        emptyLabel="Nessuna riserva"
        rows={reserve}
        showP2={showP2}
        onPromote={(rid) => setReserveFlag(rid, false)}
        onDelete={remove}
        onVerify={(row, slot) => setVerifyTarget(registrationIdentityTarget(id, row, slot))}
        onGender={(row, slot, value) => void prepareMixed("set_gender", row.id, slot, value)}
      />
      {verifyTarget && <HistoricalIdentityDialog key={`${verifyTarget.registrationId}:${verifyTarget.slot}`}
        target={verifyTarget} onClose={() => setVerifyTarget(null)} onLinked={loadRegs} />}
    </div>
  );
}
