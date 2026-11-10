"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import styles from "./RegistrationForm.module.css";

type Candidate = { player_identity_id: string | null; account_user_id: string | null; display_name: string; phone: string; email: string | null; gender: "M" | "F" | null; source: string; alias_match?: boolean };
type Selection =
  | { kind: "identity"; player_identity_id: string }
  | { kind: "account"; account_user_id: string; confirmed: boolean }
  | { kind: "new"; confirmed: boolean; confirmed_conflict: boolean; full_name: string; phone: string; gender: "M" | "F" | null };
type Player = { name: string; phone: string; gender: "" | "M" | "F"; selection: Selection | null };
const blankPlayer = (): Player => ({ name: "", phone: "", gender: "", selection: null });
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600";

function PlayerSlot({ number, value, onChange }: { number: 1 | 2; value: Player; onChange: (value: Player) => void }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [createOpen, setCreateOpen] = useState(false);
  const [conflictChecked, setConflictChecked] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 3) { setCandidates([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/tournaments/players/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Ricerca non disponibile");
        const result = await response.json();
        setCandidates(Array.isArray(result.data) ? result.data : []);
        setHighlight(-1);
      } catch (error) {
        if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Ricerca non disponibile");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query]);

  function edit(field: "name" | "phone", text: string) {
    onChange({ ...value, [field]: text, selection: null });
    setQuery(text); setOpen(true); setCreateOpen(false);
  }
  function select(candidate: Candidate) {
    const selection: Selection = candidate.player_identity_id
      ? { kind: "identity", player_identity_id: candidate.player_identity_id }
      : { kind: "account", account_user_id: candidate.account_user_id!, confirmed: false };
    onChange({ name: candidate.display_name, phone: candidate.phone, gender: candidate.gender ?? "", selection });
    setOpen(false); setCreateOpen(false); setQuery("");
  }
  function handleKeys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(current + 1, candidates.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(current - 1, 0)); }
    if (event.key === "Enter" && highlight >= 0 && candidates[highlight]) { event.preventDefault(); select(candidates[highlight]); }
  }
  const selectedLabel = value.selection?.kind === "identity" ? "Giocatore selezionato"
    : value.selection?.kind === "account" ? value.selection.confirmed ? "Account MOVI collegato" : "Account MOVI selezionato"
      : value.selection?.kind === "new" ? "Nuovo giocatore pronto all’iscrizione" : null;

  return <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
    <legend className="px-1 font-semibold text-slate-900">Giocatore {number}</legend>
    <div className={styles.playerGrid}>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${listId}-name`}>Nome giocatore {number}</Label>
        <Input id={`${listId}-name`} className={inputClass} value={value.name} onChange={(event) => edit("name", event.target.value)}
          onKeyDown={handleKeys} role="combobox" aria-autocomplete="list" aria-expanded={open && candidates.length > 0}
          aria-controls={`${listId}-results`} aria-activedescendant={highlight >= 0 ? `${listId}-option-${highlight}` : undefined} required />
        {open && query.trim().length >= 3 && <div id={`${listId}-results`} role="listbox" aria-label={`Suggerimenti giocatore ${number}`}
          className={styles.suggestions}>
          {loading && <p className="p-2 text-sm text-slate-600">Ricerca…</p>}
          {!loading && candidates.length === 0 && <p className="p-2 text-sm text-slate-600">Nessun profilo trovato</p>}
          {candidates.map((candidate, index) => <div id={`${listId}-option-${index}`} role="option" aria-selected={highlight === index}
            key={candidate.player_identity_id ?? candidate.account_user_id} className={`${styles.suggestionItem} ${highlight === index ? styles.suggestionActive : ""}`}>
            <button type="button" className={styles.suggestionButton}
              onMouseDown={(event) => event.preventDefault()} onClick={() => select(candidate)}>
              <span className={styles.suggestionName}>{candidate.display_name}</span>
              <span className={styles.suggestionMeta}>
                <span className={styles.suggestionPhone}>{candidate.phone}</span>
                {candidate.email && <span className={styles.suggestionEmail}>{candidate.email}</span>}
              </span>
              <span className={styles.suggestionBadges}>
                <span className={`${styles.statusBadge} ${candidate.source === "Profilo MOVI" ? styles.profileBadge : candidate.source === "Account da collegare" ? styles.accountBadge : styles.identityBadge}`}>{candidate.source}</span>
                {candidate.alias_match && <span className={styles.aliasBadge}>Alias storico</span>}
              </span>
            </button>
          </div>)}
        </div>}
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${listId}-phone`}>Telefono giocatore {number}</Label>
        <Input id={`${listId}-phone`} className={inputClass} type="tel" value={value.phone} onChange={(event) => edit("phone", event.target.value)} onKeyDown={handleKeys} required />
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${listId}-gender`}>Sesso (se noto)</Label>
        <select id={`${listId}-gender`} className={inputClass} value={value.gender}
          onChange={(event) => onChange({ ...value, gender: event.target.value as Player["gender"], selection: value.selection?.kind === "new" ? null : value.selection })}>
          <option value="">Seleziona</option><option value="M">M</option><option value="F">F</option>
        </select>
      </div>
    </div>
    {selectedLabel && <p className={styles.selectedBadge} role="status">{selectedLabel}</p>}
    {value.selection?.kind === "account" && !value.selection.confirmed && <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>L’identità sportiva di questo account sarà risolta durante l’iscrizione. Eventuali conflitti bloccheranno l’operazione.</p>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => onChange({ ...value, selection: { ...value.selection!, confirmed: true } as Selection })}>Conferma collegamento account</Button>
    </div>}
    {!value.selection && <div className={styles.createAction}>
      <p>Nessun profilo corretto? Crea una nuova identità giocatore.</p>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => { setCreateOpen(true); setOpen(false); }}>Crea nuovo giocatore</Button>
    </div>}
    {createOpen && !value.selection && <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
      <p>Non è stato trovato un profilo MOVI compatibile. Verrà creata una nuova identità giocatore, senza account di accesso.</p>
      <p className="mt-1 break-words font-medium">{value.name || "Nome mancante"} · {value.phone || "Telefono mancante"}</p>
      <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-1" checked={conflictChecked} onChange={(event) => setConflictChecked(event.target.checked)} />Ho verificato eventuali omonimi o alias storici.</label>
      <Button type="button" className="mt-2 min-h-11" disabled={!value.name.trim() || !value.phone.trim()}
        onClick={() => { onChange({ ...value, selection: { kind: "new", confirmed: true, confirmed_conflict: conflictChecked, full_name: value.name.trim(), phone: value.phone.trim(), gender: value.gender || null } }); setCreateOpen(false); }}>
        Conferma nuova identità</Button>
    </div>}
  </fieldset>;
}

export default function RegistrationForm({ tournamentId, tournamentType, onCreated }: { tournamentId: string; tournamentType?: string; onCreated?: () => void | Promise<void> }) {
  const showP2 = tournamentType === "Coppie fisse";
  const [saving, setSaving] = useState(false);
  const [p1, setP1] = useState<Player>(blankPlayer);
  const [p2, setP2] = useState<Player>(blankPlayer);
  const [notes, setNotes] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!p1.selection || (showP2 && !p2.selection)) { toast.error("Seleziona o crea ogni giocatore prima di iscriverlo"); return; }
    if (p1.selection.kind === "account" && !p1.selection.confirmed || showP2 && p2.selection?.kind === "account" && !p2.selection.confirmed) { toast.error("Conferma il collegamento dell’account"); return; }
    if (showP2 && p1.selection.kind === "identity" && p2.selection?.kind === "identity" && p1.selection.player_identity_id === p2.selection.player_identity_id) { toast.error("I due giocatori devono essere diversi"); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/registrations`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p1: { ...p1.selection, gender: p1.gender || null }, p2: showP2 ? { ...p2.selection, gender: p2.gender || null } : null, notes: notes.trim() || null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Iscrizione non riuscita");
      toast.success("Iscrizione aggiunta"); setP1(blankPlayer()); setP2(blankPlayer()); setNotes("");
      await onCreated?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Errore"); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-lg font-extrabold text-slate-900">Aggiungi iscrizione</h2><span className="text-xs text-slate-500">Tipo: {tournamentType ?? "—"}</span></div>
    <PlayerSlot number={1} value={p1} onChange={setP1} />
    {showP2 && <PlayerSlot number={2} value={p2} onChange={setP2} />}
    <div className="min-w-0 space-y-1"><Label htmlFor="registration-notes">Note (opz.)</Label><Textarea id="registration-notes" className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></div>
    <Button type="submit" disabled={saving} className="min-h-11 bg-indigo-600 hover:bg-indigo-700">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio…</> : "Aggiungi"}</Button>
  </form>;
}
