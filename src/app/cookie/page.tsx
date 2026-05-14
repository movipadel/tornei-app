import Link from "next/link";
import {
  ArrowLeft,
  Cookie,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";

import PublicNav from "@/components/PublicNav";

const pageBg =
  "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)";

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.66)",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 560,
};

const sectionTitle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  fontSize: 19,
  fontWeight: 950,
  color: "#ffffff",
  marginBottom: 10,
};

const listStyle: React.CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 18,
  color: "rgba(255,255,255,0.68)",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 560,
};

export default function CookiePage() {
  return (
    <div style={{ minHeight: "100dvh", background: pageBg, color: "white" }}>
      <PublicNav />

      <main
        className="base44-home-container"
        style={{ paddingTop: 12, paddingBottom: 52 }}
      >
        <Link href="/" style={backLink}>
          <ArrowLeft className="w-4 h-4" />
          Torna alla Home
        </Link>

        <section style={heroCard}>
          <div style={heroGlow} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={heroPill}>
              <Cookie className="w-4 h-4" />
              Cookie MOVI App
            </div>

            <h1 style={heroTitle}>Cookie Policy</h1>

            <p style={{ ...muted, marginTop: 12, maxWidth: 720 }}>
              Questa pagina spiega quali cookie e tecnologie simili vengono
              utilizzati da MOVI App per il corretto funzionamento della
              piattaforma.
            </p>

            <p style={{ ...muted, marginTop: 10, fontSize: 12 }}>
              Ultimo aggiornamento: maggio 2026
            </p>
          </div>
        </section>

        <CookieCard icon={<Cookie className="w-5 h-5" />} title="1. Cosa sono i cookie">
          <p style={muted}>
            I cookie sono piccoli file di testo che il sito o la web app può
            salvare sul dispositivo dell’utente per consentire il funzionamento
            dei servizi, mantenere una sessione attiva o ricordare alcune
            preferenze tecniche.
          </p>
        </CookieCard>

        <CookieCard icon={<Lock className="w-5 h-5" />} title="2. Cookie tecnici">
          <p style={muted}>
            MOVI App utilizza cookie tecnici e strumenti analoghi necessari per:
          </p>

          <ul style={listStyle}>
            <li>gestire login e sessioni utente;</li>
            <li>mantenere l’accesso ad aree riservate;</li>
            <li>riconoscere ruoli admin, staff o utente;</li>
            <li>proteggere le funzionalità dell’app;</li>
            <li>garantire il corretto funzionamento dei servizi.</li>
          </ul>

          <p style={{ ...muted, marginTop: 10 }}>
            Questi cookie sono necessari e non richiedono consenso preventivo,
            poiché servono a fornire il servizio richiesto dall’utente.
          </p>
        </CookieCard>

        <CookieCard icon={<ShieldCheck className="w-5 h-5" />} title="3. Cookie di autenticazione">
          <p style={muted}>
            Alcuni cookie sono utilizzati per mantenere attiva la sessione
            dell’utente e consentire l’accesso a funzionalità come iscrizioni,
            MoviBack, Store MOVI, area staff o area admin.
          </p>
        </CookieCard>

        <CookieCard icon={<FileText className="w-5 h-5" />} title="4. Cookie analitici e marketing">
          <p style={muted}>
            Al momento MOVI App non utilizza strumenti di profilazione
            pubblicitaria o tracciamento marketing di terze parti come Meta Pixel
            o Google Analytics per finalità commerciali.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            Qualora in futuro vengano introdotti strumenti analitici o marketing
            non tecnici, verrà richiesto un consenso specifico e separato ove
            previsto dalla normativa.
          </p>
        </CookieCard>

        <CookieCard icon={<ShieldCheck className="w-5 h-5" />} title="5. Gestione dei cookie">
          <p style={muted}>
            L’utente può gestire o eliminare i cookie attraverso le impostazioni
            del proprio browser. La disattivazione dei cookie tecnici potrebbe
            impedire il corretto funzionamento dell’app o l’accesso alle aree
            riservate.
          </p>
        </CookieCard>

        <CookieCard icon={<Mail className="w-5 h-5" />} title="6. Contatti">
          <p style={muted}>
            Per richieste relative alla presente Cookie Policy è possibile
            scrivere a:
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            Email: <b style={{ color: "white" }}>movipadel@gmail.com</b>
          </p>
        </CookieCard>
      </main>
    </div>
  );
}

function CookieCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...cardStyle, padding: 18, marginBottom: 12 }}>
      <h2 style={sectionTitle}>
        <span style={{ color: "#fbbf24", display: "inline-flex" }}>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.68)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 850,
  marginBottom: 14,
};

const heroCard: React.CSSProperties = {
  ...cardStyle,
  padding: "24px 20px",
  marginBottom: 14,
  position: "relative",
  overflow: "hidden",
};

const heroGlow: React.CSSProperties = {
  position: "absolute",
  inset: "-80px -80px auto -80px",
  height: 260,
  background:
    "radial-gradient(circle at 20% 10%, rgba(251,191,36,0.24), transparent 34%), radial-gradient(circle at 84% 20%, rgba(45,212,191,0.18), transparent 38%)",
  pointerEvents: "none",
};

const heroPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 999,
  padding: "7px 10px",
  background: "rgba(251,191,36,0.12)",
  border: "1px solid rgba(251,191,36,0.20)",
  color: "#fbbf24",
  fontSize: 12,
  fontWeight: 950,
};

const heroTitle: React.CSSProperties = {
  marginTop: 14,
  fontSize: "clamp(30px, 7vw, 44px)",
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: -1.1,
};