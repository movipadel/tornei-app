"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type FixedPairsPair = {
  id: string; // registration.id
  name: string;
};

type FormatMode = "groups_and_bracket" | "bracket_only" | "group_only";
type ScoringMode = "one_set" | "best_of_3";

type GroupDraft = {
  id: string;
  name: string;
  closed: boolean;
  pairIds: string[];
};

type MatchDraft = {
  id: string;
  stage: "group" | "bracket";
  groupId?: string;
  groupName?: string;
  roundLabel?: string;
  homePairId: string; // registration.id
  awayPairId: string; // registration.id
  court?: number | null;
  startsAt?: string | null; // "HH:MM"
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundRobinMatches(pairIds: string[], groupId: string, groupName: string, legs: 1 | 2): MatchDraft[] {
  const out: MatchDraft[] = [];
  for (let i = 0; i < pairIds.length; i++) {
    for (let j = i + 1; j < pairIds.length; j++) {
      // andata
      out.push({
        id: uid("m"),
        stage: "group",
        groupId,
        groupName,
        roundLabel: "Girone",
        homePairId: pairIds[i],
        awayPairId: pairIds[j],
        court: null,
        startsAt: null,
      });

      // ritorno
      if (legs === 2) {
        out.push({
          id: uid("m"),
          stage: "group",
          groupId,
          groupName,
          roundLabel: "Girone",
          homePairId: pairIds[j],
          awayPairId: pairIds[i],
          court: null,
          startsAt: null,
        });
      }
    }
  }
  return out;
}

function StepChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="base44-chip"
      style={{
        borderRadius: 999,
        padding: "4px 8px",
        fontSize: 12,
        background: active ? "#eef2ff" : "#fff",
        borderColor: active ? "#c7d2fe" : "#e2e8f0",
        color: active ? "#4338ca" : "#334155",
        fontWeight: 800,
        borderWidth: 1,
        borderStyle: "solid",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Base44Stepper
 * - evita input manuale (mobile) -> niente bug "sempre stesso valore"
 * - casella valore ridotta (~2/3 rispetto a input normale)
 * - stesso stile base44 (usa base44-input + base44-icon-btn)
 */
function Base44Stepper({
  label,
  value,
  min,
  max,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  help?: React.ReactNode;
  onChange: (v: number) => void;
}) {
  const canDec = value > min;
  const canInc = value < max;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className="base44-icon-btn"
          onClick={() => canDec && onChange(value - 1)}
          disabled={!canDec}
          aria-label="Diminuisci"
          style={{ opacity: canDec ? 1 : 0.5 }}
        >
          –
        </button>

        {/* Valore centrale: readOnly, no tastiera su mobile */}
        <input
          className="base44-input"
          value={value}
          readOnly
          inputMode="none"
          style={{
            width: 44, // ✅ ridotta ~2/3
            padding: "6px 8px",
            textAlign: "center",
            fontWeight: 900,
            fontSize: 14,
            lineHeight: 1,
          }}
        />

        <button
          type="button"
          className="base44-icon-btn"
          onClick={() => canInc && onChange(value + 1)}
          disabled={!canInc}
          aria-label="Aumenta"
          style={{ opacity: canInc ? 1 : 0.5 }}
        >
          +
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b" }}>
        Min <b>{min}</b> · Max <b>{max}</b>
      </div>

      {help ? <div style={{ color: "#64748b", fontSize: 12 }}>{help}</div> : null}
    </div>
  );
}

export default function FixedPairsGenerateWizard(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentId: string | null;
  tournamentName: string;
  pairs: FixedPairsPair[];
  onGenerated: (tournamentId: string) => void;
}) {
  const { open, onOpenChange, tournamentId, tournamentName, pairs, onGenerated } = props;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);

  const [format, setFormat] = useState<FormatMode>("groups_and_bracket");
  const [scoring, setScoring] = useState<ScoringMode>("best_of_3");

  // ✅ solo girone: 1=andata, 2=andata+ritorno
  const [roundRobinLegs, setRoundRobinLegs] = useState<1 | 2>(1);

  const [groupsCount, setGroupsCount] = useState<number>(2);
  const [qualifiersCount, setQualifiersCount] = useState<number>(4);
  const [groups, setGroups] = useState<GroupDraft[]>([]);

  // ✅ bracket_only: scegli quanti partecipanti (poi size = nextPow2)
  const [bracketParticipantsCount, setBracketParticipantsCount] = useState<number>(Math.max(2, pairs.length));

  // ✅ TDS / Seeds
  const [seedsCount, setSeedsCount] = useState<number>(0);
  const [seedRegistrationIds, setSeedRegistrationIds] = useState<string[]>([]); // ordered: seed1, seed2...

  const [courtsCount, setCourtsCount] = useState<number>(2);
  const [matches, setMatches] = useState<MatchDraft[]>([]);

  const pairsById = useMemo(() => {
    const m = new Map<string, FixedPairsPair>();
    for (const p of pairs) m.set(p.id, p);
    return m;
  }, [pairs]);

  const allPairIds = useMemo(() => pairs.map((p) => p.id), [pairs]);

  const usedPairIdsInGroups = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const pid of g.pairIds) s.add(pid);
    return s;
  }, [groups]);

  const remainingForGroups = useMemo(() => pairs.filter((p) => !usedPairIdsInGroups.has(p.id)), [pairs, usedPairIdsInGroups]);

  // ✅ options per seeds: prendiamo da tutte le coppie
  const seedOptions = useMemo(() => pairs, [pairs]);
  const seedSet = useMemo(() => new Set(seedRegistrationIds.filter(Boolean)), [seedRegistrationIds]);

  useEffect(() => {
    if (!open) return;

    setStep(1);
    setSaving(false);
    setFormat("groups_and_bracket");
    setScoring("best_of_3");

    setRoundRobinLegs(1);

    setGroupsCount(2);
    setQualifiersCount(Math.min(4, Math.max(2, pairs.length)));

    const gs: GroupDraft[] = Array.from({ length: 2 }).map((_, idx) => ({
      id: uid("g"),
      name: `Girone ${String.fromCharCode(65 + idx)}`,
      closed: false,
      pairIds: [],
    }));
    setGroups(gs);

    // bracket_only default: tutti partecipanti
    const pcount = Math.max(2, pairs.length);
    setBracketParticipantsCount(pcount);

    // seeds reset
    setSeedsCount(0);
    setSeedRegistrationIds([]);

    setCourtsCount(2);
    setMatches([]);
  }, [open, pairs.length]);

  useEffect(() => {
    setGroups((prev) => {
      const next = [...prev];
      if (next.length === groupsCount) return next;
      if (next.length < groupsCount) {
        for (let i = next.length; i < groupsCount; i++) {
          next.push({
            id: uid("g"),
            name: `Girone ${String.fromCharCode(65 + i)}`,
            closed: false,
            pairIds: [],
          });
        }
        return next;
      }
      return next.slice(0, groupsCount);
    });
  }, [groupsCount]);

  // ✅ seedsCount coerente con coppie
  useEffect(() => {
    const maxSeeds = clamp(pairs.length, 0, pairs.length);
    const sc = clamp(Number(seedsCount || 0), 0, maxSeeds);
    if (sc !== seedsCount) setSeedsCount(sc);

    setSeedRegistrationIds((prev) => {
      const next = [...prev];
      if (next.length > sc) return next.slice(0, sc);
      while (next.length < sc) next.push("");
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedsCount, pairs.length]);

  function addPairToGroup(groupId: string, pairId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        if (g.closed) return g;
        if (g.pairIds.includes(pairId)) return g;
        return { ...g, pairIds: [...g.pairIds, pairId] };
      })
    );
  }

  function removePairFromGroup(groupId: string, pairId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, pairIds: g.pairIds.filter((x) => x !== pairId) } : g)));
  }

  function closeGroup(groupId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, closed: true } : g)));
  }
  function reopenGroup(groupId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, closed: false } : g)));
  }

  function setSeedAt(i: number, value: string) {
    setSeedRegistrationIds((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function autoBuildSingleGroup() {
    const gId = uid("g");
    const gName = "Girone Unico";
    const g: GroupDraft = { id: gId, name: gName, closed: true, pairIds: [...allPairIds] };
    setGroupsCount(1);
    setGroups([g]);
    setMatches(roundRobinMatches(g.pairIds, gId, gName, roundRobinLegs));
  }

  function buildMatchesFromGroups() {
    const ms: MatchDraft[] = [];
    for (const g of groups) {
      if (g.pairIds.length < 2) continue;
      ms.push(...roundRobinMatches(g.pairIds, g.id, g.name, roundRobinLegs));
    }
    setMatches(ms);
  }

  function validateSeedsLocal(): string | null {
    if (seedsCount <= 0) return null;
    const ids = seedRegistrationIds.map((x) => String(x || "")).filter(Boolean);
    if (ids.length !== seedsCount) return "Seleziona tutte le TDS (Seed 1..Seed N)";
    const uniq = new Set(ids);
    if (uniq.size !== ids.length) return "Le TDS devono essere tutte diverse";
    return null;
  }

  function goNext() {
    if (step === 1) {
      const seedErr = validateSeedsLocal();
      if (seedErr) return toast.error(seedErr);

      if (format === "groups_and_bracket") {
        if (groupsCount < 1) return toast.error("Numero gironi non valido");
        if (qualifiersCount < 2) return toast.error("Qualificate non valide");
      }

      if (format === "group_only") autoBuildSingleGroup();
      if (format === "bracket_only") setMatches([]);

      setStep(2);
      return;
    }

    if (step === 2) {
      if (format === "groups_and_bracket") {
        if (groups.some((g) => !g.closed)) return toast.error("Chiudi prima tutti i gironi");
        const used = new Set<string>();
        for (const g of groups) for (const pid of g.pairIds) used.add(pid);
        if (used.size < 2) return toast.error("Inserisci almeno 2 coppie nei gironi");
        buildMatchesFromGroups();
      }

      if (format === "bracket_only") {
        const pcount = clamp(bracketParticipantsCount || 2, 2, pairs.length);
        if (pcount < 2) return toast.error("Servono almeno 2 partecipanti");
      }

      setStep(3);
      return;
    }

    if (step === 3) {
  if (courtsCount < 1) return toast.error("Numero campi non valido");

  // ✅ Obbligo campo + orario per ogni partita (gironi)
  if (format !== "bracket_only") {
    const missingCourt = matches.filter(
      (m) => m.stage === "group" && (m.court == null || m.court === 0)
    );

    const missingTime = matches.filter(
      (m) => m.stage === "group" && !m.startsAt
    );

    if (missingCourt.length > 0 || missingTime.length > 0) {
      return toast.error(
        "Devi inserire campo e orario per tutte le partite."
      );
    }
  }

  setStep(4);
  return;
}
  }

  function goBack() {
    if (step === 1) return;
    setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : 3));
  }

  async function submit() {
    if (!tournamentId) return;

    const seedErr = validateSeedsLocal();
    if (seedErr) return toast.error(seedErr);

    if (format === "groups_and_bracket") {
      if (groups.some((g) => g.pairIds.length < 2)) return toast.error("Ogni girone deve avere almeno 2 coppie");
      if (groups.some((g) => !g.closed)) return toast.error("Chiudi tutti i gironi prima di generare");
    }

    if (format === "group_only") {
      if (roundRobinLegs !== 1 && roundRobinLegs !== 2) return toast.error("Andata/ritorno non valido");
    }
    // ✅ Controllo finale obbligo campo + orario
if (format !== "bracket_only") {
  const missingCourt = matches.filter(
    (m) => m.stage === "group" && (m.court == null || m.court === 0)
  );

  const missingTime = matches.filter(
    (m) => m.stage === "group" && !m.startsAt
  );

  if (missingCourt.length > 0 || missingTime.length > 0) {
    return toast.error(
      "Devi inserire campo e orario per tutte le partite."
    );
  }
}
    setSaving(true);
    try {
      const payload = {
        type: "fixed_pairs",
        format,
        scoring,

        roundRobinLegs: format === "group_only" ? roundRobinLegs : undefined,

        seedsCount: seedsCount || 0,
        seedRegistrationIds: (seedRegistrationIds ?? []).filter(Boolean),

        groups: format === "groups_and_bracket" || format === "group_only" ? groups : [],
        qualifiersCount: format === "groups_and_bracket" ? qualifiersCount : null,

        // ✅ bracket_only: NO composizione manuale, gestisce tutto il server
        bracketParticipantsCount: format === "bracket_only" ? clamp(bracketParticipantsCount || 2, 2, pairs.length) : null,
        bracketSlots: [],

        courtsCount,
        matches, // solo gironi (se bracket_only è vuoto)
      };

      const res = await fetch(`/api/admin/tournaments/${tournamentId}/fixed/run/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error((json as any).error || "Errore generazione torneo");

      onGenerated(tournamentId);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  const groupedMatches = useMemo(() => {
    const byGroup = new Map<string, MatchDraft[]>();
    for (const m of matches) {
      const key = m.groupId ?? "no_group";
      const arr = byGroup.get(key) ?? [];
      arr.push(m);
      byGroup.set(key, arr);
    }
    return Array.from(byGroup.entries()).map(([groupId, ms]) => ({
      groupId,
      name: ms[0]?.groupName ?? "Girone",
      matches: ms,
    }));
  }, [matches]);

  const title = `Genera Coppie Fisse — ${tournamentName || "Torneo"}`;

  const bracketSize = useMemo(
    () => nextPowerOfTwo(clamp(bracketParticipantsCount || 2, 2, pairs.length)),
    [bracketParticipantsCount, pairs.length]
  );

  // -----------------------------
  // Layout helpers (solo UI)
  // -----------------------------
  const cardNoShadow = { boxShadow: "none" as const };
  const bodyPaddingBottom = 110; // spazio per footer sticky

  function PillPairRow({
    name,
    onRemove,
    disabled,
  }: {
    name: string;
    onRemove: () => void;
    disabled?: boolean;
  }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "1px solid #e2e8f0",
          borderRadius: 999,
          padding: "8px 10px",
          background: "#fff",
        }}
      >
        <div style={{ flex: 1, fontWeight: 800, color: "#0f172a" }}>{name}</div>
        <button
          type="button"
          className="base44-icon-btn"
          aria-label="Rimuovi"
          onClick={onRemove}
          disabled={!!disabled}
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            opacity: disabled ? 0.5 : 1,
          }}
          title="Rimuovi"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl"
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 32px)",
          overflow: "hidden",
        }}
      >
        {/* come TournamentDialogForm: nascondiamo la X */}
        <style>{`
          .absolute.right-4.top-4 { display: none !important; }
        `}</style>

        {/* HEADER compatto */}
<div style={{ display: "grid", gap: 8, paddingBottom: 6 }}>
  {/* Titolo 1 riga */}
  <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
    <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap" }}>Genera</div>

    <div
      style={{
        fontSize: 18,
        fontWeight: 900,
        lineHeight: 1.1,
        color: "#0f172a",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
        flex: 1,
      }}
      title={tournamentName || "Torneo"}
    >
      {tournamentName || "Torneo"}
    </div>
  </div>

  {/* Stepper 1 riga, mini, read-only */}
  <div
    style={{
      display: "flex",
      gap: 6,
      overflowX: "auto",
      paddingBottom: 4,
      WebkitOverflowScrolling: "touch",
    }}
  >
    <StepChip active={step === 1} label="1" />
    <StepChip active={step === 2} label="2" />
    <StepChip active={step === 3} label="3" />
    <StepChip active={step === 4} label="4" />

    <div style={{ marginLeft: 6, color: "#64748b", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
      {step === 1 ? "Impostazioni" : step === 2 ? "Composizione" : step === 3 ? "Calendario" : "Conferma"}
    </div>
  </div>
</div>


        {/* BODY (scrollabile) */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            marginTop: 14,
            paddingRight: 6,
            paddingBottom: bodyPaddingBottom,
          }}
        >
          {/* STEP 1 — mobile-first: sezioni verticali */}
          {step === 1 && (
            <div style={{ display: "grid", gap: 14 }}>
              {/* Formula */}
              <div className="base44-card" style={cardNoShadow}>
                <div className="base44-card-inner">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>1) Formula torneo</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" name="format" checked={format === "groups_and_bracket"} onChange={() => setFormat("groups_and_bracket")} />
                      Gironi + tabellone finale
                    </label>

                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" name="format" checked={format === "bracket_only"} onChange={() => setFormat("bracket_only")} />
                      Solo tabellone
                    </label>

                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" name="format" checked={format === "group_only"} onChange={() => setFormat("group_only")} />
                      Solo girone (autogenerato)
                    </label>
                  </div>

                  {format === "groups_and_bracket" && (
                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      <Base44Stepper
                        label="Quanti gironi?"
                        value={groupsCount}
                        min={1}
                        max={8}
                        onChange={(v) => {
                          setGroupsCount(v);
                          setQualifiersCount((q) => clamp(q, 2, pairs.length));
                        }}
                      />

                      <Base44Stepper
                        label="Quante coppie qualificate al tabellone finale?"
                        value={qualifiersCount}
                        min={2}
                        max={pairs.length}
                        help={<>Il tabellone finale verrà generato automaticamente quando i gironi saranno conclusi.</>}
                        onChange={(v) => setQualifiersCount(v)}
                      />
                    </div>
                  )}

                  {format === "group_only" && (
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>Solo girone</div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="radio" name="legs" checked={roundRobinLegs === 1} onChange={() => setRoundRobinLegs(1)} />
                          Solo andata
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="radio" name="legs" checked={roundRobinLegs === 2} onChange={() => setRoundRobinLegs(2)} />
                          Andata + ritorno
                        </label>
                      </div>
                    </div>
                  )}

                  {format === "bracket_only" && (
                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      <Base44Stepper label="Numero partecipanti" value={bracketParticipantsCount} min={2} max={pairs.length} onChange={(v) => setBracketParticipantsCount(v)} />
                      <div style={{ color: "#64748b", fontSize: 12, marginTop: -4 }}>
                        Dimensione tabellone: <b>{bracketSize}</b> (BYE automatici per completare la potenza di 2).
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Punteggio */}
              <div className="base44-card" style={cardNoShadow}>
                <div className="base44-card-inner">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>2) Modalità punteggio</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" name="scoring" checked={scoring === "one_set"} onChange={() => setScoring("one_set")} />
                      1 set
                    </label>
                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input type="radio" name="scoring" checked={scoring === "best_of_3"} onChange={() => setScoring("best_of_3")} />
                      Al meglio dei 3 set
                    </label>
                  </div>
                </div>
              </div>

              {/* TDS */}
              {(format === "bracket_only" || format === "groups_and_bracket") && (
                <div className="base44-card" style={cardNoShadow}>
                  <div className="base44-card-inner">
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Teste di serie (TDS)</div>

                    <Base44Stepper
                      label="Numero teste di serie"
                      value={seedsCount}
                      min={0}
                      max={pairs.length}
                      help={<>I BYE verranno assegnati automaticamente alle TDS più alte (Seed 1, poi Seed 2, …).</>}
                      onChange={(v) => setSeedsCount(v)}
                    />

                    {seedsCount > 0 && (
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {Array.from({ length: seedsCount }).map((_, i) => {
                          const current = seedRegistrationIds[i] || "";
                          return (
                            <div key={i} style={{ display: "grid", gap: 6 }}>
                              <div style={{ fontWeight: 900 }}>Seed {i + 1}</div>
                              <select className="base44-input" value={current} onChange={(e) => setSeedAt(i, e.target.value)}>
                                <option value="">(seleziona coppia)</option>
                                {seedOptions.map((p) => {
                                  const takenByOther = seedSet.has(p.id) && p.id !== current;
                                  return (
                                    <option key={p.id} value={p.id} disabled={takenByOther}>
                                      {p.name}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Coppie iscritte (collassabile su mobile) */}
              <div className="base44-card" style={cardNoShadow}>
                <div className="base44-card-inner">
                  <details>
                    <summary style={{ cursor: "pointer", listStyle: "none" as any }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>Coppie iscritte</div>
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          Totale: <b>{pairs.length}</b>
                        </div>
                      </div>
                    </summary>

                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      {pairs.map((p) => (
                        <span key={p.id} className="base44-chip" style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}>
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div style={{ display: "grid", gap: 14 }}>
              {format === "group_only" && (
                <div className="base44-card" style={cardNoShadow}>
                  <div className="base44-card-inner">
                    <div style={{ fontWeight: 900 }}>Girone unico creato automaticamente</div>
                    <div style={{ color: "#64748b", marginTop: 6 }}>
                      Partite generate: <b>{matches.length}</b>
                    </div>
                  </div>
                </div>
              )}

              {format === "groups_and_bracket" && (
                <>
                  {/* Sticky Summary (primario) */}
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 5,
                      background: "#fff",
                      paddingBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        padding: "10px 12px",
                        background: "#f8fafc",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#0f172a" }}>Riepilogo</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "#334155", fontSize: 13 }}>
                        <span>
                          Assegnate <b>{usedPairIdsInGroups.size}</b>/<b>{pairs.length}</b>
                        </span>
                        <span style={{ color: "#64748b" }}>·</span>
                        <span>
                          Non assegnate <b>{pairs.length - usedPairIdsInGroups.size}</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info tabellone (collassabile) */}
                  <div className="base44-card" style={cardNoShadow}>
                    <div className="base44-card-inner">
                      <details>
                        <summary style={{ cursor: "pointer", listStyle: "none" as any }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div style={{ fontWeight: 900 }}>Tabellone finale</div>
                            <div style={{ color: "#64748b", fontSize: 13 }}>Info</div>
                          </div>
                        </summary>
                        <div style={{ color: "#64748b", fontSize: 13, marginTop: 10 }}>
                          Verrà generato automaticamente a fine gironi (prime, poi seconde, ecc.).
                        </div>

                        {seedsCount > 0 && (
                          <div style={{ marginTop: 12, padding: 12, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff" }}>
                            <div style={{ fontWeight: 900 }}>TDS selezionate</div>
                            <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                              Seed 1..{seedsCount} salvati nel payload.
                            </div>
                          </div>
                        )}
                      </details>
                    </div>
                  </div>

                  {/* Gironi */}
                  <div className="base44-card" style={cardNoShadow}>
                    <div className="base44-card-inner">
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Composizione gironi (manuale)</div>
                      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
                        Aggiungi coppie dai menu: una coppia assegnata sparisce dalle opzioni disponibili.
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        {groups.map((g) => (
                          <div
                            key={g.id}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: 16,
                              padding: 12,
                              background: g.closed ? "#f8fafc" : "#fff",
                            }}
                          >
                            {/* Header pulito */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 900 }}>{g.name}</div>
                                {g.closed && (
                                  <span
                                    className="base44-chip"
                                    style={{
                                      borderColor: "#e2e8f0",
                                      background: "#eef2ff",
                                      color: "#4338ca",
                                      fontWeight: 900,
                                    }}
                                  >
                                    CHIUSO
                                  </span>
                                )}
                              </div>

                              {g.closed ? (
                                <button className="base44-csv-btn" onClick={() => reopenGroup(g.id)}>
                                  Riapri
                                </button>
                              ) : (
                                <button className="base44-csv-btn" onClick={() => closeGroup(g.id)} style={{ fontWeight: 900 }}>
                                  Chiudi
                                </button>
                              )}
                            </div>

                            {/* Add + remaining */}
                            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                              {!g.closed && (
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                    <div style={{ fontWeight: 800, color: "#334155" }}>Aggiungi coppia</div>
                                    <div style={{ color: "#64748b", fontSize: 12 }}>
                                      Rimaste: <b>{remainingForGroups.length}</b>
                                    </div>
                                  </div>

                                  <select
                                    className="base44-input"
                                    defaultValue=""
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (!v) return;
                                      addPairToGroup(g.id, v);
                                      e.currentTarget.value = "";
                                    }}
                                  >
                                    <option value="">+ Seleziona…</option>
                                    {remainingForGroups.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Lista coppie */}
                              {g.pairIds.length === 0 ? (
                                <div style={{ color: "#64748b" }}>Nessuna coppia inserita</div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {g.pairIds.map((pid) => (
                                    <PillPairRow
                                      key={pid}
                                      name={pairsById.get(pid)?.name ?? pid}
                                      disabled={g.closed}
                                      onRemove={() => !g.closed && removePairFromGroup(g.id, pid)}
                                    />
                                  ))}
                                </div>
                              )}

                              {g.closed && (
                                <div style={{ color: "#64748b", fontSize: 12 }}>
                                  Girone chiuso (coppie: <b>{g.pairIds.length}</b>)
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {format === "bracket_only" && (
                <div className="base44-card" style={cardNoShadow}>
                  <div className="base44-card-inner">
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Tabellone (automatico)</div>

                    <div style={{ display: "grid", gap: 10, color: "#334155" }}>
                      <div>
                        Partecipanti: <b>{clamp(bracketParticipantsCount || 2, 2, pairs.length)}</b>
                      </div>
                      <div>
                        Dimensione tabellone: <b>{bracketSize}</b>
                      </div>

                      <div style={{ color: "#64748b", fontSize: 13 }}>
                        Il server posizionerà le TDS, sorteggerà le altre coppie e assegnerà i BYE automaticamente alle TDS più alte.
                      </div>

                      {seedsCount > 0 && (
                        <div style={{ marginTop: 8, padding: 12, borderRadius: 16, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                          <div style={{ fontWeight: 900 }}>TDS + BYE</div>
                          <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                            BYE automatici alle TDS più alte (Seed 1, poi Seed 2, …).
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div style={{ display: "grid", gap: 14 }}>
              {/* Sticky bar: Campi */}
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  background: "#fff",
                  paddingBottom: 10,
                }}
              >
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: "10px 12px",
                    background: "#f8fafc",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>Calendario</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {/* Stepper compatto: riuso Base44Stepper ma senza help/extra testo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 800, color: "#334155" }}>Campi</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          className="base44-icon-btn"
                          onClick={() => courtsCount > 1 && setCourtsCount(courtsCount - 1)}
                          disabled={courtsCount <= 1}
                          aria-label="Diminuisci campi"
                          style={{ opacity: courtsCount > 1 ? 1 : 0.5 }}
                        >
                          –
                        </button>

                        <input
                          className="base44-input"
                          value={courtsCount}
                          readOnly
                          inputMode="none"
                          style={{
                            width: 44,
                            padding: "6px 8px",
                            textAlign: "center",
                            fontWeight: 900,
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                        />

                        <button
                          type="button"
                          className="base44-icon-btn"
                          onClick={() => courtsCount < 16 && setCourtsCount(courtsCount + 1)}
                          disabled={courtsCount >= 16}
                          aria-label="Aumenta campi"
                          style={{ opacity: courtsCount < 16 ? 1 : 0.5 }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ color: "#64748b", fontSize: 12, marginTop: 8, paddingLeft: 2 }}>
                  Inserisci <b>campo</b> e <b>orario</b> per ogni partita (visibile anche lato user).
                </div>
              </div>

              {/* Partite */}
              <div className="base44-card" style={cardNoShadow}>
                <div className="base44-card-inner">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Partite</div>

                  {format === "bracket_only" ? (
                    <div style={{ color: "#64748b" }}>
                      Per “solo tabellone”, il calendario dettagliato verrà gestito quando generiamo i turni del tabellone.
                      (In questa fase salviamo partecipanti + TDS.)
                    </div>
                  ) : matches.length === 0 ? (
                    <div style={{ color: "#64748b" }}>Nessuna partita generata.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 14 }}>
                      {groupedMatches.map((g) => (
                        <details
                          key={g.groupId}
                          open
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 16,
                            padding: 12,
                            background: "#fff",
                          }}
                        >
                          <summary style={{ cursor: "pointer", listStyle: "none" as any }}>
                            <div style={{ fontWeight: 900 }}>{g.name}</div>
                          </summary>

                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            {g.matches.map((m) => {
                              const home = pairsById.get(m.homePairId)?.name ?? m.homePairId;
                              const away = pairsById.get(m.awayPairId)?.name ?? m.awayPairId;

                              return (
                                <div
                                  key={m.id}
                                  style={{
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 16,
                                    padding: 12,
                                    background: "#f8fafc",
                                  }}
                                >
                                  {/* Match title (vertical, più leggibile) */}
                                  <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                    {home}
                                  </div>
                                  <div style={{ color: "#64748b", fontWeight: 800, margin: "2px 0" }}>vs</div>
                                  <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                    {away}
                                  </div>

                                  {/* Controls: stack su mobile */}
                                  <div
                                    className="grid grid-cols-1 md:grid-cols-2"
                                    style={{
                                      gap: 12,
                                      marginTop: 12,
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontWeight: 800, marginBottom: 6 }}>Campo</div>
                                      <select
                                        className="base44-input"
                                        value={m.court ?? ""}
                                        onChange={(e) => {
                                          const v = e.target.value ? Number(e.target.value) : null;
                                          setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, court: v } : x)));
                                        }}
                                      >
                                        <option value="">(non assegnato)</option>
                                        {Array.from({ length: courtsCount }).map((_, i) => (
                                          <option key={i} value={i + 1}>
                                            Campo {i + 1}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div>
                                      <div style={{ fontWeight: 800, marginBottom: 6 }}>Orario</div>
                                      <input
                                        type="time"
                                        className="base44-input"
                                        value={m.startsAt ?? ""}
                                        onChange={(e) => {
                                          const v = e.target.value || null;
                                          setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, startsAt: v } : x)));
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 (quasi invariato) */}
          {step === 4 && (
            <div className="base44-card" style={cardNoShadow}>
              <div className="base44-card-inner">
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Conferma generazione</div>

                <div style={{ display: "grid", gap: 10, color: "#334155" }}>
                  <div>
                    Formula:{" "}
                    <b>{format === "groups_and_bracket" ? "Gironi + tabellone" : format === "bracket_only" ? "Solo tabellone" : "Solo girone"}</b>
                  </div>
                  <div>
                    Punteggio: <b>{scoring === "one_set" ? "1 set" : "Best of 3"}</b>
                  </div>
                  <div>
                    Campi: <b>{courtsCount}</b>
                  </div>

                  {format === "group_only" && (
                    <div>
                      Girone: <b>{roundRobinLegs === 1 ? "solo andata" : "andata + ritorno"}</b>
                    </div>
                  )}

                  {format !== "bracket_only" && (
                    <div>
                      Partite gironi: <b>{matches.length}</b>
                    </div>
                  )}

                  {format === "groups_and_bracket" && (
                    <div>
                      Gironi: <b>{groupsCount}</b> — Qualificate tabellone: <b>{qualifiersCount}</b>
                    </div>
                  )}

                  {format === "bracket_only" && (
                    <div>
                      Partecipanti: <b>{clamp(bracketParticipantsCount || 2, 2, pairs.length)}</b> — Dimensione tabellone: <b>{bracketSize}</b>
                    </div>
                  )}

                  {seedsCount > 0 && (
                    <div>
                      TDS: <b>{seedsCount}</b> (BYE assegnati automaticamente alle TDS più alte)
                    </div>
                  )}

                  <div style={{ marginTop: 6, padding: 12, borderRadius: 16, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <div style={{ fontWeight: 800 }}>Classifica gironi</div>
                    <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                      1 punto vittoria, 0 sconfitta. Tie-break: Punti, GW, GL, DG.
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="button" className="base44-csv-btn" onClick={() => onOpenChange(false)} disabled={saving}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="base44-primary-btn"
                    onClick={submit}
                    disabled={saving || !tournamentId}
                    style={{ opacity: saving ? 0.75 : 1 }}
                  >
                    {saving ? "Generazione..." : "Conferma e genera"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls — sticky (sempre visibile) */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "#fff",
            marginTop: 10,
            paddingTop: 10,
            paddingBottom: 10,
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* SINISTRA: step 1 = Chiudi, altri step = Indietro */}
          {step === 1 ? (
            <button
              type="button"
              className="base44-csv-btn"
              disabled={saving}
              onClick={() => onOpenChange(false)}
              style={{ borderRadius: 999, padding: "10px 14px" }}
            >
              Chiudi
            </button>
          ) : (
            <button
              type="button"
              className="base44-csv-btn"
              disabled={saving}
              onClick={goBack}
              style={{ borderRadius: 999, padding: "10px 14px" }}
            >
              Indietro
            </button>
          )}

          {/* DESTRA: Avanti solo fino allo step 3 */}
          {step < 4 ? (
            <button
              type="button"
              className="base44-primary-btn"
              disabled={saving}
              onClick={goNext}
              style={{ borderRadius: 999, padding: "10px 14px", opacity: saving ? 0.75 : 1 }}
            >
              Avanti
            </button>
          ) : (
            <div />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
