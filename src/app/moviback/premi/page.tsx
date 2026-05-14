"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Gift,
  Loader2,
  PackageCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import PublicNav from "@/components/PublicNav";

type Reward = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  points_cost: number;
  image_path: string | null;
  stock_qty: number | null;
  reward_type: "club" | "partner";
};

type MoviBackMe = {
  membership: {
    id: string;
    status: "pending_review" | "approved" | "rejected" | "suspended";
  } | null;
  points: number;
};

type RewardCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type RewardPointRange = {
  id: string;
  label: string;
  min_points: number | null;
  max_points: number | null;
  sort_order: number;
  is_active: boolean;
};

const pageBg =
  "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)";

const glassCard: React.CSSProperties = {
  borderRadius: 26,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

export default function MoviBackPremiPage() {
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const [points, setPoints] = useState(0);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);

  const [categories, setCategories] = useState<RewardCategory[]>([]);
  const [pointRanges, setPointRanges] = useState<RewardPointRange[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPointRangeId, setSelectedPointRangeId] = useState("all");

  const [previewImage, setPreviewImage] = useState<string | null>(null);
const [previewTitle, setPreviewTitle] = useState<string>("");

  const canRedeem = membershipStatus === "approved";

  const fallbackCategories = useMemo(() => {
    return Array.from(
      new Set(rewards.map((r) => r.category?.trim() || "Premi"))
    ).map((name, index) => ({
      id: name,
      name,
      sort_order: index,
      is_active: true,
    }));
  }, [rewards]);

  const visibleCategories = categories.length > 0 ? categories : fallbackCategories;

  const filteredRewards = useMemo(() => {
    const selectedRange =
      selectedPointRangeId === "all"
        ? null
        : pointRanges.find((range) => range.id === selectedPointRangeId) ?? null;

    return rewards.filter((reward) => {
      const category = reward.category?.trim() || "Premi";

      const categoryOk =
        selectedCategory === "all" || category === selectedCategory;

      const cost = Number(reward.points_cost || 0);

      const rangeOk =
        !selectedRange ||
        ((selectedRange.min_points === null ||
          cost >= selectedRange.min_points) &&
          (selectedRange.max_points === null ||
            cost <= selectedRange.max_points));

      return categoryOk && rangeOk;
    });
  }, [rewards, selectedCategory, selectedPointRangeId, pointRanges]);

  async function loadData() {
    try {
      setLoading(true);

      const [meRes, rewardsRes] = await Promise.all([
        fetch("/api/moviback/me", { cache: "no-store" }),
        fetch("/api/moviback/rewards", { cache: "no-store" }),
      ]);

      const meJson = (await meRes.json().catch(() => ({}))) as MoviBackMe & {
        error?: string;
      };

      if (!meRes.ok) {
        throw new Error(meJson.error || "Errore caricamento MoviBack");
      }

      setPoints(Number(meJson.points ?? 0));
      setMembershipStatus(meJson.membership?.status ?? null);

      const rewardsJson = await rewardsRes.json().catch(() => ({}));

      if (!rewardsRes.ok) {
        throw new Error(rewardsJson.error || "Errore caricamento premi");
      }

      setRewards((rewardsJson.data ?? []) as Reward[]);
      setCategories(
        (rewardsJson.filters?.categories ?? []) as RewardCategory[]
      );
      setPointRanges(
        (rewardsJson.filters?.point_ranges ?? []) as RewardPointRange[]
      );
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function redeemReward(reward: Reward) {
    if (!canRedeem) {
      toast.error("MoviBack non attivo");
      return;
    }

    if (points < reward.points_cost) {
      toast.error("Punti insufficienti");
      return;
    }

    if (reward.stock_qty !== null && reward.stock_qty <= 0) {
      toast.error("Premio esaurito");
      return;
    }

    const ok = confirm(
      `Vuoi riscattare "${reward.name}" per ${reward.points_cost} punti?\n\nIl QR premio comparirà nella tua pagina MoviBack.`
    );

    if (!ok) return;

    try {
      setRedeemingId(reward.id);

      const res = await fetch("/api/moviback/rewards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_id: reward.id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore riscatto premio");
      }

      toast.success("Premio riscattato. Trovi il QR nella tua pagina MoviBack.");
      window.location.href = "/moviback";
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setRedeemingId(null);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div
      className="base44-home-wrap"
      style={{
        minHeight: "100dvh",
        background: pageBg,
      }}
    >
      <PublicNav />

      <div className="base44-home-container" style={{ paddingTop: 6 }}>
        {loading ? (
          <div
            style={{
              minHeight: "70dvh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader2
              className="w-8 h-8 animate-spin"
              style={{ color: "#f59e0b" }}
            />
          </div>
        ) : (
          <>
            <section
              style={{
                ...glassCard,
                position: "relative",
                overflow: "hidden",
                padding: "22px 18px",
                color: "white",
                marginBottom: 16,
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "-90px -60px auto -60px",
                  height: 260,
                  background:
                    "radial-gradient(circle at 15% 0%, rgba(245,158,11,0.34), transparent 34%), radial-gradient(circle at 88% 18%, rgba(251,191,36,0.24), transparent 38%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1 }}>
                <Link
                  href="/moviback"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    color: "rgba(255,255,255,0.72)",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 800,
                    marginBottom: 18,
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Torna a MoviBack
                </Link>

                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fbbf24", marginBottom: 10 }}>
                  <Gift className="w-7 h-7" />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 850,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    Catalogo premi
                  </span>
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: "clamp(31px, 7vw, 42px)",
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: -1.15,
                  }}
                >
                  Scegli il tuo premio
                </h1>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 14,
                    lineHeight: 1.35,
                    fontWeight: 560,
                    maxWidth: 460,
                  }}
                >
                  Usa i tuoi punti MoviBack per riscattare premi. Dopo il
                  riscatto riceverai un QR monouso da mostrare in segreteria.
                </p>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div style={heroMiniCard}>
                    <div style={heroMiniLabel}>Saldo punti</div>
                    <div style={heroMiniValue}>
                      <WalletCards className="w-5 h-5" />
                      {points}
                    </div>
                  </div>

                  <div style={heroMiniCard}>
                    <div style={heroMiniLabel}>Stato</div>
                    <div
                      style={{
                        marginTop: 9,
                        color: canRedeem ? "#86efac" : "#fbbf24",
                        fontSize: 15,
                        fontWeight: 900,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      {canRedeem ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {canRedeem ? "Riscatti attivi" : "Non attivo"}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {!canRedeem ? (
              <section
                style={{
                  ...glassCard,
                  padding: 18,
                  color: "white",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", gap: 12 }}>
                  <Sparkles
                    className="w-6 h-6"
                    style={{ color: "#fbbf24", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      MoviBack non ancora attivo
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(255,255,255,0.60)",
                        fontSize: 14,
                        lineHeight: 1.35,
                        fontWeight: 560,
                      }}
                    >
                      Puoi visualizzare il catalogo, ma per riscattare i premi
                      devi avere la membership MoviBack approvata.
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {rewards.length > 0 ? (
              <section
                style={{
                  ...glassCard,
                  padding: 14,
                  color: "white",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={selectStyle}
                  >
                    <option
                      value="all"
                      style={{ color: "#0f172a", background: "#fff" }}
                    >
                      Tutte le categorie
                    </option>

                    {visibleCategories.map((category) => (
                      <option
                        key={category.id}
                        value={category.name}
                        style={{ color: "#0f172a", background: "#fff" }}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedPointRangeId}
                    onChange={(e) => setSelectedPointRangeId(e.target.value)}
                    style={selectStyle}
                  >
                    <option
                      value="all"
                      style={{ color: "#0f172a", background: "#fff" }}
                    >
                      Tutti i punti
                    </option>

                    {pointRanges.map((range) => (
                      <option
                        key={range.id}
                        value={range.id}
                        style={{ color: "#0f172a", background: "#fff" }}
                      >
                        {range.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            ) : null}

            {rewards.length === 0 ? (
              <EmptyMessage text="Nessun premio disponibile al momento." />
            ) : filteredRewards.length === 0 ? (
              <EmptyMessage text="Nessun premio trovato con questi filtri." />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {filteredRewards.map((reward) => {
                  const insufficient = points < reward.points_cost;
                  const outOfStock =
                    reward.stock_qty !== null && reward.stock_qty <= 0;
                  const disabled =
                    !canRedeem ||
                    insufficient ||
                    outOfStock ||
                    redeemingId === reward.id;

                  return (
                    <article
                      key={reward.id}
                      style={{
  padding: 10,
  color: "white",
  opacity: outOfStock ? 0.58 : 1,
  display: "grid",
  gridTemplateColumns: "104px minmax(0, 1fr)",
  gap: 13,
  alignItems: "stretch",
  borderRadius: 24,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow:
    "0 18px 42px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)",
  backdropFilter: "blur(16px)",
}}
                    >
                      <button
  type="button"
  onClick={() => {
    if (!reward.image_path) return;
    setPreviewImage(reward.image_path);
    setPreviewTitle(reward.name);
  }}
  style={{
    ...premiumFrame,
    padding: 0,
    border: "1px solid rgba(255,255,255,0.10)",
    cursor: reward.image_path ? "zoom-in" : "default",
  }}
>
  <div style={premiumFrameGlow} />
  <div style={premiumFrameTexture} />
  <div style={premiumFrameVignette} />

  {reward.image_path ? (
    <img
      src={reward.image_path}
      alt={reward.name}
      style={premiumProductImage}
    />
  ) : (
    <div style={premiumFrameFallback}>
      <Gift className="w-8 h-8" style={{ color: "#fbbf24" }} />
    </div>
  )}

  <div style={premiumProductShadow} />
</button>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
  fontSize: 15,
  fontWeight: 950,
  letterSpacing: -0.35,
  lineHeight: 1.08,
  color: "#ffffff",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}}
                        >
                          {reward.name}
                        </div>

                        {reward.description ? (
                          <div
                            style={{
                              marginTop: 5,
                              color: "rgba(255,255,255,0.55)",
                              fontSize: 12,
                              lineHeight: 1.25,
                              fontWeight: 600,
                              display: "-webkit-box",
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {reward.description}
                          </div>
                        ) : null}

                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              color: "#fbbf24",
                              fontSize: 18,
                              fontWeight: 950,
                              lineHeight: 1,
                            }}
                          >
                            {reward.points_cost} pt
                          </span>

                          <span style={miniPillStyle}>
                            Stock:{" "}
                            {reward.stock_qty === null
                              ? "∞"
                              : reward.stock_qty}
                          </span>
                        </div>

                        {insufficient ? (
                          <div
                            style={{
                              marginTop: 7,
                              color: "#fbbf24",
                              fontSize: 11,
                              fontWeight: 850,
                            }}
                          >
                            Ti mancano {reward.points_cost - points} pt
                          </div>
                        ) : null}

                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => redeemReward(reward)}
                          style={{
  marginTop: 9,
  width: "100%",
  minHeight: 38,
  borderRadius: 999,
  border: disabled
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(255,255,255,0.22)",
  background: disabled
    ? "rgba(255,255,255,0.07)"
    : "linear-gradient(135deg,#f59e0b 0%,#fbbf24 100%)",
  color: disabled ? "rgba(255,255,255,0.42)" : "#111827",
  fontWeight: 950,
  fontSize: 12,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxShadow: disabled
    ? "none"
    : "0 10px 22px rgba(245,158,11,0.24)",
}}
                        >
                          {redeemingId === reward.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              ...
                            </>
                          ) : outOfStock ? (
                            "Esaurito"
                          ) : insufficient ? (
                            "Non disponibile"
                          ) : !canRedeem ? (
                            "Non attivo"
                          ) : (
                            <>
                              <PackageCheck className="w-4 h-4" />
                              Riscatta
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
        {previewImage ? (
  <div
    onClick={() => setPreviewImage(null)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 120,
      background: "rgba(0,0,0,0.82)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 520,
        borderRadius: 28,
        overflow: "hidden",
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
        color: "white",
      }}
    >
      <button
        type="button"
        onClick={() => setPreviewImage(null)}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(0,0,0,0.42)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
          fontSize: 22,
          cursor: "pointer",
        }}
      >
        ×
      </button>

      <div
  style={{
    position: "relative",
    padding: 16,
    background:
      "linear-gradient(180deg, #1e293b 0%, #334155 55%, #475569 100%)",
    overflow: "hidden",
  }}
>
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.65), rgba(255,255,255,0.20) 40%, transparent 75%)",
      pointerEvents: "none",
    }}
  />

  <img
    src={previewImage}
    alt={previewTitle}
    style={{
      position: "relative",
      zIndex: 2,
      width: "100%",
      maxHeight: "70dvh",
      objectFit: "contain",
      display: "block",
      borderRadius: 20,
      filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.35))",
    }}
  />
</div>

      <div style={{ padding: "14px 16px 16px" }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 950,
            letterSpacing: -0.3,
          }}
        >
          {previewTitle}
        </div>
      </div>
    </div>
  </div>
) : null}
      </div>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <section
      style={{
        ...glassCard,
        padding: 24,
        color: "rgba(255,255,255,0.62)",
        textAlign: "center",
        fontWeight: 700,
      }}
    >
      {text}
    </section>
  );
}

const heroMiniCard: React.CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.09)",
};

const heroMiniLabel: React.CSSProperties = {
  color: "rgba(255,255,255,0.54)",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.11em",
};

const heroMiniValue: React.CSSProperties = {
  marginTop: 7,
  color: "#ffffff",
  fontSize: 30,
  fontWeight: 950,
  lineHeight: 1,
  letterSpacing: -0.8,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 15,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  padding: "0 12px",
  outline: "none",
  fontWeight: 800,
  fontSize: 13,
};

const miniPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 25,
  padding: "0 9px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.62)",
  fontSize: 11,
  fontWeight: 850,
};

/* luce centrale */
const frameLight: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.25), transparent 70%)",
  pointerEvents: "none",
};

const premiumFrame: React.CSSProperties = {
  width: 104,
  height: 104,
  borderRadius: 22,
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(180deg, #1e293b 0%, #334155 55%, #475569 100%)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(0,0,0,0.18)",
  flexShrink: 0,
};

const premiumFrameGlow: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.65), rgba(255,255,255,0.20) 40%, transparent 75%)",
  pointerEvents: "none",
};

const premiumFrameTexture: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 12px), radial-gradient(circle at 85% 15%, rgba(56,189,248,0.10), transparent 32%)",
  opacity: 0.65,
  pointerEvents: "none",
};

const premiumFrameVignette: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at center, transparent 45%, rgba(0,0,0,0.46) 100%)",
  pointerEvents: "none",
};

const premiumProductImage: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  padding: 9,
  filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.35))",
};

const premiumProductShadow: React.CSSProperties = {
  position: "absolute",
  left: 22,
  right: 22,
  bottom: 12,
  height: 10,
  borderRadius: 999,
  background: "rgba(0,0,0,0.42)",
  filter: "blur(8px)",
  zIndex: 1,
  pointerEvents: "none",
};

const premiumFrameFallback: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};