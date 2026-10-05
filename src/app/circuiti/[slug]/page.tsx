"use client";

/* eslint-disable @next/next/no-img-element */

import { CalendarDays, ChevronDown, ChevronUp, Clock3, Crown, FileText, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./CircuitDetail.module.css";

type RankingRow = { position: number; player_name: string; total_points: number; events_played: number };
type StageResult = { player_name: string; points: number; placement: number | null };
type Stage = { source_tournament_id: string | null; tournament_name: string; tournament_type: string; tournament_date: string | null; results: StageResult[] };
type UpcomingStage = { id: string; name: string; date: string | null; time: string | null; location: string | null; registrations_open: boolean };
type RankingGroup = { id: string; category: string | null; level: string | null; ranking: RankingRow[]; played_stages: Stage[]; upcoming_stages: UpcomingStage[] };
type Circuit = {
  id: string; name: string; slug: string; tournament_type: string; status: string;
  hero_logo_url: string | null; hero_logo_2_url: string | null; hero_logo_3_url: string | null;
  hero_subtitle: string | null; theme_key: string | null; rules_url: string | null;
};
type ApiResponse = { circuit: Circuit | null; ranking_groups: RankingGroup[] };
type PersonalStage = { source_tournament_id: string | null; name: string; date: string | null; time: string | null; location: string | null; category: string | null; level: string | null; placement: number | null; points: number };
type PersonalResponse = {
  state: "ready" | "empty" | "review_required" | "anonymous" | "loading" | "error";
  message?: string;
  position?: { position: number; points: number; events_played: number; total_ranked_players: number };
  stages?: PersonalStage[];
};

const levelLabels: Record<string, string> = { principiante: "Principiante", intermedio: "Intermedio", avanzato: "Avanzato" };

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : String(value);
}

function statusLabel(value?: string) {
  if (value === "active") return "Attivo";
  if (value === "closed") return "Concluso";
  if (value === "draft") return "Bozza";
  return value || "Circuito";
}

