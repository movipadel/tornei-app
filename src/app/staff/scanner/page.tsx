"use client";

import { useRouter } from "next/navigation";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useState } from "react";
import { ArrowLeft, Camera, AlertTriangle } from "lucide-react";

export default function StaffScannerPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  function getPrizeTokenFromUrl(raw: string) {
    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts[0] === "riscatto-premio" && parts[1]) {
        return parts[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  function extractCustomerCode(raw: string) {
    if (!raw) return null;

    if (raw.startsWith("mb:")) {
      return raw.replace("mb:", "").trim();
    }

    return raw.trim();
  }

  function handleScan(result: any) {
    if (!result || scanned) return;

    const raw = String(result?.rawValue || "").trim();
    if (!raw) return;

    setScanned(true);

    const prizeToken = getPrizeTokenFromUrl(raw);

    if (prizeToken) {
      router.push(`/riscatto-premio/${encodeURIComponent(prizeToken)}`);
      return;
    }

    const code = extractCustomerCode(raw);

    if (!code) {
      setScanned(false);
      return;
    }

    router.push(`/staff?code=${encodeURIComponent(code)}`);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#020617",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Scanner QR
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            borderRadius: 24,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "black",
          }}
        >
          <Scanner
            onScan={handleScan}
            onError={(err) => {
              console.error(err);
              setError("Errore fotocamera");
            }}
            constraints={{
              facingMode: "environment",
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <Camera size={16} />
          Inquadra il QR cliente o il QR premio
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#f87171",
              fontSize: 13,
            }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}