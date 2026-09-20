/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Loader2, Shield, Trophy, Users, Upload } from "lucide-react";
import { toast } from "sonner";

import PublicNav from "@/components/PublicNav";
import styles from "@/app/monday-league/MondayLeague.module.css";

type Phase = { id: string; code: string; name: string; sequence: number; status: string };
type Standing = { position: number; teamId: string; teamName: string; points: number; played: number; wins: number; losses: number; setsWon: number; setsLost: number; setDifference: number; gamesWon: number; gamesLost: number; gameDifference: number };
type RevealedLineup = { state: "submitted"; players: string[] } | { state: "missing"; label: string };
type Match = { id: string; roundId: string; homeTeam: { id: string; name: string; slug: string }; awayTeam: { id: string; name: string; slug: string }; scheduledAt: string | null; venue: { id: string; name: string } | null; workflowStatus: string; workflowLabel: string; lineups: null | { home: RevealedLineup; away: RevealedLineup }; result: null | { kind: "played" | "special"; summary: string; status: string; statusLabel: string; sets: Array<{ number: number; homeGames: number; awayGames: number }>; actualPlayers: { home: string[]; away: string[] }; specialType?: string } };
type Round = { id: string; number: number; playDate: string | null; matches: Match[] };
type TeamCard = { id: string; name: string; slug: string; slogan: string | null; logoUrl: string | null; position: number | null; points: number };
type Snapshot = { available: true; season: { id: string; name: string; status: string; timezone: string }; phases: Phase[]; selectedPhase: Phase; hasProvisionalResults: boolean; standings: Standing[]; rounds: Round[]; teams: TeamCard[] };
type TeamMatch = Match & { roundNumber: number; playDate: string | null; side: "home" | "away" };
type CaptainContext = { is_captain: true; can_edit_profile: boolean; can_edit_roster: boolean; can_submit_lineup: boolean; lineup_locked: boolean; match_id: string | null; lineup_deadline: string | null; own_lineup: null | { revision: number; players: Array<{ id: string; displayName: string }> }; opponent_lineup: RevealedLineup | null; roster: Array<{ id: string; displayName: string; isCaptain: boolean }> };
type TeamResponse = { available: true; found: true; snapshot: { season: Snapshot["season"]; phases: Phase[]; selectedPhase: Phase }; team: { id: string; name: string; slug: string; slogan: string | null; logoUrl: string | null; imageUrl: string | null; roster: Array<{ displayName: string; isCaptain: boolean }>; standing: Standing | null; nextMatch: TeamMatch | null; schedule: TeamMatch[] }; captain: CaptainContext | null };

function formatDate(value: string | null) {
  if (!value) return "Data da definire";
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string | null) {
  if (!value) return "Orario da definire";
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(value));
}

function LoadingState() {
  return <div className={styles.page}><PublicNav /><div className={styles.state}><Loader2 className="animate-spin" aria-label="Caricamento" /></div></div>;
}

function UnavailableState({ error }: { error?: string }) {
  return <div className={styles.page}><PublicNav /><main className={`${styles.container} ${styles.state}`}><section className={styles.stateCard}><Shield size={34} aria-hidden /><h1>Monday League</h1><p className={styles.muted}>{error ?? "La competizione non è ancora disponibile al pubblico. Torna presto."}</p></section></main></div>;
}

function PhaseNav({ phases, selectedId, onSelect, hrefFor }: { phases: Phase[]; selectedId: string; onSelect?: (id: string) => void; hrefFor?: (id: string) => string }) {
  return <nav className={styles.phaseNav} aria-label="Fasi della competizione">{phases.map((phase) => hrefFor ? <Link key={phase.id} href={hrefFor(phase.id)} className={`${styles.phaseButton} ${phase.id === selectedId ? styles.phaseButtonActive : ""}`}>{phase.name}</Link> : <button key={phase.id} type="button" className={`${styles.phaseButton} ${phase.id === selectedId ? styles.phaseButtonActive : ""}`} onClick={() => onSelect?.(phase.id)} aria-pressed={phase.id === selectedId}>{phase.name}</button>)}</nav>;
}

