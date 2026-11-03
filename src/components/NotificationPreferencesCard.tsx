'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, LoaderCircle, Save } from 'lucide-react';
import styles from '@/app/profilo/profile.module.css';
import PushEnrollmentCard from './PushEnrollmentCard';

type Preference = { transactional_email_enabled: boolean; transactional_push_enabled: boolean; version: number; updated_at: string };

export default function NotificationPreferencesCard() {
  const [preference, setPreference] = useState<Preference | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/user/notification-preferences', { cache: 'no-store' });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error);
      setPreference(payload.data); setEnabled(payload.data.transactional_email_enabled); setPushEnabled(payload.data.transactional_push_enabled);
    } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!preference || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/user/notification-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactional_email_enabled: enabled, transactional_push_enabled: pushEnabled, expected_version: preference.version }) });
      const payload = await response.json(); if (!response.ok) throw Error(payload.error);
      setPreference(payload.data); setEnabled(payload.data.transactional_email_enabled); setPushEnabled(payload.data.transactional_push_enabled); setMessage('Preferenze notifiche salvate.');
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }
  return <section className={styles.card} aria-labelledby="profile-notifications-title">
    <div className={styles.sectionHeading}>
      <span className={styles.sectionIcon} aria-hidden><BellRing size={21} /></span>
      <div><h2 id="profile-notifications-title">Notifiche</h2><p>Scegli come ricevere gli aggiornamenti sulle tue attività MOVI.</p></div>
    </div>
    {loading ? <p className={styles.inlineLoading} role="status"><LoaderCircle size={18} aria-hidden />Caricamento preferenze…</p> : <>
      <label className={styles.notificationControl}><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} disabled={saving} /><span><strong>Email</strong><small>Aggiornamenti transazionali sulle tue attività.</small></span></label>
      <label className={styles.notificationControl}><input type="checkbox" checked={pushEnabled} onChange={event => setPushEnabled(event.target.checked)} disabled={saving} /><span><strong>Push</strong><small>Ricevi notifiche push sulle tue attività MOVI.</small></span></label>
      <PushEnrollmentCard audience="customer" variant="profile" preferenceEnabled={preference?.transactional_push_enabled} preferencePending={!!preference&&pushEnabled!==preference.transactional_push_enabled} />
      <p className={styles.muted}>Le email di sicurezza dell&apos;account, come verifica e recupero password, continuano a essere inviate indipendentemente da questa preferenza.</p>
      {error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p> : null}
      {message ? <p className={`${styles.notice} ${styles.success}`} role="status">{message}</p> : null}
      <div className={styles.actions}><button className={styles.primary} type="button" onClick={save} disabled={saving || !preference || (enabled === preference.transactional_email_enabled && pushEnabled === preference.transactional_push_enabled)}><Save size={18} aria-hidden />{saving ? 'Salvataggio…' : 'Salva notifiche'}</button></div>
    </>}
  </section>;
}
