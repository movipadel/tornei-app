import Link from "next/link";
import LegacyAccessForm from "@/components/LegacyAccessForm";

export default function LegacyAccessPage() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg,#eef2ff,#f8fafc)" }}>
    <section style={{ width: "min(100%,520px)", background: "white", borderRadius: 22, padding: 26, boxShadow: "0 18px 55px rgba(15,23,42,.12)", display: "grid", gap: 15 }}>
      <Link href="/" style={{ color: "#4338ca", fontWeight: 800 }}>← MOVI</Link>
      <div>
        <h1 style={{ fontSize: 28, margin: "0 0 6px" }}>Accesso precedente</h1>
        <p style={{ color: "#475569", margin: 0 }}>Inserisci telefono ed email del tuo profilo MOVI.</p>
      </div>
      <Link href="/accedi" className="base44-primary-btn" style={{ minHeight: 46, display: "grid", placeItems: "center", textDecoration: "none" }}>
        Accedi con email e password
      </Link>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 15 }}>
        <strong>I tuoi dati</strong>
      </div>
      <LegacyAccessForm />
      <p style={{ color: "#475569", fontSize: 13, margin: 0 }}>Profilo non trovato? <Link href="/registrati" style={{ fontWeight: 850 }}>Registrati con il nuovo accesso MOVI</Link>.</p>
    </section>
  </main>;
}
