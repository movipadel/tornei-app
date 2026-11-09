"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import styles from "@/app/monday-league/MondayLeague.module.css";

type RevealedLineup = { state: "submitted"; players: string[] } | { state: "missing"; label: string };
type RosterPlayer = { id: string; displayName: string; isCaptain: boolean };

export type CaptainLineupMatch = {
  matchId: string;
  roundNumber: number;
  opponentName: string;
  status: "scheduled" | "postponed";
  scheduledAt: string | null;
  venueName: string | null;
  lineupDeadline: string | null;
  lineupLocked: boolean;
  canSubmitLineup: boolean;
  ownLineup: null | { lineupId: string; revision: number; players: Array<{ id: string; displayName: string }> };
  opponentLineup: RevealedLineup | null;
};

export type CaptainResultMatch = {
  matchId: string;
  roundNumber: number;
  opponentName: string;
  status: string;
  scheduledAt: string | null;
  resultId: string | null;
  isAwayCaptain: boolean;
  canSubmitResult: boolean;
  canContestResult: boolean;
  effectiveStatus: string | null;
  submittedAt: string | null;
  contestDeadline: string | null;
  summary: string | null;
  sets: Array<{ number: number; homeGames: number; awayGames: number }>;
  contestSubmitted: boolean;
};

function matchTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value));
}

