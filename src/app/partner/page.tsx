"use client";

import { ArrowRight, Loader2, Tags } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MediaFrame, PublicButton, PublicState } from "@/components/public/PublicPrimitives";
import { categories, type Partner } from "@/lib/partners";
import styles from "./PartnerDirectory.module.css";

const PAGE_SIZE = 50;

export default function PartnerDirectoryPage() {
  const [items, setItems] = useState<Partner[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("Tutti");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset = 0) => {
    if (offset) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/partners?limit=${PAGE_SIZE}&offset=${offset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: Partner[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Partner non disponibili");
      const nextItems = payload.data ?? [];
      setItems((current) => offset ? [...current, ...nextItems.filter((item) => !current.some((existing) => existing.id === item.id))] : nextItems);
      setHasMore(nextItems.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Partner non disponibili");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const availableCategories = useMemo(() => categories.filter((category) => items.some((item) => item.category === category)), [items]);
  const filteredItems = selectedCategory === "Tutti" ? items : items.filter((item) => item.category === selectedCategory);

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.hero}>
        <h1>Partner MOVI</h1>
        <p className={styles.subtitle}>Più vantaggi per la tua passione.</p>
        <p className={styles.support}>Scopri i partner che supportano la community MOVI e i vantaggi riservati ai membri.</p>
      </header>

      {!loading && !error && items.length ? <nav className={styles.filters} aria-label="Filtra Partner per categoria">
        {["Tutti", ...availableCategories].map((category) => <button type="button" className={selectedCategory === category ? styles.activeFilter : styles.filter} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)} key={category}>{category}</button>)}
      </nav> : null}

      <section className={styles.directory} aria-label="Directory Partner MOVI">
        {loading ? <div className={styles.loading} role="status"><Loader2 className="animate-spin" aria-hidden />Caricamento Partner</div>
          : error ? <PublicState kind="error" title="Partner non disponibili" message="Riprova tra poco." action={<PublicButton variant="secondary" onClick={() => void load()}>Riprova</PublicButton>} />
          : !items.length ? <PublicState kind="empty" title="Nessun Partner disponibile" message="I Partner MOVI attivi compariranno qui." />
          : !filteredItems.length ? <PublicState kind="empty" title="Nessun Partner in questa categoria" message="Scegli un’altra categoria per continuare." />
          : <div className={styles.grid}>{filteredItems.map((partner) => {
            const image = partner.cover_url ?? partner.logo_url ?? undefined;
            return <Link className={styles.cardLink} href={`/partner/${partner.slug}`} aria-label={`Apri Partner ${partner.name}`} key={partner.id}>
              <article className={styles.card}>
                <MediaFrame src={image} alt={image ? partner.name : ""} fit={partner.cover_url ? "cover" : "contain"} />
                <div className={styles.cardBody}>
                  <span className={styles.category}><Tags size={13} aria-hidden />{partner.category}</span>
                  <div className={styles.cardHeading}><h2>{partner.name}</h2><ArrowRight size={20} aria-hidden /></div>
                  {partner.short_description ? <p className={styles.description}>{partner.short_description}</p> : null}
                  <div className={styles.benefit}><span>Vantaggio MOVI</span><strong>{partner.benefit_title}</strong>{partner.benefit_description ? <p>{partner.benefit_description}</p> : null}</div>
                </div>
              </article>
            </Link>;
          })}</div>}
      </section>

      {hasMore && selectedCategory === "Tutti" ? <div className={styles.more}><PublicButton variant="secondary" disabled={loadingMore} onClick={() => void load(items.length)}>{loadingMore ? "Caricamento…" : "Carica altri Partner"}</PublicButton></div> : null}
    </div>
  </main>;
}
