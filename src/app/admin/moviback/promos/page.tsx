"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgePercent,
  Ban,
  CalendarDays,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

type Promo = {
  id: string;
  title: string;
  multiplier: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  schedule_type: string;
  days_of_week: number[] | null;
  start_time: string | null;
  end_time: string | null;
  target_type: string;
  target_gender: string | null;
  min_age: number | null;
  max_age: number | null;
  new_member_days: number | null;
};

const WEEK_DAYS = [
  { id: 1, label: "Lun" },
  { id: 2, label: "Mar" },
  { id: 3, label: "Mer" },
  { id: 4, label: "Gio" },
  { id: 5, label: "Ven" },
  { id: 6, label: "Sab" },
  { id: 7, label: "Dom" },
];

export default function AdminMoviBackPromosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Promo[]>([]);

  const [title, setTitle] = useState("");
  const [multiplier, setMultiplier] = useState("");
  const [days, setDays] = useState("");
  const [notes, setNotes] = useState("");

  const [scheduleType, setScheduleType] = useState("always");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [targetType, setTargetType] = useState("all");
  const [targetGender, setTargetGender] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [newMemberDays, setNewMemberDays] = useState("");

  async function load() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/moviback/promos", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento promo");

      setItems(json.data || []);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activePromo = useMemo(() => {
    const now = new Date();

    return (
      items.find((p) => {
        const starts = new Date(p.starts_at);
        const ends = new Date(p.ends_at);
        return p.is_active && starts <= now && ends >= now;
      }) || null
    );
  }, [items]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function resetForm() {
    setTitle("");
    setMultiplier("");
    setDays("");
    setNotes("");
    setScheduleType("always");
    setDaysOfWeek([]);
    setStartTime("");
    setEndTime("");
    setTargetType("all");
    setTargetGender("");
    setMinAge("");
    setMaxAge("");
    setNewMemberDays("");
  }

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Inserisci un titolo");
      return;
    }

    if (!multiplier || Number(multiplier) <= 1) {
      toast.error("Inserisci un moltiplicatore maggiore di 1");
      return;
    }

    if (!days || Number(days) < 1) {
      toast.error("Inserisci una durata valida");
      return;
    }

    if (scheduleType === "time_window" && (!startTime || !endTime)) {
      toast.error("Inserisci inizio e fine fascia oraria");
      return;
    }

    if (scheduleType === "weekdays" && daysOfWeek.length === 0) {
      toast.error("Seleziona almeno un giorno");
      return;
    }

    if (targetType === "gender" && !targetGender) {
      toast.error("Seleziona il genere target");
      return;
    }

    if (targetType === "age_range" && !minAge && !maxAge) {
      toast.error("Inserisci almeno età minima o massima");
      return;
    }

    if (targetType === "new_members" && (!newMemberDays || Number(newMemberDays) < 1)) {
      toast.error("Inserisci il periodo per nuovi iscritti");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/admin/moviback/promos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          multiplier: Number(multiplier),
          days: Number(days),
          notes,
          schedule_type: scheduleType,
          days_of_week: daysOfWeek,
          start_time: startTime,
          end_time: endTime,
          target_type: targetType,
          target_gender: targetGender,
          min_age: minAge,
          max_age: maxAge,
          new_member_days: newMemberDays,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore creazione promo");

      toast.success("Promo creata");
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function togglePromo(promo: Promo) {
    try {
      setSaving(true);

      const res = await fetch(`/api/admin/moviback/promos/${promo.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: !promo.is_active,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore aggiornamento promo");

      toast.success(promo.is_active ? "Promo disattivata" : "Promo riattivata");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function deletePromo(id: string) {
    const ok = confirm("Eliminare definitivamente questa promo?");
    if (!ok) return;

    try {
      setSaving(true);

      const res = await fetch(`/api/admin/moviback/promos/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore eliminazione promo");

      toast.success("Promo eliminata");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1120, margin: "0 auto", color: "white" }}>
        <Link href="/admin/moviback" style={backLink}>
          <ArrowLeft className="w-4 h-4" />
          Torna a MoviBack
        </Link>

        <header style={{ marginTop: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BadgePercent className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 30, fontWeight: 950, letterSpacing: -0.9 }}>
              Promozioni MoviBack
            </h1>
          </div>

          <p style={muted}>
            Crea moltiplicatori globali con calendario e target utenti.
          </p>
        </header>

        {activePromo ? (
          <section style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ color: "#86efac", fontSize: 13, fontWeight: 900 }}>
              Promo globale attiva
            </div>

            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>
              {activePromo.title} · x{activePromo.multiplier}
            </div>

            <div style={{ ...muted, marginTop: 5 }}>
              {describePromo(activePromo)}
            </div>
          </section>
        ) : (
          <section style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ color: "#fbbf24", fontSize: 13, fontWeight: 900 }}>
              Nessuna promo globale attiva
            </div>
            <div style={{ ...muted, marginTop: 5 }}>
              Puoi crearne una dal modulo qui sotto.
            </div>
          </section>
        )}

        <form onSubmit={createPromo} style={{ ...cardStyle, marginBottom: 16 }}>
          <h2 style={titleStyle}>Nuova promo collettiva</h2>

          <div style={formGrid}>
            <Field label="Titolo">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Weekend punti doppi"
                style={inputStyle}
              />
            </Field>

            <Field label="Moltiplicatore">
              <input
                type="number"
                step="0.1"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                placeholder="Moltiplicatore punti es. 2"
                style={inputStyle}
              />
            </Field>

            <Field label="Durata promo">
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="Durata in giorni es. 7"
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ ...subCard, marginTop: 12 }}>
            <div style={subTitle}>
              <CalendarDays className="w-4 h-4" />
              Quando si applica
            </div>

            <div style={segmentedGrid}>
              <button type="button" onClick={() => setScheduleType("always")} style={segmentBtn(scheduleType === "always")}>
                Sempre
              </button>
              <button type="button" onClick={() => setScheduleType("time_window")} style={segmentBtn(scheduleType === "time_window")}>
                Fascia oraria
              </button>
              <button type="button" onClick={() => setScheduleType("weekdays")} style={segmentBtn(scheduleType === "weekdays")}>
                Giorni
              </button>
              <button type="button" onClick={() => setScheduleType("weekend")} style={segmentBtn(scheduleType === "weekend")}>
                Weekend
              </button>
            </div>

            {scheduleType === "time_window" ? (
              <div style={{ ...formGrid, marginTop: 12 }}>
                <Field label="Dalle">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Alle">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            ) : null}

            {scheduleType === "weekdays" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {WEEK_DAYS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    style={dayBtn(daysOfWeek.includes(d.id))}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ ...subCard, marginTop: 12 }}>
            <div style={subTitle}>
              <Users className="w-4 h-4" />
              A chi si applica
            </div>

            <div style={segmentedGrid}>
              <button type="button" onClick={() => setTargetType("all")} style={segmentBtn(targetType === "all")}>
                Tutti
              </button>
              <button type="button" onClick={() => setTargetType("birthday")} style={segmentBtn(targetType === "birthday")}>
                Compleanno
              </button>
              <button type="button" onClick={() => setTargetType("gender")} style={segmentBtn(targetType === "gender")}>
                Genere
              </button>
              <button type="button" onClick={() => setTargetType("age_range")} style={segmentBtn(targetType === "age_range")}>
                Età
              </button>
              <button type="button" onClick={() => setTargetType("new_members")} style={segmentBtn(targetType === "new_members")}>
                Nuovi iscritti
              </button>
            </div>

            {targetType === "gender" ? (
              <div style={{ ...formGrid, marginTop: 12 }}>
                <Field label="Genere">
                  <select
                    value={targetGender}
                    onChange={(e) => setTargetGender(e.target.value)}
                    style={inputStyle}
                  >
                    <option style={optionStyle} value="">Seleziona</option>
                    <option style={optionStyle} value="F">Femminile</option>
                    <option style={optionStyle} value="M">Maschile</option>
                  </select>
                </Field>
              </div>
            ) : null}

            {targetType === "age_range" ? (
              <div style={{ ...formGrid, marginTop: 12 }}>
                <Field label="Età minima">
                  <input
                    type="number"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    placeholder="Es. 55"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Età massima">
                  <input
                    type="number"
                    value={maxAge}
                    onChange={(e) => setMaxAge(e.target.value)}
                    placeholder="Opzionale"
                    style={inputStyle}
                  />
                </Field>
              </div>
            ) : null}

            {targetType === "new_members" ? (
              <div style={{ ...formGrid, marginTop: 12 }}>
                <Field label="Iscritti negli ultimi giorni">
                  <input
                    type="number"
                    value={newMemberDays}
                    onChange={(e) => setNewMemberDays(e.target.value)}
                    placeholder="Es. 30"
                    style={inputStyle}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota interna opzionale"
            style={{
              ...inputStyle,
              minHeight: 90,
              paddingTop: 12,
              marginTop: 12,
              resize: "vertical",
            }}
          />

          <button type="submit" disabled={saving} style={primaryBtn}>
            <Plus className="w-4 h-4" />
            Crea promo
          </button>
        </form>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div style={emptyStyle}>Nessuna promo creata.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((promo) => {
              const now = new Date();
              const starts = new Date(promo.starts_at);
              const ends = new Date(promo.ends_at);
              const isCurrentlyActive =
                promo.is_active && starts <= now && ends >= now;

              return (
                <div
                  key={promo.id}
                  style={{
                    ...cardStyle,
                    opacity: promo.is_active ? 1 : 0.58,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 950 }}>
                        {promo.title}
                      </div>

                      <div style={{ ...muted, marginTop: 5 }}>
                        x{promo.multiplier} ·{" "}
                        {new Date(promo.starts_at).toLocaleDateString("it-IT")}{" "}
                        →{" "}
                        {new Date(promo.ends_at).toLocaleDateString("it-IT")}
                      </div>

                      <div style={{ ...muted, marginTop: 5 }}>
                        {describePromo(promo)}
                      </div>

                      {promo.notes ? (
                        <div style={{ ...muted, marginTop: 6 }}>
                          {promo.notes}
                        </div>
                      ) : null}
                    </div>

                    <span
                      style={{
                        ...pillStyle,
                        color: isCurrentlyActive ? "#86efac" : "#fbbf24",
                        border: isCurrentlyActive
                          ? "1px solid rgba(34,197,94,0.28)"
                          : "1px solid rgba(245,158,11,0.24)",
                        background: isCurrentlyActive
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(245,158,11,0.10)",
                      }}
                    >
                      {isCurrentlyActive
                        ? "Attiva ora"
                        : promo.is_active
                          ? "Programm./scaduta"
                          : "Disattivata"}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 13,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => togglePromo(promo)}
                      disabled={saving}
                      style={secondaryBtn}
                    >
                      <Ban className="w-4 h-4" />
                      {promo.is_active ? "Disattiva" : "Riattiva"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deletePromo(promo.id)}
                      disabled={saving}
                      style={dangerBtn}
                    >
                      <Trash2 className="w-4 h-4" />
                      Elimina
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function describePromo(p: Promo) {
  const schedule =
    p.schedule_type === "always"
      ? "Sempre"
      : p.schedule_type === "time_window"
        ? `Fascia ${String(p.start_time || "").slice(0, 5)}-${String(p.end_time || "").slice(0, 5)}`
        : p.schedule_type === "weekend"
          ? "Solo weekend"
          : `Giorni: ${(p.days_of_week || [])
              .map((id) => WEEK_DAYS.find((d) => d.id === id)?.label)
              .filter(Boolean)
              .join(", ")}`;

  const target =
    p.target_type === "all"
      ? "Tutti"
      : p.target_type === "birthday"
        ? "Compleanno"
        : p.target_type === "gender"
          ? `Genere ${p.target_gender}`
          : p.target_type === "age_range"
            ? `Età ${p.min_age ?? "0"}-${p.max_age ?? "∞"}`
            : `Nuovi iscritti ${p.new_member_days} giorni`;

  return `${schedule} · ${target}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
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

const subCard: React.CSSProperties = {
  borderRadius: 20,
  padding: 13,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.075)",
};

const subTitle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.82)",
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 10,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.68)",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 6,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const segmentedGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};

function segmentBtn(active: boolean): React.CSSProperties {
  return {
    minHeight: 38,
    borderRadius: 14,
    border: active
      ? "1px solid rgba(245,158,11,0.45)"
      : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.055)",
    color: active ? "#fbbf24" : "rgba(255,255,255,0.72)",
    fontWeight: 900,
    cursor: "pointer",
  };
}

function dayBtn(active: boolean): React.CSSProperties {
  return {
    minHeight: 36,
    padding: "0 12px",
    borderRadius: 999,
    border: active
      ? "1px solid rgba(45,212,191,0.42)"
      : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(45,212,191,0.14)" : "rgba(255,255,255,0.055)",
    color: active ? "#2dd4bf" : "rgba(255,255,255,0.72)",
    fontWeight: 900,
    cursor: "pointer",
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  padding: "0 13px",
  outline: "none",
  fontWeight: 750,
};

const optionStyle: React.CSSProperties = {
  color: "#0f172a",
  background: "#ffffff",
};

const primaryBtn: React.CSSProperties = {
  marginTop: 14,
  minHeight: 46,
  width: "100%",
  borderRadius: 16,
  border: 0,
  background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
  color: "#111827",
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  color: "#fca5a5",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "rgba(239,68,68,0.12)",
};

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.68)",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const emptyStyle: React.CSSProperties = {
  borderRadius: 24,
  padding: 28,
  textAlign: "center",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.58)",
  fontWeight: 750,
};