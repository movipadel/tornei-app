"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TournamentType = "Baraonda" | "Coppie fisse";
type Category = "Maschile" | "Femminile" | "Misto" | "Libero";
type Level = "principiante" | "intermedio" | "avanzato";
type Stage = "winner" | "finalist" | "semifinalist" | "quarterfinalist" | "others";

type RankingGroup = {
  category: Category;
  level: Level;
};

type PlacementRule = {
  min_admissions: number;
  max_admissions: number;
  rule_type: "placement";
  placement: number;
  points: number | "";
};

type StageRule = {
  min_admissions: number;
  max_admissions: number;
  rule_type: "stage";
  stage: Stage;
  points: number | "";
};

type Rule = PlacementRule | StageRule;

type CircuitDetail = {
  id: string;
  name: string;
  slug: string;
  tournament_type: TournamentType;
  status: "draft" | "active" | "closed";
  hero_logo_url: string | null;
  hero_logo_2_url: string | null;
  hero_logo_3_url: string | null;
  hero_subtitle: string | null;
  theme_key: string | null;
  rules_url: string | null;
  ranking_groups: RankingGroup[];
  points_rules: Array<{
    min_admissions: number;
    max_admissions: number;
    rule_type: "placement" | "stage";
    placement: number | null;
    stage: Stage | null;
    points: number;
  }>;
};

const CATEGORIES: Category[] = ["Maschile", "Femminile", "Misto", "Libero"];
const LEVELS: Level[] = ["principiante", "intermedio", "avanzato"];
const FIXED_RANGES = [
  { min: 4, max: 6 },
  { min: 7, max: 9 },
  { min: 10, max: 12 },
] as const;

const STAGE_LABELS: Record<Stage, string> = {
  winner: "Vittoria",
  finalist: "Finale",
  semifinalist: "Semifinale",
  quarterfinalist: "Quarti di finale",
  others: "Tutti gli altri",
};