function LineupCard({ match, teamId, roster, onSaved, focused }: {
  match: CaptainLineupMatch; teamId: string; roster: RosterPlayer[]; onSaved: () => void; focused: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(match.ownLineup?.players.map((player) => player.id) ?? []);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!match.canSubmitLineup || selected.length !== 2 || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monday-league/matches/${match.matchId}/lineups`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, player_ids: selected }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(json.error || "Formazione non inviata");
      toast.success("Formazione inviata"); onSaved();
    } catch {
      toast.error("Formazione non inviata");
    } finally { setBusy(false); }
  }
  function togglePlayer(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id)
      : current.length < 2 ? [...current, id] : current);
  }
  return <article id={`lineup-${match.matchId}`} className={`${styles.captainMatchCard}${focused ? ` ${styles.captainMatchFocus}` : ""}`}>
    <strong>Giornata {match.roundNumber} · vs {match.opponentName}</strong>
    <p className={styles.muted}>{match.status === "postponed" ? "Da recuperare · formazione modificabile fino alla chiusura del recupero"
      : `${match.scheduledAt ? matchTime(match.scheduledAt) : "Data da definire"} · ${match.venueName ?? "Sede da definire"}`}</p>
    {match.status === "scheduled" && match.lineupDeadline ? <p className={styles.muted}>Scadenza formazione: {matchTime(match.lineupDeadline)}</p> : null}
    <p className={styles.muted}>{match.ownLineup ? `Formazione inviata · revisione ${match.ownLineup.revision}: ${match.ownLineup.players.map((player) => player.displayName).join(" · ")}` : "Formazione non ancora inviata"}</p>
    {match.canSubmitLineup ? <>
      <div className={styles.captainPlayerChoices}>{roster.map((player) => <button key={player.id} type="button"
        className={selected.includes(player.id) ? styles.captainPlayerSelected : styles.captainPlayerChoice}
        aria-pressed={selected.includes(player.id)} onClick={() => togglePlayer(player.id)}>{player.displayName}</button>)}</div>
      <button type="button" className={styles.captainAction} disabled={busy || selected.length !== 2} onClick={() => void submit()}>
        {match.ownLineup ? "Modifica formazione" : "Schiera formazione"}
      </button>
    </> : <p className={styles.muted}>{match.lineupLocked ? "Formazione bloccata" : "Formazione non ancora disponibile"}</p>}
    <p className={styles.muted}>Avversari: {match.opponentLineup ? match.opponentLineup.state === "submitted" ? match.opponentLineup.players.join(" · ") : match.opponentLineup.label : "Formazione riservata"}</p>
  </article>;
}

function ResultCard({ match, onSaved, focused }: { match: CaptainResultMatch; onSaved: () => void; focused: boolean }) {
  const [scores, setScores] = useState<Array<{ homeGames: string; awayGames: string }>>([
    { homeGames: "", awayGames: "" }, { homeGames: "", awayGames: "" }, { homeGames: "", awayGames: "" },
  ]);
  const [contestReason, setContestReason] = useState("");
  const [busy, setBusy] = useState(false);
  const playedSets = scores.filter((score) => score.homeGames !== "" && score.awayGames !== "")
    .map((score) => ({ homeGames: Number(score.homeGames), awayGames: Number(score.awayGames) }));
  const legalSet = (score: { homeGames: number; awayGames: number }) =>
    (score.homeGames === 6 && score.awayGames >= 0 && score.awayGames <= 4)
    || (score.awayGames === 6 && score.homeGames >= 0 && score.homeGames <= 4)
    || (score.homeGames === 7 && [5, 6].includes(score.awayGames))
    || (score.awayGames === 7 && [5, 6].includes(score.homeGames));
  const homeSets = playedSets.filter((score) => score.homeGames > score.awayGames).length;
  const awaySets = playedSets.filter((score) => score.awayGames > score.homeGames).length;
  const validResult = playedSets.every(legalSet) && Math.max(homeSets, awaySets) === 2
    && ((playedSets.length === 2 && Math.min(homeSets, awaySets) === 0)
      || (playedSets.length === 3 && Math.min(homeSets, awaySets) === 1));

  async function submit() {
    if (!match.canSubmitResult || !validResult || busy) return;
    if (!window.confirm(`Confermi il risultato ${homeSets}–${awaySets}? Dopo l'invio non potrai modificarlo.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monday-league/matches/${match.matchId}/result`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sets: playedSets }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(json.error || "Risultato non inviato");
      toast.success("Risultato inviato"); onSaved();
    } catch {
      toast.error("Risultato non inviato");
    } finally { setBusy(false); }
  }
  async function contest() {
    if (!match.canContestResult || !match.resultId || !contestReason.trim() || busy) return;
    if (!window.confirm("Confermi l'invio della contestazione?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monday-league/matches/${match.matchId}/contest`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: match.resultId, reason: contestReason }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(json.error || "Contestazione non inviata");
      toast.success("Contestazione inviata"); onSaved();
    } catch {
      toast.error("Contestazione non inviata");
    } finally { setBusy(false); }
  }
  const resultStatus = match.effectiveStatus === "contested" ? "Contestato"
    : match.effectiveStatus === "confirmed" ? "Definitivo" : "Provvisorio";
  return <article id={`result-${match.matchId}`} className={`${styles.captainMatchCard}${focused ? ` ${styles.captainMatchFocus}` : ""}`}>
    <strong>Risultato · Giornata {match.roundNumber} · vs {match.opponentName}</strong>
    {match.status === "postponed" ? <p className={styles.muted}>Recupero da registrare</p> : null}
    {match.canSubmitResult ? <>
      <p className={styles.muted}>Inserisci i set giocati. Il terzo set è facoltativo.</p>
      <div className={styles.captainScoreGrid}>{scores.map((score, index) => <div key={index} className={styles.captainScoreRow}>
        <span>Set {index + 1}</span><input aria-label={`Set ${index + 1} casa`} type="number" min="0" max="7" value={score.homeGames}
          onChange={(event) => setScores((current) => current.map((item, i) => i === index ? { ...item, homeGames: event.target.value } : item))} />
        <span>–</span><input aria-label={`Set ${index + 1} ospite`} type="number" min="0" max="7" value={score.awayGames}
          onChange={(event) => setScores((current) => current.map((item, i) => i === index ? { ...item, awayGames: event.target.value } : item))} />
      </div>)}</div>
      <p className={styles.muted}>{validResult ? `Anteprima: ${homeSets}–${awaySets}` : "Inserisci un risultato legale 2–0 o 2–1"}</p>
      <button type="button" className={styles.captainAction} disabled={busy || !validResult} onClick={() => void submit()}>Inserisci risultato</button>
    </> : match.resultId ? <>
      <p><strong>{match.summary}</strong> · {resultStatus}</p>
      <p className={styles.muted}>Risultato inviato · Non modificabile{match.submittedAt ? ` · ${matchTime(match.submittedAt)}` : ""}</p>
      {match.contestDeadline ? <p className={styles.muted}>Termine contestazione: {matchTime(match.contestDeadline)}</p> : null}
      {match.canContestResult ? <><textarea maxLength={1000} value={contestReason} onChange={(event) => setContestReason(event.target.value)} placeholder="Motivazione obbligatoria" />
        <button type="button" className={styles.captainAction} disabled={busy || !contestReason.trim()} onClick={() => void contest()}>Contesta risultato</button></>
        : match.contestSubmitted ? <p className={styles.muted}>Contestazione inviata</p>
          : match.isAwayCaptain && match.effectiveStatus === "confirmed"
            ? <p className={styles.muted}>Termine contestazione scaduto</p> : null}
    </> : null}
  </article>;
}

