'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, LoaderCircle, Save } from 'lucide-react';
import styles from '@/app/profilo/profile.module.css';

type Preference = { transactional_email_enabled: boolean; version: number; updated_at: string };

export default function NotificationPreferencesCard() {
  const [preference, setPreference] = useState<Preference | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/user/notification-preferences', { cache: 'no-store' });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error);
      setPreference(payload.data); setEnabled(payload.data.transactional_email_enabled);
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!preference || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/user/notification-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactional_email_enabled: enabled, expected_version: preference.version }) });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error);
      setPreference(payload.data); setEnabled(payload.data.transactional_email_enabled); setMessage('Preferenze notifiche salvate.');
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }
  return <section className={styles.card} aria-labelledby="profile-notifications-title">
    <div className={styles.sectionHeading}>
      <span className={styles.sectionIcon} aria-hidden><BellRing size={21} /></span>
      <div><h2 id="profile-notifications-title">Notifiche</h2><p>Ricevi via email gli aggiornamenti importanti sulle tue attività MOVI.</p></div>
    </div>
    {loading ? <p className={styles.inlineLoading} role="status"><LoaderCircle size={18} aria-hidden />Caricamento preferenze…</p> : <>
      <label className={styles.notificationControl}><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} disabled={saving} /><span><strong>Email</strong><small>Aggiornamenti transazionali sulle tue attività.</small></span></label>
      <p className={styles.muted}>Le email di sicurezza dell&apos;account, come verifica e recupero password, continuano a essere inviate indipendentemente da questa preferenza.</p>
      {error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}
      {message ? <p className={`${styles.notice} ${styles.success}`} role="status">{message}</p> : null}
      <div className={styles.actions}><button className={styles.primary} type="button" onClick={save} disabled={saving || !preference || enabled === preference.transactional_email_enabled}><Save size={18} aria-hidden />{saving ? 'Salvataggio…' : 'Salva notifiche'}</button></div>
    </>}
  </section>;
}
