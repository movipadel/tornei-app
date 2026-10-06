import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UserNotificationEvent = {
  event_type: string;
  domain: string;
  payload: Record<string, unknown>;
};

const eventCopy: Record<string, { subject: string; heading: string; intro: string }> = {
  request_received: { subject: "Richiesta MOVI ricevuta", heading: "Richiesta ricevuta", intro: "Abbiamo ricevuto la tua richiesta." },
  request_searching: { subject: "MOVI sta cercando per te", heading: "Ricerca avviata", intro: "Lo staff MOVI sta lavorando sulla tua richiesta." },
  request_found: { subject: "Aggiornamento sulla tua richiesta MOVI", heading: "Abbiamo una proposta", intro: "La tua richiesta ha un nuovo aggiornamento." },
  request_completed: { subject: "Richiesta MOVI conclusa", heading: "Richiesta conclusa", intro: "La tua richiesta è stata conclusa." },
  request_cancelled: { subject: "Richiesta MOVI annullata", heading: "Richiesta annullata", intro: "La tua richiesta è stata annullata." },
  tournament_registered: { subject: "Iscrizione torneo confermata", heading: "Iscrizione confermata", intro: "La tua iscrizione al torneo è confermata." },
  tournament_reserve: { subject: "Iscrizione in lista di riserva", heading: "Sei in lista di riserva", intro: "Abbiamo registrato la tua iscrizione in lista di riserva." },
  tournament_promoted: { subject: "Promozione dalla lista di riserva", heading: "Posto confermato", intro: "Sei stato promosso dalla lista di riserva." },
  tournament_cancelled: { subject: "Iscrizione torneo annullata", heading: "Iscrizione annullata", intro: "La tua iscrizione al torneo è stata annullata." },
  "store.order.received": { subject: "Ordine MOVI ricevuto", heading: "Ordine ricevuto", intro: "Abbiamo ricevuto il tuo ordine MOVI." },
  "store.order.ready": { subject: "Il tuo ordine MOVI è pronto", heading: "Il tuo ordine è pronto", intro: "Il tuo ordine MOVI è pronto." },
  "store.order.delivered": { subject: "Ordine MOVI consegnato", heading: "Ordine consegnato", intro: "Il tuo ordine MOVI risulta consegnato." },
  "store.order.cancelled": { subject: "Ordine MOVI annullato", heading: "Ordine annullato", intro: "Il tuo ordine MOVI è stato annullato." },
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function label(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value ?? "").trim();
}

function rows(event: UserNotificationEvent) {
  const payload = event.payload;
  if (event.domain === "requests") {
    return [
      ["Attività", payload.request_type === "allenati" ? "Allenati" : "Gioca"],
      ["Club", label(payload.clubs) || "Indifferente"],
      ["Quando", label(payload.requested_date) || "Flessibile"],
      ["Fascia", label(payload.time_window)],
      ["Livello", label(payload.level)],
      ["Lato di gioco", label(payload.playing_side)],
      ...(payload.group_size ? [["Gruppo", `Siamo in ${payload.group_size}`]] : []),
      ...(payload.required_player_side ? [["Quarto cercato", label(payload.required_player_side)]] : []),
      ["Preferenze", label(payload.match_type) || label(payload.training_type)],
    ];
  }
  if (event.domain === "store") {
    const items = Array.isArray(payload.items)
      ? payload.items
          .map(item => {
            if (!item || typeof item !== "object") return "";
            const value = item as Record<string, unknown>;
            const quantity = Number(value.quantity ?? 0);
            const name = label(value.name);
            const variant = label(value.variant);
            return `${quantity > 0 ? `${quantity}× ` : ""}${name}${variant ? ` (${variant})` : ""}`;
          })
          .filter(Boolean)
          .join("; ")
      : "";
    const paymentMode = label(payload.payment_mode);
    const totals = paymentMode === "points"
      ? `${Number(payload.total_points ?? 0)} punti`
      : paymentMode === "mixed"
        ? `€ ${Number(payload.total_euro ?? 0).toFixed(2)} + ${Number(payload.total_points ?? 0)} punti`
        : `€ ${Number(payload.total_euro ?? 0).toFixed(2)}`;
    return [
      ["Ordine", label(payload.order_id)],
      ["Articoli", items],
      ["Totale", totals],
      ["Ritiro", label(payload.pickup_club)],
    ];
  }
  return [
    ["Torneo", label(payload.tournament_name)],
    ["Data", label(payload.date)],
    ["Ora", label(payload.time)],
    ["Luogo", label(payload.location)],
  ];
}

