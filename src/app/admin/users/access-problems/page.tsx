"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Item = { source: string; id: string; status: string; reason: string; name?: string | null; phone?: string | null; auth_email?: string | null; profile_email?: string | null; created_at: string; can_resolve: boolean; can_cancel: boolean; can_retry: boolean; technical?: Record<string, string> };

export default function AccessProblemsPage() {
  const [items, setItems] = useState<Item[]>([]); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => { const response = await fetch("/api/admin/users/access-problems", { cache: "no-store" }); const json = await response.json(); if (!response.ok) throw new Error(json.error); setItems(json.data ?? []); }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function act(item: Item, action: string) { setBusy(item.id); setError(""); try { const response = await fetch("/api/admin/users/access-problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita"); } finally { setBusy(""); } }
  return <main style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}><Link href="/admin">← Dashboard admin</Link><h1>Problemi di accesso</h1><p>Richieste di assistenza e accessi verificati che richiedono un intervento.</p>{error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    <div style={{ display: "grid", gap: 14 }}>{items.map((item) => <article key={`${item.source}:${item.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, background: "white" }}>
      <strong style={{ fontSize: 18 }}>{item.name || "Profilo da identificare"}</strong><p><b>Problema:</b> {item.reason}</p>
      {item.phone && <p><b>Telefono:</b> {item.phone}</p>}{item.auth_email && <p><b>Email usata:</b> {item.auth_email}</p>}{item.profile_email && <p><b>Email profilo MOVI:</b> {item.profile_email}</p>}
      <p><b>Data:</b> {new Date(item.created_at).toLocaleString("it-IT")}</p>
      {item.technical && <details><summary>Dettagli tecnici</summary><pre>{JSON.stringify(item.technical, null, 2)}</pre></details>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{item.can_retry && <button disabled={busy === item.id} onClick={() => act(item, "retry_onboarding")}>Riprova collegamento</button>}{item.can_resolve && <button disabled={busy === item.id} onClick={() => act(item, "resolve_help")}>Contrassegna come risolto</button>}{item.can_cancel && <button disabled={busy === item.id} onClick={() => act(item, item.source === "help_request" ? "cancel_help" : "cancel_onboarding")}>Annulla richiesta</button>}</div>
    </article>)}{!items.length && <p>Nessun problema di accesso.</p>}</div></main>;
}
