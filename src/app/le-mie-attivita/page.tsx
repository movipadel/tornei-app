'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CircuitBoard,
  Clock3,
  Dumbbell,
  History,
  LoaderCircle,
  MapPin,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import PublicNav from '@/components/PublicNav';
import {
  activityTabs,
  activityTypes,
  type Activity,
  type ActivityTab,
  type ActivityType,
} from '@/lib/activities';
import styles from './Activities.module.css';

const typePresentation: Record<ActivityType, { icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; family: string }> = {
  tournament: { icon: Trophy, family: styles.tournament },
  gioca: { icon: UsersRound, family: styles.gioca },
  allenati: { icon: Dumbbell, family: styles.allenati },
  circuit: { icon: CircuitBoard, family: styles.circuit },
  monday_league: { icon: CalendarDays, family: styles.league },
};

function dateParts(value: string) {
  const date = /^\d{4}-\d\d-\d\d$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    compactDay: new Intl.DateTimeFormat('it-IT', { day: '2-digit', timeZone: 'Europe/Rome' }).format(date),
    compactMonth: new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'Europe/Rome' }).format(date).replace('.', ''),
    full: /^\d{4}-\d\d-\d\d$/.test(value)
      ? new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }).format(date)
      : new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(date),
  };
}

function statusTone(status: string) {
  if (['registered', 'completed', 'active', 'confirmed'].includes(status)) return styles.statusSuccess;
  if (['cancelled', 'contested'].includes(status)) return styles.statusDanger;
  if (['reserve', 'submitted'].includes(status)) return styles.statusWarning;
  return styles.statusInfo;
}

function ActivityCard({ item, busy, onCancel }: { item: Activity; busy: boolean; onCancel: (activity: Activity) => void }) {
  const presentation = typePresentation[item.type];
  const TypeIcon = presentation.icon;
  const date = item.date ? dateParts(item.date) : null;

  return <article className={`${styles.card} ${presentation.family} ${date ? styles.withDate : ''}`}>
    <div className={styles.typeIcon} aria-hidden><TypeIcon size={24} aria-hidden /></div>
    <div className={styles.cardHeading}>
      <p className={styles.typeLabel}>{activityTypes[item.type]}</p>
      <h2 className={styles.cardTitle}>{item.title}</h2>
    </div>
    <div className={styles.cardDetails}>
      {item.subtitle ? <p className={styles.subtitle}>{item.subtitle}</p> : null}
      <div className={styles.metadata}>
        {date ? <span><Clock3 size={16} aria-hidden />{date.full}</span> : null}
        {item.club ? <span><MapPin size={16} aria-hidden />{item.club}</span> : null}
        {item.primary_meta ? <span className={styles.primaryMeta}>{item.primary_meta}</span> : null}
        {item.secondary_meta ? <span>{item.secondary_meta}</span> : null}
      </div>
      <span className={`${styles.status} ${statusTone(item.status)}`}>{item.status_label}</span>
    </div>
    {date ? <div className={styles.dateTile} aria-label={date.full}><strong>{date.compactDay}</strong><span>{date.compactMonth}</span></div> : null}
    {(item.cta_href || item.can_cancel) ? <div className={styles.cardActions}>
      {item.cta_href ? <Link className={styles.cta} href={item.cta_href}>{item.cta_label}<ArrowRight size={17} aria-hidden /></Link> : null}
      {item.can_cancel ? <button type="button" disabled={busy} className={styles.cancel} onClick={() => onCancel(item)}>Annulla richiesta</button> : null}
    </div> : null}
  </article>;
}

export default function ActivitiesPage() {
  const [tab, setTab] = useState<ActivityTab>('upcoming');
  const [items, setItems] = useState<Activity[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/user/activities?tab=${tab}&limit=12&offset=${offset}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        setLogin(response.status === 401);
        if (!response.ok) throw new Error(body.error);
        setItems(body.data);
        setMore(body.has_more);
      })
      .catch(reason => { if (reason.name !== 'AbortError') setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, offset, reload]);

  function change(next: ActivityTab, start = 0) {
    if (tab === next && offset === start) return;
    setLoading(true);
    setError('');
    setTab(next);
    setOffset(start);
  }

  async function cancel(item: Activity) {
    if (!confirm('Annullare questa richiesta? Rimarrà nello storico.')) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/user/requests/${item.source_id}/cancel`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setLoading(true);
      setReload(value => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PublicNav />
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1>Le mie attività</h1>
        <p>Qui trovi iscrizioni, richieste e prossimi appuntamenti.</p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Viste attività">
        {(Object.entries(activityTabs) as Array<[ActivityTab, string]>).map(([key, label]) => {
          const Icon = key === 'upcoming' ? CalendarDays : History;
          return <button
            key={key}
            id={`activity-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls="activity-panel"
            className={styles.tab}
            onClick={() => change(key)}
          ><Icon size={19} aria-hidden />{label}</button>;
        })}
      </div>

      <section id="activity-panel" role="tabpanel" aria-labelledby={`activity-tab-${tab}`} className={styles.panel}>
        {error ? <div className={`${styles.state} ${styles.error}`} role="alert">
          <h2>Non riusciamo a mostrare le attività.</h2>
          <p>{error}</p>
          {login
            ? <Link className={styles.cta} href="/accedi">Accedi a MOVI<ArrowRight size={17} aria-hidden /></Link>
            : <button className={styles.retry} type="button" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1); }}>Riprova</button>}
        </div> : loading ? <div className={styles.loading} role="status"><LoaderCircle size={22} aria-hidden />Caricamento attività…</div> : items.length ? <div className={styles.feed}>
          {items.map(item => <ActivityCard key={item.id} item={item} busy={busy} onCancel={cancel} />)}
        </div> : <div className={styles.state}>
          <h2>{tab === 'upcoming' ? 'Non hai ancora nulla in programma.' : 'Non ci sono ancora attività nello storico.'}</h2>
          <p>{tab === 'upcoming' ? 'Quando avrai una richiesta, un’iscrizione o un appuntamento, lo troverai qui.' : 'Le attività concluse compariranno qui.'}</p>
          {tab === 'upcoming' ? <div className={styles.emptyActions}>
            <Link className={styles.cta} href="/richieste/gioca">Trova una partita<ArrowRight size={17} aria-hidden /></Link>
            <Link className={styles.secondaryCta} href="/richieste/allenati">Allenati</Link>
            <Link className={styles.secondaryCta} href="/tornei">Vedi i tornei</Link>
          </div> : null}
        </div>}
      </section>

      {!error && (offset > 0 || more) ? <nav className={styles.pagination} aria-label="Paginazione attività">
        <button type="button" disabled={!offset || loading} onClick={() => change(tab, Math.max(0, offset - 12))}>Precedenti</button>
        <button type="button" disabled={!more || loading} onClick={() => change(tab, offset + 12)}>Successive</button>
      </nav> : null}
    </main>
  </>;
}
