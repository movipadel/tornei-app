"use client";

/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./StageDetail.module.css";

type StagePayload = {
  circuit: { name: string; slug: string; hero_logo_url: string | null };
  group: { id: string; category: string | null; level: string | null };
  stage: { id: string; name: string; type: string; category: string | null; level: string | null; date: string | null; time: string | null; location: string | null };
  results: { player_name: string; points: number; placement: number | null }[];
};

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "Data non disponibile";
const timeLabel = (value: string | null) => value?.match(/^(\d{2}:\d{2})/)?.[1] ?? value;
const levelLabel = (value: string | null) => value ? value[0].toUpperCase() + value.slice(1) : "Livello";

export default function CircuitStagePage() {
  const params = useParams<{ slug: string; tournamentId: string }>();
  const query = useSearchParams();
  const slug = String(params.slug ?? "");
  const tournamentId = String(params.tournamentId ?? "");
  const group = query.get("group");
  const [data, setData] = useState<StagePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const suffix = group ? `?group=${encodeURIComponent(group)}` : "";
    fetch(`/api/circuits/${encodeURIComponent(slug)}/stages/${encodeURIComponent(tournamentId)}${suffix}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Tappa non disponibile");
        return payload as StagePayload;
      })
      .then(setData)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Tappa non disponibile"); });
    return () => controller.abort();
  }, [slug, tournamentId, group]);

  const backGroup = data?.group.id ?? group;
  const backHref = `/circuiti/${encodeURIComponent(slug)}${backGroup ? `?group=${encodeURIComponent(backGroup)}` : ""}`;
  if (error) return <main className={styles.page}><div className={styles.state} role="alert"><p>{error}</p><Link href={backHref}>Torna al circuito</Link></div></main>;
  if (!data) return <main className={styles.page}><div className={styles.state} role="status">Caricamento tappa…</div></main>;

  return <main className={styles.page}><div className={styles.content}>
    <Link className={styles.back} href={backHref}><ArrowLeft size={18} aria-hidden />Torna al circuito</Link>
    <header className={styles.hero}>
      {data.circuit.hero_logo_url ? <img src={data.circuit.hero_logo_url} alt={`Logo ${data.circuit.name}`} /> : null}
      <div className={styles.tags}><span>{data.group.category}</span><span>{levelLabel(data.group.level)}</span></div>
      <p>{data.circuit.name}</p><h1>{data.stage.name}</h1>
      <div className={styles.meta}>
        <span><CalendarDays size={18} aria-hidden />{dateLabel(data.stage.date)}</span>
        {data.stage.time ? <span><Clock3 size={18} aria-hidden />Ore {timeLabel(data.stage.time)}</span> : null}
        {data.stage.location ? <span><MapPin size={18} aria-hidden />{data.stage.location}</span> : null}
      </div>
    </header>
    <section className={styles.results} aria-labelledby="stage-ranking-title">
      <div><span>Risultati ufficiali</span><h2 id="stage-ranking-title">Classifica della tappa</h2></div>
      <div className={styles.tableWrap}><table><caption className="sr-only">Classifica di {data.stage.name}</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Giocatore</th><th scope="col">Punti</th></tr></thead><tbody>
        {data.results.length ? data.results.map((row, index) => <tr key={`${row.player_name}-${index}`}><td>{row.placement == null ? "—" : `${row.placement}°`}</td><th scope="row">{row.player_name}</th><td>{row.points}</td></tr>) : <tr><td colSpan={3} className={styles.empty}>Nessun risultato disponibile per questa tappa.</td></tr>}
      </tbody></table></div>
    </section>
  </div></main>;
}
