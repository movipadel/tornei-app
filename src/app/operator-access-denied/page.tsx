import Link from "next/link";

export default function OperatorAccessDeniedPage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#020617", color: "white" }}>
      <section style={{ maxWidth: 520, padding: 28, border: "1px solid #334155", borderRadius: 18, background: "#0f172a" }}>
        <h1 style={{ marginTop: 0 }}>Accesso non autorizzato</h1>
        <p>Il tuo account operatore non dispone del permesso richiesto per questa sezione.</p>
        <Link href="/staff" style={{ color: "#93c5fd", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Torna all’area Staff</Link>
      </section>
    </main>
  );
}
