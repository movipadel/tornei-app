import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Database,
  FileText,
  HeartPulse,
  Mail,
  Megaphone,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  UserCheck,
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

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100dvh", background: pageBg, color: "white" }}>
      <PublicNav />

      <main
        className="base44-home-container"
        style={{ paddingTop: 12, paddingBottom: 52 }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(255,255,255,0.68)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 850,
            marginBottom: 14,
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Torna alla Home
        </Link>

        <section
          style={{
            ...cardStyle,
            padding: "24px 20px",
            marginBottom: 14,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-80px -80px auto -80px",
              height: 260,
              background:
                "radial-gradient(circle at 20% 10%, rgba(45,212,191,0.24), transparent 34%), radial-gradient(circle at 84% 20%, rgba(251,191,36,0.20), transparent 38%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 999,
                padding: "7px 10px",
                background: "rgba(45,212,191,0.12)",
                border: "1px solid rgba(45,212,191,0.20)",
                color: "#5eead4",
                fontSize: 12,
                fontWeight: 950,
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              Privacy MOVI App
            </div>

            <h1
              style={{
                marginTop: 14,
                fontSize: "clamp(30px, 7vw, 44px)",
                lineHeight: 1,
                fontWeight: 950,
                letterSpacing: -1.1,
              }}
            >
              Informativa Privacy
            </h1>

            <p style={{ ...muted, marginTop: 12, maxWidth: 720 }}>
              Questa informativa descrive come vengono trattati i dati personali
              degli utenti che utilizzano MOVI App, inclusi tornei, programma
              fedeltà MoviBack, Store MOVI, comunicazioni e servizi collegati.
            </p>

            <p style={{ ...muted, marginTop: 10, fontSize: 12 }}>
              Ultimo aggiornamento: maggio 2026
            </p>
          </div>
        </section>

        <PrivacyCard
          icon={<UserCheck className="w-5 h-5" />}
          title="1. Contitolari del trattamento"
        >
          <p style={muted}>
            I dati personali sono trattati, nell’ambito del progetto MoviPadel /
            MOVI App, da:
          </p>

          <ul style={listStyle}>
            <li>
              <b>Vav Padel A.S.D.</b>, Via Saluzzo 17, 12024 Costigliole
              Saluzzo (CN), CF/P.IVA 03940860046.
            </li>
            <li>
              <b>Centallo Paddle A.S.D.</b>, Viale della Liberazione snc, 12037
              Centallo (CN), CF 96100840048, P.IVA 04069380048.
            </li>
          </ul>

          <p style={{ ...muted, marginTop: 10 }}>
            Le associazioni operano quali contitolari del trattamento per le
            attività connesse alla gestione del progetto MoviPadel.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<Mail className="w-5 h-5" />} title="2. Contatti privacy">
          <p style={muted}>
            Per richieste relative alla privacy è possibile scrivere a:
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            Email: <b style={{ color: "white" }}>movipadel@gmail.com</b>
            <br />
            Referente privacy:{" "}
            <b style={{ color: "white" }}>Massimiliano Rinaudo</b>
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<Database className="w-5 h-5" />} title="3. Dati trattati">
          <p style={muted}>A seconda dei servizi utilizzati, MOVI App può trattare:</p>

          <ul style={listStyle}>
            <li>dati anagrafici e di contatto: nome, cognome, telefono, email;</li>
            <li>dati account e autenticazione;</li>
            <li>dati relativi a tornei, iscrizioni, categorie, livello e risultati;</li>
            <li>dati relativi a MoviBack: codice fiscale, tessera sportiva, punti, QR identificativo, premi e riscatti;</li>
            <li>certificato medico e relativa scadenza, solo per le finalità sportive richieste;</li>
            <li>dati relativi agli ordini Store MOVI e al club di ritiro;</li>
            <li>dati tecnici necessari al funzionamento dell’app, come cookie tecnici e sessioni.</li>
          </ul>
        </PrivacyCard>

        <PrivacyCard icon={<Trophy className="w-5 h-5" />} title="4. Tornei">
          <p style={muted}>
            Per la gestione dei tornei vengono trattati dati necessari a:
          </p>

          <ul style={listStyle}>
            <li>identificare l’utente iscritto;</li>
            <li>gestire iscrizioni, liste, riserve e cancellazioni;</li>
            <li>generare tabelloni, turni, classifiche e risultati;</li>
            <li>inviare comunicazioni operative relative al torneo.</li>
          </ul>

          <p style={{ ...muted, marginTop: 10 }}>
            L’utilizzo dei servizi è riservato a utenti maggiorenni.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<BadgeCheck className="w-5 h-5" />} title="5. MoviBack">
          <p style={muted}>
            Per il programma fedeltà MoviBack vengono trattati dati necessari a:
          </p>

          <ul style={listStyle}>
            <li>verificare l’idoneità dell’utente alla partecipazione;</li>
            <li>gestire tessera, stato membership, punti, QR e premi;</li>
            <li>registrare accrediti, utilizzi punti e riscatti;</li>
            <li>verificare il certificato medico ove richiesto.</li>
          </ul>
        </PrivacyCard>

        <PrivacyCard icon={<HeartPulse className="w-5 h-5" />} title="6. Certificati medici">
          <p style={muted}>
            Il certificato medico è trattato esclusivamente per finalità sportive,
            organizzative, assicurative e di verifica dell’idoneità alla
            partecipazione alle attività. Il trattamento richiede uno specifico
            consenso dell’utente.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            I certificati vengono conservati per la durata della membership e per
            i 12 mesi successivi, salvo obblighi di legge o necessità di tutela
            dei diritti dei contitolari.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<ShoppingBag className="w-5 h-5" />} title="7. Store MOVI">
          <p style={muted}>
            Per la gestione degli ordini Store vengono trattati dati necessari a:
          </p>

          <ul style={listStyle}>
            <li>ricevere e gestire ordini;</li>
            <li>identificare cliente, prodotti scelti, taglie, colori e quantità;</li>
            <li>gestire ritiro presso il club scelto;</li>
            <li>gestire pagamento in segreteria, punti MoviBack o modalità mista;</li>
            <li>comunicare informazioni operative sull’ordine.</li>
          </ul>
        </PrivacyCard>

        <PrivacyCard icon={<Megaphone className="w-5 h-5" />} title="8. Comunicazioni e marketing">
          <p style={muted}>
            Solo previo consenso facoltativo, MOVI App potrà inviare comunicazioni
            promozionali, newsletter, offerte commerciali, notifiche push e
            messaggi WhatsApp relativi a iniziative MoviPadel.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            Il consenso marketing può essere revocato in qualsiasi momento
            contattando MoviPadel all’indirizzo email indicato in questa
            informativa.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<FileText className="w-5 h-5" />} title="9. Base giuridica">
          <p style={muted}>
            I dati sono trattati in base a una o più delle seguenti basi
            giuridiche:
          </p>

          <ul style={listStyle}>
            <li>esecuzione dei servizi richiesti dall’utente;</li>
            <li>adempimento di obblighi legali;</li>
            <li>consenso dell’utente, in particolare per marketing e dati sanitari;</li>
            <li>legittimo interesse alla sicurezza, organizzazione e tutela dei servizi.</li>
          </ul>
        </PrivacyCard>

        <PrivacyCard icon={<ShieldCheck className="w-5 h-5" />} title="10. Conservazione e sicurezza">
          <p style={muted}>
            I dati sono conservati per il tempo necessario alle finalità per cui
            sono raccolti e secondo eventuali obblighi di legge. MOVI App utilizza
            misure tecniche e organizzative per limitare accessi non autorizzati,
            perdita, modifica o diffusione dei dati.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            I dati sono ospitati tramite fornitori tecnici quali Supabase e
            Vercel, utilizzati per database, storage, autenticazione tecnica e
            hosting dell’app.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<UserCheck className="w-5 h-5" />} title="11. Diritti dell’utente">
          <p style={muted}>
            L’utente può richiedere accesso, rettifica, cancellazione, limitazione
            del trattamento, opposizione e portabilità dei dati nei casi previsti
            dalla normativa applicabile.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            L’utente può inoltre revocare i consensi prestati, senza pregiudicare
            la liceità del trattamento effettuato prima della revoca.
          </p>
        </PrivacyCard>

        <PrivacyCard icon={<ShieldCheck className="w-5 h-5" />} title="12. Reclamo">
          <p style={muted}>
            L’utente ha diritto di proporre reclamo all’autorità di controllo
            competente qualora ritenga che il trattamento dei dati personali
            violi la normativa applicabile.
          </p>
        </PrivacyCard>
      </main>
    </div>
  );
}

function PrivacyCard({
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