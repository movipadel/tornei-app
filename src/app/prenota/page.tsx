"use client";

import { ExternalLink, MapPin } from "lucide-react";
import PublicNav from "@/components/PublicNav";

const clubs = [
  {
    name: "Movi Padel Centallo",
    address: "Viale della Liberazione, Centallo",
    maps: "https://www.google.com/maps?q=Viale+della+Liberazione+Centallo",
    wansport: "https://wansport.com/venues?venue=ebzv02m3ji7ir3j5o51buoko",
  },
  {
    name: "Movi Padel Costigliole",
    address: "Via Busca, 5, Costigliole Saluzzo",
    maps: "https://www.google.com/maps?q=Via+Busca+5+Costigliole",
    wansport: "https://wansport.com/venues?venue=8javshutvbh4mn3a36wpogpf",
  },
  {
    name: "Movi Padel Saluzzo",
    address: "Via Antica Torino 26, Saluzzo",
    maps: "https://www.google.com/maps?q=Via+Antica+Torino+26+Saluzzo",
    wansport: "https://wansport.com/venues?venue=dhiur9eoa0338jf9sjdurie0",
  },
  {
    name: "Movi Padel Manta",
    address: "Via Gerbola, Manta",
    maps: "https://www.google.com/maps?q=Via+Gerbola+Manta",
    wansport: "https://wansport.com/venues?venue=4hyc73siou28doeirhs5e56",
  },
  {
    name: "Movi Padel Revello",
    address: "Via Italia 61, Revello",
    maps: "https://www.google.com/maps?q=Via+Italia+61+Revello",
    wansport: "https://wansport.com/venues?venue=xp9yoov751r8pbjs34t5uam7",
  },
];

export default function PrenotaPage() {
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

      <main
        className="base44-home-container"
        style={{
          paddingTop: 0,
        }}
      >
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
              Prenotazioni
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
              Prenota un campo
            </h1>

            <p
              style={{
                margin: "10px 0 0",
                maxWidth: 330,
                color: "rgba(255,255,255,0.62)",
                fontSize: 14,
                lineHeight: 1.35,
                fontWeight: 520,
              }}
            >
              Scegli il club MOVI e completa la prenotazione su Wansport.
            </p>
          </div>
        </section>

        <section style={{ display: "grid", gap: 12, padding: "0 18px 24px" }}>
          {clubs.map((club) => (
            <article
              key={club.name}
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
                  <MapPin className="w-5 h-5" />
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
                    {club.name}
                  </div>

                  <div
                    style={{
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 13,
                      lineHeight: 1.3,
                      marginTop: 5,
                      fontWeight: 560,
                    }}
                  >
                    {club.address}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.25fr",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <a
                  href={club.maps}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    padding: "0 12px",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    textDecoration: "none",
                    color: "rgba(255,255,255,0.82)",
                    fontWeight: 760,
                    fontSize: 13,
                    background: "rgba(255,255,255,0.055)",
                  }}
                >
                  <MapPin className="w-4 h-4" />
                  Maps
                </a>

                <a
                  href={club.wansport}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    padding: "0 12px",
                    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    textDecoration: "none",
                    fontWeight: 850,
                    fontSize: 13,
                    boxShadow: "0 12px 26px rgba(37,99,235,0.24)",
                  }}
                >
                  Prenota
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}