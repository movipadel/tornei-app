import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  Gift,
  Mail,
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

export default function TerminiPage() {
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

        <section
          style={{
            ...cardStyle,
            padding: "24px 20px",
            marginBottom: 14,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-80px -80px auto -80px",
              height: 260,
              background:
                "radial-gradient(circle at 20% 10%, rgba(251,191,36,0.24), transparent 34%), radial-gradient(circle at 84% 20%, rgba(45,212,191,0.18), transparent 38%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={heroPill}>
              <FileText className="w-4 h-4" />
              Termini MOVI App
            </div>

            <h1 style={heroTitle}>Termini di utilizzo</h1>

            <p style={{ ...muted, marginTop: 12, maxWidth: 720 }}>
              Questi termini regolano l’utilizzo di MOVI App, inclusi tornei,
              programma fedeltà MoviBack, Store MOVI, comunicazioni e servizi
              collegati.
            </p>

            <p style={{ ...muted, marginTop: 10, fontSize: 12 }}>
              Ultimo aggiornamento: maggio 2026
            </p>
          </div>
        </section>

        <LegalCard icon={<UserCheck className="w-5 h-5" />} title="1. Soggetti gestori">
          <p style={muted}>
            MOVI App è gestita nell’ambito del progetto MoviPadel da Vav Padel
            A.S.D. e Centallo Paddle A.S.D.
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
        </LegalCard>

        <LegalCard icon={<BadgeCheck className="w-5 h-5" />} title="2. Requisiti di utilizzo">
          <p style={muted}>
            L’utilizzo di MOVI App è riservato a utenti maggiorenni. Utilizzando
            l’app, l’utente dichiara di avere almeno 18 anni e di fornire dati
            veritieri, aggiornati e riferiti alla propria persona.
          </p>
        </LegalCard>

        <LegalCard icon={<ShieldCheck className="w-5 h-5" />} title="3. Account utente">
          <p style={muted}>
            L’utente è responsabile della correttezza dei dati inseriti e
            dell’utilizzo del proprio account. MOVI App può sospendere o limitare
            l’accesso in caso di uso improprio, dati falsi, abuso dei servizi o
            violazione dei presenti termini.
          </p>
        </LegalCard>

        <LegalCard icon={<Trophy className="w-5 h-5" />} title="4. Tornei">
          <p style={muted}>
            Le iscrizioni ai tornei sono soggette alle regole specifiche di ogni
            evento: numero massimo di partecipanti, categorie, livelli, orari,
            formule di gioco, riserve, cancellazioni e gestione dei risultati.
          </p>

          <ul style={listStyle}>
            <li>l’iscrizione può essere accettata, spostata in riserva o cancellata secondo disponibilità;</li>
            <li>gli orari e le formule possono subire modifiche organizzative;</li>
            <li>l’utente deve presentarsi in condizioni idonee alla partecipazione sportiva;</li>
            <li>comportamenti scorretti possono comportare esclusione da eventi futuri.</li>
          </ul>
        </LegalCard>

        <LegalCard icon={<Gift className="w-5 h-5" />} title="5. MoviBack">
          <p style={muted}>
            MoviBack è il programma fedeltà collegato a MOVI App. La partecipazione
            richiede approvazione da parte dello staff o dell’amministrazione e
            può essere sospesa o revocata in caso di dati non corretti, abuso,
            uso improprio dei punti o mancato rispetto del regolamento.
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            I punti non costituiscono denaro elettronico, non sono convertibili
            in contanti e possono essere utilizzati solo secondo le modalità
            previste dal regolamento MoviBack.
          </p>
        </LegalCard>

        <LegalCard icon={<ShoppingBag className="w-5 h-5" />} title="6. Store MOVI">
          <p style={muted}>
            Lo Store MOVI consente di ordinare prodotti e articoli riservati agli
            utenti dell’app. Il pagamento avviene esclusivamente presso la
            segreteria o il club indicato, salvo diversa comunicazione.
          </p>

          <ul style={listStyle}>
            <li>non sono previsti pagamenti online tramite MOVI App;</li>
            <li>il ritiro avviene presso il club selezionato;</li>
            <li>la disponibilità prodotti può variare in base a taglia, colore e stock;</li>
            <li>gli ordini possono essere confermati, preparati, consegnati o annullati dallo staff;</li>
            <li>eventuali ordini speciali possono essere gestiti separatamente.</li>
          </ul>
        </LegalCard>

        <LegalCard icon={<Mail className="w-5 h-5" />} title="7. Comunicazioni">
          <p style={muted}>
            MOVI App può inviare comunicazioni operative relative a iscrizioni,
            tornei, ordini, MoviBack, premi o informazioni di servizio. Le
            comunicazioni promozionali vengono inviate solo previo consenso
            specifico dell’utente.
          </p>
        </LegalCard>

        <LegalCard icon={<ShieldCheck className="w-5 h-5" />} title="8. Limitazioni di responsabilità">
          <p style={muted}>
            MOVI App è uno strumento digitale a supporto delle attività sportive
            e organizzative. I gestori si impegnano a mantenere il servizio
            funzionante e aggiornato, ma non garantiscono assenza totale di errori,
            interruzioni, ritardi tecnici o indisponibilità temporanee.
          </p>
        </LegalCard>

        <LegalCard icon={<FileText className="w-5 h-5" />} title="9. Modifiche ai termini">
          <p style={muted}>
            I presenti termini possono essere aggiornati nel tempo per adeguarli
            a nuove funzionalità, esigenze organizzative o obblighi normativi.
            L’utilizzo continuato dell’app dopo eventuali aggiornamenti comporta
            accettazione dei termini modificati.
          </p>
        </LegalCard>

        <LegalCard icon={<Mail className="w-5 h-5" />} title="10. Contatti">
          <p style={muted}>
            Per informazioni sui presenti termini è possibile scrivere a:
          </p>

          <p style={{ ...muted, marginTop: 10 }}>
            Email: <b style={{ color: "white" }}>movipadel@gmail.com</b>
          </p>
        </LegalCard>
      </main>
    </div>
  );
}

function LegalCard({
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