function MatchCard({ match, date }: { match: Match; date?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = Boolean(match.result);
  const row = <>
    <div className={styles.matchMeta}>{date ? <>{formatDate(date)}<br /></> : null}{formatTime(match.scheduledAt)}<br />{match.venue?.name ?? "Sede da definire"}</div>
    <div className={styles.matchTeams}><span>{match.homeTeam.name}</span><span>{match.awayTeam.name}</span></div>
    <div className={styles.matchResult}>{match.result ? <><span className={styles.score}>{match.result.summary}</span><span className={styles.status}>{match.result.statusLabel} {expanded ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}</span></> : <span className={styles.status}>{match.workflowLabel}</span>}</div>
  </>;
  return <div>{expandable ? <button type="button" className={styles.matchRow} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{row}</button> : <div className={styles.matchRow}>{row}</div>}{match.lineups ? <div className={styles.details}><strong>Formazioni ufficiali</strong><p>{match.homeTeam.name}: {match.lineups.home.state === "submitted" ? match.lineups.home.players.join(" · ") : match.lineups.home.label}</p><p>{match.awayTeam.name}: {match.lineups.away.state === "submitted" ? match.lineups.away.players.join(" · ") : match.lineups.away.label}</p></div> : null}{expanded && match.result ? <div className={styles.details} role="region" aria-label={`Dettagli ${match.homeTeam.name} contro ${match.awayTeam.name}`}><strong>{match.result.statusLabel}</strong>{match.result.kind === "special" ? <p className={styles.muted}>{match.result.summary}. Nessun set giocato è stato registrato.</p> : <div className={styles.sets}>{match.result.sets.map((set) => <span className={styles.setPill} key={set.number}>Set {set.number}: {set.homeGames}–{set.awayGames}</span>)}</div>}{match.result.actualPlayers.home.length || match.result.actualPlayers.away.length ? <div><p>{match.result.actualPlayers.home.join(", ")}</p><p>{match.result.actualPlayers.away.join(", ")}</p></div> : null}</div> : null}</div>;
}

function CaptainControls({ team, captain, onSaved }: { team: TeamResponse["team"]; captain: CaptainContext; onSaved: () => void }) {
  const [slogan, setSlogan] = useState(team.slogan ?? "");
  const [roster, setRoster] = useState(captain.roster);
  const [selected, setSelected] = useState<string[]>(captain.own_lineup?.players.map((p) => p.id) ?? []);
  const [busy, setBusy] = useState(false);
  async function jsonAction(url: string, method: string, body: unknown, success: string) {
    setBusy(true); const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return toast.error(json.error || "Operazione non riuscita"); toast.success(success); onSaved();
  }
  async function upload(kind: "logo" | "hero", file?: File) {
    if (!file) return; const form = new FormData(); form.set("kind", kind); form.set("file", file); setBusy(true);
    const response = await fetch(`/api/monday-league/teams/${team.id}/media`, { method: "POST", body: form });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return toast.error(json.error || "Upload non riuscito"); toast.success("Immagine aggiornata"); onSaved();
  }
  function togglePlayer(id: string) { setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : value.length < 2 ? [...value, id] : value); }
  return <section className={`${styles.panel} ${styles.contentPanel}`} style={{ marginBottom: 18 }} aria-label="Azioni capitano"><div className={styles.eyebrow}>Area capitano</div><h2 className={styles.sectionTitle}>Gestisci la tua squadra</h2><div style={{ display: "grid", gap: 20, marginTop: 16 }}><div><strong>Modifica profilo squadra</strong><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}><input value={slogan} onChange={(e) => setSlogan(e.target.value)} maxLength={160} placeholder="Slogan" style={fieldStyle} /><button disabled={busy} style={actionStyle} onClick={() => void jsonAction(`/api/monday-league/teams/${team.id}/profile`, "PATCH", { slogan }, "Profilo aggiornato")}>Salva profilo</button><label style={actionStyle}><Upload size={15} /> Logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload("logo", e.target.files?.[0])} /></label><label style={actionStyle}><Upload size={15} /> Immagine squadra<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload("hero", e.target.files?.[0])} /></label></div></div><div><strong>Gestisci rosa</strong>{captain.can_edit_roster ? <><div style={{ display: "grid", gap: 8, marginTop: 9 }}>{roster.map((player, index) => <div key={player.id} style={{ display: "flex", gap: 8 }}><input value={player.displayName} disabled={player.isCaptain} onChange={(e) => setRoster((items) => items.map((item, i) => i === index ? { ...item, displayName: e.target.value } : item))} style={fieldStyle} />{!player.isCaptain ? <button type="button" style={subtleActionStyle} onClick={() => setRoster((items) => items.filter((_, i) => i !== index))}>Rimuovi</button> : <span className={styles.captain}>Capitano</span>}</div>)}</div><div style={{ display: "flex", gap: 8, marginTop: 9 }}><button type="button" disabled={roster.length >= 4} style={subtleActionStyle} onClick={() => setRoster((items) => [...items, { id: `new-${crypto.randomUUID()}`, displayName: "", isCaptain: false }])}>Aggiungi giocatore</button><button disabled={busy} style={actionStyle} onClick={() => void jsonAction(`/api/monday-league/teams/${team.id}/roster`, "PUT", { roster: roster.map((p) => ({ player_id: p.id.startsWith("new-") ? null : p.id, display_name: p.displayName })) }, "Rosa aggiornata")}>Salva rosa</button></div></> : <p className={styles.muted}>Rosa ufficiale — per modifiche contatta l&apos;organizzazione</p>}</div>{captain.match_id ? <div><strong>Inserisci formazione</strong><p className={styles.muted}>{captain.lineup_deadline ? `Scadenza: ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(captain.lineup_deadline))}` : "Partita da programmare"}</p>{captain.can_submit_lineup ? <><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{captain.roster.map((player) => <button type="button" key={player.id} style={selected.includes(player.id) ? actionStyle : subtleActionStyle} onClick={() => togglePlayer(player.id)}>{player.displayName}</button>)}</div><button disabled={busy || selected.length !== 2} style={{ ...actionStyle, marginTop: 9 }} onClick={() => void jsonAction(`/api/monday-league/matches/${captain.match_id}/lineups`, "POST", { team_id: team.id, player_ids: selected }, "Formazione inviata")}>Conferma i 2 giocatori</button></> : <p className={styles.muted}>{captain.lineup_locked ? "Formazione bloccata" : "Formazione non ancora disponibile"}</p>}<p className={styles.muted}>Avversari: {captain.opponent_lineup ? captain.opponent_lineup.state === "submitted" ? captain.opponent_lineup.players.join(" · ") : captain.opponent_lineup.label : "Formazione riservata fino alla scadenza"}</p></div> : null}</div></section>;
}

