"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CTA_DESTINATION_GROUP_LABELS,
  DYNAMIC_CTA_DESTINATIONS,
  STATIC_CTA_DESTINATIONS,
  assertNotPadelleriaSelfLink,
  buildCircuitCtaHref,
  buildPadelleriaCtaHref,
  buildPartnerCtaHref,
  buildTournamentCtaHref,
  canonicalizeExternalCtaUrl,
  destinationSuggestion,
  filterCircuitCtaOptions,
  filterPadelleriaCtaOptions,
  filterPartnerCtaOptions,
  filterTournamentCtaOptions,
  includePreservedOption,
  matchCtaDestination,
  selectionChoice,
  shouldApplyCtaLabelSuggestion,
  validateCustomInternalPath,
  type CircuitCtaOption,
  type DynamicCtaDestinationKey,
  type PadelleriaCtaOption,
  type PartnerCtaOption,
  type StaticCtaDestinationKey,
  type TournamentCtaOption,
} from "@/lib/publicCtaDestinations";
import s from "./padelleria.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";

function todayRome() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateLabel(value?: string | null) {
  if (!value) return "data non disponibile";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" }).format(date)
    : value;
}

function initialDynamicValue(url: string | null | undefined) {
  const selection = matchCtaDestination(url);
  if (selection.mode !== "catalog" || !("params" in selection)) return "";
  if (selection.key === "tournament") return selection.params.tournamentId;
  if (selection.key === "circuit") return selection.params.slug;
  if (selection.key === "partner") return selection.params.slug;
  return selection.params.contentId;
}

