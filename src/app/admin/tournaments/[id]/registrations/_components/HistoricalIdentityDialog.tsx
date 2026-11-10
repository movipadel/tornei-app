"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "./HistoricalIdentityDialog.module.css";

export type RegistrationIdentityTarget = {
  tournamentId: string;
  registrationId: string;
  slot: "p1" | "p2";
  name: string;
  phone: string;
  gender: "M" | "F" | null;
  isReserve: boolean;
  currentIdentityId: string | null;
};

export type HistoricalRegistrationRow = {
  id: string;
  is_reserve: boolean;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p1_player_identity_id: string | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
  p2_player_identity_id: string | null;
};

export function registrationIdentityTarget(tournamentId: string, row: HistoricalRegistrationRow, slot: "p1" | "p2"): RegistrationIdentityTarget {
  return {
    tournamentId, registrationId: row.id, slot,
    name: slot === "p1" ? row.p1_name : row.p2_name ?? "",
    phone: slot === "p1" ? row.p1_phone : row.p2_phone ?? "",
    gender: slot === "p1" ? row.p1_gender : row.p2_gender,
    isReserve: row.is_reserve,
    currentIdentityId: slot === "p1" ? row.p1_player_identity_id : row.p2_player_identity_id,
  };
}

type Candidate = {
  player_identity_id: string | null;
  account_user_id: string | null;
  display_name: string;
  phone: string;
  email: string | null;
  gender: "M" | "F" | null;
  source: "Profilo MOVI" | "Identità sportiva" | "Account da collegare";
  alias_match?: boolean;
};

const comparableName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
const comparablePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return /^3\d{9}$/.test(digits) ? `39${digits}` : digits;
};

