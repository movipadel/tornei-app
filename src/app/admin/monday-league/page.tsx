import Link from "next/link";
import { CalendarDays, Database, ShieldCheck } from "lucide-react";

export default function MondayLeagueAdminFoundationPage() {
  return (
    <main style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          padding: 24,
          borderRadius: 24,
          color: "white",
          background:
            "linear-gradient(135deg, rgba(20,184,166,0.22), rgba(15,23,42,0.92))",
          border: "1px solid rgba(94,234,212,0.2)",
        }}
      >
        <CalendarDays size={30} aria-hidden />
        <h1 style={{ margin: "14px 0 6px", fontSize: 28, fontWeight: 900 }}>
          Monday League
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
          Fondazione del modulo installata. Le funzioni operative saranno abilitate
          nelle fasi successive.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gap: 12,
          padding: 20,
          borderRadius: 20,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.09)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Database size={20} color="#5eead4" aria-hidden />
          <strong>Stage 1 — Domain Foundation</strong>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ShieldCheck size={20} color="#a5b4fc" aria-hidden />
          <span>Area protetta dall’autenticazione admin esistente.</span>
        </div>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>
          Nessuna pagina pubblica, generazione calendario o gestione risultati è
          attiva in questo stage.
        </p>
      </section>

      <Link href="/admin" style={{ color: "#99f6e4", fontWeight: 800 }}>
        Torna alla dashboard
      </Link>
    </main>
  );
}