function levelLabel(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  return levelLabels[normalized] ?? (value || "Livello");
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function LogoStrip({ circuit }: { circuit: Circuit }) {
  const logos = [
    { src: circuit.hero_logo_url, alt: `Logo ${circuit.name}`, primary: true },
    { src: circuit.hero_logo_2_url, alt: `Logo secondario ${circuit.name}`, primary: false },
    { src: circuit.hero_logo_3_url, alt: `Terzo logo ${circuit.name}`, primary: false },
  ].filter((logo): logo is { src: string; alt: string; primary: boolean } => Boolean(logo.src));
  if (!logos.length) return null;
  return <div className={styles.logos} aria-label="Brand del circuito">{logos.map((logo) => <img key={logo.src} src={logo.src} alt={logo.alt} className={logo.primary ? styles.primaryLogo : styles.secondaryLogo} />)}</div>;
}

function Podium({ rows }: { rows: RankingRow[] }) {
  if (!rows.length) return null;
  const visualOrder = rows.length === 3 ? [rows[1], rows[0], rows[2]] : rows;
  return <ol className={styles.podium} aria-label="Prime posizioni">{visualOrder.map((row) => (
    <li key={`${row.position}-${row.player_name}`} className={`${styles.podiumCard} ${styles[`podium${row.position}`] ?? ""}`}>
      <span className={styles.medal} aria-label={`${row.position}ª posizione`}>{row.position === 1 ? <Crown className={styles.crown} size={19} strokeWidth={2.6} fill="currentColor" aria-hidden /> : row.position}</span>
      <span className={styles.avatar} aria-hidden>{initials(row.player_name)}</span>
      <strong>{row.player_name}</strong><span>{row.total_points} pt</span>
    </li>
  ))}</ol>;
}

export default function CircuitPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug ?? "");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [personal, setPersonal] = useState<PersonalResponse>({ state: "loading" });
  const [activeTab, setActiveTab] = useState<"ranking" | "personal">("ranking");

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetch(`/api/circuits/${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Errore caricamento circuito");
        return payload as ApiResponse;
      })
      .then((payload) => {
        const groups = Array.isArray(payload.ranking_groups) ? payload.ranking_groups : [];
        setData({ circuit: payload.circuit ?? null, ranking_groups: groups });
        const requested = new URLSearchParams(window.location.search).get("group");
        setSelectedGroupId(groups.find((group) => group.id === requested)?.id ?? groups[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Circuito non disponibile");
        setData({ circuit: null, ranking_groups: [] });
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (!slug || !selectedGroupId) return;
    const controller = new AbortController();
    fetch(`/api/user/circuits/${encodeURIComponent(slug)}?group=${encodeURIComponent(selectedGroupId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) return { state: "anonymous" } as PersonalResponse;
        if (response.status === 409) return { state: "review_required", message: payload.message ?? payload.error } as PersonalResponse;
        if (!response.ok) throw new Error(payload.error || "Dati personali non disponibili");
        return payload as PersonalResponse;
      })
      .then(setPersonal)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setPersonal({ state: "error", message: reason instanceof Error ? reason.message : "Dati personali non disponibili" }); });
    return () => controller.abort();
  }, [slug, selectedGroupId]);

  const groups = useMemo(() => data?.ranking_groups ?? [], [data]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const categories = useMemo(() => [...new Set(groups.map((group) => group.category).filter((value): value is string => Boolean(value)))], [groups]);
  const selectedCategory = selectedGroup?.category ?? categories[0] ?? null;
  const levels = useMemo(() => groups.filter((group) => group.category === selectedCategory), [groups, selectedCategory]);
  const normalizedSearch = search.trim().toLocaleLowerCase("it");
  const ranking = useMemo(() => {
    const rows = selectedGroup?.ranking ?? [];
    return normalizedSearch ? rows.filter((row) => row.player_name.toLocaleLowerCase("it").includes(normalizedSearch)) : rows;
  }, [selectedGroup, normalizedSearch]);
  const playedStages = useMemo(() => {
    const stages = selectedGroup?.played_stages ?? [];
    if (!normalizedSearch) return stages;
    return stages.map((stage) => ({ ...stage, results: stage.results.filter((row) => row.player_name.toLocaleLowerCase("it").includes(normalizedSearch)) })).filter((stage) => stage.results.length > 0);
  }, [selectedGroup, normalizedSearch]);
  const nextStage = selectedGroup?.upcoming_stages?.[0] ?? null;

  function chooseGroup(group: RankingGroup) {
    setSelectedGroupId(group.id); setSearch(""); setOpenStage(null); setActiveTab("ranking"); setPersonal({ state: "loading" });
    const url = new URL(window.location.href); url.searchParams.set("group", group.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function chooseCategory(category: string) {
    const firstGroup = groups.find((group) => group.category === category);
    if (firstGroup) chooseGroup(firstGroup);
  }

  if (!data) return <main className={styles.page}><div className={styles.state}>Caricamento circuito…</div></main>;
  if (!data.circuit) return <main className={styles.page}><div className={styles.state} role="alert">{error || "Circuito non trovato."}</div></main>;

  const circuit = data.circuit;
  const playedCount = selectedGroup?.played_stages.length ?? 0;
  const upcomingCount = selectedGroup?.upcoming_stages.length ?? 0;

  return <main className={styles.page}><div className={styles.content}>
    <section className={`${styles.hero} ${circuit.theme_key === "padelseries" ? styles.padelseries : ""}`} aria-labelledby="circuit-title">
      <div className={styles.heroGlow} aria-hidden /><div className={styles.heroContent}>
        <LogoStrip circuit={circuit} />
        <div className={styles.badges}>
          <span className={`${styles.status} ${styles[`status_${circuit.status}`] ?? ""}`}><span aria-hidden />{statusLabel(circuit.status)}</span>
          <span className={styles.typeBadge}>{circuit.tournament_type}</span>
        </div>
        <h1 id="circuit-title">{circuit.name}</h1>
        {circuit.hero_subtitle ? <p className={styles.subtitle}>{circuit.hero_subtitle}</p> : null}
        <dl className={styles.stats} aria-label="Riepilogo circuito">
          <div><dt>Classifiche</dt><dd>{groups.length}</dd></div><div><dt>Tappe giocate</dt><dd>{playedCount}</dd></div><div><dt>In programma</dt><dd>{upcomingCount}</dd></div>
        </dl>
        {circuit.rules_url ? <a className={styles.rulesLink} href={circuit.rules_url} target="_blank" rel="noreferrer"><FileText size={18} aria-hidden />Regolamento circuito<span aria-hidden>↗</span></a> : null}
      </div>
    </section>

    {groups.length ? <section className={styles.filters} aria-labelledby="ranking-selection-title">
      <h2 id="ranking-selection-title">Seleziona la classifica</h2>
      <div className={styles.filterGroup}><span className={styles.filterLabel}>Categoria</span><div className={styles.chips} role="group" aria-label="Categoria">
        {categories.map((category) => <button type="button" key={category} className={styles.chip} aria-pressed={selectedCategory === category} onClick={() => chooseCategory(category)}>{category}</button>)}
      </div></div>
      <div className={styles.filterGroup}><span className={styles.filterLabel}>Livello</span><div className={styles.chips} role="group" aria-label="Livello">
        {levels.map((group) => <button type="button" key={group.id} className={styles.chip} aria-pressed={group.id === selectedGroupId} onClick={() => chooseGroup(group)}>{levelLabel(group.level)}</button>)}
      </div></div>
    </section> : null}

    <section className={styles.personalPosition} aria-labelledby="personal-position-title" aria-live="polite">
      <div><span className={styles.eyebrow}>Il tuo circuito</span><h2 id="personal-position-title">La tua posizione</h2></div>
      {personal.state === "loading" ? <p>Caricamento della tua classifica…</p> : null}
      {personal.state === "anonymous" ? <div className={styles.personalMessage}><p>Accedi per vedere posizione e tappe personali.</p><Link href={`/accedi?next=${encodeURIComponent(`/circuiti/${slug}?group=${selectedGroupId ?? ""}`)}`}>Accedi a MOVI</Link></div> : null}
      {personal.state === "empty" ? <p>{personal.message ?? "Non hai ancora giocato tappe in questa classifica."}</p> : null}
      {personal.state === "review_required" ? <p>{personal.message ?? "Classifica personale da verificare"}</p> : null}
      {personal.state === "error" ? <p role="alert">{personal.message}</p> : null}
      {personal.state === "ready" && personal.position ? <dl className={styles.personalStats}>
        <div><dt>Posizione</dt><dd>{personal.position.position}°</dd></div><div><dt>Punti</dt><dd>{personal.position.points}</dd></div><div><dt>Tappe</dt><dd>{personal.position.events_played}</dd></div><div><dt>Giocatori</dt><dd>{personal.position.total_ranked_players}</dd></div>
      </dl> : null}
      {selectedGroup ? <span className={styles.personalGroup}>{selectedGroup.category} · {levelLabel(selectedGroup.level)}</span> : null}
    </section>

    <section className={styles.section} aria-labelledby="next-stage-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Calendario</span><h2 id="next-stage-title">Prossima tappa</h2></div></div>
      {nextStage ? <article className={styles.nextStage}>
        <div className={styles.dateTile} aria-label={formatDate(nextStage.date) ?? undefined}><CalendarDays size={19} aria-hidden /><strong>{formatDate(nextStage.date) ?? "Data da definire"}</strong></div>
        <div className={styles.stageBody}><div className={styles.stageTags}>{selectedGroup?.category ? <span>{selectedGroup.category}</span> : null}{selectedGroup?.level ? <span>{levelLabel(selectedGroup.level)}</span> : null}</div><h3>{nextStage.name}</h3><div className={styles.stageMeta}>{nextStage.location ? <span><MapPin size={15} aria-hidden />{nextStage.location}</span> : null}{nextStage.time ? <span><Clock3 size={15} aria-hidden />Ore {formatTime(nextStage.time)}</span> : null}</div></div>
        <span className={`${styles.registration} ${nextStage.registrations_open ? styles.open : styles.closed}`}>{nextStage.registrations_open ? "Iscrizioni aperte" : "Iscrizioni chiuse"}</span>
      </article> : <div className={styles.empty}>Nessuna tappa futura programmata per questa classifica.</div>}
    </section>

    <div className={styles.tabs} role="tablist" aria-label="Contenuti della classifica" onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault(); const next = activeTab === "ranking" ? "personal" : "ranking"; setActiveTab(next);
      document.getElementById(`circuit-tab-${next}`)?.focus();
    }}><button id="circuit-tab-ranking" type="button" role="tab" aria-selected={activeTab === "ranking"} aria-controls="circuit-panel-ranking" tabIndex={activeTab === "ranking" ? 0 : -1} onClick={() => setActiveTab("ranking")}>Classifica</button><button id="circuit-tab-personal" type="button" role="tab" aria-selected={activeTab === "personal"} aria-controls="circuit-panel-personal" tabIndex={activeTab === "personal" ? 0 : -1} onClick={() => setActiveTab("personal")}>Le tue tappe</button></div>

    <section className={`${styles.section} ${styles.rankingSection}`} id="circuit-panel-ranking" role="tabpanel" aria-labelledby="circuit-tab-ranking" hidden={activeTab !== "ranking"}>
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Classifica generale</span><h2 id="ranking-title">Classifica</h2></div><span className={styles.groupLabel}>{selectedGroup ? `${selectedGroup.category} · ${levelLabel(selectedGroup.level)}` : "—"}</span></div>
      <Podium rows={ranking.slice(0, 3)} />
      <label className={styles.search}><Search size={18} aria-hidden /><span className="sr-only">Cerca giocatore</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca giocatore" />{search ? <button type="button" onClick={() => setSearch("")} aria-label="Cancella ricerca">×</button> : null}</label>
      <div className={styles.rankingTableWrap}><table className={styles.rankingTable}><caption className="sr-only">Classifica del circuito per categoria e livello selezionati</caption><thead><tr><th scope="col">#</th><th scope="col">Giocatore</th><th scope="col">Punti</th><th scope="col">Tappe</th></tr></thead><tbody>
        {ranking.length ? ranking.map((row) => <tr key={`${row.position}-${row.player_name}`}><td><span className={styles.position}>{row.position}</span></td><th scope="row">{row.player_name}</th><td>{row.total_points}</td><td>{row.events_played}</td></tr>) : <tr><td colSpan={4} className={styles.noRows}>Nessun giocatore trovato.</td></tr>}
      </tbody></table></div>
    </section>

    <section className={`${styles.section} ${styles.personalStagesSection}`} id="circuit-panel-personal" role="tabpanel" aria-labelledby="circuit-tab-personal" hidden={activeTab !== "personal"}>
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Storico personale</span><h2>Le tue tappe</h2></div><span className={styles.groupLabel}>{selectedGroup ? `${selectedGroup.category} · ${levelLabel(selectedGroup.level)}` : "—"}</span></div>
      {personal.state === "anonymous" ? <div className={styles.empty}>Accedi per vedere le tappe che hai giocato. <Link href="/accedi">Accedi a MOVI</Link></div> : null}
      {personal.state === "loading" ? <div className={styles.empty}>Caricamento tappe…</div> : null}
      {personal.state === "empty" ? <div className={styles.empty}>{personal.message ?? "Non hai ancora giocato tappe in questa classifica."}</div> : null}
      {personal.state === "review_required" ? <div className={styles.empty}>{personal.message ?? "Classifica personale da verificare"}</div> : null}
      {personal.state === "error" ? <div className={styles.empty} role="alert">{personal.message}</div> : null}
      {personal.state === "ready" ? <div className={styles.personalStageList}>{(personal.stages ?? []).map((stage, index) => {
        const content = <><div className={styles.personalStageDate}><CalendarDays size={18} aria-hidden /><strong>{formatDate(stage.date) ?? "Data non disponibile"}</strong></div><div><h3>{stage.name}</h3><p>{[stage.location, stage.time ? `Ore ${formatTime(stage.time)}` : null].filter(Boolean).join(" · ") || "Sede non disponibile"}</p></div><dl><div><dt>Pos.</dt><dd>{stage.placement == null ? "—" : `${stage.placement}°`}</dd></div><div><dt>Punti</dt><dd>{stage.points}</dd></div></dl></>;
        return stage.source_tournament_id ? <Link className={styles.personalStageCard} key={stage.source_tournament_id} href={`/circuiti/${encodeURIComponent(slug)}/tappe/${stage.source_tournament_id}?group=${encodeURIComponent(selectedGroupId ?? "")}`}>{content}</Link> : <article className={styles.personalStageCard} key={`${stage.name}-${stage.date}-${index}`}>{content}</article>;
      })}{!(personal.stages ?? []).length ? <div className={styles.empty}>Non hai ancora giocato tappe in questa classifica.</div> : null}</div> : null}
    </section>

    <section className={`${styles.section} ${styles.playedSection}`} aria-labelledby="played-stages-title">
      <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Archivio circuito</span><h2 id="played-stages-title">Risultati delle tappe</h2></div></div>
      <p className={styles.sectionIntro}>Risultati complessivi delle tappe giocate nella classifica selezionata.</p>
      {playedStages.length ? <div className={styles.stageList}>{playedStages.map((stage, index) => {
        const key = `${stage.tournament_name}-${stage.tournament_date}-${index}`; const open = openStage === key;
        return <article className={styles.playedStage} key={key}><button type="button" aria-expanded={open} onClick={() => setOpenStage(open ? null : key)}><span><strong>{stage.tournament_name}</strong><small>{formatDate(stage.tournament_date) ?? "Data non disponibile"} · {stage.results.length} risultati</small></span>{open ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}</button>
          {stage.source_tournament_id ? <Link className={styles.stageDetailLink} href={`/circuiti/${encodeURIComponent(slug)}/tappe/${stage.source_tournament_id}?group=${encodeURIComponent(selectedGroupId ?? "")}`}>Apri classifica della tappa</Link> : null}
          {open ? <div className={styles.stageResults}><table><caption className="sr-only">Risultati di {stage.tournament_name}</caption><thead><tr><th scope="col">Giocatore</th><th scope="col">Punti</th><th scope="col">Pos.</th></tr></thead><tbody>{stage.results.map((row, resultIndex) => <tr key={`${row.player_name}-${resultIndex}`}><th scope="row">{row.player_name}</th><td>{row.points}</td><td>{row.placement == null ? "—" : `${row.placement}°`}</td></tr>)}</tbody></table></div> : null}
        </article>;
      })}</div> : <div className={styles.empty}>Nessuna tappa giocata disponibile.</div>}
    </section>
  </div></main>;
}