const fieldStyle: React.CSSProperties = { minWidth: 220, flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "white" };
const actionStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 13px", border: 0, borderRadius: 10, background: "#14b8a6", color: "#042f2e", fontWeight: 800, cursor: "pointer" };
const subtleActionStyle: React.CSSProperties = { ...actionStyle, background: "#e2e8f0", color: "#0f172a" };

function StandingsView({ data }: { data: Snapshot }) {
  const slugs = new Map(data.teams.map((team) => [team.id, team.slug]));
  return <section className={styles.panel}><header className={styles.panelHeader}><h2 className={styles.sectionTitle}>Classifica</h2></header><div className={styles.tableScroll}><table className={styles.standings}><thead><tr><th>Pos</th><th>Squadra</th><th>PT</th><th>PG</th><th>V</th><th>S</th><th>Diff set</th><th>Diff game</th></tr></thead><tbody>{data.standings.map((row) => <tr key={row.teamId}><td>{row.position}</td><td><Link className={styles.teamLink} href={`/monday-league/squadre/${slugs.get(row.teamId)}?phase=${data.selectedPhase.id}`}>{row.teamName}</Link></td><td><strong>{row.points}</strong></td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.setDifference > 0 ? "+" : ""}{row.setDifference}</td><td>{row.gameDifference > 0 ? "+" : ""}{row.gameDifference}</td></tr>)}</tbody></table></div></section>;
}

