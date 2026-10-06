'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatRequestValues, goals, groupSizeLabels, levels, matchTypes, trainingTypes, type userRequestDTO } from '@/lib/moviRequests';
import { playingSideLabel } from '@/lib/playingSide';
import s from '../../../admin/padelleria/padelleria.module.css';
type Item = ReturnType<typeof userRequestDTO>;

export default function Detail({ id }: { id: string }) {
  const [item, setItem] = useState<Item | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/user/activities/request/${id}`, { cache: 'no-store', signal: controller.signal }).then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setItem(payload.data); }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); }); return () => controller.abort(); }, [id, reload]);
  async function cancel() { if (!confirm('Annullare questa richiesta?')) return; setBusy(true); try { const response = await fetch(`/api/user/requests/${id}/cancel`, { method: 'POST' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setReload(value => value + 1); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }
  return <main className={s.page}><Link href="/le-mie-attivita">← Le mie attività</Link><h1>La mia richiesta</h1>{error && <p role="alert" className={s.error}>{error}</p>}{item && <article className={s.card}><h2 className={s.title}>{item.summary}</h2><p className={s.badge}>{item.status_label}</p><p>{levels[item.level]} · Lato del richiedente: {playingSideLabel(item.playing_side)}</p>{item.activity_type === 'gioca' ? <><p>Gruppo: {item.group_size ? groupSizeLabels[item.group_size] : 'Non indicato'}</p>{item.group_size === 3 ? <p>Quarto cercato: {playingSideLabel(item.required_player_side)}</p> : null}<p>{formatRequestValues(item.match_type, matchTypes)}</p></> : <p>{formatRequestValues(item.training_type, trainingTypes)} · {formatRequestValues(item.training_goal, goals)}</p>}<p>{item.preferred_time_text}</p><p style={{ whiteSpace: 'pre-wrap' }}>{item.notes}</p>{item.can_cancel ? <button className={s.secondary} disabled={busy} onClick={cancel}>Annulla richiesta</button> : <p className={s.muted}>Per informazioni contatta MOVI.</p>}</article>}</main>;
}
