"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Suspense } from "react";
import {
  Bell,
  CalendarClock,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

type CommunicationTarget =
  | "all"
  | "tournament"
  | "moviback"
  | "moviback_approved"
  | "moviback_pending"
  | "moviback_suspended"
  | "staff";

type Communication = {
  id: string;
  target: CommunicationTarget;
  tournament_id: string | null;
  title: string;
  body: string;
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type AdminTournamentOption = {
  id: string;
  name: string;
  date: string | null;
  time: string | null;
  location: string | null;
};

const targets: { value: CommunicationTarget; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "tournament", label: "Torneo" },
  { value: "moviback", label: "MoviBack" },
  { value: "moviback_approved", label: "MoviBack attivi" },
  { value: "moviback_pending", label: "MoviBack pending" },
  { value: "moviback_suspended", label: "MoviBack sospesi" },
  { value: "staff", label: "Staff" },
];

const emptyForm = {
  target: "all" as CommunicationTarget,
  tournament_id: "",
  title: "",
  body: "",
  image_path: "",
  cta_label: "",
  cta_url: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
};

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function targetLabel(value: string) {
  return targets.find((t) => t.value === value)?.label || value;
}

function isRunning(item: Communication) {
  const now = Date.now();
  const start = new Date(item.starts_at).getTime();
  const end = item.ends_at ? new Date(item.ends_at).getTime() : null;

  return item.is_active && start <= now && (!end || end >= now);
}

function AdminComunicazioniPageContent() {
  const searchParams = useSearchParams();
  const initialTarget = searchParams.get("target") as CommunicationTarget | null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Communication[]>([]);
  const [editing, setEditing] = useState<Communication | null>(null);

  const [tournaments, setTournaments] = useState<AdminTournamentOption[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  const [form, setForm] = useState({
    ...emptyForm,
    target:
      initialTarget && targets.some((t) => t.value === initialTarget)
        ? initialTarget
        : "all",
  });

  const [filterTarget, setFilterTarget] = useState<
    CommunicationTarget | "all_items"
  >(
    initialTarget && targets.some((t) => t.value === initialTarget)
      ? initialTarget
      : "all_items"
  );

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (filterTarget === "all_items") return items;
    return items.filter((item) => item.target === filterTarget);
  }, [items, filterTarget]);

  function tournamentLabel(id?: string | null) {
    if (!id) return null;
    const t = tournaments.find((x) => x.id === id);
    if (!t) return "Torneo selezionato";
    return `${t.name} · ${t.date || "-"} ${t.time || ""}`;
  }

  async function loadTournaments() {
    try {
      setLoadingTournaments(true);

      const res = await fetch("/api/admin/tournaments", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore caricamento tornei");
      }

      setTournaments((json.data ?? []) as AdminTournamentOption[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore caricamento tornei");
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function loadItems() {
    try {
      setLoading(true);

      const qs =
        filterTarget !== "all_items"
          ? `?target=${encodeURIComponent(filterTarget)}`
          : "";

      const res = await fetch(`/api/admin/comunicazioni${qs}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore caricamento comunicazioni");
      }

      setItems((json.data ?? []) as Communication[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTarget]);

  function resetForm() {
    setEditing(null);
    setImageFile(null);
    setForm({
      ...emptyForm,
      target:
        filterTarget !== "all_items"
          ? (filterTarget as CommunicationTarget)
          : initialTarget && targets.some((t) => t.value === initialTarget)
            ? initialTarget
            : "all",
      tournament_id: "",
    });
  }

  function startEdit(item: Communication) {
    setEditing(item);
    setImageFile(null);
    setForm({
      target: item.target,
      tournament_id: item.tournament_id ?? "",
      title: item.title ?? "",
      body: item.body ?? "",
      image_path: item.image_path ?? "",
      cta_label: item.cta_label ?? "",
      cta_url: item.cta_url ?? "",
      is_active: Boolean(item.is_active),
      starts_at: toDatetimeLocal(item.starts_at),
      ends_at: toDatetimeLocal(item.ends_at),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadImageIfNeeded() {
    if (!imageFile) {
      return form.image_path || null;
    }

    const fd = new FormData();
    fd.append("file", imageFile);

    const res = await fetch("/api/admin/comunicazioni/image", {
      method: "POST",
      body: fd,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore upload immagine");
    }

    return json.url as string;
  }

  async function saveCommunication(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);

      if (form.target === "tournament" && !form.tournament_id) {
        throw new Error("Seleziona un torneo");
      }

      const imageUrl = await uploadImageIfNeeded();

      const payload = {
        target: form.target,
        tournament_id: form.target === "tournament" ? form.tournament_id : null,
        title: form.title,
        body: form.body,
        image_path: imageUrl,
        cta_label: form.cta_label,
        cta_url: form.cta_url,
        is_active: form.is_active,
        starts_at: form.starts_at || new Date().toISOString(),
        ends_at: form.ends_at || null,
      };

      const url = editing
        ? `/api/admin/comunicazioni/${editing.id}`
        : "/api/admin/comunicazioni";

      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore salvataggio comunicazione");
      }

      toast.success(
        editing ? "Comunicazione aggiornata" : "Comunicazione creata"
      );

      resetForm();
      await loadItems();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: Communication) {
    try {
      const res = await fetch(`/api/admin/comunicazioni/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: item.target,
          tournament_id:
            item.target === "tournament" ? item.tournament_id : null,
          title: item.title,
          body: item.body,
          image_path: item.image_path ?? "",
          cta_label: item.cta_label ?? "",
          cta_url: item.cta_url ?? "",
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          is_active: !item.is_active,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore aggiornamento comunicazione");
      }

      toast.success(
        item.is_active ? "Comunicazione disattivata" : "Comunicazione riattivata"
      );
      await loadItems();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteItem(id: string) {
    const ok = confirm("Eliminare definitivamente questa comunicazione?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/comunicazioni/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore eliminazione comunicazione");
      }

      toast.success("Comunicazione eliminata");
      await loadItems();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

    return (
    <div style={pageStyle} className="admin-comunicazioni-page">
      <div
        style={{ maxWidth: 1120, margin: "0 auto", color: "white" }}
        className="admin-comunicazioni-shell"
      >
        <header style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Comunicazioni
            </h1>
          </div>

          <p style={muted}>
            Crea notifiche centralizzate per utenti, tornei, MoviBack e staff.
          </p>
        </header>

        <form onSubmit={saveCommunication} style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
            {editing ? "Modifica comunicazione" : "Nuova comunicazione"}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              className="admin-comunicazioni-two-grid"
            >
              <select
                value={form.target}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    target: e.target.value as CommunicationTarget,
                    tournament_id:
                      e.target.value === "tournament" ? p.tournament_id : "",
                  }))
                }
                style={selectStyle}
              >
                {targets.map((t) => (
                  <option
                    key={t.value}
                    value={t.value}
                    style={{ color: "#0f172a", background: "#ffffff" }}
                  >
                    {t.label}
                  </option>
                ))}
              </select>

              <label style={checkRow}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                />
                Comunicazione attiva
              </label>
            </div>

            {form.target === "tournament" ? (
              <select
                value={form.tournament_id}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    tournament_id: e.target.value,
                  }))
                }
                required
                style={selectStyle}
              >
                <option value="" style={{ color: "#0f172a", background: "#ffffff" }}>
                  {loadingTournaments ? "Caricamento tornei..." : "Seleziona torneo"}
                </option>

                {tournaments.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    style={{ color: "#0f172a", background: "#ffffff" }}
                  >
                    {t.name} · {t.date || "-"} {t.time || ""} · {t.location || "-"}
                  </option>
                ))}
              </select>
            ) : null}

            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Titolo comunicazione"
              required
              style={inputStyle}
            />

            <textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              placeholder="Testo comunicazione"
              required
              rows={5}
              style={{
                ...inputStyle,
                minHeight: 130,
                paddingTop: 12,
                resize: "vertical",
              }}
            />

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              className="admin-comunicazioni-two-grid"
            >
              <input
                value={form.cta_label}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cta_label: e.target.value }))
                }
                placeholder="CTA label opzionale es. Scopri di più"
                style={inputStyle}
              />

              <input
                value={form.cta_url}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cta_url: e.target.value }))
                }
                placeholder="CTA URL opzionale es. /tornei"
                style={inputStyle}
              />
            </div>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
              className="admin-comunicazioni-two-grid"
            >
              <div>
                <div style={labelStyle}>Inizio pubblicazione</div>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, starts_at: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={labelStyle}>Fine pubblicazione opzionale</div>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, ends_at: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <label style={uploadLabel}>
              <ImagePlus
                className="w-5 h-5"
                strokeWidth={1.7}
                style={{ color: "#f59e0b", flexShrink: 0 }}
              />

              <span
                style={{
                  color: imageFile ? "#ffffff" : "rgba(255,255,255,0.58)",
                  fontWeight: 750,
                  fontSize: 13,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {imageFile
                  ? imageFile.name
                  : form.image_path
                    ? "Immagine già caricata"
                    : "Carica immagine opzionale JPG, PNG o WEBP"}
              </span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {form.image_path ? (
              <button
                type="button"
                onClick={() => setPreviewImage(form.image_path)}
                style={previewBtn}
              >
                Visualizza immagine caricata
              </button>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: editing ? "1fr 1fr" : "1fr",
                gap: 10,
              }}
              className="admin-comunicazioni-actions-grid"
            >
              {editing ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  style={secondaryBtn}
                >
                  Annulla modifica
                </button>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...primaryBtn,
                  opacity: saving ? 0.65 : 1,
                }}
              >
                {saving
                  ? "Salvataggio..."
                  : editing
                    ? "Salva modifiche"
                    : "Crea comunicazione"}
              </button>
            </div>
          </div>
        </form>

        <section style={{ marginTop: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
            className="admin-comunicazioni-list-head"
          >
            <div style={{ fontSize: 18, fontWeight: 950 }}>
              Comunicazioni create
            </div>

            <select
              value={filterTarget}
              onChange={(e) =>
                setFilterTarget(e.target.value as CommunicationTarget | "all_items")
              }
              style={{
                ...selectStyle,
                width: 210,
                minHeight: 42,
              }}
              className="admin-comunicazioni-filter-select"
            >
              <option value="all_items" style={{ color: "#0f172a", background: "#ffffff" }}>
                Tutti i target
              </option>
              {targets.map((t) => (
                <option
                  key={t.value}
                  value={t.value}
                  style={{ color: "#0f172a", background: "#ffffff" }}
                >
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 30 }}>
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={emptyState}>Nessuna comunicazione trovata.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {filteredItems.map((item) => {
                const running = isRunning(item);

                return (
                  <div
                    key={item.id}
                    className="admin-comunicazioni-item-card"
                    style={{
                      display: "grid",
                      gridTemplateColumns: item.image_path
                        ? "86px minmax(0, 1fr)"
                        : "1fr",
                      gap: 13,
                      alignItems: "center",
                      borderRadius: 24,
                      padding: 12,
                      background: item.is_active
                        ? "rgba(255,255,255,0.055)"
                        : "rgba(255,255,255,0.02)",
                      opacity: item.is_active ? 1 : 0.58,
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 14px 34px rgba(0,0,0,0.16)",
                    }}
                  >
                    {item.image_path ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(item.image_path)}
                        style={thumbBtn}
                        className="admin-comunicazioni-thumb"
                      >
                        <img
                          src={item.image_path}
                          alt={item.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </button>
                    ) : null}

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                        className="admin-comunicazioni-item-head"
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: "#ffffff",
                              fontSize: 17,
                              fontWeight: 900,
                              lineHeight: 1.1,
                            }}
                          >
                            {item.title}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: "rgba(255,255,255,0.58)",
                              fontSize: 13,
                              fontWeight: 600,
                              lineHeight: 1.35,
                            }}
                          >
                            {item.body}
                          </div>
                        </div>

                        <span
                          style={{
                            ...statusPill,
                            color: running ? "#86efac" : "#fbbf24",
                            border: running
                              ? "1px solid rgba(134,239,172,0.30)"
                              : "1px solid rgba(251,191,36,0.28)",
                            background: running
                              ? "rgba(34,197,94,0.12)"
                              : "rgba(245,158,11,0.12)",
                          }}
                        >
                          {running ? "Attiva ora" : item.is_active ? "Programm." : "Off"}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 11,
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                        }}
                        className="admin-comunicazioni-meta-row"
                      >
                        <span style={pillStyle}>{targetLabel(item.target)}</span>

                        {item.target === "tournament" ? (
                          <span style={pillStyle}>
                            {tournamentLabel(item.tournament_id)}
                          </span>
                        ) : null}

                        <span style={pillStyle}>
                          <CalendarClock className="w-3.5 h-3.5" />
                          {formatDateTime(item.starts_at)}
                          {item.ends_at ? ` → ${formatDateTime(item.ends_at)}` : ""}
                        </span>

                        {item.cta_label ? (
                          <span style={pillStyle}>CTA: {item.cta_label}</span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          style={iconBtn}
                          title="Modifica"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleActive(item)}
                          style={{
                            ...iconBtn,
                            color: item.is_active ? "#fbbf24" : "#86efac",
                            border: item.is_active
                              ? "1px solid rgba(245,158,11,0.24)"
                              : "1px solid rgba(34,197,94,0.24)",
                          }}
                          title={item.is_active ? "Disattiva" : "Riattiva"}
                        >
                          {item.is_active ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          style={{
                            ...iconBtn,
                            color: "#f87171",
                            border: "1px solid rgba(239,68,68,0.24)",
                          }}
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {previewImage ? (
          <div
            onClick={() => setPreviewImage(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
            }}
            className="admin-comunicazioni-preview-overlay"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 620,
                borderRadius: 26,
                overflow: "hidden",
                background: "#020617",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              className="admin-comunicazioni-preview-card"
            >
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.45)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                }}
              >
                <X className="w-5 h-5" />
              </button>

              <img
                src={previewImage}
                alt="Anteprima comunicazione"
                style={{
                  width: "100%",
                  maxHeight: "78dvh",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </div>
        ) : null}

        <style jsx global>{`
          @media (max-width: 760px) {
            .admin-comunicazioni-page {
              padding: 18px 12px 34px !important;
            }

            .admin-comunicazioni-two-grid,
            .admin-comunicazioni-actions-grid {
              grid-template-columns: 1fr !important;
            }

            .admin-comunicazioni-list-head {
              flex-direction: column !important;
              align-items: stretch !important;
            }

            .admin-comunicazioni-filter-select {
              width: 100% !important;
            }

            .admin-comunicazioni-item-card {
              grid-template-columns: 1fr !important;
              align-items: stretch !important;
            }

            .admin-comunicazioni-thumb {
              width: 100% !important;
              height: auto !important;
              aspect-ratio: 16 / 9 !important;
            }

            .admin-comunicazioni-item-head {
              flex-direction: column !important;
              align-items: flex-start !important;
            }

            .admin-comunicazioni-meta-row {
              align-items: stretch !important;
            }

            .admin-comunicazioni-meta-row > span {
              width: 100% !important;
              justify-content: flex-start !important;
              min-height: 32px !important;
            }

            .admin-comunicazioni-meta-row > button {
              flex: 1 1 0 !important;
              min-width: 44px !important;
              height: 40px !important;
              border-radius: 14px !important;
            }

            .admin-comunicazioni-preview-overlay {
              padding: 12px !important;
            }

            .admin-comunicazioni-preview-card {
              border-radius: 22px !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  padding: "0 13px",
  outline: "none",
  fontWeight: 700,
  fontSize: 15,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 13,
  fontWeight: 750,
  marginBottom: 7,
};

const muted: React.CSSProperties = {
  marginTop: 6,
  color: "rgba(255,255,255,0.58)",
  fontWeight: 650,
};

const checkRow: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.82)",
  padding: "0 13px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 800,
  fontSize: 14,
};

const uploadLabel: React.CSSProperties = {
  minHeight: 54,
  borderRadius: 18,
  border: "1px dashed rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.055)",
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "12px 13px",
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  minHeight: 50,
  borderRadius: 17,
  border: 0,
  background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  minHeight: 50,
  borderRadius: 17,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.82)",
  fontWeight: 850,
  fontSize: 15,
  cursor: "pointer",
};

const previewBtn: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.055)",
  color: "rgba(255,255,255,0.82)",
  fontWeight: 850,
  cursor: "pointer",
};

const emptyState: React.CSSProperties = {
  borderRadius: 24,
  padding: 26,
  textAlign: "center",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.58)",
  fontWeight: 700,
};

const thumbBtn: React.CSSProperties = {
  width: 86,
  height: 86,
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  padding: 0,
  cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.68)",
  fontSize: 11,
  fontWeight: 850,
};

const statusPill: React.CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.82)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

export default function AdminComunicazioniPage() {
  return (
    <Suspense fallback={null}>
      <AdminComunicazioniPageContent />
    </Suspense>
  );
}