export function CaptainMatchActions({ teamId, roster, lineupMatches, resultMatches, onSaved, focusMatchId }: {
  teamId: string; roster: RosterPlayer[]; lineupMatches: CaptainLineupMatch[];
  resultMatches: CaptainResultMatch[]; onSaved: () => void; focusMatchId?: string | null;
}) {
  const scheduled = lineupMatches.filter((match) => match.status === "scheduled" && match.canSubmitLineup);
  const postponed = lineupMatches.filter((match) => match.status === "postponed" && match.canSubmitLineup);
  const urgentResults = resultMatches.filter((match) => match.status !== "postponed" && (match.canSubmitResult || match.canContestResult));
  const recoveryResults = resultMatches.filter((match) => match.status === "postponed" && (match.canSubmitResult || match.canContestResult));
  const submittedResults = resultMatches.filter((match) => !match.canSubmitResult && !match.canContestResult);
  const focusIsOwnMatch = Boolean(focusMatchId && ([...scheduled, ...postponed].some((match) => match.matchId === focusMatchId)
    || resultMatches.some((match) => match.matchId === focusMatchId)));
  useEffect(() => {
    if (!focusIsOwnMatch || !focusMatchId) return;
    const id = resultMatches.some((match) => match.matchId === focusMatchId)
      ? `result-${focusMatchId}` : `lineup-${focusMatchId}`;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [focusMatchId, focusIsOwnMatch, resultMatches]);
  return <div className={styles.captainMatches} aria-label="Incontri del capitano">
    {urgentResults.length ? <section><h3>Risultati da gestire</h3><div className={styles.captainMatchList}>{urgentResults.map((match) => <ResultCard
      key={`${match.matchId}:${match.resultId ?? "pending"}`} match={match} onSaved={onSaved} focused={focusMatchId === match.matchId} />)}</div></section> : null}
    {recoveryResults.length || postponed.length ? <section><h3>Recuperi da giocare</h3><div className={styles.captainMatchList}>
      {recoveryResults.map((match) => <ResultCard key={`${match.matchId}:${match.resultId ?? "pending"}`} match={match} onSaved={onSaved}
        focused={focusMatchId === match.matchId} />)}
      {postponed.map((match) => <LineupCard key={`${match.matchId}:${match.ownLineup?.revision ?? 0}`} match={match} teamId={teamId}
        roster={roster} onSaved={onSaved} focused={focusMatchId === match.matchId} />)}
    </div></section> : null}
    {scheduled[0] ? <section><h3>Prossimo incontro</h3><LineupCard key={`${scheduled[0].matchId}:${scheduled[0].ownLineup?.revision ?? 0}`}
      match={scheduled[0]} teamId={teamId} roster={roster} onSaved={onSaved} focused={focusMatchId === scheduled[0].matchId} /></section> : null}
    {scheduled.length > 1 ? <section><h3>Altri incontri programmati</h3><div className={styles.captainMatchList}>{scheduled.slice(1).map((match) => <LineupCard
      key={`${match.matchId}:${match.ownLineup?.revision ?? 0}`} match={match} teamId={teamId} roster={roster} onSaved={onSaved}
      focused={focusMatchId === match.matchId} />)}</div></section> : null}
    {submittedResults.length ? <section><h3>Risultati inviati</h3><div className={styles.captainMatchList}>{submittedResults.map((match) => <ResultCard
      key={`${match.matchId}:${match.resultId ?? "pending"}`} match={match} onSaved={onSaved} focused={focusMatchId === match.matchId} />)}</div></section> : null}
    {!scheduled.length && !postponed.length && !resultMatches.length ? <p className={styles.muted}>Nessun incontro da gestire al momento.</p> : null}
  </div>;
}