function CalendarView({ rounds }: { rounds: Round[] }) {
  return <div className={styles.rounds}>{rounds.map((round) => <section className={styles.roundCard} key={round.id}><header className={styles.roundHeading}><h2>Giornata {round.number}</h2><span>{formatDate(round.playDate)}</span></header><div className={styles.matchList}>{round.matches.map((match) => <MatchCard key={match.id} match={match} />)}</div></section>)}</div>;
}

function TeamsView({ teams, phaseId }: { teams: TeamCard[]; phaseId: string }) {
  return <div><h2 className={styles.sectionTitle}>Le squadre</h2><div className={styles.teamGrid} style={{ marginTop: 14 }}>{teams.map((team) => <Link key={team.id} href={`/monday-league/squadre/${team.slug}?phase=${phaseId}`} className={styles.teamCard}>{team.logoUrl ? <img src={team.logoUrl} alt={`Logo ${team.name}`} className={styles.logo} /> : <span className={styles.logo} aria-hidden>{team.name.slice(0, 2).toUpperCase()}</span>}<h3 className={styles.teamName}>{team.name}</h3><p className={styles.slogan}>{team.slogan || "Monday League"}</p><div className={styles.teamStats}><span>{team.position ? `${team.position}ª posizione` : "Posizione —"}</span><span>{team.points} PT</span></div></Link>)}</div></div>;
}

