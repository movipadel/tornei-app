"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ScanLine, Wallet } from "lucide-react";
import { Suspense } from "react";

type LookupData = {
  full_name: string;
  points: number;
  membership_status: string;
  certificate_status: string;
};

const CLUBS = ["CENTALLO", "COSTIGLIOLE", "MANTA", "SALUZZO", "REVELLO"];

function StaffPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialCode = params.get("code") || "";

  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LookupData | null>(null);

  const [amount, setAmount] = useState("");
  const [club, setClub] = useState("CENTALLO");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const savedClub = window.localStorage.getItem("staff_club");
    if (savedClub && CLUBS.includes(savedClub)) {
      setClub(savedClub);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("staff_club", club);
  }, [club]);

  async function lookup(c?: string) {
    const membership_code = (c ?? code).trim();
    if (!membership_code) return;

    try {
      setLoading(true);
      setData(null);

      const res = await fetch("/api/staff/lookup-membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_code }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore lookup");

      setData(json.data);

      setTimeout(() => {
        document.getElementById("amount-input")?.focus();
      }, 100);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialCode) {
      lookup(initialCode);
    }
  }, [initialCode]);

  async function earnPoints() {
    const value = Number(amount);

    if (!code || !value || value <= 0) {
      toast.error("Importo non valido");
      return;
    }

    if (!club) {
      toast.error("Seleziona la sede");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/staff/earn-points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          membership_code: code,
          euro_amount: value,
          club,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore accredito");

      toast.success(`+${json.points_added} punti (${club})`);

      setAmount("");
      setData(null);
      setCode("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, color: "white" }}>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>
        Accredito Punti
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "rgba(255,255,255,0.55)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Sede operativa
        </div>

        <select
          value={club}
          onChange={(e) => setClub(e.target.value)}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            padding: "0 12px",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {CLUBS.map((c) => (
            <option key={c} value={c} style={{ color: "#0f172a", background: "#ffffff" }}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => router.push("/staff/scanner")}
        style={{
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
        }}
      >
        <ScanLine size={18} />
        Scansiona QR
      </button>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Codice o QR"
          style={{
            flex: 1,
            height: 48,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            padding: "0 12px",
            fontWeight: 600,
          }}
        />

        <button
          onClick={() => lookup()}
          style={{
            width: 48,
            borderRadius: 14,
            background: "#4f46e5",
            border: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ScanLine size={20} />
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <Loader2 className="animate-spin" />
        </div>
      )}

      {data && (
        <div
          style={{
            borderRadius: 20,
            padding: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {data.full_name}
          </div>

          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
            Stato: {data.membership_status}
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 20,
              fontWeight: 900,
            }}
          >
            <Wallet size={18} />
            {data.points} punti
          </div>
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gap: 10 }}>
          <input
            id="amount-input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") earnPoints();
            }}
            placeholder="Importo €"
            style={{
              height: 52,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              padding: "0 12px",
              fontSize: 18,
              fontWeight: 700,
            }}
          />

          <button
            onClick={earnPoints}
            disabled={saving}
            style={{
              height: 52,
              borderRadius: 16,
              border: 0,
              background: "linear-gradient(135deg,#22c55e,#16a34a)",
              color: "white",
              fontWeight: 900,
              fontSize: 16,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : "Accredita punti"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  return (
    <Suspense fallback={null}>
      <StaffPageContent />
    </Suspense>
  );
}