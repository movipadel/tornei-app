"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { MediaFrame, PublicButton, PublicState } from "@/components/public/PublicPrimitives";
import type { ContentItem } from "@/lib/padelleria";
import styles from "./PadelleriaHub.module.css";

type View = "succede" | "archivio";
type PageResponse = { data?: ContentItem[]; pagination?: { limit: number; offset: number; has_more: boolean }; error?: string };
const PAGE_SIZE = 12;

function formatDate(item: ContentItem) {
  const value = item.occurred_at ?? (item.kind === "succede" ? item.visible_until : null) ?? item.published_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }).format(date) : null;
}

function cover(item: ContentItem) {
  return item.media.find((media) => media.media_type === "image" && media.role === "cover" && media.url)?.url ?? undefined;
}

function PadelleriaHubContent() {
  const searchParams = useSearchParams();
  const view: View = searchParams.get("view") === "archivio" ? "archivio" : "succede";
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextView: View, offset = 0) => {
    if (offset) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = nextView === "archivio" ? "view=archivio" : "kind=succede";
      const response = await fetch(`/api/padelleria?${query}&limit=${PAGE_SIZE}&offset=${offset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as PageResponse;
      if (!response.ok) throw new Error(payload.error || "Contenuti non disponibili");
      const nextItems = payload.data ?? [];
      setItems((current) => offset ? [...current, ...nextItems.filter((item) => !current.some((existing) => existing.id === item.id))] : nextItems);
      setHasMore(Boolean(payload.pagination?.has_more));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Contenuti non disponibili");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(view);
  }, [load, view]);

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.hero}><h1>Succede in Padelleria</h1><p>Scopri il mondo MOVI</p></header>
      <nav className={styles.tabs} role="tablist" aria-label="Contenuti Padelleria">
        <Link className={view === "succede" ? styles.activeTab : styles.tab} role="tab" aria-selected={view === "succede"} href="/padelleria">Succede</Link>
        <Link className={view === "archivio" ? styles.activeTab : styles.tab} role="tab" aria-selected={view === "archivio"} href="/padelleria?view=archivio">Archivio</Link>
      </nav>
      <section className={styles.section}>
        {loading ? <div className={styles.loading} role="status"><Loader2 className="animate-spin" aria-hidden />Caricamento contenuti</div>
          : error ? <PublicState kind="error" title="Contenuti non disponibili" message="Riprova tra poco." action={<PublicButton variant="secondary" onClick={() => void load(view)}>Riprova</PublicButton>} />
          : items.length ? <div className={styles.grid}>{items.map((item) => {
            const image = cover(item); const date = formatDate(item);
            return <Link className={styles.cardLink} href={`/padelleria/${item.id}`} aria-label={`Apri ${item.title}`} key={item.id}>
              <article className={styles.card}>
                <MediaFrame src={image} alt={image ? item.title : ""} />
                <div className={styles.cardBody}>
                  <div className={styles.meta}><span>{item.kind === "e_successo" ? "È successo" : view === "archivio" ? "Succede · Archivio" : "Succede"}</span>{date ? <span><CalendarDays size={14} aria-hidden />{date}</span> : null}</div>
                  <h3>{item.title}</h3>{item.excerpt ? <p>{item.excerpt}</p> : null}
                </div>
              </article>
            </Link>;
          })}</div>
          : <PublicState kind="empty" title={view === "archivio" ? "L’archivio è ancora vuoto" : "Nessuna novità al momento"} message={view === "archivio" ? "Qui ritroverai i contenuti passati della Padelleria." : "Torna presto per scoprire cosa succede in Padelleria."} />}
        {hasMore ? <div className={styles.more}><PublicButton variant="secondary" disabled={loadingMore} onClick={() => void load(view, items.length)}>{loadingMore ? "Caricamento…" : "Carica altri"}</PublicButton></div> : null}
      </section>
    </div>
  </main>;
}

export default function PadelleriaHubPage() {
  return <Suspense fallback={<main className={styles.page}><div className={styles.container}><div className={styles.loading} role="status"><Loader2 className="animate-spin" aria-hidden />Caricamento contenuti</div></div></main>}><PadelleriaHubContent /></Suspense>;
}
