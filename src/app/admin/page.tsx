import Link from "next/link";
import {
  Trophy,
  Network,
  Gift,
  UsersRound,
  ScanLine,
  Settings,
  Home,
  Store,
  ShoppingBag,
} from "lucide-react";

const cards = [
  {
    title: "Tornei",
    description: "Crea, modifica, genera e gestisci tornei.",
    href: "/admin/tournaments",
    icon: Trophy,
    accent: "#6366f1",
  },
  {
    title: "Scanner QR Code",
    description: "Accredita punti o scansiona codici premio.",
    href: "/staff",
    icon: ScanLine,
    accent: "#a855f7",
  },
  {
    title: "Circuiti",
    description: "Gestisci circuiti e classifiche giocatori.",
    href: "/admin/circuits",
    icon: Network,
    accent: "#22c55e",
  },
  {
    title: "MoviBack",
    description: "Gestione utenti, punti e premi.",
    href: "/admin/moviback",
    icon: Gift,
    accent: "#f59e0b",
  },
  {
    title: "Store MOVI",
    description: "Gestisci prodotti, categorie, linee, varianti e stock.",
    href: "/admin/store/products",
    icon: Store,
    accent: "#fb923c",
  },
  {
    title: "Ordini Store",
    description: "Gestisci ordini, incassi, stati e riepiloghi fornitore.",
    href: "/admin/store-orders",
    icon: ShoppingBag,
    accent: "#fbbf24",
  },
  {
    title: "Gestione staff",
    description: "Crea e gestisci accessi admin e staff.",
    href: "/admin/users",
    icon: UsersRound,
    accent: "#38bdf8",
  },
  {
    title: "Comunicazioni",
    description: "Notifiche e comunicazioni agli utenti.",
    href: "/admin/comunicazioni",
    icon: Settings,
    accent: "#64748b",
  },
];

export default function AdminHomePage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 65px)",
        margin: "-24px -16px -40px",
        padding: "28px 16px 44px",
        color: "white",
        background:
          "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div>
            <img
              src="/home/movi-logo.png"
              alt="Movi"
              style={{
                height: 44,
                width: "auto",
                objectFit: "contain",
                display: "block",
                opacity: 0.96,
                marginBottom: 18,
              }}
            />

            <h1
              style={{
                fontSize: "clamp(28px, 8vw, 48px)",
                lineHeight: 1,
                letterSpacing: "-0.05em",
                fontWeight: 950,
                margin: 0,
              }}
            >
              Dashboard Admin
            </h1>
          </div>

          <Link
            href="/"
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.075)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "white",
              flex: "0 0 auto",
            }}
            aria-label="Home pubblica"
          >
            <Home size={20} strokeWidth={1.6} />
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))",
            gap: 14,
          }}
        >
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.title}
                href={card.href}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  minHeight: 104,
                  padding: 16,
                  borderRadius: 24,
                  textDecoration: "none",
                  color: "white",
                  background: "rgba(255,255,255,0.055)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  backdropFilter: "blur(14px)",
                  boxShadow: "0 18px 44px rgba(0,0,0,0.24)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: -36,
                    top: -36,
                    width: 110,
                    height: 110,
                    borderRadius: 999,
                    background: card.accent,
                    opacity: 0.14,
                    filter: "blur(2px)",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      flex: "0 0 auto",
                    }}
                  >
                    <Icon size={24} strokeWidth={1.6} color={card.accent} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        marginBottom: 4,
                      }}
                    >
                      {card.title}
                    </div>

                    <div
                      style={{
                        color: "rgba(255,255,255,0.58)",
                        fontSize: 13,
                        lineHeight: 1.35,
                      }}
                    >
                      {card.description}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}