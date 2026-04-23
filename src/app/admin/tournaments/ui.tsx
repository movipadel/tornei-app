"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  Calendar,
  MapPin,
  Users,
  Download,
  Pencil,
  ChevronDown,
  Trophy,
  Trash2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  ImagePlus,
} from "lucide-react";

import TournamentDialogForm, { TournamentDTO } from "./_components/TournamentDialogForm";
import RegistrationForm from "./[id]/registrations/RegistrationForm";
import FixedPairsGenerateWizard, { FixedPairsPair } from "./FixedPairsGenerateWizard";
import ResponsiveSheetDialog from "@/components/base44/ResponsiveSheetDialog";
import {
  getBaraondaFormulaOptionsV2,
  getDefaultBaraondaFormulaV2,
} from "@/lib/baraonda-v2/public/ui-options";
import { getBaraondaCardPreview } from "@/lib/baraonda-v2/public/getBaraondaCardPreview";

type ApiListResponse = { data: TournamentDTO[] };

type RegRow = {
  id: string;
  tournament_id: string;
  position: number;
  is_reserve: boolean;
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: "M" | "F" | null;
  created_at?: string | null;
};

function typeLabel(type?: string | null) {
  const t = String(type ?? "");
  if (t === "Coppie fisse") return "Amatoriale Coppie fisse";
  if (t === "Baraonda") return "Baraonda";
  return t || "-";
}

