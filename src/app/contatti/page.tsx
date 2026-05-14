"use client";

import PublicNav from "@/components/PublicNav";
import { Mail, Phone, MessageCircle, UserRound } from "lucide-react";

const contacts = [
  {
    name: "Claudio Fabbri",
    phone: "+393497490822",
    role: "Istruttore FITP · Fiduciario Regionale TPRA",
    areas: [
      "Lezioni individuali e di gruppo",
      "Allenamenti agonistici",
      "Responsabile Settore Maschile FITP-TPRA",
      "Responsabile Scuola Padel MOVI",
      "Tesseramento FITP",
    ],
  },
  {
    name: "Erika Castello",
    phone: "+393471106438",
    role: "Coordinatrice Tornei Amatoriali A.S.C.",
    areas: [
      "Organizzazione partite",
      "Responsabile Settore Femminile FITP-TPRA",
      "Responsabile Tornei amatoriali A.S.C.",
      "Organizzatrice Eventi Movi Padel",
    ],
  },
  {
    name: "Massimiliano Rinaudo",
    phone: "+393929624858",
    role: "Coordinatore MOVI",
    areas: [
      "Info e prenotazione campi",
      "Coordinatore Attività MOVI CLUBS",
      "Responsabile Campionato Invernale MOVI",
      "Responsabile Partnership e Sponsorizzazioni",
    ],
  },
];

const email = "movipadel@gmail.com";

function phoneHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

function whatsappHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export default function ContattiPage() {
  return (
    <div
      className="base44-home-wrap"
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
      }}
    >
      <PublicNav />

      <main className="base44-home-container" style={{ paddingTop: 0 }}>
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "22px 18px 24px",
            marginBottom: 22,
            color: "white",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-80px -40px auto -40px",
              height: 360,
              background:
                "radial-gradient(circle at 20% 0%, rgba(14,165,233,0.34), transparent 35%), radial-gradient(circle at 88% 12%, rgba(99,102,241,0.30), transparent 38%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                width: 54,
                height: 34,
                backgroundImage: "url('/home/movi-logo.png')",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "left center",
                opacity: 0.92,
              }}
            />

            <div
              style={{
                marginTop: 18,
                fontSize: 11,
                fontWeight: 650,
                color: "rgba(255,255,255,0.52)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Contatti
            </div>

            <h1
              style={{
                margin: "8px 0 0",
                fontSize: "clamp(30px, 7vw, 40px)",
                lineHeight: 1,
                fontWeight: 850,
                letterSpacing: -1.2,
                color: "#ffffff",
              }}
            >
              Parla con MOVI
            </h1>

            <p
              style={{
                margin: "10px 0 0",
                maxWidth: 340,
                color: "rgba(255,255,255,0.62)",
                fontSize: 14,
                lineHeight: 1.35,
                fontWeight: 520,
              }}
            >
              Scegli il referente più adatto alla tua esigenza.
            </p>
          </div>
        </section>

        <section style={{ display: "grid", gap: 12, padding: "0 18px 24px" }}>
          {contacts.map((contact) => (
            <article
              key={contact.phone}
              style={{
                borderRadius: 24,
                padding: 14,
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.02), 0 18px 40px rgba(0,0,0,0.18)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 15,
                    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 10px 22px rgba(14,165,233,0.30)",
                  }}
                >
                  <UserRound className="w-5 h-5" />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 820,
                      fontSize: 17,
                      color: "rgba(255,255,255,0.94)",
                      lineHeight: 1.1,
                      letterSpacing: -0.3,
                    }}
                  >
                    {contact.name}
                  </div>

                  <div
                    style={{
                      color: "rgba(255,255,255,0.56)",
                      fontSize: 13,
                      lineHeight: 1.3,
                      marginTop: 5,
                      fontWeight: 560,
                    }}
                  >
                    {contact.role}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginTop: 14,
                }}
              >
                {contact.areas.map((area) => (
                  <span
                    key={area}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.055)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.68)",
                      fontWeight: 650,
                      fontSize: 11,
                    }}
                  >
                    {area}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <a
                  href={whatsappHref(contact.phone)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    padding: "0 12px",
                    background: "linear-gradient(135deg, #16a34a, #22c55e)",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    textDecoration: "none",
                    fontWeight: 850,
                    fontSize: 13,
                    boxShadow: "0 12px 26px rgba(22,163,74,0.22)",
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>

                <a
                  href={phoneHref(contact.phone)}
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    padding: "0 12px",
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.055)",
                    color: "rgba(255,255,255,0.82)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    textDecoration: "none",
                    fontWeight: 760,
                    fontSize: 13,
                  }}
                >
                  <Phone className="w-4 h-4" />
                  Chiama
                </a>
              </div>
            </article>
          ))}

          <article
            style={{
              borderRadius: 24,
              padding: 14,
              background:
                "linear-gradient(135deg, rgba(79,70,229,0.28), rgba(14,165,233,0.12))",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
              color: "white",
              backdropFilter: "blur(14px)",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  background: "rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Mail className="w-5 h-5" />
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 820,
                    fontSize: 17,
                    color: "rgba(255,255,255,0.94)",
                  }}
                >
                  Email MOVI
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.58)",
                    fontWeight: 560,
                    marginTop: 4,
                    fontSize: 13,
                  }}
                >
                  Per richieste generali e informazioni
                </div>
              </div>
            </div>

            <a
              href={`mailto:${email}`}
              style={{
                marginTop: 14,
                minHeight: 42,
                borderRadius: 999,
                padding: "0 12px",
                background: "#ffffff",
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                textDecoration: "none",
                fontWeight: 850,
                fontSize: 13,
              }}
            >
              <Mail className="w-4 h-4" />
              {email}
            </a>
          </article>
        </section>
      </main>
    </div>
  );
}