export default function CircuitDialog({
  open,
  onClose,
  circuit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  circuit: { id: string } | null;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TournamentType>("Baraonda");
  const [status, setStatus] = useState<"draft" | "active" | "closed">("active");

  const [heroLogoUrl, setHeroLogoUrl] = useState("");
  const [heroLogo2Url, setHeroLogo2Url] = useState("");
  const [heroLogo3Url, setHeroLogo3Url] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [themeKey, setThemeKey] = useState("");
  const [rulesUrl, setRulesUrl] = useState("");

  const [groups, setGroups] = useState<RankingGroup[]>([]);
  const [points, setPoints] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isEdit = !!circuit?.id;

  useEffect(() => {
    if (!open) return;

    if (circuit?.id) {
      setLoadingDetail(true);

      fetch(`/api/admin/circuits/${circuit.id}`)
        .then(async (r) => {
          const json = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(json.error || "Errore caricamento circuito");
          return json;
        })
        .then((res) => {
          const c = res.data as CircuitDetail;

          setName(c.name);
          setType(c.tournament_type);
          setStatus(c.status);
          setHeroLogoUrl(c.hero_logo_url ?? "");
          setHeroLogo2Url(c.hero_logo_2_url ?? "");
          setHeroLogo3Url(c.hero_logo_3_url ?? "");
          setHeroSubtitle(c.hero_subtitle ?? "");
          setThemeKey(c.theme_key ?? "");
          setRulesUrl(c.rules_url ?? "");
          setGroups(c.ranking_groups ?? []);
          setPoints(
            (c.points_rules ?? []).map((r) => {
              if (r.rule_type === "placement") {
                return {
                  min_admissions: r.min_admissions,
                  max_admissions: r.max_admissions,
                  rule_type: "placement" as const,
                  placement: Number(r.placement),
                  points: Number(r.points),
                };
              }

              return {
                min_admissions: r.min_admissions,
                max_admissions: r.max_admissions,
                rule_type: "stage" as const,
                stage: r.stage as Stage,
                points: Number(r.points),
              };
            })
          );
        })
        .catch((e: any) => {
          toast.error(e?.message ?? "Errore caricamento circuito");
        })
        .finally(() => {
          setLoadingDetail(false);
        });
    } else {
      setName("");
      setType("Baraonda");
      setStatus("active");
      setHeroLogoUrl("");
      setHeroLogo2Url("");
      setHeroLogo3Url("");
      setHeroSubtitle("");
      setThemeKey("");
      setRulesUrl("");
      setGroups([]);
      setPoints([]);
    }
  }, [open, circuit?.id]);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const c = a.category.localeCompare(b.category, "it");
      if (c !== 0) return c;
      return a.level.localeCompare(b.level, "it");
    });
  }, [groups]);

  function hasGroup(category: Category, level: Level) {
    return groups.some((g) => g.category === category && g.level === level);
  }

  function toggleGroup(category: Category, level: Level) {
    const exists = hasGroup(category, level);

    if (exists) {
      setGroups((prev) => prev.filter((g) => !(g.category === category && g.level === level)));
      return;
    }

    setGroups((prev) => [...prev, { category, level }]);
  }

  function getPlacementRule(min: number, max: number, placement: number) {
    return points.find(
      (p) =>
        p.min_admissions === min &&
        p.max_admissions === max &&
        p.rule_type === "placement" &&
        p.placement === placement
    ) as PlacementRule | undefined;
  }

  function getStageRule(min: number, max: number, stage: Stage) {
    return points.find(
      (p) =>
        p.min_admissions === min &&
        p.max_admissions === max &&
        p.rule_type === "stage" &&
        p.stage === stage
    ) as StageRule | undefined;
  }

  function updatePlacementRule(
    range: { min: number; max: number },
    placement: number,
    rawValue: string
  ) {
    setPoints((prev) => {
      const filtered = prev.filter(
        (p) =>
          !(
            p.min_admissions === range.min &&
            p.max_admissions === range.max &&
            p.rule_type === "placement" &&
            p.placement === placement
          )
      );

      if (rawValue.trim() === "") return filtered;

      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) return filtered;

      return [
        ...filtered,
        {
          min_admissions: range.min,
          max_admissions: range.max,
          rule_type: "placement",
          placement,
          points: value,
        },
      ];
    });
  }

  function updateStageRule(
    range: { min: number; max: number },
    stage: Stage,
    rawValue: string
  ) {
    setPoints((prev) => {
      const filtered = prev.filter(
        (p) =>
          !(
            p.min_admissions === range.min &&
            p.max_admissions === range.max &&
            p.rule_type === "stage" &&
            p.stage === stage
          )
      );

      if (rawValue.trim() === "") return filtered;

      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) return filtered;

      return [
        ...filtered,
        {
          min_admissions: range.min,
          max_admissions: range.max,
          rule_type: "stage",
          stage,
          points: value,
        },
      ];
    });
  }

  async function save() {
    if (saving) return;

    try {
      setSaving(true);

      if (!name.trim()) throw new Error("Nome circuito obbligatorio");
      if (!groups.length) throw new Error("Seleziona almeno una classifica");

      const payload = {
        name: name.trim(),
        slug: name.trim(),
        tournament_type: type,
        status,
        hero_logo_url: heroLogoUrl.trim() || null,
        hero_logo_2_url: heroLogo2Url.trim() || null,
        hero_logo_3_url: heroLogo3Url.trim() || null,
        hero_subtitle: heroSubtitle.trim() || null,
        theme_key: themeKey.trim() || null,
        rules_url: rulesUrl.trim() || null,
        ranking_groups: groups,
        points_rules: points,
      };

      const url = isEdit ? `/api/admin/circuits/${circuit!.id}` : `/api/admin/circuits`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio circuito");

      toast.success(isEdit ? "Circuito aggiornato" : "Circuito creato");
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-4xl"
        style={{
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica circuito" : "Nuovo circuito"}</DialogTitle>
        </DialogHeader>

        {loadingDetail ? (
          <div style={{ color: "#64748b" }}>Caricamento...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Dati base */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 220px 180px",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Nome circuito</div>
                <input
                  className="base44-input"
                  placeholder="Es: Circuito Invernale 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Tipo</div>
                <select
                  className="base44-input"
                  value={type}
                  onChange={(e) => {
                    const nextType = e.target.value as TournamentType;
                    setType(nextType);
                    setPoints((prev) =>
                      prev.filter((p) =>
                        nextType === "Baraonda"
                          ? p.rule_type === "placement"
                          : p.rule_type === "stage"
                      )
                    );
                  }}
                >
                  <option value="Baraonda">Baraonda</option>
                  <option value="Coppie fisse">Coppie fisse</option>
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Stato</div>
                <select
                  className="base44-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "active" | "closed")}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Attivo</option>
                  <option value="closed">Chiuso</option>
                </select>
              </div>
            </div>

            {/* Branding */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 14,
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Branding pagina circuito</div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Logo principale URL</div>
                  <input
                    className="base44-input"
                    placeholder="https://..."
                    value={heroLogoUrl}
                    onChange={(e) => setHeroLogoUrl(e.target.value)}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Logo secondario URL</div>
                  <input
                    className="base44-input"
                    placeholder="https://..."
                    value={heroLogo2Url}
                    onChange={(e) => setHeroLogo2Url(e.target.value)}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Logo terziario URL</div>
                  <input
                    className="base44-input"
                    placeholder="https://..."
                    value={heroLogo3Url}
                    onChange={(e) => setHeroLogo3Url(e.target.value)}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Theme key</div>
                  <input
                    className="base44-input"
                    placeholder='Es: padelseries oppure lascia vuoto'
                    value={themeKey}
                    onChange={(e) => setThemeKey(e.target.value)}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Sottotitolo hero</div>
                  <textarea
                    className="base44-input"
                    placeholder="Es: Circuito storico primavera-estate • Classifiche individuali • Finals"
                    value={heroSubtitle}
                    onChange={(e) => setHeroSubtitle(e.target.value)}
                    rows={3}
                    style={{ minHeight: 90, resize: "vertical" }}
                  />
                </div>
              </div>
            </div>

            <div
  style={{
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    background: "white",
  }}
>
  <div style={{ fontWeight: 900, marginBottom: 12 }}>Regolamento circuito</div>

  <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
    Inserisci il link pubblico al PDF del regolamento del circuito.
  </div>

  <div>
    <div style={{ fontWeight: 800, marginBottom: 6 }}>URL regolamento PDF</div>
    <input
      className="base44-input"
      placeholder="https://..."
      value={rulesUrl}
      onChange={(e) => setRulesUrl(e.target.value)}
    />
  </div>
</div>

            {/* Classifiche */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 14,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Classifiche attive</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {CATEGORIES.map((category) => (
                  <div key={category}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{category}</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {LEVELS.map((level) => {
                        const active = hasGroup(category, level);

                        return (
                          <button
                            key={`${category}-${level}`}
                            type="button"
                            className="base44-csv-btn"
                            onClick={() => toggleGroup(category, level)}
                            style={{
                              borderRadius: 999,
                              padding: "10px 14px",
                              fontWeight: 900,
                              background: active ? "#16a34a" : "white",
                              borderColor: active ? "#16a34a" : "#e2e8f0",
                              color: active ? "white" : "#0f172a",
                            }}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Regole punti uniche del circuito */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 14,
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 12 }}>
                Regole punti del circuito
              </div>

              <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
                I punti valgono per tutte le classifiche del circuito. Categoria e livello separano solo le classifiche individuali.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {FIXED_RANGES.map((range) => (
                  <div
                    key={`${range.min}-${range.max}`}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: 12,
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 10 }}>
                      Fascia {range.min}-{range.max}
                    </div>

                    {type === "Baraonda" ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {Array.from({ length: range.max }, (_, i) => i + 1).map((placement) => {
                          const current = getPlacementRule(range.min, range.max, placement);

                          return (
                            <div key={placement}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#475569",
                                  marginBottom: 4,
                                  fontWeight: 700,
                                }}
                              >
                                {placement}°
                              </div>
                              <input
                                type="number"
                                min={0}
                                className="base44-input"
                                value={current?.points ?? ""}
                                onChange={(e) =>
                                  updatePlacementRule(range, placement, e.target.value)
                                }
                                placeholder="-"
                                style={{ fontSize: 16 }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 10,
                        }}
                      >
                        {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => {
                          const current = getStageRule(range.min, range.max, stage);

                          return (
                            <div key={stage}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#475569",
                                  marginBottom: 4,
                                  fontWeight: 700,
                                }}
                              >
                                {STAGE_LABELS[stage]}
                              </div>
                              <input
                                type="number"
                                min={0}
                                className="base44-input"
                                value={current?.points ?? ""}
                                onChange={(e) =>
                                  updateStageRule(range, stage, e.target.value)
                                }
                                placeholder="-"
                                style={{ fontSize: 16 }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview gruppi */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 14,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Classifiche che verranno create</div>

              {sortedGroups.length === 0 ? (
                <div style={{ color: "#64748b" }}>Nessuna classifica selezionata.</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sortedGroups.map((g) => (
                    <span
                      key={`${g.category}-${g.level}`}
                      className="base44-chip"
                      style={{
                        borderRadius: 999,
                        padding: "8px 12px",
                        border: "1px solid #cbd5e1",
                        background: "white",
                        fontWeight: 800,
                      }}
                    >
                      {g.category} / {g.level}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="base44-csv-btn" onClick={onClose}>
                Annulla
              </button>

              <button
                type="button"
                className="base44-primary-btn"
                onClick={save}
                disabled={saving}
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Salvataggio..." : isEdit ? "Salva" : "Crea circuito"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}