function formatDt(dt?: string | null) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function catKey(category?: string | null) {
  const c = String(category ?? "libero").toLowerCase();
  if (["maschile", "femminile", "misto", "libero"].includes(c)) return c;
  return "libero";
}
function lvlKey(level?: string | null) {
  const l = String(level ?? "intermedio").toLowerCase();
  if (["principiante", "intermedio", "avanzato", "open"].includes(l)) return l;
  return "intermedio";
}
function capitalize(value?: string | null) {
  if (!value) return "-";
  const v = String(value).toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function GenderMark({ gender }: { gender: "M" | "F" | null }) {
  if (!gender) return null;
  const cls = gender === "M" ? "male" : "female";
  return (
    <span className={`base44-gender-mark ${cls}`} aria-label={gender === "M" ? "Uomo" : "Donna"}>
      {gender === "M" ? "♂" : "♀"}
    </span>
  );
}

function defaultBaraondaCourts(players: number) {
  // comportamento "Auto" (esteso a 3 campi)
  if (players >= 12) return 3;
  if (players >= 8) return 2;
  return 1;
}

function maxBaraondaCourtsSupported(players: number) {
  // limite fisico: ogni match usa 4 giocatori
  const physical = Math.floor(players / 4);
  // supporto richiesto: fino a 3 campi, ma almeno 1
  return Math.min(3, Math.max(1, physical));
}

export default function AdminTournamentsUI() {
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TournamentDTO | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [regsByTournament, setRegsByTournament] = useState<
    Record<string, { loading: boolean; main: RegRow[]; reserve: RegRow[] }>
  >({});

  const [startingById, setStartingById] = useState<Record<string, boolean>>({});
  const [posterLoadingById, setPosterLoadingById] = useState<Record<string, boolean>>({});
  // Baraonda courts preset: 0 = Auto, 1..3 = campi scelti
const [baraondaCourtsById, setBaraondaCourtsById] = useState<Record<string, number>>({});
const [baraondaFormulaById, setBaraondaFormulaById] = useState<
  Record<string, "snella" | "bilanciata" | "estesa" | "maratona" | "">
>({});

  // Fixed pairs wizard state
  const [fixedWizardOpen, setFixedWizardOpen] = useState(false);
  const [fixedWizardTid, setFixedWizardTid] = useState<string | null>(null);
  const [fixedWizardTournamentName, setFixedWizardTournamentName] = useState<string>("");
  const [fixedWizardPairs, setFixedWizardPairs] = useState<FixedPairsPair[]>([]);
  const [fixedWizardLoading, setFixedWizardLoading] = useState(false);

  // settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [homeTitle, setHomeTitle] = useState("");
  const [homeSubtitle, setHomeSubtitle] = useState("Iscriviti ai tornei Movi e gestisci le tue iscrizioni");
  const [homeLogoUrl, setHomeLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tournaments", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiListResponse> & { error?: string };
      if (!res.ok) throw new Error((json as any).error || "Errore caricamento");
      setItems(((json as any).data ?? []) as any[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  async function loadRegistrations(tournamentId: string) {
    setRegsByTournament((p) => ({
      ...p,
      [tournamentId]: {
        loading: true,
        main: p[tournamentId]?.main ?? [],
        reserve: p[tournamentId]?.reserve ?? [],
      },
    }));

    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/registrations`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento iscrizioni");

      setRegsByTournament((p) => ({
        ...p,
        [tournamentId]: {
          loading: false,
          main: (json.main ?? []) as RegRow[],
          reserve: (json.reserve ?? []) as RegRow[],
        },
      }));
    } catch (e: any) {
      setRegsByTournament((p) => ({
        ...p,
        [tournamentId]: { loading: false, main: [], reserve: [] },
      }));
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteTournament(id: string, name: string) {
    try {
      const res = await fetch(`/api/admin/tournaments/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore eliminazione");
      toast.success(`Torneo eliminato: ${name}`);
      setExpandedId((cur) => (cur === id ? null : cur));
      await loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteRegistration(tournamentId: string, regId: string) {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore eliminazione");
      toast.success("Iscrizione eliminata");
      await loadRegistrations(tournamentId);
      await loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function setReserveFlag(tournamentId: string, regId: string, is_reserve: boolean) {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_reserve }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore");
      toast.success(is_reserve ? "Spostato in riserva" : "Promosso in principale");
      await loadRegistrations(tournamentId);
      await loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function deleteAllRegistrations(tournamentId: string) {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/registrations`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore eliminazione");
      toast.success("Tutte le iscrizioni eliminate");
      await loadRegistrations(tournamentId);
      await loadList();
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  }

  async function createTournamentRunBaraonda(
  tournamentId: string,
  courts?: number,
  formula?: "snella" | "bilanciata" | "estesa" | "maratona" | ""
) {
  setStartingById((p) => ({ ...p, [tournamentId]: true }));
  try {
    const payload: Record<string, any> = {};
    if (courts) payload.courts = courts;
    if (formula) payload.formula = formula;

    const res = await fetch(`/api/admin/tournaments/${tournamentId}/run/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any).error || "Errore avvio torneo");

    toast.success("Torneo generato");
    router.push(`/admin/tournaments/${tournamentId}/run`);
  } catch (e: any) {
    toast.error(e?.message ?? "Errore");
  } finally {
    setStartingById((p) => ({ ...p, [tournamentId]: false }));
  }
}

  async function recreateTournamentRunBaraonda(
  tournamentId: string,
  courts?: number,
  formula?: "snella" | "bilanciata" | "estesa" | "maratona" | ""
) {
  setStartingById((p) => ({ ...p, [tournamentId]: true }));
  try {
    const r = await fetch(`/api/admin/tournaments/${tournamentId}/run/reset`, { method: "POST" });
    const rj = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((rj as any).error || "Errore reset torneo");

    const payload: Record<string, any> = {};
    if (courts) payload.courts = courts;
    if (formula) payload.formula = formula;

    const s = await fetch(`/api/admin/tournaments/${tournamentId}/run/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sj = await s.json().catch(() => ({}));
    if (!s.ok) throw new Error((sj as any).error || "Errore rigenerazione torneo");

    toast.success("Torneo rigenerato");
    router.push(`/admin/tournaments/${tournamentId}/run`);
  } catch (e: any) {
    toast.error(e?.message ?? "Errore");
  } finally {
    setStartingById((p) => ({ ...p, [tournamentId]: false }));
  }
}

async function reopenTournamentRegistrations(tournamentId: string) {
  setStartingById((p) => ({ ...p, [tournamentId]: true }));
  try {
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/run/reopen`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as any).error || "Errore riapertura iscrizioni");

    toast.success("Iscrizioni riaperte");
    await loadList(); // 🔥 fondamentale: fa tornare bottone blu
  } catch (e: any) {
    toast.error(e?.message ?? "Errore");
  } finally {
    setStartingById((p) => ({ ...p, [tournamentId]: false }));
  }
}

async function handlePosterMobile(tournamentId: string, tournamentName?: string | null) {
  try {
    setPosterLoadingById((p) => ({ ...p, [tournamentId]: true }));

    const res = await fetch(`/api/admin/tournaments/${tournamentId}/poster`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as any).error || "Errore generazione locandina");
    }

    const blob = await res.blob();

    const safeName = String(tournamentName ?? "locandina")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    const file = new File([blob], `locandina-${safeName || tournamentId}.png`, {
      type: "image/png",
    });

    const canNativeShare =
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      typeof (navigator as any).canShare === "function" &&
      (navigator as any).canShare({ files: [file] });

    if (canNativeShare) {
      await navigator.share({
        files: [file],
        title: "Locandina torneo",
      });
      return;
    }

    const previewUrl = `/api/admin/tournaments/${tournamentId}/poster?disposition=inline`;
    window.open(previewUrl, "_blank");
  } catch (e: any) {
    const previewUrl = `/api/admin/tournaments/${tournamentId}/poster?disposition=inline`;
    window.open(previewUrl, "_blank");
  } finally {
    setPosterLoadingById((p) => ({ ...p, [tournamentId]: false }));
  }
}
  async function openFixedPairsWizardFromServer(t: any, tid: string) {
    if (fixedWizardLoading) return;

    setFixedWizardLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tid}/registrations`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento iscrizioni");

      const main = (json.main ?? []) as RegRow[];

      const pairs: FixedPairsPair[] = main
        .filter((r) => !!r.p1_name && !!r.p2_name)
        .map((r) => ({
          id: r.id, // registration.id
          name: `${r.p1_name} / ${r.p2_name}`,
        }));

      if (pairs.length < 2) {
        throw new Error("Servono almeno 2 coppie complete (Giocatore 1 + Giocatore 2) in lista principale");
      }

      setFixedWizardTid(tid);
      setFixedWizardTournamentName(String(t?.name ?? "Torneo"));
      setFixedWizardPairs(pairs);
      setFixedWizardOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setFixedWizardLoading(false);
    }
  }

  async function resetTournamentRunFixedPairs(tournamentId: string) {
    setStartingById((p) => ({ ...p, [tournamentId]: true }));
    try {
      const r = await fetch(`/api/admin/tournaments/${tournamentId}/run/reset`, { method: "POST" });
      const rj = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(rj.error || "Errore reset torneo");
      toast.success("Reset completato");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore reset");
      throw e;
    } finally {
      setStartingById((p) => ({ ...p, [tournamentId]: false }));
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/app-settings", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore caricamento impostazioni");

      setHomeTitle(json.home_title ?? "");
      setHomeSubtitle(json.home_subtitle ?? "");
      setHomeLogoUrl(json.home_logo_url ?? null);
      setLogoFile(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      let url = homeLogoUrl;

      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);

        const up = await fetch("/api/admin/app-settings/logo", { method: "POST", body: fd });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upJson.error || "Errore upload logo");
        url = upJson.url;
      }

      const res = await fetch("/api/admin/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_title: homeTitle,
          home_subtitle: homeSubtitle,
          home_logo_url: url,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Errore salvataggio");

      toast.success("Impostazioni salvate");
      setHomeLogoUrl(url ?? null);
      setLogoFile(null);
      setSettingsOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ad = `${a.date ?? ""} ${a.time ?? ""}`;
      const bd = `${b.date ?? ""} ${b.time ?? ""}`;
      return ad.localeCompare(bd);
    });
  }, [items]);

  return (
    <>
      {/* Header */}
      <div className="base44-header">
        <div>
          <div
  className="base44-title"
  style={{
    fontSize: "clamp(18px, 5vw, 24px)",
    lineHeight: 1.1,
  }}
>

            <Trophy className="w-7 h-7" style={{ color: "#4f46e5" }} />
            Gestione Tornei
          </div>
          <div className="base44-subtitle hidden md:block">
  Crea e gestisci i tuoi tornei
</div>
{/* FAB mobile: Nuovo Torneo */}
<button
  type="button"
  onClick={() => {
    setSelected(null);
    setOpen(true);
  }}
  className="md:hidden"
  aria-label="Nuovo torneo"
  style={{
    position: "fixed",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    background: "#4f46e5",
    color: "#fff",
    fontSize: 28,
    fontWeight: 800,
    border: "none",
    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
    zIndex: 60,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }}
>
  +
</button>


        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
  className="base44-icon-btn"
  title="Personalizzazione"
  onClick={async () => {
    setSettingsOpen(true);
    await loadSettings();
  }}
>
  ⚙️
</button>


          <button
  className="base44-primary-btn hidden md:inline-flex"
  onClick={() => {
    setSelected(null);
    setOpen(true);
  }}
>
  + Nuovo Torneo
</button>

        </div>
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <div className="base44-card">
            <div className="base44-card-inner">Caricamento...</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="base44-card">
            <div className="base44-card-inner" style={{ textAlign: "center", padding: "48px 24px" }}>
              <Trophy className="w-12 h-12" style={{ margin: "0 auto 12px", color: "#cbd5e1" }} />
              <div style={{ color: "#64748b", fontWeight: 600 }}>Nessun torneo trovato</div>
              <div style={{ color: "#94a3b8", marginTop: 4 }}>Crea il tuo primo torneo</div>
            </div>
          </div>
        ) : (
          sorted.map((t) => {
            const tid = String((t as any).id ?? "");
            if (!tid) return null;

            const categoryLower = String(t.category ?? "").toLowerCase();
            const isMixedBaraonda = t.type === "Baraonda" && categoryLower === "misto";

            const counts = t.counts ?? { main: 0, reserve: 0, male: 0, female: 0 };
            const mainCount = counts.main ?? 0;
            const reserveCount = counts.reserve ?? 0;
            const maleCount = counts.male ?? 0;
            const femaleCount = counts.female ?? 0;

            const max = t.max_participants ?? 0;
            const maxPerGender = isMixedBaraonda ? Math.floor(max / 2) : 0;

            const isExpanded = expandedId === tid;
            const regsState = regsByTournament[tid];
            const regsLoading = regsState?.loading ?? false;
            const mainRegs = regsState?.main ?? [];
            const reserveRegs = regsState?.reserve ?? [];

            const typeLower = String(t.type ?? "").toLowerCase();
            const isBaraonda = typeLower === "baraonda";
            const isFixedPairs = typeLower === "coppie fisse";

            const MAX_BARAONDA_PLAYERS = 20;
            const canGenerateBaraonda = isBaraonda && mainCount >= 4 && mainCount <= MAX_BARAONDA_PLAYERS;
            const canGenerateFixedPairs = isFixedPairs && mainCount >= 2;
            const isStarting = !!startingById[tid];
            // 🔴 run già creato? (prova più possibili campi dal backend)
            const hasRun = Boolean((t as any).has_run);
            const isCircuit = Boolean((t as any).circuit_id);
            const isClosed = (t as any).run_status === "completed"; // temporaneo

            return (
              <div key={tid} className="base44-card">
                <Collapsible
                  open={isExpanded}
                  onOpenChange={(open) => {
                    const next = open ? tid : null;
                    setExpandedId(next);
                    if (open) loadRegistrations(tid);
                  }}
                >
                  <div className="base44-card-inner">
                    <div
  className="base44-row"
  style={{
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    flexDirection: "column", // ✅ mobile: colonna
  }}
>

                      <div
  style={{
    flex: 1,
    width: "100%",
  }}
>

  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
  <div className="base44-name">{t.name}</div>
  <span className={`base44-chip base44-chip-cat-${catKey(t.category)}`}>
    {capitalize(t.category)}
  </span>
  <span className={`base44-chip base44-chip-lvl-${lvlKey(t.level)}`}>
    {capitalize(t.level)}
  </span>
</div>

                        <div className="base44-meta">{typeLabel(t.type)}</div>

                        <div className="base44-divider hidden md:block" />


                        <div className="base44-info">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Calendar className="w-4 h-4" />
                            {t.date} - {t.time}
                          </span>

                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <MapPin className="w-4 h-4" />
                            {t.location ?? "-"}
                          </span>

                          {isMixedBaraonda ? (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      flexWrap: "wrap",
    }}
  >
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Users className="w-4 h-4" />
      ♂ {maleCount}/{maxPerGender}
    </span>

    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Users className="w-4 h-4" />
      ♀ {femaleCount}/{maxPerGender}
    </span>
  </div>
) : (

                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Users className="w-4 h-4" />
                              {mainCount}/{max} {t.type === "Coppie fisse" ? "coppie" : "iscritti"}
                            </span>
                          )}

                          {reserveCount > 0 && (
                            <span className="base44-chip" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }}>
                              +{reserveCount} {reserveCount === 1 ? "riserva" : "riserve"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
  className="base44-actions"
  style={{
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  }}
>

  {/* DESKTOP */}
  <div className="hidden md:flex items-center gap-2">
    <a
      className="base44-csv-btn"
      href={`/api/admin/tournaments/${tid}/registrations.csv`}
      target="_blank"
      rel="noreferrer"
    >
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Download className="w-4 h-4" />
        CSV
      </span>
    </a>

    <a
  className="base44-csv-btn"
  href={`/api/admin/tournaments/${tid}/poster`}
  target="_blank"
  rel="noreferrer"
>
  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
    <ImagePlus className="w-4 h-4" />
    Locandina
  </span>
</a>

    <button
      className="base44-icon-btn"
      title="Modifica"
      onClick={() => {
        setSelected(t);
        setOpen(true);
      }}
    >
      <Pencil className="w-4 h-4" />
    </button>

    <AlertDialog>
  <AlertDialogTrigger asChild>
    <button
      type="button"
      className="base44-icon-btn"
      title="Elimina"
      style={{ color: "#dc2626" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </AlertDialogTrigger>

  <AlertDialogContent
    onClick={(e) => e.stopPropagation()}
    style={{
      borderRadius: 18,
      padding: 20,
    }}
  >
    <AlertDialogHeader>
      <AlertDialogTitle style={{ fontWeight: 900, fontSize: 18 }}>
        Eliminare il torneo?
      </AlertDialogTitle>

      <AlertDialogDescription style={{ marginTop: 6 }}>
        Stai per eliminare <b>{t.name}</b>.
        <br />
        Questa azione non può essere annullata.
      </AlertDialogDescription>
    </AlertDialogHeader>

    <AlertDialogFooter
      style={{
        marginTop: 18,
        display: "flex",
        gap: 10,
        justifyContent: "flex-end",
      }}
    >
      <AlertDialogCancel asChild>
        <button
          className="base44-csv-btn"
          style={{
            padding: "10px 16px",
            borderRadius: 999,
          }}
        >
          Annulla
        </button>
      </AlertDialogCancel>

      <AlertDialogAction asChild>
        <button
          className="base44-primary-btn"
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            background: "#dc2626",
          }}
          onClick={(e) => {
  e.stopPropagation();

  if (isCircuit && !isClosed) {
    toast.error("Devi prima chiudere il torneo");
    return;
  }

  deleteTournament(tid, String(t.name ?? "Torneo"));
}}
        >
          Elimina torneo
        </button>
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>




    <CollapsibleTrigger asChild>
      <button className="base44-csv-btn">
        Iscrizioni
        <ChevronDown
          className="w-4 h-4 ml-1"
          style={{
            transition: "transform 150ms ease",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
    </CollapsibleTrigger>
  </div>
  </div>

  {/* MOBILE */}
  <div className="md:hidden flex items-center gap-2">
    <a
      href={`/api/admin/tournaments/${tid}/registrations.csv`}
      target="_blank"
      rel="noreferrer"
      className="base44-icon-btn"
      title="CSV"
    >
      <Download className="w-5 h-5" />
    </a>

    <button
  type="button"
  className="base44-icon-btn"
  title="Condividi o salva locandina"
  onClick={() => handlePosterMobile(tid, t.name)}
  disabled={!!posterLoadingById[tid]}
>
  {posterLoadingById[tid] ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : (
    <ImagePlus className="w-5 h-5" />
  )}
</button>

    <button
      className="base44-icon-btn"
      title="Modifica"
      onClick={() => {
        setSelected(t);
        setOpen(true);
      }}
    >
      <Pencil className="w-5 h-5" />
    </button>

   <AlertDialog>
  <AlertDialogTrigger asChild>
    <button
      type="button"
      className="base44-icon-btn"
      title="Elimina"
      style={{ color: "#dc2626" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Trash2 className="w-5 h-5" />
    </button>
  </AlertDialogTrigger>

  <AlertDialogContent
    onClick={(e) => e.stopPropagation()}
    style={{
      borderRadius: 18,
      padding: 20,
    }}
  >
    <AlertDialogHeader>
      <AlertDialogTitle style={{ fontWeight: 900, fontSize: 18 }}>
        Eliminare il torneo?
      </AlertDialogTitle>

      <AlertDialogDescription style={{ marginTop: 6 }}>
        Stai per eliminare <b>{t.name}</b>.
        <br />
        Questa azione non può essere annullata.
      </AlertDialogDescription>
    </AlertDialogHeader>

    <AlertDialogFooter
      style={{
        marginTop: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <AlertDialogCancel asChild>
        <button
          className="base44-csv-btn"
          style={{
            padding: "12px 16px",
            borderRadius: 999,
            width: "100%",
          }}
        >
          Annulla
        </button>
      </AlertDialogCancel>

      <AlertDialogAction asChild>
        <button
          className="base44-primary-btn"
          style={{
            padding: "12px 16px",
            borderRadius: 999,
            background: "#dc2626",
            width: "100%",
          }}
          onClick={(e) => {
  e.stopPropagation();

  if (isCircuit && !isClosed) {
    toast.error("Devi prima chiudere il torneo");
    return;
  }

  deleteTournament(tid, String(t.name ?? "Torneo"));
}}
        >
          Elimina torneo
        </button>
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>




    <CollapsibleTrigger asChild>
      <button className="base44-icon-btn" title="Iscrizioni">
        <Users className="w-5 h-5" />
        <ChevronDown
          className="w-4 h-4"
          style={{
            transition: "transform 150ms ease",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
    </CollapsibleTrigger>
  </div>
</div>


                    {/* Gestione torneo */}
                    {(isBaraonda || isFixedPairs) && (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                        <button
  className={hasRun ? "base44-primary-btn" : "base44-csv-btn"}
  onClick={() => router.push(`/admin/tournaments/${tid}/run`)}
  
  style={{
    padding: "8px 14px",
    borderRadius: 999,
    ...(hasRun
      ? {
          backgroundColor: "#4f46e5",
          borderColor: "#4f46e5",
        }
      : {}),
  }}
>
  Gestisci torneo
</button>

{isCircuit && hasRun && !isClosed && (
  <button
    className="base44-primary-btn"
    style={{
      padding: "8px 14px",
      borderRadius: 999,
      backgroundColor: "#dc2626",
      borderColor: "#dc2626",
    }}
    onClick={async () => {
      if (!confirm("Chiudere il torneo? Operazione definitiva")) return;

      try {
        const res = await fetch(`/api/admin/tournaments/${tid}/run/close`, {
          method: "POST",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(json.error || "Errore chiusura");

        toast.success("Torneo chiuso");
        await loadList();
      } catch (e: any) {
        toast.error(e?.message || "Errore");
      }
    }}
  >
    Chiudi torneo
  </button>
)}

                        {/* Baraonda */}
                        {isBaraonda && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="base44-primary-btn"
                                disabled={!canGenerateBaraonda || isStarting}
                                style={{
                                 padding: "8px 14px",
                                 borderRadius: 999,
                                 opacity: !canGenerateBaraonda || isStarting ? 0.6 : 1,
                                 cursor: !canGenerateBaraonda || isStarting ? "not-allowed" : "pointer",

                                 // 🔥 FORZA COLORE
                                 backgroundColor: hasRun ? "#dc2626" : "#4f46e5",
                                 borderColor: hasRun ? "#dc2626" : "#4f46e5",
                               }}
                                title={
                                 mainCount < 4
                                 ? "Servono almeno 4 iscritti in lista principale"
                                 : mainCount > MAX_BARAONDA_PLAYERS
                                 ? `Massimo ${MAX_BARAONDA_PLAYERS} iscritti per Baraonda`
                                 : "Genera il torneo"
                               }
                              >
                                {isStarting ? "..." : hasRun ? "Modifica torneo" : "Genera torneo"}
                              </button>
                            </AlertDialogTrigger>

                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Generare il torneo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Puoi creare il torneo (se non esiste) oppure ricrearlo cancellando lo storico dello sviluppo.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                             {(() => {
  const selectedCourts = baraondaCourtsById[tid] ?? 0; // 0 = Auto
  const maxCourts = canGenerateBaraonda ? maxBaraondaCourtsSupported(mainCount) : 1;
  const autoCourts = defaultBaraondaCourts(mainCount);
  const effectiveCourts = selectedCourts === 0 ? autoCourts : selectedCourts;
    const formulaOptions = getBaraondaFormulaOptionsV2({
    players: mainCount,
    category: String(t.category ?? "libero").toLowerCase(),
  });
  const categoryLower = String(t.category ?? "libero").toLowerCase();
const isProtectedNonMistoCase = categoryLower !== "misto" && mainCount <= 10;
const isProtectedMistoCase = categoryLower === "misto" && mainCount <= 12;
const isProtectedCase = isProtectedNonMistoCase || isProtectedMistoCase;

const hasSelectableProtectedFormula =
  categoryLower !== "misto" && [6, 7, 8, 9, 10].includes(mainCount);

const showFormulaSelector =
  !isProtectedCase || hasSelectableProtectedFormula;
  const defaultFormula = getDefaultBaraondaFormulaV2({
  players: mainCount,
  category: String(t.category ?? "libero").toLowerCase(),
});

const rawSelectedFormula = baraondaFormulaById[tid] || defaultFormula;

const selectedFormula = formulaOptions.some((o) => o.value === rawSelectedFormula)
  ? rawSelectedFormula
  : defaultFormula;
  const selectedFormulaOption = formulaOptions.find((o) => o.value === selectedFormula) ?? null;
  const preview = getBaraondaCardPreview({
  players: mainCount,
  category: categoryLower,
  formula: selectedFormula,
  maxCourts: effectiveCourts,
});

  const optionStyle = (active: boolean) => ({
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: active ? "#eef2ff" : "white",
    color: active ? "#3730a3" : "#0f172a",
    fontWeight: 800 as const,
    cursor: "pointer",
  });

  const disabledStyle = {
    opacity: 0.45,
    cursor: "not-allowed",
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8, color: "#0f172a" }}>Campi</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
  type="button"
  className="base44-csv-btn"
  style={{
    ...optionStyle(selectedCourts === 0),
    ...(!canGenerateBaraonda ? { opacity: 0.45, cursor: "not-allowed" } : null),
  }}
  disabled={!canGenerateBaraonda}
  onClick={() => {
    if (!canGenerateBaraonda) return;
    setBaraondaCourtsById((p) => ({ ...p, [tid]: 0 }));
  }}
  title={
    !canGenerateBaraonda
      ? mainCount < 4
        ? "Servono almeno 4 iscritti in lista principale"
        : mainCount > MAX_BARAONDA_PLAYERS
        ? `Massimo ${MAX_BARAONDA_PLAYERS} iscritti per Baraonda`
        : "Non disponibile"
      : "Selezione automatica in base agli iscritti"
  }
>
  Auto
</button>

        {[1, 2, 3].map((c) => {
          const disabled = c > maxCourts;
          const active = selectedCourts === c;

          return (
            <button
              key={c}
              type="button"
              className="base44-csv-btn"
              style={{
                ...optionStyle(active),
                ...(disabled ? (disabledStyle as any) : null),
              }}
              disabled={!canGenerateBaraonda || disabled}
              onClick={() => {
                if (!canGenerateBaraonda) return;
                if (c > maxCourts) return;
                setBaraondaCourtsById((p) => ({ ...p, [tid]: c }));
              }}
              title={
  !canGenerateBaraonda
    ? "Servono almeno 4 iscritti in lista principale"
    : c > maxCourts
    ? `Con ${mainCount} iscritti massimo ${maxCourts} campi`
    : `${c} ${c === 1 ? "campo" : "campi"}`
}
            >
              {c} {c === 1 ? "campo" : "campi"}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#64748b", lineHeight: 1.3 }}>
        Iscritti: <b>{mainCount}</b> · Max campi possibili: <b>{maxCourts}</b> · Scelta:{" "}
        <b>{selectedCourts === 0 ? `Auto (${autoCourts})` : selectedCourts}</b> · Partite/turno: <b>{effectiveCourts}</b>
      </div>
            {showFormulaSelector && formulaOptions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8, color: "#0f172a" }}>Formula</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {formulaOptions.map((opt) => {
              const active = selectedFormula === opt.value;

              return (
                <button
                  key={opt.value}
                  type="button"
                  className="base44-csv-btn"
                  style={{
                    ...optionStyle(active),
                    minWidth: 120,
                  }}
                  disabled={!canGenerateBaraonda}
                  onClick={() => {
                    if (!canGenerateBaraonda) return;
                    setBaraondaFormulaById((p) => ({ ...p, [tid]: opt.value }));
                  }}
                  title={`${opt.matchesPerPlayer} partite a testa · ${opt.totalMatches} match totali`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          
        </div>
      )}
      
               {preview ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            color: "#0f172a",
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4 }}>
            Riepilogo generazione
          </div>

          <div>
            Formula <b>{preview.formulaLabel}</b> ·{" "}
            <b>{preview.matchesPerPlayer}</b> partite a testa ·{" "}
            <b>{preview.totalMatches}</b> match totali ·{" "}
            <b>{preview.totalTurns}</b> turni
          </div>

          <div style={{ marginTop: 4, color: "#334155" }}>
            Campi disponibili: <b>{preview.maxCourts}</b>
          </div>

          {!preview.ok && (
            <div style={{ marginTop: 6, color: "#b91c1c", fontWeight: 700 }}>
              ⚠️ {preview.validationSummary}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
})()}

 <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
  <button
    className="base44-primary-btn"
    style={{
      width: "100%",
      padding: "12px 14px",
      borderRadius: 14,
      backgroundColor: hasRun ? "#dc2626" : "#4f46e5",
      borderColor: hasRun ? "#dc2626" : "#4f46e5",
    }}
        onClick={() => {
  const selectedCourts = baraondaCourtsById[tid] ?? 0;
  const courts = selectedCourts === 0 ? undefined : selectedCourts;

  const categoryLower = String(t.category ?? "libero").toLowerCase();
  const isProtectedNonMistoCase = categoryLower !== "misto" && mainCount <= 10;
  const isProtectedMistoCase = categoryLower === "misto" && mainCount <= 12;
  const isProtectedCase = isProtectedNonMistoCase || isProtectedMistoCase;

  const hasSelectableProtectedFormula =
    categoryLower !== "misto" && [6, 7, 8, 9, 10].includes(mainCount);

  const formula =
    (!isProtectedCase || hasSelectableProtectedFormula)
      ? (
          baraondaFormulaById[tid] ||
          getDefaultBaraondaFormulaV2({
            players: mainCount,
            category: categoryLower,
          })
        )
      : "";

  if (hasRun) {
    recreateTournamentRunBaraonda(tid, courts, formula);
  } else {
    createTournamentRunBaraonda(tid, courts, formula);
  }
}}
    disabled={!canGenerateBaraonda || isStarting}
  >
    {hasRun ? "Rigenera torneo" : "Genera torneo"}
  </button>

  {hasRun && (
  <AlertDialogAction asChild>
    <button
      className="base44-csv-btn"
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 14,
        borderColor: "#93c5fd",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 900,
      }}
      onClick={async () => {
        await reopenTournamentRegistrations(tid);
      }}
      disabled={isStarting}
    >
      Riapri iscrizioni
    </button>
  </AlertDialogAction>
)}

  <AlertDialogCancel asChild>
    <button className="base44-csv-btn" style={{ width: "100%", padding: "12px 14px", borderRadius: 14 }}>
      Annulla
    </button>
  </AlertDialogCancel>
</div>

                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {/* Coppie fisse */}
                        {isFixedPairs && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="base44-primary-btn"
                                disabled={!canGenerateFixedPairs || fixedWizardLoading || isStarting}
                                style={{
                                  padding: "8px 14px",
                                  borderRadius: 999,
                                  opacity: !canGenerateFixedPairs || fixedWizardLoading || isStarting ? 0.6 : 1,
                                  cursor: !canGenerateFixedPairs || fixedWizardLoading || isStarting ? "not-allowed" : "pointer",
                                  backgroundColor: hasRun ? "#dc2626" : "#4f46e5",
                                  borderColor: hasRun ? "#dc2626" : "#4f46e5",
                                }}
                                title={
                                !canGenerateFixedPairs
                                ? "Servono almeno 2 coppie in lista principale"
                                : hasRun
                                ? "Rigenera il torneo (reset + configura di nuovo)"
                                : "Configura e genera il torneo"
                              }
                              >
                                {fixedWizardLoading || isStarting ? "..." : hasRun ? "Modifica torneo" : "Genera torneo"}
                              </button>
                            </AlertDialogTrigger>

                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{hasRun ? "Rigenerare il torneo (Coppie fisse)?" : "Generare il torneo (Coppie fisse)?"}</AlertDialogTitle>
                                <AlertDialogDescription>
                                 {hasRun
                                 ? "Rigenerando verrà fatto reset dello sviluppo attuale e poi potrai configurare e creare di nuovo."
                                 : "Puoi configurare e creare il torneo."}
                               </AlertDialogDescription>
                              </AlertDialogHeader>

                              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
  <button
    className="base44-primary-btn"
    style={{
      width: "100%",
      padding: "12px 14px",
      borderRadius: 14,
      backgroundColor: hasRun ? "#dc2626" : "#4f46e5",
      borderColor: hasRun ? "#dc2626" : "#4f46e5",
    }}
    onClick={async () => {
      try {
        if (hasRun) {
          await resetTournamentRunFixedPairs(tid);
        }
        await openFixedPairsWizardFromServer(t, tid);
      } catch {
        // già gestito dai toast
      }
    }}
    disabled={!canGenerateFixedPairs || fixedWizardLoading || isStarting}
  >
    {hasRun ? "Rigenera torneo" : "Configura e crea"}
  </button>

  {hasRun && (
  <AlertDialogAction asChild>
    <button
      className="base44-csv-btn"
      style={{
        width: "100%",
        padding: "12px 14px",
        borderRadius: 14,
        borderColor: "#93c5fd",
        background: "#eff6ff",
        color: "#1d4ed8",
        fontWeight: 900,
      }}
      onClick={async () => {
        await reopenTournamentRegistrations(tid);
      }}
      disabled={isStarting}
    >
      Riapri iscrizioni
    </button>
  </AlertDialogAction>
)}

  <AlertDialogCancel asChild>
    <button className="base44-csv-btn" style={{ width: "100%", padding: "12px 14px", borderRadius: 14 }}>
      Annulla
    </button>
  </AlertDialogCancel>
</div>

                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ✅ QUI è dove deve stare tutta la gestione iscrizioni */}
                  <CollapsibleContent>
                    <div className="base44-collapsible">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, color: "#334155" }}>Iscrizioni ({mainRegs.length})</div>

                        {(mainRegs.length > 0 || reserveRegs.length > 0) && !regsLoading && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="base44-csv-btn" style={{ color: "#dc2626" }}>
                                Elimina tutte
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare tutte le iscrizioni?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Questa azione eliminerà tutte le iscrizioni (principali + riserve) del torneo <b>{t.name}</b>. Non può essere annullata.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteAllRegistrations(tid)}>
                                  Elimina tutte
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>

                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, background: "#f8fafc", padding: 14, marginBottom: 14 }}>
                        <RegistrationForm
                          tournamentId={tid}
                          tournamentType={t.type}
                          onCreated={async () => {
                            await loadRegistrations(tid);
                            await loadList();
                          }}
                        />
                      </div>

                      {regsLoading ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b" }}>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Caricamento iscrizioni...
                        </div>
                      ) : (
                        <>
                          {mainRegs.length === 0 ? (
                            <div style={{ color: "#64748b" }}>Nessuna iscrizione per questo torneo</div>
                          ) : (
                            <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", background: "white" }}>
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-slate-50">
                                    <TableHead>#</TableHead>
                                    <TableHead>Giocatore 1</TableHead>
                                    <TableHead>Telefono</TableHead>
                                    <TableHead>Giocatore 2</TableHead>
                                    <TableHead>Telefono</TableHead>
                                    <TableHead>Data</TableHead>
                                    <TableHead className="text-right">Azioni</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {mainRegs.map((r, idx) => (
                                    <TableRow key={r.id}>
                                      <TableCell>{idx + 1}</TableCell>
                                      <TableCell>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                          <span className="base44-player-name">{r.p1_name}</span>
                                        <GenderMark gender={r.p1_gender} />

                                        </div>
                                      </TableCell>
                                      <TableCell>{r.p1_phone}</TableCell>
                                      <TableCell>
                                        {r.p2_name ? (
                                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <span className="base44-player-name">{r.p2_name}</span>
                                          <GenderMark gender={r.p2_gender} />
                                          </div>
                                        ) : (
                                          "-"
                                        )}
                                      </TableCell>
                                      <TableCell>{r.p2_phone ?? "-"}</TableCell>
                                      <TableCell>{formatDt(r.created_at)}</TableCell>
                                      <TableCell className="text-right">
                                        <button className="base44-icon-btn" title="Metti in riserva" onClick={() => setReserveFlag(tid, r.id, true)}>
                                          <ArrowDownRight className="w-4 h-4" />
                                        </button>

                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <button className="base44-icon-btn" title="Elimina" style={{ color: "#dc2626", marginLeft: 6 }}>
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Eliminare l&apos;iscrizione?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Stai per eliminare l&apos;iscrizione di <b>{r.p1_name}</b>. Questa azione non può essere annullata.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                                              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteRegistration(tid, r.id)}>
                                                Elimina
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          {reserveRegs.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <div style={{ fontWeight: 700, color: "#b45309" }}>Lista Riserva ({reserveRegs.length})</div>
                              </div>

                              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", borderRadius: 14, padding: 10, marginBottom: 10 }}>
                                Le riserve subentrano automaticamente in ordine di iscrizione quando qualcuno si cancella.
                              </div>

                              <div style={{ border: "1px solid #fde68a", borderRadius: 14, overflow: "hidden", background: "white" }}>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-amber-50">
                                      <TableHead>#</TableHead>
                                      <TableHead>Giocatore 1</TableHead>
                                      <TableHead>Telefono</TableHead>
                                      <TableHead>Giocatore 2</TableHead>
                                      <TableHead>Telefono</TableHead>
                                      <TableHead>Data</TableHead>
                                      <TableHead className="text-right">Azioni</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {reserveRegs.map((r, idx) => (
                                      <TableRow key={r.id}>
                                        <TableCell>{idx + 1}</TableCell>
                                        <TableCell>
                                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <span className="base44-player-name">{r.p1_name}</span>
                                          <GenderMark gender={r.p1_gender} />
                                          </div>
                                        </TableCell>
                                        <TableCell>{r.p1_phone}</TableCell>
                                        <TableCell>
                                          {r.p2_name ? (
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                              <span className="base44-player-name">{r.p2_name}</span>
                                            <GenderMark gender={r.p2_gender} />
                                            </div>
                                          ) : (
                                            "-"
                                          )}
                                        </TableCell>
                                        <TableCell>{r.p2_phone ?? "-"}</TableCell>
                                        <TableCell>{formatDt(r.created_at)}</TableCell>
                                        <TableCell className="text-right">
                                          <button className="base44-icon-btn" title="Promuovi" onClick={() => setReserveFlag(tid, r.id, false)}>
                                            <ArrowUpRight className="w-4 h-4" />
                                          </button>

                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <button className="base44-icon-btn" title="Elimina" style={{ color: "#dc2626", marginLeft: 6 }}>
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Eliminare l&apos;iscrizione?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Stai per eliminare l&apos;iscrizione di <b>{r.p1_name}</b> (riserva). Questa azione non può essere annullata.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteRegistration(tid, r.id)}>
                                                  Elimina
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })
        )}
      </div>

      {/* Wizard Coppie Fisse */}
      <FixedPairsGenerateWizard
        open={fixedWizardOpen}
        onOpenChange={setFixedWizardOpen}
        tournamentId={fixedWizardTid}
        tournamentName={fixedWizardTournamentName}
        pairs={fixedWizardPairs}
        onGenerated={(tournamentId) => {
          setFixedWizardOpen(false);
          toast.success("Torneo generato");
          router.push(`/admin/tournaments/${tournamentId}/run`);
        }}
      />

      {/* Dialog tornei */}
      <TournamentDialogForm open={open} onClose={() => setOpen(false)} tournament={selected} onSaved={loadList} />

      {/* Dialog personalizzazione (mobile sheet + footer sticky) */}
<ResponsiveSheetDialog
  open={settingsOpen}
  onOpenChange={setSettingsOpen}
  title="Personalizzazione Home Page"
  footer={
    <div className="flex gap-3">
      <button className="base44-csv-btn" style={{ flex: 1 }} onClick={() => setSettingsOpen(false)}>
        Annulla
      </button>
      <button
        className="base44-primary-btn"
        style={{ flex: 1, opacity: settingsSaving ? 0.7 : 1 }}
        onClick={saveSettings}
        disabled={settingsSaving}
      >
        {settingsSaving ? "Salvataggio..." : "Salva"}
      </button>
    </div>
  }
>
  {settingsLoading ? (
    <div style={{ color: "#64748b" }}>Caricamento...</div>
  ) : (
    <>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Titolo</div>
        <input
          value={homeTitle}
          onChange={(e) => setHomeTitle(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            outline: "none",
            fontSize: 16, // extra safety (iOS)
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Sottotitolo</div>
        <textarea
          value={homeSubtitle}
          onChange={(e) => setHomeSubtitle(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            outline: "none",
            resize: "vertical",
            fontSize: 16, // extra safety (iOS)
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Logo (opzionale)</div>

        {homeLogoUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={homeLogoUrl}
              alt="Logo"
              style={{
                width: 64,
                height: 64,
                objectFit: "contain",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
              }}
            />
            <button
              className="base44-csv-btn"
              onClick={() => {
                setHomeLogoUrl(null);
                setLogoFile(null);
              }}
              style={{ color: "#dc2626" }}
            >
              Rimuovi
            </button>
          </div>
        ) : null}

        <input
          type="file"
          accept="image/*"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          style={{ marginTop: 10, fontSize: 16 }}
        />

        {logoFile ? (
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
            Selezionato: <b>{logoFile.name}</b>
          </div>
        ) : null}
      </div>
    </>
  )}
</ResponsiveSheetDialog>

    </>
  );
}
