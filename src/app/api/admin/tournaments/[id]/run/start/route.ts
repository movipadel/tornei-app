import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateBaraondaScheduleSwitch } from "@/lib/baraonda/generateScheduleSwitch";
import { guardAdmin } from "@/lib/adminGuard";
import {
  getBaraondaOptions,
  getRecommendedBaraondaOption,
  type BaraondaFormulaLabel,
} from "@/lib/baraonda/options";

export const runtime = "nodejs";

type RegRow = {
  p1_name: string;
  p1_phone: string;
  p1_gender: "M" | "F" | null;
  is_reserve: boolean;
};

type TournamentRow = {
  id: string;
  type: string | null;
  category: string | null;
  max_participants: number | null;
};

type ParticipantRow = { id: string; name: string; sex: "m" | "f" };
type BaraondaEngine = "legacy" | "v2";

function resolveBaraondaEngine(_rules: any): BaraondaEngine {
  return "legacy";
}

function toSex(g: "M" | "F" | null): "m" | "f" {
  return g === "F" ? "f" : "m";
}

function mapCategory(raw: string | null | undefined) {
  const cat = String(raw ?? "libero").toLowerCase();
  if (cat === "misto") return "misto";
  if (cat === "maschile") return "maschile";
  if (cat === "femminile") return "femminile";
  return "libero";
}

function computeTurns(players: number) {
  // preset turni
  if (players === 10) return 10; // ✅ FULL equo: 8 match/player con 2 campi
  if (players === 9) return 9;
  if (players === 8) return 7;
  if (players === 7) return 7;
  if (players === 6) return 6;
  if (players === 5) return 5;
  if (players === 4) return 3;
  return players;
}

function resolveProtectedFormula(
  players: number,
  category: string,
  matchesPerPlayer: number
): BaraondaFormulaLabel {
  if (category === "misto") {
    if (players === 10 && matchesPerPlayer === 6) return "bilanciata";
    if (players === 12 && matchesPerPlayer === 6) return "bilanciata";
  } else {
    if (players === 4 && matchesPerPlayer === 3) return "snella";
    if (players === 5 && matchesPerPlayer === 4) return "snella";
    if (players === 6 && matchesPerPlayer === 4) return "snella";
    if (players === 6 && matchesPerPlayer === 6) return "estesa";
    if (players === 7 && matchesPerPlayer === 4) return "snella";
    if (players === 7 && matchesPerPlayer === 8) return "estesa";
    if (players === 8 && matchesPerPlayer === 4) return "snella";
    if (players === 8 && matchesPerPlayer === 7) return "maratona";
    if (players === 9 && matchesPerPlayer === 4) return "snella";
    if (players === 9 && matchesPerPlayer === 8) return "maratona";
    if (players === 10 && matchesPerPlayer === 4) return "snella";
    if (players === 10 && matchesPerPlayer === 8) return "estesa";
  }

  throw new Error(
    `Formula protetta non risolvibile per category=${category}, players=${players}, matchesPerPlayer=${matchesPerPlayer}`
  );
}

