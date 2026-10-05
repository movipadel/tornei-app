"use client";

import { useState } from "react";
import Link from "next/link";
import { levels, matchTypes, windows } from "@/lib/moviRequests";
import { playerMatchingWeekdays, type PlayerMatchResult } from "@/lib/playerMatching";
import { playingSideLabel, type PlayingSide } from "@/lib/playingSide";
import PlayerMatchResults from "../../players/PlayerMatchResults";
import s from "../../players/players.module.css";

type MatchingContext = {
  clubs: string[];
  level: string | null;
  weekday: number | null;
  timeWindow: string | null;
  matchTypes: string[];
  playingSide: PlayingSide | null;
  lastMinute: false;
  requesterExcluded: boolean;
};

export default function RequestMatchingPanel({ id }: { id: string }) {
  const [results, setResults] = useState<PlayerMatchResult[] | null>(null);
  const [context, setContext] = useState<MatchingContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function suggest() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/requests/${id}/player-suggestions`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setResults(json.data); setContext(json.context);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  return <section className={s.requestMatching} aria-labelledby="request-matching-title">
    <div className={s.requestMatchingHeader}><div><h3 id="request-matching-title">Giocatori compatibili</h3><p>Usa i dati sportivi della richiesta senza modificarne stato o contenuto.</p></div><button type="button" className={s.primary} disabled={busy} onClick={suggest}>{busy ? "Ricerca…" : "Suggerisci giocatori"}</button></div>
    {error && <div className={s.error} role="alert">{error}</div>}
    {context && <div className={s.contextBlock} aria-label="Criteri usati"><h4>Ricerca basata su</h4><dl className={s.contextGrid}>
      <div><dt>Club</dt><dd>{context.clubs.length ? context.clubs.join(" oppure ") : "Non indicato"}</dd></div>
      <div><dt>Livello</dt><dd>{context.level ? levels[context.level as keyof typeof levels] : "Non indicato"}</dd></div>
      <div><dt>Giorno</dt><dd>{context.weekday ? playerMatchingWeekdays[context.weekday - 1] : "Non indicato"}</dd></div>
      <div><dt>Fascia</dt><dd>{context.timeWindow ? windows[context.timeWindow as keyof typeof windows] : "Non indicato"}</dd></div>
      <div><dt>Tipo</dt><dd>{context.matchTypes.map(type => matchTypes[type as keyof typeof matchTypes]).join(" oppure ")}</dd></div>
      <div><dt>Lato</dt><dd>{playingSideLabel(context.playingSide)}</dd></div>
      <div><dt>Last minute</dt><dd>Non previsto</dd></div>
      <div><dt>Richiedente</dt><dd>{context.requesterExcluded ? "Escluso tramite identità collegata" : "Identità non collegata: nessuna esclusione dedotta"}</dd></div>
    </dl></div>}
    {results !== null && <PlayerMatchResults results={results} emptyMessage="Nessun giocatore supera la soglia di compatibilità con i dati attuali."/>}
    {results !== null && <Link className={s.secondary} href="/admin/players?mode=matching">{results.length === 0 ? "Apri ricerca manuale" : "Apri ricerca avanzata"}</Link>}
  </section>;
}