export default function CtaDestinationFields({
  ctaLabel,
  ctaUrl,
  currentContentId,
  onLabelChange,
  onUrlChange,
}: {
  ctaLabel: string;
  ctaUrl: string;
  currentContentId?: string;
  onLabelChange: (value: string) => void;
  onUrlChange: (value: string) => void;
}) {
  const initialSelection = useMemo(() => matchCtaDestination(ctaUrl), [ctaUrl]);
  const [choice, setChoice] = useState(() => selectionChoice(initialSelection));
  const [dynamicValue, setDynamicValue] = useState(() => initialDynamicValue(ctaUrl));
  const [labelCustomized, setLabelCustomized] = useState(Boolean(ctaLabel.trim()));
  const [fieldError, setFieldError] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [tournaments, setTournaments] = useState<TournamentCtaOption[]>([]);
  const [circuits, setCircuits] = useState<CircuitCtaOption[]>([]);
  const [contents, setContents] = useState<PadelleriaCtaOption[]>([]);
  const [partners, setPartners] = useState<PartnerCtaOption[]>([]);

  const dynamicKey = choice.startsWith("dynamic:") ? choice.slice("dynamic:".length) as DynamicCtaDestinationKey : null;

  useEffect(() => {
    if (!dynamicKey) return;
    if (dynamicKey === "tournament" && tournaments.length) return;
    if (dynamicKey === "circuit" && circuits.length) return;
    if (dynamicKey === "padelleria_content" && contents.length) return;
    if (dynamicKey === "partner" && partners.length) return;
    const controller = new AbortController();
    const endpoint = dynamicKey === "tournament"
      ? "/api/admin/tournaments"
      : dynamicKey === "circuit"
        ? "/api/admin/circuits"
        : dynamicKey === "partner"
          ? "/api/admin/partners?limit=50&offset=0"
          : "/api/admin/padelleria?status=published&limit=50&offset=0";
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Destinazioni non disponibili");
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (dynamicKey === "tournament") setTournaments(filterTournamentCtaOptions(rows, todayRome()));
        else if (dynamicKey === "circuit") setCircuits(filterCircuitCtaOptions(rows));
        else if (dynamicKey === "partner") setPartners(filterPartnerCtaOptions(rows));
        else setContents(filterPadelleriaCtaOptions(rows, currentContentId));
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setFieldError(error instanceof Error ? error.message : "Destinazioni non disponibili");
      });
    return () => controller.abort();
  }, [circuits.length, contents.length, currentContentId, dynamicKey, partners.length, tournaments.length]);

  function suggest(key: StaticCtaDestinationKey | DynamicCtaDestinationKey) {
    const suggestion = destinationSuggestion(key);
    if (suggestion && shouldApplyCtaLabelSuggestion(ctaLabel, labelCustomized)) onLabelChange(suggestion);
  }

  function changeChoice(next: string) {
    setChoice(next);
    setDynamicValue("");
    setFieldError("");
    if (next === "none") {
      onLabelChange("");
      onUrlChange("");
      return;
    }
    if (next.startsWith("static:")) {
      const key = next.slice("static:".length) as StaticCtaDestinationKey;
      const destination = STATIC_CTA_DESTINATIONS.find((item) => item.key === key);
      if (!destination) return;
      onUrlChange(destination.href);
      suggest(key);
      return;
    }
    if (next.startsWith("dynamic:")) {
      const key = next.slice("dynamic:".length) as DynamicCtaDestinationKey;
      const alreadyLoaded = key === "tournament" ? tournaments.length > 0 : key === "circuit" ? circuits.length > 0 : key === "partner" ? partners.length > 0 : contents.length > 0;
      setLoadState(alreadyLoaded ? "ready" : "idle");
      onUrlChange("");
      suggest(key);
      return;
    }
    if (next === "external" || next === "custom_internal") onUrlChange("");
  }

  function changeDynamic(value: string) {
    setDynamicValue(value);
    setFieldError("");
    try {
      const href = dynamicKey === "tournament"
        ? buildTournamentCtaHref(value)
        : dynamicKey === "circuit"
          ? buildCircuitCtaHref(value)
          : dynamicKey === "partner"
            ? buildPartnerCtaHref(value)
            : buildPadelleriaCtaHref(value);
      assertNotPadelleriaSelfLink(currentContentId, href);
      onUrlChange(href);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Destinazione non valida");
    }
  }

  const tournamentOptions = includePreservedOption(
    tournaments.map((item) => ({ value: item.id, label: `${item.name || "Torneo"} — ${dateLabel(item.date)}${item.category || item.type ? ` · ${[item.category, item.type].filter(Boolean).join(" · ")}` : ""}` })),
    dynamicKey === "tournament" ? dynamicValue : "",
    "Torneo salvato non più disponibile nel selettore",
  );
  const circuitOptions = includePreservedOption(
    circuits.map((item) => ({ value: item.slug as string, label: `${item.name || item.slug} · ${item.status === "active" ? "In corso" : "Concluso"}` })),
    dynamicKey === "circuit" ? dynamicValue : "",
    "Circuito salvato non più disponibile nel selettore",
  );
  const contentOptions = includePreservedOption(
    contents.map((item) => ({ value: item.id, label: `${item.title || "Contenuto"} · ${item.kind === "succede" ? "Succede" : "È successo"} · ${dateLabel(item.occurred_at ?? item.visible_from ?? item.published_at)}` })),
    dynamicKey === "padelleria_content" ? dynamicValue : "",
    "Contenuto salvato non più disponibile nel selettore",
  );
  const partnerOptions = includePreservedOption(
    partners.map((item) => ({ value: item.slug as string, label: `${item.name || item.slug}${item.category ? ` · ${item.category}` : ""}` })),
    dynamicKey === "partner" ? dynamicValue : "",
    "Partner salvato non più disponibile nel selettore",
  );
  const selectedOptions = dynamicKey === "tournament" ? tournamentOptions : dynamicKey === "circuit" ? circuitOptions : dynamicKey === "partner" ? partnerOptions : contentOptions;
  const generated = choice.startsWith("static:") || choice.startsWith("dynamic:");

  return <>
    <label className={s.field}>Testo CTA (opzionale)
      <input maxLength={100} value={ctaLabel} onChange={(event) => { setLabelCustomized(true); onLabelChange(event.target.value); }} />
    </label>
    <label className={s.field}>Destinazione CTA
      <select value={choice} onChange={(event) => changeChoice(event.target.value)}>
        <option value="none">Nessuna</option>
        {(["movi_pages", "personal", "information"] as const).map((group) => <optgroup label={CTA_DESTINATION_GROUP_LABELS[group]} key={group}>
          {STATIC_CTA_DESTINATIONS.filter((item) => item.group === group && item.availability === "enabled").map((item) => <option value={`static:${item.key}`} key={item.key}>{item.label}{item.auth === "user" ? " · accesso richiesto" : ""}</option>)}
        </optgroup>)}
        <optgroup label={CTA_DESTINATION_GROUP_LABELS.specific_content}>
          {DYNAMIC_CTA_DESTINATIONS.filter((item) => item.availability === "enabled").map((item) => <option value={`dynamic:${item.key}`} key={item.key}>{item.label}</option>)}
        </optgroup>
        <optgroup label={CTA_DESTINATION_GROUP_LABELS.links}>
          <option value="external">URL esterno HTTPS</option>
          <option value="custom_internal">Percorso interno personalizzato · Avanzato</option>
        </optgroup>
        {initialSelection.mode === "legacy" ? <option value="legacy">Valore legacy conservato</option> : null}
      </select>
    </label>

    {dynamicKey ? <label className={`${s.field} ${s.wide}`}>{DYNAMIC_CTA_DESTINATIONS.find((item) => item.key === dynamicKey)?.selectorLabel ?? "Destinazione"}
      <select required value={dynamicValue} disabled={loadState === "idle" || loadState === "loading"} onChange={(event) => changeDynamic(event.target.value)} aria-describedby="cta-dynamic-help">
        <option value="">{loadState === "idle" || loadState === "loading" ? "Caricamento…" : "Seleziona…"}</option>
        {selectedOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <span className={s.muted} id="cta-dynamic-help">{loadState === "ready" && selectedOptions.length === 0 ? "Nessuna destinazione pubblica disponibile." : "La destinazione viene generata automaticamente."}</span>
    </label> : null}

    {choice === "external" ? <label className={`${s.field} ${s.wide}`}>URL esterno HTTPS
      <input required type="url" inputMode="url" placeholder="https://…" maxLength={2000} value={ctaUrl} onChange={(event) => { event.currentTarget.setCustomValidity(""); setFieldError(""); onUrlChange(event.target.value); }} onBlur={(event) => {
        if (!ctaUrl) return;
        try { onUrlChange(canonicalizeExternalCtaUrl(ctaUrl)); event.currentTarget.setCustomValidity(""); setFieldError(""); } catch (error) { const message = error instanceof Error ? error.message : "URL non valido"; event.currentTarget.setCustomValidity(message); setFieldError(message); }
      }} />
      <span className={s.muted}>Solo HTTPS, senza credenziali.</span>
    </label> : null}

    {choice === "custom_internal" ? <label className={`${s.field} ${s.wide}`}>Percorso interno personalizzato · Avanzato
      <input required placeholder="/percorso" maxLength={2000} value={ctaUrl} onChange={(event) => {
        const next = event.target.value;
        onUrlChange(next);
        const validation = next ? validateCustomInternalPath(next) : { ok: true as const };
        event.currentTarget.setCustomValidity(validation.ok ? "" : validation.error);
        setFieldError(validation.ok ? "" : validation.error);
      }} />
      <span className={s.muted}>Usalo soltanto per una route pubblica MOVI non ancora presente nel catalogo.</span>
    </label> : null}

    {choice === "legacy" ? <div className={`${s.legacyCta} ${s.wide}`} role="status"><strong>Valore CTA legacy conservato</strong><code>{ctaUrl}</code><span>Puoi lasciarlo invariato oppure scegliere esplicitamente una nuova destinazione.</span></div> : null}
    {generated && ctaUrl ? <div className={`${s.generatedCta} ${s.wide}`}><span>Destinazione generata</span><code>{ctaUrl}</code></div> : null}
    {fieldError ? <span className={`${s.inlineError} ${s.wide}`} role="alert">{fieldError}</span> : null}
  </>;
}
