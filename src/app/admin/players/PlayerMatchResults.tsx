import Link from "next/link";
import { matchTypes, windows } from "@/lib/moviRequests";
import { playerMatchingWeekdays, type PlayerMatchResult } from "@/lib/playerMatching";
import s from "./players.module.css";

const levelLabels: Record<string, string> = { principiante: "Principiante", intermedio: "Intermedio", avanzato: "Avanzato" };
const lastMinuteLabel = (value: boolean | null) => value === true ? "Sì" : value === false ? "No" : "Non indicato";

export default function PlayerMatchResults({ results, emptyMessage = "Nessun candidato supera la soglia con questi criteri." }: { results: PlayerMatchResult[]; emptyMessage?: string }) {
  return <>
    <div className={s.matchMeta}>{results.length} candidati mostrati · soglia 50/100 · massimo 20</div>
    {results.length === 0 && <div className={s.empty}>{emptyMessage}</div>}
    <div className={s.matchResults}>{results.map(candidate => <article className={s.matchCard} key={candidate.id}>
      <div className={s.matchIdentity}><div><h3>{candidate.fullName}</h3><p>{candidate.normalizedPhone} · {candidate.accountState === "linked" ? "Account collegato" : "Senza account"}</p></div><strong className={s.score}>{candidate.score}/100</strong></div>
      {candidate.identityWarning && <Link className={s.warningLink} href="/admin/users/duplicates">Identità da verificare</Link>}
      {candidate.matchedClub && <p className={s.matchedClub}>Compatibile soprattutto per: <strong>{candidate.matchedClub}</strong></p>}
      <div className={s.matchFacts}>
        <span><b>Livello</b>{candidate.moviLevel !== null ? `MOVI ${candidate.moviLevel.toFixed(1)}` : candidate.descriptiveLevel ? levelLabels[candidate.descriptiveLevel] : "Non indicato"}</span>
        <span><b>Club</b>{candidate.preferredClubs.length ? candidate.preferredClubs.join(", ") : "Nessuna restrizione"}</span>
        <span><b>Disponibilità</b>{candidate.availability.length ? candidate.availability.slice(0, 4).map(slot => `${playerMatchingWeekdays[slot.weekday - 1]} · ${windows[slot.time_window]}`).join("; ") : "Non indicata"}</span>
        <span><b>Partita</b>{candidate.preferredMatchTypes.length ? candidate.preferredMatchTypes.map(type => matchTypes[type as keyof typeof matchTypes]).join(", ") : "Non indicata"}</span>
        <span><b>Last minute</b>{lastMinuteLabel(candidate.availableLastMinute)}</span>
      </div>
      <details className={s.explanation}><summary>Come è calcolato il punteggio</summary><div className={s.scoreGrid}>
        <Score label="Livello" part={candidate.scoreParts.level}/><Score label="Disponibilità" part={candidate.scoreParts.availability}/><Score label="Club" part={candidate.scoreParts.club}/><Score label="Tipo partita" part={candidate.scoreParts.matchType}/><Score label="Last minute" part={candidate.scoreParts.lastMinute}/>
      </div></details>
      <Link className={s.openAction} href={`/admin/players/${candidate.id}`}>Apri giocatore</Link>
    </article>)}</div>
  </>;
}

function Score({ label, part }: { label: string; part: { score: number; max: number; detail: string } }) {
  return <div><strong>{label}: {part.score}/{part.max}</strong><span>{part.detail}</span></div>;
}