export function PublicLeagueMain() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"standings" | "calendar" | "teams">("standings");
  async function load(phaseId?: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/monday-league${phaseId ? `?phase=${encodeURIComponent(phaseId)}` : ""}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Errore di caricamento");
      setData(json.available ? json : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Errore di caricamento"); setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <LoadingState />;
  if (!data) return <UnavailableState error={error || undefined} />;
  return <div className={styles.page}><PublicNav /><main className={styles.container}><header className={styles.hero}><div className={styles.eyebrow}>Competizione a squadre</div><h1 className={styles.title}>Monday<br />League</h1><p className={styles.subtitle}>{data.season.name}: classifica, giornate, risultati e protagonisti in un unico spazio.</p><span className={styles.phaseBadge}>{data.selectedPhase.name}</span></header><PhaseNav phases={data.phases} selectedId={data.selectedPhase.id} onSelect={(id) => void load(id)} /><nav className={styles.tabs} aria-label="Contenuti Monday League">{[["standings", "Classifica", Trophy], ["calendar", "Calendario / Risultati", CalendarDays], ["teams", "Squadre", Users]].map(([key, label, Icon]) => <button type="button" key={String(key)} onClick={() => setTab(key as typeof tab)} className={`${styles.tabButton} ${tab === key ? styles.tabButtonActive : ""}`} aria-pressed={tab === key}><Icon size={16} aria-hidden /> {String(label)}</button>)}</nav>{data.hasProvisionalResults ? <div className={styles.notice}>Classifica provvisoria: include risultati non ancora definitivi.</div> : null}{tab === "standings" ? <StandingsView data={data} /> : tab === "calendar" ? <CalendarView rounds={data.rounds} /> : <TeamsView teams={data.teams} phaseId={data.selectedPhase.id} />}</main></div>;
}

export function PublicLeagueTeamPage({ slug, initialPhaseId }: { slug: string; initialPhaseId?: string }) {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = initialPhaseId ? `?phase=${encodeURIComponent(initialPhaseId)}` : "";
        const response = await fetch(`/api/monday-league/teams/${encodeURIComponent(slug)}${query}`, { cache: "no-store", signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.available) throw new Error(json.error || "Squadra non disponibile");
        setData(json);
      } catch (reason) { if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Errore di caricamento"); }
      finally { setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [slug, initialPhaseId, reloadKey]);
  const past = useMemo(() => data?.team.schedule.filter((match) => Boolean(match.result)) ?? [], [data]);
  const future = useMemo(() => data?.team.schedule.filter((match) => !match.result) ?? [], [data]);
  if (loading) return <LoadingState />;
  if (!data) return <UnavailableState error={error || "Squadra non disponibile"} />;
  const { team, snapshot } = data;
  return <div className={styles.page}><PublicNav /><main className={styles.container}><Link href="/monday-league" className={styles.backLink}>← Monday League</Link><section className={styles.profileHero} style={team.imageUrl ? { backgroundImage: `url(${team.imageUrl})` } : undefined}><div className={styles.profileInfo}>{team.logoUrl ? <img className={styles.profileLogo} src={team.logoUrl} alt={`Logo ${team.name}`} /> : <span className={`${styles.profileLogo} ${styles.logo}`} aria-hidden>{team.name.slice(0, 2).toUpperCase()}</span>}<div><div className={styles.eyebrow}>{snapshot.selectedPhase.name}</div><h1>{team.name}</h1><p>{team.slogan || "Monday League"}</p></div></div></section><PhaseNav phases={snapshot.phases} selectedId={snapshot.selectedPhase.id} hrefFor={(id) => `/monday-league/squadre/${team.slug}?phase=${id}`} /><section className={styles.metricGrid}><div className={styles.metric}><strong>{team.standing?.position ?? "—"}</strong><span>Posizione</span></div><div className={styles.metric}><strong>{team.standing?.points ?? 0}</strong><span>Punti</span></div><div className={styles.metric}><strong>{team.standing?.setDifference ?? 0}</strong><span>Diff set</span></div><div className={styles.metric}><strong>{team.standing?.gameDifference ?? 0}</strong><span>Diff game</span></div></section>{data.captain ? <CaptainControls team={team} captain={data.captain} onSaved={() => setReloadKey((value) => value + 1)} /> : null}<div className={styles.twoColumn}><aside className={`${styles.panel} ${styles.contentPanel}`}><h2 className={styles.sectionTitle}>Rosa</h2><div className={styles.roster}>{team.roster.map((player) => <div className={styles.player} key={player.displayName}><span>{player.displayName}</span>{player.isCaptain ? <span className={styles.captain}>Capitano</span> : null}</div>)}</div><h2 className={styles.sectionTitle} style={{ marginTop: 24 }}>Prossima partita</h2>{team.nextMatch ? <div className={styles.nextMatch}><strong>{team.nextMatch.side === "home" ? team.nextMatch.awayTeam.name : team.nextMatch.homeTeam.name}</strong><p className={styles.muted}>{team.nextMatch.side === "home" ? "In casa" : "In trasferta"} · {formatDate(team.nextMatch.playDate)}</p><p className={styles.muted}>{formatTime(team.nextMatch.scheduledAt)} · {team.nextMatch.venue?.name ?? "Sede da definire"}</p><span className={styles.status}>{team.nextMatch.workflowLabel}</span></div> : <p className={styles.muted}>Nessuna prossima partita disponibile.</p>}</aside><section style={{ display: "grid", gap: 16 }}><div className={`${styles.panel} ${styles.contentPanel}`}><h2 className={styles.sectionTitle}>Prossime giornate</h2><div className={styles.matchList} style={{ marginTop: 14 }}>{future.map((match) => <MatchCard key={match.id} match={match} date={match.playDate} />)}{future.length === 0 ? <p className={styles.muted}>Nessuna partita futura.</p> : null}</div></div><div className={`${styles.panel} ${styles.contentPanel}`}><h2 className={styles.sectionTitle}>Risultati</h2><div className={styles.matchList} style={{ marginTop: 14 }}>{past.map((match) => <MatchCard key={match.id} match={match} date={match.playDate} />)}{past.length === 0 ? <p className={styles.muted}>Nessun risultato disponibile.</p> : null}</div></div></section></div></main></div>;
}
