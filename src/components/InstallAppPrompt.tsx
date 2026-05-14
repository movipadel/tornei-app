"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
  if (isStandalone()) return;

  const dismissedUntil = Number(
    localStorage.getItem("movi_install_prompt_dismissed_until") || 0
  );

  if (dismissedUntil > Date.now()) return;

  setIos(isIos());

  const timer = window.setTimeout(() => {
    setVisible(true);
  }, 1200);

  const handler = (event: Event) => {
    event.preventDefault();
    setDeferredPrompt(event as BeforeInstallPromptEvent);
    setVisible(true);
  };

  window.addEventListener("beforeinstallprompt", handler);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("beforeinstallprompt", handler);
  };
}, []);

  async function install() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setVisible(false);
    localStorage.setItem(
  "movi_install_prompt_dismissed_until",
  String(Date.now() + 1000 * 60 * 60 * 24 * 365)
);
  }

  function close() {
  setVisible(false);

  const sevenDays = 1000 * 60 * 60 * 24 * 7;

  localStorage.setItem(
    "movi_install_prompt_dismissed_until",
    String(Date.now() + sevenDays)
  );
}

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 14,
        zIndex: 9999,
        borderRadius: 24,
        padding: 14,
        background:
          "linear-gradient(135deg, rgba(15,23,42,0.97), rgba(3,7,18,0.97))",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
        color: "white",
        backdropFilter: "blur(16px)",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Chiudi"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X className="w-4 h-4" />
      </button>

      <div style={{ paddingRight: 36 }}>
        <div style={{ fontSize: 16, fontWeight: 950 }}>Installa MOVI App</div>

        <div
          style={{
            marginTop: 5,
            color: "rgba(255,255,255,0.68)",
            fontSize: 13,
            fontWeight: 650,
            lineHeight: 1.35,
          }}
        >
          Aggiungila alla schermata Home per aprirla come una vera app.
        </div>
      </div>

      {ios ? (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 9,
            alignItems: "center",
            color: "rgba(255,255,255,0.82)",
            fontSize: 13,
            fontWeight: 750,
          }}
        >
          <Share className="w-4 h-4" style={{ color: "#fbbf24" }} />
          Tocca Condividi → “Aggiungi alla schermata Home”
        </div>
      ) : (
        <button
          type="button"
          onClick={install}
          style={{
            marginTop: 12,
            width: "100%",
            minHeight: 46,
            borderRadius: 16,
            border: 0,
            background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
            color: "#111827",
            fontWeight: 950,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Download className="w-4 h-4" />
          Installa app
        </button>
      )}
    </div>
  );
}