export function renderUserNotificationEmail(event: UserNotificationEvent) {
  const copy = eventCopy[event.event_type];
  if (!copy) throw new Error("NOTIFICATION_TEMPLATE_UNSUPPORTED");
  const details = rows(event).filter(([, value]) => value);
  const detailText = details.map(([key, value]) => `${key}: ${value}`).join("\n");
  const text = `MOVI\n\n${copy.heading}\n${copy.intro}${detailText ? `\n\n${detailText}` : ""}\n\nApri MOVI per i dettagli.`;
  const detailHtml = details.map(([key, value]) => `<tr><th align="left" style="padding:8px 12px;color:#667085;font-size:13px">${escapeHtml(key)}</th><td style="padding:8px 12px;color:#101828;font-size:14px">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<div style="margin:0;background:#f4f6fb;padding:24px;font-family:Arial,sans-serif;color:#101828"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e4e7ec;border-radius:18px;overflow:hidden"><div style="background:#17124f;color:#fff;padding:22px 24px"><strong style="font-size:22px">MOVI</strong></div><div style="padding:24px"><h1 style="margin:0 0 10px;font-size:24px">${escapeHtml(copy.heading)}</h1><p style="margin:0 0 18px;line-height:1.55">${escapeHtml(copy.intro)}</p>${detailHtml ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fc;border-radius:12px">${detailHtml}</table>` : ""}<p style="margin:20px 0 0;color:#667085;font-size:13px;line-height:1.5">Apri MOVI per i dettagli. Questa è un’email transazionale relativa alle tue attività.</p></div></div></div>`;
  return { subject: copy.subject, html, text };
}

export async function resolveUserNotificationEmail(userId: string) {
  const { data, error } = await supabaseAdmin().from("users").select("email,identity_status").eq("id", userId).maybeSingle();
  if (error) throw new Error("NOTIFICATION_DESTINATION_LOOKUP_FAILED");
  const email = String(data?.email ?? "").trim().toLowerCase();
  if (!data || data.identity_status !== "active" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("NOTIFICATION_DESTINATION_UNAVAILABLE");
  return email;
}

export function userEmailDestinationFingerprint(email: string) {
  const secret = process.env.USER_NOTIFICATION_FINGERPRINT_SECRET ?? process.env.USER_COOKIE_SECRET;
  if (!secret) throw new Error("NOTIFICATION_FINGERPRINT_SECRET_MISSING");
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

export async function sendUserTransactionalEmail(input: { to: string; subject: string; html: string; text: string }) {
  const transport = process.env.USER_EMAIL_TRANSPORT;
  const local = process.env.SUPABASE_URL === "http://127.0.0.1:55421";
  if (local) {
    if (transport !== "local") throw new Error("LOCAL_EMAIL_TRANSPORT_REQUIRED");
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "re_local_disabled") throw new Error("LOCAL_EMAIL_EXTERNAL_CREDENTIALS_PRESENT");
    return { id: `local-${createHash("sha256").update(`${randomUUID()}:${input.subject}`).digest("hex").slice(0,24)}` };
  }
  if (transport !== "resend") throw new Error("USER_EMAIL_TRANSPORT_NOT_CONFIGURED");
  if (!process.env.RESEND_API_KEY || !process.env.USER_EMAIL_FROM) throw new Error("USER_EMAIL_RESEND_CONFIG_MISSING");
  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.USER_EMAIL_FROM, to: input.to, subject: input.subject, html: input.html, text: input.text });
  if (error) throw new Error(`USER_EMAIL_PROVIDER:${error.message}`);
  return { id: data?.id ?? null };
}