async function ensureScheduleForRun(sb: ReturnType<typeof supabaseAdmin>, runId: string, rules: any) {
  // participants
  const { data: participants, error: perr } = await sb
    .from("tournament_run_participants")
    .select("id,name,sex")
    .eq("run_id", runId);

  if (perr) throw new Error(perr.message);

  const plist = (participants ?? []) as ParticipantRow[];
  if (plist.length < 4) throw new Error("Partecipanti insufficienti nella run");

  const schedule = generateBaraondaScheduleSwitch(plist as any, rules, {
  engine: resolveBaraondaEngine(rules),
});

  // 1) TURNI idempotente (serve vincolo unico run_id+turn_number)
  const turnsPayload = schedule.map((t) => ({
    run_id: runId,
    turn_number: t.turnNumber,
  }));

  const { error: upTurnErr } = await sb
    .from("tournament_run_turns")
    .upsert(turnsPayload, { onConflict: "run_id,turn_number", ignoreDuplicates: true });

  if (upTurnErr) throw new Error(upTurnErr.message);

  // 2) leggi turni per avere gli id
  const { data: turnRows, error: trErr } = await sb
    .from("tournament_run_turns")
    .select("id,turn_number")
    .eq("run_id", runId);

  if (trErr) throw new Error(trErr.message);

  const turnIdByNumber = new Map<number, string>((turnRows ?? []).map((tr: any) => [tr.turn_number, tr.id]));

  // 3) MATCH idempotente
  // ⚠️ consigliato: unique(turn_id, match_number) su tournament_run_matches
  const matchesPayload = schedule.flatMap((tnr) => {
    const turnId = turnIdByNumber.get(tnr.turnNumber);
    if (!turnId) return [];

    return tnr.matches.map((m) => ({
      turn_id: turnId,
      match_number: m.matchNumber,
      p1_id: m.players[0].id,
      p2_id: m.players[1].id,
      p3_id: m.players[2].id,
      p4_id: m.players[3].id,
    }));
  });

  if (matchesPayload.length) {
    const { error: upMatchErr } = await sb
      .from("tournament_run_matches")
      .upsert(matchesPayload, { onConflict: "turn_id,match_number", ignoreDuplicates: true });

    if (upMatchErr) throw new Error(upMatchErr.message);
  }

  return { scheduleTurns: schedule.length };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  const sb = supabaseAdmin();

  try {
    // 1) torneo (serve type/category)
    const { data: t, error: terr } = await sb
      .from("tournaments")
      .select("id,type,category,max_participants")
      .eq("id", tournamentId)
      .single();

    if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tr = t as TournamentRow;

    if (String(tr.type) !== "Baraonda") {
      return NextResponse.json({ error: "Torneo non supportato (solo Baraonda)" }, { status: 400 });
    }

    // 2) se esiste già una run attiva, riusa MA assicurati che schedule esista
    const { data: existingRun, error: exErr } = await sb
      .from("tournament_runs")
      .select("id,status,created_at,rules")
      .eq("tournament_id", tournamentId)
      .in("status", ["locked", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    if (existingRun?.id) {
      const runId = String(existingRun.id);
      const rules = (existingRun as any).rules ?? null;
      if (!rules) return NextResponse.json({ error: "Run esistente senza rules" }, { status: 500 });

      // se i turni già ci sono, ok; se mancano, li rigenero idempotente
      const { data: anyTurn, error: tchkErr } = await sb
        .from("tournament_run_turns")
        .select("id")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle();

      if (tchkErr) return NextResponse.json({ error: tchkErr.message }, { status: 500 });

      if (!anyTurn?.id) {
        await ensureScheduleForRun(sb, runId, rules);
      }

      // assicurati che sia running
      if ((existingRun as any).status !== "running") {
        const { error: uerr } = await sb
          .from("tournament_runs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", runId);
        if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });
      }

            // 🔒 chiudi iscrizioni quando c'è una run attiva
      const { error: closeErr } = await sb
        .from("tournaments")
        .update({ registrations_open: false })
        .eq("id", tournamentId);

      if (closeErr) {
        return NextResponse.json({ error: closeErr.message }, { status: 500 });
      }

      return NextResponse.json({ tournamentId, runId, reused: true });
    }

    // 3) iscritti principali (no riserve)
    const { data: regs, error: rerr } = await sb
      .from("tournament_registrations")
      .select("p1_name,p1_phone,p1_gender,is_reserve")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", false);

    if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

    const main = (regs ?? []) as RegRow[];

    const MAX_BARAONDA_SUPPORTED = 20;

if (main.length < 4)
  return NextResponse.json({ error: "Minimo 4 partecipanti in lista principale" }, { status: 400 });

if (main.length > MAX_BARAONDA_SUPPORTED)
  return NextResponse.json(
    { error: `Baraonda supportata da 4 a ${MAX_BARAONDA_SUPPORTED} partecipanti` },
    { status: 400 }
  );
   const players = main.length;
const category = mapCategory(tr.category);

const body = await req.json().catch(() => ({} as any));
const requestedCourtsRaw = Number((body as any)?.courts);
const requestedFormula = String((body as any)?.formula ?? "").toLowerCase() as BaraondaFormulaLabel | "";
const requestedEngine: BaraondaEngine = "legacy";
const maxCourtsAvailable = Number.isFinite(requestedCourtsRaw) && requestedCourtsRaw >= 1
  ? Math.min(requestedCourtsRaw, Math.floor(players / 4))
  : Math.min(players >= 12 ? 3 : players >= 8 ? 2 : 1, Math.floor(players / 4));

if (maxCourtsAvailable < 1) {
  return NextResponse.json({ error: "Campi non validi per il numero di partecipanti" }, { status: 400 });
}

// ✅ MISTO: numero pari + M/F uguali
if (category === "misto") {
  if (players % 2 !== 0) {
    return NextResponse.json(
      { error: "Baraonda misto richiede un numero pari di partecipanti" },
      { status: 400 }
    );
  }

  const males = main.filter((r) => r.p1_gender === "M").length;
  const females = main.filter((r) => r.p1_gender === "F").length;

  if (males !== females) {
    return NextResponse.json(
      { error: `Baraonda misto richiede stesso numero di uomini e donne (M=${males}, F=${females})` },
      { status: 400 }
    );
  }
}

const isProtectedNonMisto = category !== "misto" && players <= 10;
const isProtectedMisto = category === "misto" && players <= 12;
const isProtectedCase = isProtectedNonMisto || isProtectedMisto;

function computeTurnsFixed(players: number, matchesPerTurn: number, matchesPerPlayer: number) {
  const totalSlots = players * matchesPerPlayer;
  const denom = matchesPerTurn * 4;
  if (totalSlots % denom !== 0) {
    throw new Error(
      `Regole non eque: N(${players})*mpp(${matchesPerPlayer})=${totalSlots} non divisibile per mpt(${matchesPerTurn})*4=${denom}`
    );
  }
  return totalSlots / denom;
}

let turns: number;
let matchesPerPlayer: number;
let matchesPerTurn: number;
let formula: BaraondaFormulaLabel | null = null;

 if (isProtectedCase) {
  // LOGICA STORICA PROTETTA
  matchesPerTurn = maxCourtsAvailable >= 2 && players >= 8 ? 2 : 1;

  if (category === "misto" && players === 10) {
    matchesPerTurn = 2;
    matchesPerPlayer = 6;
    turns = 8;
  } else if (category === "misto" && players === 12) {
    matchesPerTurn = maxCourtsAvailable >= 2 ? 2 : 1;
    matchesPerPlayer = 6;
    turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
    } else if (category !== "misto" && players === 6) {
  if (requestedFormula === "estesa") {
    matchesPerPlayer = 6;
  } else {
    matchesPerPlayer = 4;
  }

  matchesPerTurn = 1; // sempre 1 campo per 6
  turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);

} else if (category !== "misto" && players === 7) {
  if (requestedFormula === "estesa") {
    matchesPerPlayer = 8;
  } else {
    matchesPerPlayer = 4;
  }

  matchesPerTurn = 1; // sempre 1 campo
  turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
  } else if (category !== "misto" && players === 8) {
    if (matchesPerTurn === 2) {
      matchesPerPlayer = 7;
    } else {
      matchesPerPlayer = 4;
    }

    turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
  } else if (category !== "misto" && players === 9) {
    if (matchesPerTurn === 2) {
      matchesPerPlayer = 8;
      turns = 9;
    } else {
      matchesPerPlayer = 4;
      turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
    }
  } else if (category !== "misto" && players === 10) {
    if (matchesPerTurn === 2) {
      matchesPerPlayer = 8;
      turns = 10;
    } else {
      matchesPerPlayer = 4;
      turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
    }
  } else {
    if (players === 4) matchesPerPlayer = 3;
    else matchesPerPlayer = 4;

    turns = computeTurnsFixed(players, matchesPerTurn, matchesPerPlayer);
  }

  formula = resolveProtectedFormula(players, category, matchesPerPlayer);
} else {
  // NUOVA LOGICA GRANDI
  const availableOptions = getBaraondaOptions(players, category);
  if (!availableOptions.length) {
    return NextResponse.json(
      { error: `Nessuna formula configurata per ${category} con ${players} partecipanti` },
      { status: 400 }
    );
  }

  const chosen =
    availableOptions.find((o) => o.label === requestedFormula) ??
    getRecommendedBaraondaOption(players, category);

  if (!chosen) {
    return NextResponse.json({ error: "Nessuna formula valida trovata" }, { status: 400 });
  }

  matchesPerPlayer = chosen.matchesPerPlayer;
  formula = chosen.label;
  matchesPerTurn = maxCourtsAvailable;

  // ATTENZIONE: qui turns NON è più affidabile come formula fissa
  // lo mettiamo come valore placeholder; il nuovo generator dei casi grandi
  // calcolerà la turnazione dinamicamente.
  turns = Math.ceil(chosen.totalMatches / Math.max(1, maxCourtsAvailable));
}

// 4) crea run
const rules = {
  players,
  matchesPerTurn,
  turns,
  matchesPerPlayer,
  durationPreset: "standard",
  tieWinValue: 0.5,
  category,
  maxCourtsAvailable,
  formula,
  flexibleTurns: !isProtectedCase,
  engine: requestedEngine,
};

const { data: run, error: runErr } = await sb
  .from("tournament_runs")
  .insert({
    tournament_id: tournamentId,
    mode: "baraonda",
    category,
    status: "locked",
    locked_at: new Date().toISOString(),
    rules,
  })
  .select("id,rules")
  .single();

if (runErr || !run) return NextResponse.json({ error: runErr?.message ?? "Run error" }, { status: 500 });

const runId = String((run as any).id);

// 5) snapshot partecipanti
const participantsPayload = main.map((r) => ({
  run_id: runId,
  name: r.p1_name,
  phone: r.p1_phone,
  sex: toSex(r.p1_gender),
}));

const { error: perr } = await sb.from("tournament_run_participants").insert(participantsPayload);
if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

// 6) genera e inserisce schedule (idempotente)
await ensureScheduleForRun(sb, runId, (run as any).rules ?? rules);

// 7) running
const { error: uerr } = await sb
  .from("tournament_runs")
  .update({ status: "running", started_at: new Date().toISOString() })
  .eq("id", runId);

if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

// 🔒 chiudi iscrizioni quando il torneo viene generato
const { error: closeErr2 } = await sb
  .from("tournaments")
  .update({ registrations_open: false })
  .eq("id", tournamentId);

if (closeErr2) return NextResponse.json({ error: closeErr2.message }, { status: 500 });

return NextResponse.json({ tournamentId, runId, reused: false });
} catch (e: any) {
return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
}
}