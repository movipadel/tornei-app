"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  Gift,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import PublicNav from "@/components/PublicNav";

export default function MoviBackRulesPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
        color: "white",
      }}
    >
      <PublicNav />

      <main
        className="base44-home-container"
        style={{
          paddingTop: 12,
          paddingBottom: 44,
        }}
      >
        <Link
          href="/moviback"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(255,255,255,0.68)",
            textDecoration: "none",
            fontWeight: 800,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Torna a MoviBack
        </Link>

        <section style={heroStyle}>
          <Sparkles className="w-8 h-8" style={{ color: "#2dd4bf" }} />

          <h1
            style={{
              marginTop: 12,
              fontSize: "clamp(30px, 7vw, 42px)",
              fontWeight: 900,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            Scopri MoviBack
          </h1>

          <p
            style={{
              marginTop: 10,
              color: "rgba(255,255,255,0.64)",
              fontSize: 14,
              lineHeight: 1.45,
              fontWeight: 560,
              maxWidth: 620,
            }}
          >
            MoviBack è il programma fedeltà di MOVI PADEL: accumuli punti con le tue
            spese nel mondo Movi e li usi per riscattare i premi messi a disposizione. Che sia una Slot, un corso, un'iscrizione ad un torneo o un acquisto nello Store, più usi MOVI e più guadagni!
          </p>
          <p
  style={{
    marginTop: 10,
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    lineHeight: 1.45,
    fontWeight: 560,
    maxWidth: 620,
  }}
>
  Il programma è riservato a utenti maggiorenni ed è soggetto
  all’accettazione della Privacy Policy, dei Termini di utilizzo e del
  presente regolamento.
</p>
        </section>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          <RuleCard
            icon={<BadgeCheck className="w-5 h-5" />}
            title="1. Iscrizione a MoviBack"
          >
            Per partecipare devi registrarti e richiedere, se non lo hai ancora,
             il tesseramento all'Ente di Promozione Sportiva A.S.C. oppure alla FITP.
            L’attivazione del programma MoviBack si effettua caricando codice fiscale, tipo tessera scelta e certificato
            medico valido. La richiesta viene controllata e approvata dalla segreteria.
          </RuleCard>

          <RuleCard
  icon={<FileText className="w-5 h-5" />}
  title="2. Tessera e certificato medico"
>
  Il tesseramento A.S.C. è gratuito. Il tesseramento FITP, quando richiesto
  tramite MOVI, comporta un addebito di 15 punti MoviBack. Il certificato
  medico necessario è quello sportivo non agonistico e deve essere in corso di
  validità. Il certificato può essere aggiornato dalla tua pagina personale
  MoviBack.
</RuleCard>

<RuleCard
  icon={<ShieldCheck className="w-5 h-5" />}
  title="3. Privacy e dati sanitari"
>
  L’iscrizione a MoviBack richiede il trattamento di dati personali, tra cui
  codice fiscale, dati di tesseramento e certificato medico. Il certificato
  medico viene utilizzato esclusivamente per finalità sportive, organizzative
  e assicurative, previo consenso specifico dell’utente.
</RuleCard>

          <RuleCard
            icon={<Wallet className="w-5 h-5" />}
            title="4. Come accumuli punti"
          >
            Ogni volta che effettui un pagamento per un servizio o prodotto, mostra il QR code cliente
             alla segreteria o al responsabile. I punti vengono
            accreditati in base all’importo pagato: tessera A.S.C. 1 punto ogni
            1€, tessera FITP 1.2 punti ogni 1€.
          </RuleCard>

          <RuleCard
            icon={<Sparkles className="w-5 h-5" />}
            title="5. Promozioni"
          >
            MOVI può attivare promo personali o collettive per un periodo limitato. Se
            hai una promo attiva, i punti generati dagli accrediti vengono
            moltiplicati in base al moltiplicatore previsto dalla promo.
          </RuleCard>

          <RuleCard
            icon={<Gift className="w-5 h-5" />}
            title="6. Riscatto premi"
          >
            Puoi usare i punti disponibili per riscattare i premi nel catalogo.
            Dopo il riscatto compare un QR premio monouso nella tua pagina
            MoviBack. Mostralo alla segreteria per ritirare il premio.
          </RuleCard>

          <RuleCard
            icon={<QrCode className="w-5 h-5" />}
            title="7. QR premio monouso"
          >
            Il QR premio può essere usato una sola volta. Dopo la consegna, la
            segreteria lo valida e il QR non sarà più disponibile né
            riutilizzabile.
          </RuleCard>

          <RuleCard
            icon={<ShieldCheck className="w-5 h-5" />}
            title="8. Sospensione o uscita dal programma"
          >
            Puoi abbandonare MoviBack dalla tua pagina personale. In questo
            caso la membership viene sospesa e gli eventuali QR premio attivi
            vengono annullati. Se l’uscita è volontaria, puoi rientrare
            automaticamente in seguito.
          </RuleCard>

          <RuleCard
  icon={<FileText className="w-5 h-5" />}
  title="9. Modifiche al regolamento"
>
  MOVI può aggiornare il presente regolamento per esigenze organizzative,
  tecniche o normative. Le modifiche saranno pubblicate in MOVI App o comunicate
  tramite i canali ufficiali.
</RuleCard>

<RuleCard
  icon={<FileText className="w-5 h-5" />}
  title="10. Contatti"
>
  Per informazioni sul programma MoviBack puoi scrivere a movipadel@gmail.com
  o rivolgerti alla segreteria dei club MoviPadel.
</RuleCard>

        </div>
      </main>
    </div>
  );
}

function RuleCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 15,
            background: "rgba(45,212,191,0.13)",
            border: "1px solid rgba(45,212,191,0.18)",
            color: "#2dd4bf",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>

        <div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: -0.25,
            }}
          >
            {title}
          </h2>

          <p
            style={{
              marginTop: 7,
              color: "rgba(255,255,255,0.62)",
              fontSize: 14,
              lineHeight: 1.45,
              fontWeight: 560,
            }}
          >
            {children}
          </p>
        </div>
      </div>
    </section>
  );
}

const heroStyle: React.CSSProperties = {
  borderRadius: 28,
  padding: "24px 20px",
  background:
    "linear-gradient(135deg, rgba(20,184,166,0.22), rgba(255,255,255,0.045))",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.22)",
  backdropFilter: "blur(14px)",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 24,
  padding: 16,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
  backdropFilter: "blur(14px)",
};