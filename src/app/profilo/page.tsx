'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, LoaderCircle, RotateCcw, Save, UserRound } from 'lucide-react';
import PublicNav from '@/components/PublicNav';
import PlayerProfileFields from '@/components/PlayerProfileFields';
import NotificationPreferencesCard from '@/components/NotificationPreferencesCard';
import { emptySharedProfile, type SharedPlayerProfile } from '@/lib/playerProfile';
import styles from './profile.module.css';

type Profile = {
  shared: SharedPlayerProfile;
  version: number | null;
  updated_at: string | null;
  movi_level: number | null;
  movi_level_label: string | null;
  movi_level_updated_at: string | null;
};
type Data = { account: Record<string, unknown>; identity_state: string; profile: Profile };

export default function ProfilePage() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<SharedPlayerProfile>(emptySharedProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/user/profile', { cache: 'no-store' });
      const json = await response.json();
      if (response.status === 401) {
        window.location.href = '/accedi?next=%2Fprofilo';
        return;
      }
      if (!response.ok) throw Error(json.error);
      setData(json.data);
      setForm(json.data.profile.shared);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_version: data.profile.version, profile: form }),
      });
      const json = await response.json();
      if (!response.ok) throw Error(json.error);
      setData({ ...data, identity_state: 'linked', profile: json.data.profile });
      setForm(json.data.profile.shared);
      setMessage('Profilo di gioco salvato.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const account = data?.account ?? {};
  const profileLocked = saving || data?.identity_state === 'verification_required';

  return <>
    <PublicNav />
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1>Profilo</h1>
        <p>Più controllo sui tuoi dati e sulle preferenze di gioco.</p>
      </header>

      {loading ? <div className={styles.loading} role="status"><LoaderCircle size={21} aria-hidden />Caricamento profilo…</div> : null}
      {error ? <div className={`${styles.notice} ${styles.error}`} role="alert">{error}</div> : null}
      {message ? <div className={`${styles.notice} ${styles.success}`} role="status">{message}</div> : null}

      {data ? <div className={styles.sections}>
        <section className={styles.card} aria-labelledby="profile-personal-title">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden><UserRound size={21} /></span>
            <div><h2 id="profile-personal-title">Dati personali</h2><p>Informazioni collegate al tuo account MOVI.</p></div>
          </div>
          <dl className={styles.personal}>
            <Read label="Nome" value={account.full_name} />
            <Read label="Telefono" value={account.phone} />
            <Read label="Email" value={account.email} />
            <Read label="Genere" value={account.gender === 'M' ? 'Uomo' : account.gender === 'F' ? 'Donna' : 'Non indicato'} />
          </dl>
          <p className={styles.muted}>Per correggere email o telefono usa i canali di assistenza MOVI. Da questa pagina non vengono modificati.</p>
        </section>

        <form className={styles.card} onSubmit={save} aria-labelledby="profile-preferences-title">
          <div className={styles.sectionHeading}>
            <span className={`${styles.sectionIcon} ${styles.magenta}`} aria-hidden><BadgeCheck size={21} /></span>
            <div><h2 id="profile-preferences-title">Preferenze di gioco</h2><p>Disponibilità da lunedì a domenica, club e tipi di partita.</p></div>
          </div>
          {data.identity_state === 'verification_required' ? <p className={`${styles.notice} ${styles.warning}`}>Il collegamento alla tua identità sportiva richiede una verifica dello staff MOVI.</p> : null}
          <PlayerProfileFields value={form} onChange={setForm} disabled={profileLocked} appearance="public" />
          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={profileLocked}><Save size={18} aria-hidden />{saving ? 'Salvataggio…' : 'Salva profilo'}</button>
            <button className={styles.secondary} type="button" onClick={() => { setForm(data.profile.shared); setMessage(''); }} disabled={saving}><RotateCcw size={17} aria-hidden />Annulla modifiche</button>
          </div>
        </form>

        <NotificationPreferencesCard />

        <section className={styles.card} aria-labelledby="profile-rating-title">
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden><BadgeCheck size={21} /></span>
            <div><h2 id="profile-rating-title">Valutazione MOVI</h2><p>Il livello verificato dal nostro staff.</p></div>
          </div>
          {data.profile.movi_level === null ? <p className={styles.rating}>Non ancora assegnata.</p> : <p className={styles.rating}><strong>Livello {data.profile.movi_level.toFixed(1)} <span aria-hidden>·</span> {data.profile.movi_level_label}</strong>{data.profile.movi_level_updated_at ? <span> aggiornato il {new Date(data.profile.movi_level_updated_at).toLocaleDateString('it-IT')}</span> : null}</p>}
          <p className={styles.muted}>È assegnata dallo staff perché rifletta una valutazione condivisa ed è indipendente dal livello che dichiari.</p>
        </section>

        <Link className={styles.activities} href="/le-mie-attivita" aria-label="Attività: vai a Le mie attività">Vai a Le mie Attività<ArrowRight size={18} aria-hidden /></Link>
      </div> : null}
    </main>
  </>;
}

function Read({ label, value }: { label: string; value: unknown }) {
  return <div><dt>{label}</dt><dd>{String(value ?? 'Non indicato')}</dd></div>;
}
