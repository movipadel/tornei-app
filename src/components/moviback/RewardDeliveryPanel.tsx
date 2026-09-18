"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Gift, Loader2, ScanLine, XCircle } from "lucide-react";
import { toast } from "sonner";

type RewardDeliveryData = {
  id: string;
  status: string;
  fulfillment_type: string | null;
  points_cost: number;
  deliverable: boolean;
  already_delivered: boolean;
  requires_manual_review: boolean;
  reward: { id: string; name: string } | null;
  membership: {
    id: string;
    user: { id: string; full_name: string } | null;
  } | null;
  store_fulfillment: {
    id: string;
    status: string;
    store_order_items: Array<{
      product_name: string | null;
      color_name: string | null;
      size_label: string | null;
      custom_product_name: string | null;
      custom_variant: string | null;
      quantity: number;
    }>;
  } | null;
};

function fulfillmentLabel(value: string | null) {
  if (value === "service") return "Servizio";
  if (value === "store_product") return "Prodotto Store";
  if (value === "custom_physical") return "Premio fisico";
  if (value === "partner") return "Partner";
  return "Storico / da verificare";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    requested: "Richiesto",
    processing: "In lavorazione",
    ready: "Pronto",
    delivered: "Consegnato",
    cancelled: "Annullato",
    rejected: "Rifiutato",
  };
  return labels[value] ?? value;
}

function variantText(data: RewardDeliveryData) {
  const item = data.store_fulfillment?.store_order_items?.[0];
  if (!item) return null;
  return [
    item.product_name || item.custom_product_name,
    item.color_name,
    item.size_label,
    item.custom_variant,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RewardDeliveryPanel({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [data, setData] = useState<RewardDeliveryData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function request(action: "lookup" | "deliver") {
    const normalizedInput = code.trim();
    if (!normalizedInput) {
      toast.error("Inserisci un codice premio");
      return;
    }

    try {
      if (action === "deliver") setDelivering(true);
      else setLoading(true);
      setMessage(null);
      setFailed(false);

      const res = await fetch("/api/staff/reward-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedInput, action }),
      });
      const json = await res.json().catch(() => ({}));

      if (json.data) setData(json.data);
      if (!res.ok) {
        const error = json.error || "Operazione premio non riuscita";
        setMessage(error);
        setFailed(true);
        if (!json.data) setData(null);
        return;
      }

      setData(json.data);
      if (action === "deliver") {
        const success = json.already_delivered
          ? "Premio già consegnato"
          : json.data?.fulfillment_type === "service"
            ? "Servizio erogato"
            : "Premio consegnato";
        setMessage(success);
        toast.success(success);
      }
    } catch {
      setData(null);
      setMessage("Operazione premio non riuscita");
      setFailed(true);
    } finally {
      setLoading(false);
      setDelivering(false);
    }
  }

  useEffect(() => {
    if (initialCode) void request("lookup");
    // The scanner-provided value is intentionally consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const variant = data ? variantText(data) : null;

  return (
    <section
      style={{
        marginTop: 30,
        paddingTop: 24,
        borderTop: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>
        Consegna Premio
      </div>

      <button
        type="button"
        onClick={() => router.push("/staff/scanner?mode=reward")}
        style={secondaryButton}
      >
        <ScanLine size={18} />
        Scansiona QR premio
      </button>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setData(null);
            setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void request("lookup");
          }}
          placeholder="Codice premio"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => void request("lookup")}
          disabled={loading || delivering}
          aria-label="Verifica codice premio"
          style={lookupButton}
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Gift size={20} />}
        </button>
      </div>

      {message ? (
        <div
          style={{
            ...messageStyle,
            color: failed ? "#fca5a5" : "#86efac",
            borderColor: failed
              ? "rgba(239,68,68,0.30)"
              : "rgba(34,197,94,0.30)",
            background: failed
              ? "rgba(239,68,68,0.10)"
              : "rgba(34,197,94,0.10)",
          }}
        >
          {failed ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          {message}
        </div>
      ) : null}

      {data ? (
        <div style={cardStyle}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>
            {data.reward?.name || "Premio"}
          </div>
          <div style={{ marginTop: 6, opacity: 0.78 }}>
            Cliente: <strong>{data.membership?.user?.full_name || "—"}</strong>
          </div>
          <div style={detailsGrid}>
            <Detail label="Tipo" value={fulfillmentLabel(data.fulfillment_type)} />
            <Detail label="Stato" value={statusLabel(data.status)} />
            <Detail label="Punti" value={String(data.points_cost)} />
            {variant ? <Detail label="Variante" value={variant} /> : null}
          </div>

          {data.requires_manual_review ? (
            <div style={warningStyle}>Richiesta storica da verificare manualmente.</div>
          ) : data.status === "delivered" ? (
            <div style={successStyle}>Premio già consegnato. Nessuna nuova modifica.</div>
          ) : data.deliverable ? (
            <button
              type="button"
              onClick={() => void request("deliver")}
              disabled={delivering}
              style={deliverButton}
            >
              {delivering ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {data.fulfillment_type === "service"
                ? "Conferma servizio erogato"
                : "Conferma premio consegnato"}
            </button>
          ) : (
            <div style={warningStyle}>
              {["requested", "processing"].includes(data.status)
                ? "Premio non ancora pronto"
                : "Codice premio non più utilizzabile"}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ opacity: 0.62 }}>{label}</span>
      <strong style={{ textAlign: "right" }}>{value}</strong>
    </div>
  );
}

const secondaryButton: React.CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontWeight: 700,
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 48,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  padding: "0 12px",
  fontWeight: 700,
  textTransform: "uppercase",
};

const lookupButton: React.CSSProperties = {
  width: 48,
  borderRadius: 14,
  background: "#d97706",
  color: "white",
  border: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 16,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const detailsGrid: React.CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  fontSize: 13,
};

const messageStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 12,
  border: "1px solid",
  borderRadius: 14,
  marginBottom: 12,
  fontWeight: 800,
};

const warningStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  borderRadius: 14,
  color: "#fde68a",
  background: "rgba(245,158,11,0.10)",
  border: "1px solid rgba(245,158,11,0.24)",
  fontWeight: 800,
  textAlign: "center",
};

const successStyle: React.CSSProperties = {
  ...warningStyle,
  color: "#86efac",
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.24)",
};

const deliverButton: React.CSSProperties = {
  width: "100%",
  minHeight: 50,
  marginTop: 16,
  borderRadius: 15,
  border: 0,
  background: "linear-gradient(135deg,#16a34a,#22c55e)",
  color: "white",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};
