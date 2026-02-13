import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";

import RunClient from "./RunClient";
import FixedPairsRunClient from "./FixedPairsRunClient";

export const runtime = "nodejs";

type RunApiOk =
  | {
      tournamentId: string;
      runId: string | null;
      mode: "baraonda";
      status: string | null;
      started_at: string | null;
      turns: any[];
      rules?: any;
    }
  | {
      tournamentId: string;
      runId: string | null;
      mode: "fixed_pairs";
      status: string | null;
      started_at: string | null;
      rules: any;
      groups: any[];
      matches_fp: any[];
      standingsByGroup: Record<string, any[]>;
    };

function originFromHeaders(h: Headers) {
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "";
}

function cookieHeaderFromCookies(c: Awaited<ReturnType<typeof cookies>>) {
  return c
    .getAll()
    .map((x) => `${x.name}=${x.value}`)
    .join("; ");
}

async function getRunData(
  tournamentId: string,
  cookieHeader?: string
): Promise<
  | { ok: true; status: number; data: RunApiOk }
  | { ok: false; status: number; error: string }
> {
  const h = await headers();
  const origin = originFromHeaders(h);

  const res = await fetch(`${origin}/api/admin/tournaments/${tournamentId}/run`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  const json = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      (res.status === 401 || res.status === 403 ? "Non autorizzato" : "Errore caricamento");
    return { ok: false, status: res.status, error: String(msg) };
  }

  return { ok: true, status: res.status, data: json as RunApiOk };
}

async function fetchTournamentName(tournamentId: string, cookieHeader?: string): Promise<string | null> {
  try {
    const h = await headers();
    const origin = originFromHeaders(h);

    const res = await fetch(`${origin}/api/admin/tournaments/${tournamentId}`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) return null;

    return (json?.tournament?.name ?? json?.name ?? json?.data?.name ?? null) as string | null;
  } catch {
    return null;
  }
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) notFound();

  // Cookie header (admin session)
  const c = await cookies();
  const cookieHeader = cookieHeaderFromCookies(c);

  // 🔥 prendiamo sia i dati run che il nome torneo
  const [result, tournamentName] = await Promise.all([
    getRunData(id, cookieHeader),
    fetchTournamentName(id, cookieHeader),
  ]);

  if (!result.ok && (result.status === 401 || result.status === 403)) {
    return (
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Non autorizzato</div>
          <div style={{ color: "#64748b" }}>La sessione admin non è valida dopo il refresh.</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="base44-primary-btn" href="/admin" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 999 }}>
              Vai al login / Admin
            </a>
            <a className="base44-csv-btn" href="/admin/tournaments" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 999 }}>
              Torna ai tornei
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!result.ok && result.status === 404) notFound();

  if (!result.ok) {
    return (
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Errore</div>
          <div style={{ color: "#dc2626", fontWeight: 600 }}>{result.error}</div>

          <a className="base44-csv-btn" href="/admin/tournaments" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 999 }}>
            Torna ai tornei
          </a>
        </div>
      </div>
    );
  }

  const data = result.data;

  if (!data.runId) {
    return (
      <div className="base44-card">
        <div className="base44-card-inner" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Nessun torneo generato</div>
          <div style={{ color: "#64748b" }}>
            Per questo torneo non esiste ancora uno sviluppo. Torna alla lista e clicca “Genera torneo”.
          </div>

          <a className="base44-primary-btn" href="/admin/tournaments" style={{ width: "fit-content", padding: "10px 14px", borderRadius: 999 }}>
            Torna ai tornei
          </a>
        </div>
      </div>
    );
  }

  // ✅ Coppie fisse
  if (data.mode === "fixed_pairs") {
    return <FixedPairsRunClient initialData={data as any} tournamentName={tournamentName ?? undefined} />;
  }

  // ✅ default Baraonda
  return <RunClient initialData={data as any} tournamentName={tournamentName ?? undefined} />;
}
