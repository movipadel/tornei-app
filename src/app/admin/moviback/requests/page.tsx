"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X, FileText, UserCheck } from "lucide-react";

type Row = {
  id: string;
  membership_code: string;
  membership_type: string;
  has_existing_membership: boolean;
  existing_membership_type: string | null;
  existing_membership_number: string | null;
  created_at: string;
  users: {
    full_name: string;
    phone: string;
  };
  certificate: {
    id: string;
    status: string;
    expiry_date?: string | null;
    file_path?: string;
  } | null;
};

export default function RequestsPage() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  async function load() {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/moviback/requests", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(json.error || "Errore caricamento richieste");

      setData(json.data || []);
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAction(
  id: string,
  action: "approve" | "reject",
  reason?: string
) {
    try {
      setSavingId(id);

      const res = await fetch("/api/admin/moviback/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  id,
  action,
  rejection_reason: action === "reject" ? reason : undefined,
}),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success(action === "approve" ? "Richiesta approvata" : "Richiesta rifiutata");
      await load();
      setRejectTarget(null);
setRejectionReason("");
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    } finally {
      setSavingId(null);
    }
  }

  async function openCertificate(certificateId?: string) {
    if (!certificateId) {
      toast.error("Certificato non disponibile");
      return;
    }

    try {
      const res = await fetch("/api/admin/moviback/certificate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ certificate_id: certificateId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore apertura certificato");

      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "Errore");
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 980, margin: "0 auto", color: "white" }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserCheck className="w-7 h-7" style={{ color: "#f59e0b" }} />
            <h1 style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.8 }}>
              Richieste MoviBack
            </h1>
          </div>

          <p
            style={{
              marginTop: 6,
              color: "rgba(255,255,255,0.58)",
              fontSize: 14,
              fontWeight: 650,
            }}
          >
            Controlla certificati e approva o rifiuta le nuove richieste di ingresso.
          </p>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div style={emptyStyle}>Nessuna richiesta in attesa.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {data.map((r) => (
              <div key={r.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 950 }}>
                      {r.users.full_name}
                    </div>

                    <div style={muted}>{r.users.phone}</div>

                    <div
  style={{
    marginTop: 8,
    padding: "9px 11px",
    borderRadius: 14,
    background: r.has_existing_membership
      ? "rgba(34,197,94,0.12)"
      : "rgba(245,158,11,0.12)",
    border: r.has_existing_membership
      ? "1px solid rgba(34,197,94,0.20)"
      : "1px solid rgba(245,158,11,0.20)",
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: 750,
    lineHeight: 1.35,
  }}
>
  {r.has_existing_membership ? (
    <>
      Tessera già posseduta:{" "}
      <strong>{r.existing_membership_type || r.membership_type}</strong>
      {r.existing_membership_type === "FITP" &&
      r.existing_membership_number ? (
        <> · N. {r.existing_membership_number}</>
      ) : null}
      {r.existing_membership_type === "ASC" ? (
        <div
          style={{
            marginTop: 3,
            color: "rgba(255,255,255,0.58)",
            fontSize: 12,
            fontWeight: 650,
          }}
        >
          Verifica manuale con nome e codice fiscale.
        </div>
      ) : null}
    </>
  ) : (
    <>
      Nuova tessera da attivare: <strong>{r.membership_type}</strong>
    </>
  )}
</div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <span style={pillStyle}>
                        Tessera {r.membership_type || "—"}
                      </span>

                      <span style={pillStyle}>
                        Codice {r.membership_code || "—"}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 850,
                      color: "rgba(255,255,255,0.5)",
                      textAlign: "right",
                    }}
                  >
                    {new Date(r.created_at).toLocaleDateString("it-IT")}
                  </div>
                </div>

                <div style={certBox}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText size={16} style={{ color: "#fbbf24" }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        Certificato medico
                      </div>
                      <div style={muted}>
                        {r.certificate?.status || "non presente"}
                        {r.certificate?.expiry_date
                          ? ` · scadenza ${new Date(
                              r.certificate.expiry_date
                            ).toLocaleDateString("it-IT")}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openCertificate(r.certificate?.id)}
                    disabled={!r.certificate?.id}
                    style={{
                      ...secondaryBtn,
                      minHeight: 38,
                      opacity: r.certificate?.id ? 1 : 0.45,
                      cursor: r.certificate?.id ? "pointer" : "not-allowed",
                    }}
                  >
                    Apri
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <button
                    onClick={() => handleAction(r.id, "approve")}
                    disabled={savingId === r.id}
                    style={{
                      ...approveBtn,
                      opacity: savingId === r.id ? 0.65 : 1,
                    }}
                  >
                    {savingId === r.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    Approva
                  </button>

                  <button
  onClick={() => {
    setRejectTarget(r);
    setRejectionReason("");
  }}
                    disabled={savingId === r.id}
                    style={{
                      ...rejectBtn,
                      opacity: savingId === r.id ? 0.65 : 1,
                    }}
                  >
                    {savingId === r.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <X size={16} />
                    )}
                    Rifiuta
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {rejectTarget ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: "rgba(3,7,18,0.76)",
      backdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      padding: 14,
    }}
    onClick={() => {
      if (!savingId) setRejectTarget(null);
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 520,
        borderRadius: 28,
        padding: 18,
        color: "white",
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(3,7,18,0.98))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 26px 70px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 950 }}>
        Rifiuta richiesta
      </div>

      <div style={{ marginTop: 6, ...muted }}>
        Inserisci il motivo che verrà mostrato all’utente.
      </div>

      <textarea
        value={rejectionReason}
        onChange={(e) => setRejectionReason(e.target.value)}
        placeholder="Esempio: certificato medico non leggibile, carica un nuovo documento."
        style={{
          marginTop: 14,
          width: "100%",
          minHeight: 110,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.07)",
          color: "white",
          padding: 13,
          outline: "none",
          resize: "vertical",
          fontWeight: 700,
        }}
      />

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <button
          type="button"
          disabled={!!savingId}
          onClick={() => setRejectTarget(null)}
          style={secondaryBtn}
        >
          Annulla
        </button>

        <button
          type="button"
          disabled={!!savingId || !rejectionReason.trim()}
          onClick={() =>
            handleAction(rejectTarget.id, "reject", rejectionReason)
          }
          style={{
            ...rejectBtn,
            opacity: !!savingId || !rejectionReason.trim() ? 0.55 : 1,
          }}
        >
          Conferma rifiuto
        </button>
      </div>
    </div>
  </div>
) : null}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #030712 0%, #07111f 42%, #0f172a 100%)",
  padding: "24px 16px 44px",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 18,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.20)",
  backdropFilter: "blur(14px)",
};

const emptyStyle: React.CSSProperties = {
  borderRadius: 24,
  padding: 28,
  textAlign: "center",
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.58)",
  fontWeight: 750,
};

const muted: React.CSSProperties = {
  color: "rgba(255,255,255,0.58)",
  fontSize: 13,
  fontWeight: 650,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.09)",
  color: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 850,
};

const certBox: React.CSSProperties = {
  marginTop: 15,
  padding: 13,
  borderRadius: 20,
  background: "rgba(255,255,255,0.055)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const secondaryBtn: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  fontWeight: 850,
  fontSize: 13,
  padding: "0 14px",
};

const approveBtn: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: 0,
  background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
  color: "white",
  fontWeight: 950,
  fontSize: 14,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const rejectBtn: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: 0,
  background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
  color: "white",
  fontWeight: 950,
  fontSize: 14,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};