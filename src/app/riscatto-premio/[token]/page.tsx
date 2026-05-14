"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Gift,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type RedemptionData = {
  id: string;
  status: string;
  points_cost: number;
  requested_at: string | null;
  delivered_at: string | null;
  reward: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    image_path: string | null;
    points_cost: number;
    reward_type: string;
  } | null;
  membership: {
    id: string;
    membership_code: string;
    membership_type: string | null;
    user: {
      id: string;
      full_name: string;
      phone: string;
    } | null;
  } | null;
};

export default function RewardRedemptionPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<RedemptionData | null>(null);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);

      const res = await fetch(`/api/reward-redemptions/${token}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "QR non valido");
      }

      setData(json.data);
      setValid(Boolean(json.valid));
      setError(json.valid ? null : "QR già usato o non più valido");
    } catch (e: any) {
      setError(e?.message || "Errore");
      setData(null);
      setValid(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
  if (!token) return;
  load();
}, [token]);

  async function validateRedemption() {
    if (!confirm("Confermi la consegna del premio? Il QR non sarà più utilizzabile.")) {
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`/api/reward-redemptions/${token}/validate`, {
        method: "POST",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Errore validazione");
      }

      toast.success("Premio consegnato");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 560, margin: "0 auto", color: "white" }}>
        <header style={{ marginBottom: 22, textAlign: "center" }}>
          <Gift className="w-10 h-10 mx-auto" style={{ color: "#f59e0b" }} />
          <h1 style={{ marginTop: 10, fontSize: 28, fontWeight: 950 }}>
            Riscatto premio MoviBack
          </h1>
          <p style={muted}>Verifica e valida la consegna del premio.</p>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          </div>
        ) : error && !data ? (
          <div style={cardStyle}>
            <XCircle className="w-12 h-12 mx-auto" style={{ color: "#f87171" }} />
            <h2 style={{ marginTop: 14, fontSize: 22, fontWeight: 950, textAlign: "center" }}>
              QR non valido
            </h2>
            <p style={{ ...muted, textAlign: "center", marginTop: 6 }}>{error}</p>
          </div>
        ) : data ? (
          <div style={cardStyle}>
            {data.reward?.image_path ? (
              <img
                src={data.reward.image_path}
                alt={data.reward.name}
                style={{
                  width: "100%",
                  maxHeight: 260,
                  objectFit: "cover",
                  borderRadius: 22,
                  marginBottom: 16,
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
            ) : null}

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 11px",
                borderRadius: 999,
                background: valid
                  ? "rgba(34,197,94,0.14)"
                  : "rgba(239,68,68,0.14)",
                color: valid ? "#86efac" : "#fca5a5",
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 12,
              }}
            >
              {valid ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {valid ? "QR valido" : "QR non più valido"}
            </div>

            <h2 style={{ fontSize: 25, fontWeight: 950, lineHeight: 1.1 }}>
              {data.reward?.name || "Premio"}
            </h2>

            <p style={{ ...muted, marginTop: 8 }}>
              {data.reward?.description || "Nessuna descrizione disponibile."}
            </p>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <Info label="Valore premio" value={`${data.points_cost} punti`} />
              <Info label="Categoria" value={data.reward?.category || "—"} />
              <Info label="Cliente" value={data.membership?.user?.full_name || "—"} />
              <Info label="Telefono" value={data.membership?.user?.phone || "—"} />
              <Info label="Codice membership" value={data.membership?.membership_code || "—"} />
              <Info label="Tessera" value={data.membership?.membership_type || "—"} />
              <Info label="Stato" value={data.status} />
            </div>

            {valid ? (
              <button
                type="button"
                onClick={validateRedemption}
                disabled={saving}
                style={{
                  marginTop: 20,
                  width: "100%",
                  minHeight: 54,
                  borderRadius: 18,
                  border: 0,
                  background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                  color: "white",
                  fontWeight: 950,
                  fontSize: 15,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: saving ? 0.65 : 1,
                }}
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ShieldCheck size={18} />
                )}
                Conferma consegna premio
              </button>
            ) : (
              <div
                style={{
                  marginTop: 20,
                  padding: 14,
                  borderRadius: 18,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  color: "#fca5a5",
                  fontWeight: 800,
                  textAlign: "center",
                }}
              >
                Questo QR è già stato usato o annullato.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRow}>
      <span style={muted}>{label}</span>
      <strong style={{ textAlign: "right" }}>{value}</strong>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "28px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 28,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
};