export default function HistoricalIdentityDialog({ target, onClose, onLinked }: {
  target: RegistrationIdentityTarget;
  onClose: () => void;
  onLinked: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(target.name);
  const [phone, setPhone] = useState(target.phone);
  const [gender, setGender] = useState<"" | "M" | "F">(target.gender ?? "");
  const [conflictChecked, setConflictChecked] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    const digits = trimmed.replace(/\D/g, "");
    const phoneQuery = trimmed.replace(/[\d\s()+.\-]/g, "").length === 0;
    if (phoneQuery ? digits.length < 4 : trimmed.length < 3) { setCandidates([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/tournaments/players/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Ricerca giocatori non disponibile.");
        const result = await response.json();
        setCandidates(Array.isArray(result.data) ? result.data : []);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ricerca non disponibile.");
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const selectedName = creating ? name : selected?.display_name ?? "";
  const selectedPhone = creating ? phone : selected?.phone ?? "";
  const differs = Boolean(selectedName && (
    comparableName(selectedName) !== comparableName(target.name)
      || comparablePhone(selectedPhone) !== comparablePhone(target.phone)
  ));

  async function confirm() {
    if (saving || (!selected && !creating)) return;
    setError("");
    setSaving(true);
    const selection = creating
      ? { kind: "new", full_name: name.trim(), phone: phone.trim(), gender: gender || null, confirmed_conflict: conflictChecked }
      : selected?.player_identity_id
        ? { kind: "identity", player_identity_id: selected.player_identity_id,
            expected_candidate_name: selected.display_name, expected_candidate_phone: selected.phone }
        : { kind: "account", account_user_id: selected?.account_user_id,
            expected_candidate_name: selected?.display_name, expected_candidate_phone: selected?.phone };
    try {
      const response = await fetch(`/api/admin/tournaments/${target.tournamentId}/registrations/${target.registrationId}/player-identity`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selection, slot: target.slot, confirmed: true,
          expected_name: target.name, expected_phone: target.phone,
          expected_is_reserve: target.isReserve, expected_current_identity_id: target.currentIdentityId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Collegamento non riuscito.");
      toast.success("Giocatore collegato all’iscrizione.");
      onClose();
      try { await onLinked(); } catch { toast.error("Collegamento salvato; ricarica la lista per vedere lo stato aggiornato."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Collegamento non riuscito.");
    } finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className={styles.dialog} hideClose>
      <DialogHeader className={styles.header}>
        <DialogTitle className={styles.title}>Verifica giocatore {target.slot === "p1" ? "1" : "2"}</DialogTitle>
        <DialogDescription className={styles.description}>Collega esplicitamente un’identità canonica a questa iscrizione {target.isReserve ? "in riserva" : "principale"}.</DialogDescription>
      </DialogHeader>
      <div className={styles.body}>
        <div className={styles.snapshot}>
          <p className={styles.sectionTitle}>Iscrizione attuale</p>
          <p>{target.name}</p>
          <p className={styles.secondary}>{target.phone}</p>
        </div>
        <div className={styles.fieldGroup}>
          <Label className={styles.label} htmlFor="historical-player-search">Cerca profilo MOVI</Label>
          <Input id="historical-player-search" className={styles.input} value={query} placeholder="Nome o telefono"
            onChange={(event) => { setQuery(event.target.value); setSelected(null); setCreating(false); setError(""); }} />
          {searching && <p role="status" className={styles.secondary}>Ricerca…</p>}
          {!searching && query.trim().length >= 3 && candidates.length === 0 && <p className={styles.secondary}>Nessun profilo trovato.</p>}
          {candidates.length > 0 && <div className={styles.results} aria-label="Risultati ricerca giocatori">
            {candidates.map((candidate) => <button type="button" key={candidate.player_identity_id ?? candidate.account_user_id}
              className={`${styles.candidate} ${selected === candidate ? styles.candidateSelected : ""}`}
              onClick={() => { setSelected(candidate); setCreating(false); setError(""); }}>
              <span className={styles.candidateName}>{candidate.display_name}</span>
              <span className={styles.secondary}>{candidate.phone}{candidate.email ? ` · ${candidate.email}` : ""}</span>
              <span className={styles.source}>{candidate.source}{candidate.alias_match ? " · Alias storico" : ""}</span>
            </button>)}
          </div>}
        </div>
        <Button type="button" variant="outline" className={`${styles.button} ${styles.secondaryButton}`} onClick={() => { setCreating(true); setSelected(null); setError(""); }}>
          Crea nuovo giocatore
        </Button>
        {creating && <div className={`${styles.snapshot} ${styles.createBox}`}>
          <p>Verrà creata solo un’identità sportiva, senza account di accesso.</p>
          <div className={styles.fieldGroup}><Label className={styles.label} htmlFor="new-historical-player-name">Nome</Label><Input id="new-historical-player-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className={styles.fieldGroup}><Label className={styles.label} htmlFor="new-historical-player-phone">Telefono</Label><Input id="new-historical-player-phone" className={styles.input} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <div className={styles.fieldGroup}><Label className={styles.label} htmlFor="new-historical-player-gender">Sesso (se noto)</Label><select id="new-historical-player-gender" className={styles.input} value={gender} onChange={(event) => setGender(event.target.value as "" | "M" | "F")}>
            <option value="">Non indicato</option><option value="M">M</option><option value="F">F</option>
          </select></div>
          <label className={styles.checkboxLabel}><input type="checkbox" checked={conflictChecked} onChange={(event) => setConflictChecked(event.target.checked)} />Ho verificato eventuali omonimi o alias storici.</label>
        </div>}
        {selected && <div className={`${styles.snapshot} ${styles.selectedBox}`}>
          <p className={styles.sectionTitle}>Profilo selezionato</p>
          <p>{selected.display_name}</p>
          <p className={styles.secondary}>{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p>
          <p className={styles.source}>{selected.source}</p>
        </div>}
        {differs && <p role="alert" className={styles.warning}>
          Nome o telefono del profilo scelto differisce dall’iscrizione. Verifica entrambi prima di confermare; i dati dell’iscrizione non verranno sovrascritti.
        </p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="outline" className={`${styles.button} ${styles.secondaryButton}`} disabled={saving} onClick={onClose}>Annulla</Button>
          <Button type="button" className={`${styles.button} ${styles.primaryButton}`} disabled={saving || (!selected && !creating) || (creating && (!name.trim() || !phone.trim()))} onClick={confirm}>
            {saving ? "Collegamento…" : "Collega giocatore"}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
