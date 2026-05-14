"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
  Gift,
  RefreshCw,
  LogOut,
  BookOpen,
} from "lucide-react";

import PublicNav from "@/components/PublicNav";
import UserLoginDialog from "@/components/UserLoginDialog";
import { QRCodeCanvas } from "qrcode.react";

type User = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: "M" | "F";
};

type Membership = {
  id: string;
  status: "pending_review" | "approved" | "rejected" | "suspended";
  membership_code: string;
  tax_code: string;
  membership_type: "ASC" | "FITP" | null;
  fee_points: number;
  fee_paid: boolean;
  approved_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
};

type Certificate = {
  id: string;
  file_path: string;
  status: "uploaded" | "pending_review" | "approved" | "rejected" | "expired";
  uploaded_at: string;
  reviewed_at?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
};

type MoviBackMe = {
  user: User | null;
  membership: Membership | null;
  certificate: Certificate | null;
  points: number;
  transactions: any[];
  redemptions: any[];
};

const pageBg =
  "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)";

const glassCard: React.CSSProperties = {
  borderRadius: 26,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  padding: "0 13px",
  outline: "none",
  fontWeight: 650,
};

const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.72)",
  fontSize: 13,
  fontWeight: 750,
  marginBottom: 7,
};


function formatDate(date?: string | null) {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function certificateIsExpired(cert: Certificate | null) {
  if (!cert?.expiry_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${cert.expiry_date}T00:00:00`);
  expiry.setHours(0, 0, 0, 0);

  return expiry < today;
}

function getCertificateStatus(cert: Certificate | null) {
  if (!cert?.expiry_date) return "unknown";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(`${cert.expiry_date}T00:00:00`);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";

  return "valid";
}

export default function MoviBackPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<MoviBackMe>({
    user: null,
    membership: null,
    certificate: null,
    points: 0,
    transactions: [],
    redemptions: [],
  });

  const [loginOpen, setLoginOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [rewardQrOpen, setRewardQrOpen] = useState<any | null>(null);

  const [taxCode, setTaxCode] = useState("");
  const [membershipType, setMembershipType] = useState<"ASC" | "FITP">("ASC");
  const [hasExistingMembership, setHasExistingMembership] = useState(false);
  const [existingMembershipNumber, setExistingMembershipNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  const [replaceCertOpen, setReplaceCertOpen] = useState(false);
  const [replaceExpiryDate, setReplaceExpiryDate] = useState("");
  const [replaceCertificateFile, setReplaceCertificateFile] = useState<File | null>(null);

  async function loadMe() {
    try {
      setLoading(true);

      const res = await fetch("/api/moviback/me", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento MoviBack");

      setData(json as MoviBackMe);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  
async function submitReplaceCertificate(e: React.FormEvent) {
  e.preventDefault();

  if (saving) return;

  if (!replaceCertificateFile) {
    toast.error("Carica il nuovo certificato");
    return;
  }

  try {
    setSaving(true);

    const form = new FormData();
    form.set("expiry_date", replaceExpiryDate);
    form.set("certificate", replaceCertificateFile);

    const res = await fetch("/api/moviback/certificate/replace", {
      method: "POST",
      body: form,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(json.error || "Errore caricamento certificato");

    toast.success("Nuovo certificato caricato");
    setReplaceCertOpen(false);
    setReplaceExpiryDate("");
    setReplaceCertificateFile(null);

    await loadMe();
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  } finally {
    setSaving(false);
  }
}

async function leaveMoviBack() {
  const firstConfirm = confirm(
    "Vuoi davvero abbandonare MoviBack? Non potrai più accumulare punti e gli eventuali QR premio attivi verranno annullati."
  );

  if (!firstConfirm) return;

  const secondConfirm = confirm(
    "Confermi l'uscita dal programma MoviBack?"
  );

  if (!secondConfirm) return;

  try {
    setSaving(true);

    const res = await fetch("/api/moviback/leave", {
      method: "POST",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore uscita da MoviBack");
    }

    toast.success("Hai abbandonato MoviBack");
    await loadMe();
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  } finally {
    setSaving(false);
  }
}

async function reactivateMoviBack() {
  const ok = confirm("Vuoi rientrare nel programma MoviBack?");
  if (!ok) return;

  try {
    setSaving(true);

    const res = await fetch("/api/moviback/reactivate", {
      method: "POST",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json.error || "Errore riattivazione MoviBack");
    }

    toast.success("MoviBack riattivato");
    await loadMe();
  } catch (e: any) {
    toast.error(e?.message || "Errore");
  } finally {
    setSaving(false);
  }
}

  function startRequest() {
    if (!data.user) {
      setLoginOpen(true);
      return;
    }

    setRequestOpen(true);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!certificateFile) {
      toast.error("Carica il certificato medico");
      return;
    }

    try {
      setSaving(true);

      const form = new FormData();
      form.set("tax_code", taxCode);
      form.set("membership_type", membershipType);
      form.set(
  "has_existing_membership",
  hasExistingMembership ? "true" : "false"
);

form.set(
  "existing_membership_type",
  hasExistingMembership ? membershipType : ""
);

form.set(
  "existing_membership_number",
  hasExistingMembership && membershipType === "FITP"
    ? existingMembershipNumber
    : ""
);
      form.set("expiry_date", expiryDate);
      form.set("certificate", certificateFile);

      const res = await fetch("/api/moviback/request-membership", {
        method: "POST",
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore richiesta MoviBack");

      toast.success("Richiesta MoviBack inviata");
      setRequestOpen(false);
      setTaxCode("");
      setMembershipType("ASC");
      setExpiryDate("");
      setCertificateFile(null);

      await loadMe();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSaving(false);
    }
  }

  const user = data.user;
  const membership = data.membership;
  const certificate = data.certificate;
  const expired = certificateIsExpired(certificate);

  const statusLabel =
    !membership
      ? "Non attivo"
      : membership.status === "pending_review"
        ? "In revisione"
        : membership.status === "approved"
          ? "Attivo"
          : membership.status === "rejected"
            ? "Non approvato"
            : "Sospeso";

            const certStatus = getCertificateStatus(certificate);
            const activeRewardRedemptions = (data.redemptions || []).filter(
  (r) => r.status === "requested" && r.qr_token
);

  return (
    <div
      className="base44-home-wrap"
      style={{
        minHeight: "100dvh",
        background: pageBg,
      }}
    >
      <PublicNav />

      <div className="base44-home-container" style={{ paddingTop: 6 }}>
        {loading ? (
          <div
            style={{
              minHeight: "70dvh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader2
              className="w-8 h-8 animate-spin"
              style={{ color: "#2dd4bf" }}
            />
          </div>
        ) : (
          <>
            <section
              style={{
                position: "relative",
                marginBottom: 18,
                padding: "24px 20px 22px",
                borderRadius: 28,
                overflow: "hidden",
                color: "white",
                background:
                  "linear-gradient(135deg, rgba(20,184,166,0.22), rgba(255,255,255,0.045))",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 18px 42px rgba(0,0,0,0.22)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "-90px -60px auto -60px",
                  height: 290,
                  background:
                    "radial-gradient(circle at 15% 0%, rgba(45,212,191,0.32), transparent 34%), radial-gradient(circle at 88% 18%, rgba(14,165,233,0.28), transparent 38%)",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative", zIndex: 1 }}>
              {membership?.status === "approved" ? (
  <button
    type="button"
    onClick={leaveMoviBack}
    disabled={saving}
    title="Abbandona MoviBack"
    style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: 42,
      height: 42,
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.07)",
      color: "rgba(255,255,255,0.78)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: saving ? "not-allowed" : "pointer",
      opacity: saving ? 0.55 : 1,
      backdropFilter: "blur(10px)",
    }}
  >
    <LogOut className="w-5 h-5" strokeWidth={1.8} />
  </button>
) : null}
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
                    marginTop: 16,
                    fontSize: 11,
                    fontWeight: 750,
                    color: "rgba(255,255,255,0.56)",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Programma fedeltà
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: "clamp(31px, 7vw, 42px)",
                    fontWeight: 850,
                    lineHeight: 1,
                    letterSpacing: -1.15,
                    color: "#ffffff",
                  }}
                >
                  MoviBack
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.66)",
                    fontWeight: 560,
                    fontSize: 14,
                    lineHeight: 1.35,
                    maxWidth: 440,
                  }}
                >
                  Accumula punti, richiedi premi e gestisci il tuo tesseramento
                  MOVI.
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      ...glassCard,
                      padding: 14,
                      borderRadius: 20,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.54)",
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.11em",
                      }}
                    >
                      Saldo punti
                    </div>
                    <div
                      style={{
                        marginTop: 7,
                        color: "#ffffff",
                        fontSize: 28,
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: -0.8,
                      }}
                    >
                      {data.points}
                    </div>
                  </div>

                  <div
                    style={{
                      ...glassCard,
                      padding: 14,
                      borderRadius: 20,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.54)",
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.11em",
                      }}
                    >
                      Stato
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        color: "#ffffff",
                        fontSize: 16,
                        fontWeight: 850,
                      }}
                    >
                      {membership?.status === "approved" ? (
                        <CheckCircle2 className="w-4 h-4" strokeWidth={1.7} />
                      ) : membership?.status === "pending_review" ? (
                        <Clock className="w-4 h-4" strokeWidth={1.7} />
                      ) : (
                        <WalletCards className="w-4 h-4" strokeWidth={1.7} />
                      )}
                      {statusLabel}
                    </div>
                  </div>
                </div>
                {membership ? (
  <a
    href="/moviback/regolamento"
    style={{
      marginTop: 12,
      display: "block",
      textDecoration: "none",
    }}
  >
    <div
      style={{
        ...glassCard,
        cursor: "pointer",
        padding: 12,
        borderRadius: 18,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <BookOpen className="w-5 h-5" style={{ color: "#2dd4bf" }} />

        <div>
          <div style={{ fontSize: 14, fontWeight: 900 }}>
            Regolamento MoviBack
          </div>

          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 600,
            }}
          >
            Come funzionano punti, premi e QR
          </div>
        </div>
      </div>

    </div>
  </a>
) : null}
              </div>
            </section>

            {!membership ? (
              <section style={{ ...glassCard, padding: 18, color: "white" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 13,
                  }}
                >
                  <span
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 16,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        "linear-gradient(135deg, #14b8a6, rgba(255,255,255,0.12))",
                      boxShadow: "0 10px 22px rgba(20,184,166,0.24)",
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles className="w-5 h-5" strokeWidth={1.7} />
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "#ffffff",
                        fontSize: 20,
                        fontWeight: 850,
                        letterSpacing: -0.4,
                        lineHeight: 1.08,
                      }}
                    >
                      Attiva il tuo MoviBack
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        color: "rgba(255,255,255,0.60)",
                        fontSize: 14,
                        fontWeight: 560,
                        lineHeight: 1.35,
                      }}
                    >
                      Scegli il tesseramento, inserisci codice fiscale e carica
                      il certificato medico. La segreteria controllerà la
                      richiesta.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        background: "rgba(255,255,255,0.055)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: 13,
                      }}
                    >
                      <div style={{ color: "#ffffff", fontWeight: 850 }}>
                        Tessera A.S.C.
                      </div>
                      <div
                        style={{
                          marginTop: 5,
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 12,
                          fontWeight: 650,
                        }}
                      >
                        Gratuita
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        background: "rgba(255,255,255,0.055)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: 13,
                      }}
                    >
                      <div style={{ color: "#ffffff", fontWeight: 850 }}>
                        FITP Non Agonista
                      </div>
                      <div
                        style={{
                          marginTop: 5,
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 12,
                          fontWeight: 650,
                        }}
                      >
                        15 punti
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startRequest}
                    style={{
                      minHeight: 48,
                      borderRadius: 17,
                      border: 0,
                      background:
                        "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
                      color: "#ffffff",
                      fontWeight: 900,
                      fontSize: 15,
                      cursor: "pointer",
                      boxShadow: "0 14px 28px rgba(20,184,166,0.22)",
                    }}
                  >
                    Attiva MoviBack
                  </button>
                </div>
              </section>
            ) : null}

            {membership?.status === "pending_review" ? (
              <section style={{ ...glassCard, padding: 18, color: "white" }}>
                <div style={{ display: "flex", gap: 13 }}>
                  <Clock
                    className="w-6 h-6"
                    strokeWidth={1.7}
                    style={{ color: "#fbbf24", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 850 }}>
                      Richiesta in revisione
                    </div>
                    <div
                      style={{
                        marginTop: 7,
                        color: "rgba(255,255,255,0.60)",
                        fontSize: 14,
                        fontWeight: 560,
                        lineHeight: 1.35,
                      }}
                    >
                      La segreteria controllerà il tesseramento e il
                      certificato medico. Riceverai l’attivazione appena
                      approvato.
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {membership?.status === "approved" ? (
  <section style={{ display: "grid", gap: 14 }}>
    <div
      style={{
        ...glassCard,
        padding: 18,
        color: "white",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900 }}>
        Tessera MoviBack
      </div>

      {membership.membership_type ? (
        <div
          style={{
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 0.4,
            background:
              membership.membership_type === "FITP"
                ? "rgba(14,165,233,0.18)"
                : "rgba(34,197,94,0.18)",
            color:
              membership.membership_type === "FITP"
                ? "#38bdf8"
                : "#4ade80",
            border:
              membership.membership_type === "FITP"
                ? "1px solid rgba(56,189,248,0.4)"
                : "1px solid rgba(74,222,128,0.4)",
          }}
        >
          {membership.membership_type === "FITP" ? "FITP" : "A.S.C."}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          opacity: 0.6,
        }}
      >
        Codice: {membership.membership_code}
      </div>

      <button
        onClick={() => setQrOpen(true)}
        style={{
          marginTop: 16,
          width: "100%",
          height: 52,
          borderRadius: 18,
          border: 0,
          background: "linear-gradient(135deg,#14b8a6,#0ea5e9)",
          color: "white",
          fontWeight: 900,
          fontSize: 15,
        }}
      >
        Mostra QR
      </button>
    </div>
  </section>
) : null}

{membership?.status === "approved" ? (
  <section
    style={{
      ...glassCard,
      padding: 18,
      color: "white",
      marginTop: 14,
    }}
  >
    <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
      <Gift
        className="w-6 h-6"
        style={{ color: "#f59e0b", flexShrink: 0 }}
      />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          Catalogo premi
        </div>

        <div
          style={{
            marginTop: 6,
            color: "rgba(255,255,255,0.58)",
            fontSize: 14,
            fontWeight: 560,
            lineHeight: 1.35,
          }}
        >
          Scopri i premi disponibili e usa i tuoi punti MoviBack per
          riscattarli.
        </div>

        <a
          href="/moviback/premi"
          style={{
            marginTop: 14,
            minHeight: 46,
            width: "100%",
            borderRadius: 16,
            border: 0,
            background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
            color: "#111827",
            fontWeight: 950,
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          Vai al catalogo premi
        </a>
      </div>
    </div>
  </section>
) : null}

{membership?.status === "approved" && activeRewardRedemptions.length > 0 ? (
  <section
    style={{
      ...glassCard,
      padding: 18,
      color: "white",
      marginTop: 14,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Gift className="w-6 h-6" style={{ color: "#f59e0b" }} />
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          Premi da ritirare
        </div>
        <div
          style={{
            marginTop: 3,
            color: "rgba(255,255,255,0.58)",
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          Mostra il QR alla segreteria per ricevere il premio.
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gap: 12, marginTop: 15 }}>
      {activeRewardRedemptions.map((redemption) => (
        <div
          key={redemption.id}
          style={{
            display: "grid",
            gridTemplateColumns: redemption.reward?.image_path
              ? "68px 1fr"
              : "1fr",
            gap: 12,
            alignItems: "center",
            padding: 12,
            borderRadius: 20,
            background: "rgba(255,255,255,0.055)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {redemption.reward?.image_path ? (
            <img
              src={redemption.reward.image_path}
              alt={redemption.reward.name}
              style={{
                width: 68,
                height: 68,
                objectFit: "cover",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            />
          ) : null}

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              {redemption.reward?.name || "Premio"}
            </div>

            <div
              style={{
                marginTop: 4,
                color: "rgba(255,255,255,0.58)",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              {redemption.points_cost} punti · QR monouso
            </div>

            <button
              type="button"
              onClick={() => setRewardQrOpen(redemption)}
              style={{
                marginTop: 10,
                width: "100%",
                minHeight: 42,
                borderRadius: 15,
                border: 0,
                background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
                color: "#111827",
                fontWeight: 950,
                fontSize: 14,
              }}
            >
              Mostra QR premio
            </button>
          </div>
        </div>
      ))}
    </div>
  </section>
) : null}

            {membership?.status === "rejected" ? (
              <section style={{ ...glassCard, padding: 18, color: "white" }}>
                <AlertTriangle
                  className="w-6 h-6"
                  strokeWidth={1.7}
                  style={{ color: "#fb7185" }}
                />
                <div style={{ marginTop: 10, fontSize: 19, fontWeight: 850 }}>
                  Richiesta non approvata
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 14,
                    fontWeight: 560,
                  }}
                >
                  Contatta la segreteria per maggiori informazioni.
                </div>
              </section>
            ) : null}

            {membership?.status === "suspended" ? (
              <section style={{ ...glassCard, padding: 18, color: "white" }}>
                <AlertTriangle
                  className="w-6 h-6"
                  strokeWidth={1.7}
                  style={{ color: "#fb7185" }}
                />
                <div style={{ marginTop: 10, fontSize: 19, fontWeight: 850 }}>
                  MoviBack sospeso
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 14,
                    fontWeight: 560,
                  }}
                >
                  {membership.suspension_reason ||
                    "Contatta la segreteria per maggiori informazioni."}
                    {membership.suspension_reason === "Uscita volontaria utente" ? (
  <button
    type="button"
    onClick={reactivateMoviBack}
    disabled={saving}
    style={{
      marginTop: 14,
      minHeight: 46,
      width: "100%",
      borderRadius: 16,
      border: 0,
      background: "linear-gradient(135deg,#14b8a6,#0ea5e9)",
      color: "white",
      fontWeight: 900,
      fontSize: 14,
      cursor: saving ? "not-allowed" : "pointer",
      opacity: saving ? 0.65 : 1,
    }}
  >
    Rientra in MoviBack
  </button>
) : null}
                </div>
              </section>
            ) : null}

            {certificate ? (
              <section
                style={{
                  ...glassCard,
                  padding: 18,
                  color: "white",
                  marginTop: 14,
                }}
              >
                <div
  style={{
    display: "flex",
    alignItems: "flex-start",
    gap: 13,
  }}
>
  <FileText
    className="w-6 h-6"
    strokeWidth={1.7}
    style={{ color: expired ? "#fbbf24" : "#93c5fd", flexShrink: 0 }}
  />

  <div style={{ minWidth: 0, flex: 1 }}>
    {/* HEADER ROW */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 850 }}>
        Certificato medico
      </div>

      <button
        type="button"
        onClick={() => setReplaceCertOpen(true)}
        style={{
          height: 32,
          padding: "0 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          fontWeight: 800,
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Aggiorna
      </button>
    </div>
                   <div
  style={{
    marginTop: 6,
    fontSize: 13,
    fontWeight: 650,
    color: "rgba(255,255,255,0.6)",
  }}
>
  Scadenza: {formatDate(certificate?.expiry_date)}
</div>

<div
  style={{
    marginTop: 4,
    fontSize: 13,
    fontWeight: 800,
    color:
      certStatus === "valid"
        ? "#34d399"
        : certStatus === "expiring"
        ? "#fbbf24"
        : "#f87171",
  }}
>
  {certStatus === "valid" && "Certificato valido"}
  {certStatus === "expiring" && "Certificato in scadenza"}
  {certStatus === "expired" && "Certificato scaduto"}
</div>

{certStatus === "expired" && (
  <div
    style={{
      marginTop: 10,
      borderRadius: 14,
      padding: "10px 12px",
      background: "rgba(239,68,68,0.14)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#f87171",
      fontSize: 13,
      fontWeight: 750,
    }}
  >
    Certificato scaduto: caricane uno nuovo per continuare a usare MoviBack
  </div>
)}
                  </div>
                </div>
              </section>
            ) : null}

            {requestOpen ? (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 80,
                  background: "rgba(3,7,18,0.72)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: 14,
                }}
                onClick={() => {
                  if (!saving) setRequestOpen(false);
                }}
              >
                <form
                  onSubmit={submitRequest}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    borderRadius: 28,
                    background:
                      "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
                    padding: 18,
                    color: "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      letterSpacing: -0.5,
                    }}
                  >
                    Richiedi MoviBack
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color: "rgba(255,255,255,0.58)",
                      fontSize: 14,
                      fontWeight: 560,
                    }}
                  >
                    Inserisci i dati necessari per il tesseramento.
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={labelStyle}>Codice fiscale</div>
                    <input
                      value={taxCode}
                      onChange={(e) => setTaxCode(e.target.value.toUpperCase())}
                      required
                      style={inputStyle}
                      placeholder="RSSMRA..."
                    />
                  </div>

                  <div style={{ marginTop: 13 }}>
                    <div style={labelStyle}>Tipo tessera</div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setMembershipType("ASC")}
                        style={{
                          minHeight: 70,
                          borderRadius: 18,
                          border:
                            membershipType === "ASC"
                              ? "1px solid rgba(45,212,191,0.70)"
                              : "1px solid rgba(255,255,255,0.10)",
                          background:
                            membershipType === "ASC"
                              ? "rgba(20,184,166,0.16)"
                              : "rgba(255,255,255,0.055)",
                          color: "#ffffff",
                          textAlign: "left",
                          padding: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>A.S.C.</div>
                        <div
                          style={{
                            marginTop: 5,
                            color: "rgba(255,255,255,0.58)",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Gratuita
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMembershipType("FITP")}
                        style={{
                          minHeight: 70,
                          borderRadius: 18,
                          border:
                            membershipType === "FITP"
                              ? "1px solid rgba(45,212,191,0.70)"
                              : "1px solid rgba(255,255,255,0.10)",
                          background:
                            membershipType === "FITP"
                              ? "rgba(20,184,166,0.16)"
                              : "rgba(255,255,255,0.055)",
                          color: "#ffffff",
                          textAlign: "left",
                          padding: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>FITP</div>
                        <div
                          style={{
                            marginTop: 5,
                            color: "rgba(255,255,255,0.58)",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          100 punti
                        </div>
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 13 }}>
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.10)",
      background: hasExistingMembership
        ? "rgba(20,184,166,0.14)"
        : "rgba(255,255,255,0.055)",
      padding: "10px 12px",
      cursor: "pointer",
    }}
  >
    <input
      type="checkbox"
      checked={hasExistingMembership}
      onChange={(e) => {
        setHasExistingMembership(e.target.checked);
        if (!e.target.checked) setExistingMembershipNumber("");
      }}
    />

    <span
      style={{
        color: "white",
        fontSize: 14,
        fontWeight: 800,
      }}
    >
      Ho già una tessera {membershipType === "FITP" ? "FITP" : "A.S.C."}
    </span>
  </label>

  {hasExistingMembership ? (
    <div
      style={{
        marginTop: 9,
        borderRadius: 16,
        padding: 12,
        background: "rgba(255,255,255,0.045)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {membershipType === "FITP" ? (
        <>
          <div style={labelStyle}>Numero tessera FITP</div>
          <input
            value={existingMembershipNumber}
            onChange={(e) =>
              setExistingMembershipNumber(e.target.value.toUpperCase())
            }
            required={hasExistingMembership && membershipType === "FITP"}
            style={inputStyle}
            placeholder="Inserisci numero tessera FITP"
          />
        </>
      ) : (
        <div
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 13,
            fontWeight: 650,
            lineHeight: 1.35,
          }}
        >
          La segreteria verificherà la tessera A.S.C. usando nome, cognome e
          codice fiscale.
        </div>
      )}
    </div>
  ) : null}
</div>

                  <div style={{ marginTop: 13 }}>
                    <div style={labelStyle}>Scadenza certificato</div>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ marginTop: 13 }}>
                    <div style={labelStyle}>Certificato medico</div>
                    <label
                      style={{
                        minHeight: 54,
                        borderRadius: 18,
                        border: "1px dashed rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.055)",
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "12px 13px",
                        cursor: "pointer",
                      }}
                    >
                      <Upload
                        className="w-5 h-5"
                        strokeWidth={1.7}
                        style={{ color: "#2dd4bf", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          color: certificateFile
                            ? "#ffffff"
                            : "rgba(255,255,255,0.58)",
                          fontWeight: 750,
                          fontSize: 13,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {certificateFile
                          ? certificateFile.name
                          : "Carica PDF, JPG, PNG o WEBP"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) =>
                          setCertificateFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setRequestOpen(false)}
                      style={{
                        minHeight: 46,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.82)",
                        fontWeight: 850,
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      Annulla
                    </button>

                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        minHeight: 46,
                        borderRadius: 16,
                        border: 0,
                        background:
                          "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
                        color: "#ffffff",
                        fontWeight: 900,
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.72 : 1,
                      }}
                    >
                      {saving ? "Invio..." : "Invia richiesta"}
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {qrOpen && membership && (
  <div
    onClick={() => setQrOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "black",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ textAlign: "center" }}
    >
      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 24,
        }}
      >
        <QRCodeCanvas
          value={`mb:${membership.membership_code}`}
          size={260}
        />
      </div>

      <div
        style={{
          marginTop: 20,
          color: "white",
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: 1,
        }}
      >
        {membership.membership_code}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
        }}
      >
        Mostra alla segreteria per accumulare punti
      </div>

      <button
        onClick={() => setQrOpen(false)}
        style={{
          marginTop: 24,
          height: 44,
          padding: "0 18px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "white",
          fontWeight: 700,
        }}
      >
        Chiudi
      </button>
    </div>
  </div>
)}

{rewardQrOpen ? (
  <div
    onClick={() => setRewardQrOpen(null)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 110,
      background: "black",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
      <div
        style={{
          color: "white",
          fontSize: 20,
          fontWeight: 900,
          marginBottom: 14,
        }}
      >
        {rewardQrOpen.reward?.name || "Premio MoviBack"}
      </div>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 24,
        }}
      >
        <QRCodeCanvas
          value={`${window.location.origin}/riscatto-premio/${rewardQrOpen.qr_token}`}
          size={260}
        />
      </div>

      <div
        style={{
          marginTop: 20,
          color: "#fbbf24",
          fontWeight: 900,
          fontSize: 17,
        }}
      >
        {rewardQrOpen.points_cost} punti
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
          maxWidth: 300,
        }}
      >
        QR premio monouso. Dopo la validazione della segreteria non sarà più disponibile.
      </div>

      <button
        onClick={() => setRewardQrOpen(null)}
        style={{
          marginTop: 24,
          height: 44,
          padding: "0 18px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "white",
          fontWeight: 700,
        }}
      >
        Chiudi
      </button>
    </div>
  </div>
) : null}

{replaceCertOpen ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 90,
      background: "rgba(3,7,18,0.72)",
      backdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      padding: 14,
    }}
    onClick={() => {
      if (!saving) setReplaceCertOpen(false);
    }}
  >
    <form
      onSubmit={submitReplaceCertificate}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 520,
        borderRadius: 28,
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
        padding: 18,
        color: "white",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>
        Nuovo certificato medico
      </div>

      <div
        style={{
          marginTop: 6,
          color: "rgba(255,255,255,0.58)",
          fontSize: 14,
          fontWeight: 560,
        }}
      >
        Carica un nuovo certificato. La segreteria lo controllerà.
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={labelStyle}>Nuova scadenza certificato</div>
        <input
          type="date"
          value={replaceExpiryDate}
          onChange={(e) => setReplaceExpiryDate(e.target.value)}
          required
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 13 }}>
        <div style={labelStyle}>File certificato</div>
        <label
          style={{
            minHeight: 54,
            borderRadius: 18,
            border: "1px dashed rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.055)",
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "12px 13px",
            cursor: "pointer",
          }}
        >
          <Upload
            className="w-5 h-5"
            strokeWidth={1.7}
            style={{ color: "#2dd4bf", flexShrink: 0 }}
          />
          <span
            style={{
              color: replaceCertificateFile
                ? "#ffffff"
                : "rgba(255,255,255,0.58)",
              fontWeight: 750,
              fontSize: 13,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {replaceCertificateFile
              ? replaceCertificateFile.name
              : "Carica PDF, JPG, PNG o WEBP"}
          </span>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) =>
              setReplaceCertificateFile(e.target.files?.[0] ?? null)
            }
          />
        </label>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <button
          type="button"
          disabled={saving}
          onClick={() => setReplaceCertOpen(false)}
          style={{
            minHeight: 46,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.82)",
            fontWeight: 850,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          Annulla
        </button>

        <button
          type="submit"
          disabled={saving}
          style={{
            minHeight: 46,
            borderRadius: 16,
            border: 0,
            background: "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
            color: "#ffffff",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.72 : 1,
          }}
        >
          {saving ? "Caricamento..." : "Carica certificato"}
        </button>
      </div>
    </form>
  </div>
) : null}

            <UserLoginDialog
              open={loginOpen}
              onClose={() => setLoginOpen(false)}
              onSaved={async (u) => {
                setData((prev) => ({ ...prev, user: u }));
                setLoginOpen(false);
                toast.success("Dati salvati");
                await loadMe();
                setRequestOpen(true);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}