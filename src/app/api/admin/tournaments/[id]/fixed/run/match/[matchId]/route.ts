// src/app/api/admin/tournaments/[id]/fixed/run/match/[matchId]/route.ts
import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type PatchBody = {
  reset?: boolean;

  // one_set
  homeGames?: number | null;
  awayGames?: number | null;

  // best_of_3
  set1Home?: number | null;
  set1Away?: number | null;
  set2Home?: number | null;
  set2Away?: number | null;
  set3Home?: number | null;
  set3Away?: number | null;
};

function toIntOrNullAllowUndefined(v: any): number | null | undefined {
  // undefined = "non inviato"
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;

  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Valore non valido");
  const i = Math.trunc(n);
  if (i < 0) throw new Error("Valore non valido (>= 0)");
  return i;
}

function computeBo3SetsSmart(
  s1h: number | null,
  s1a: number | null,
  s2h: number | null,
  s2a: number | null,
  s3h: number | null,
  s3a: number | null
) {
  const winner = (h: number | null, a: number | null): "H" | "A" | null => {
    if (h === null || a === null) return null;
    if (h === a) return null; // pari = set non valido
    return h > a ? "H" : "A";
  };

  const w1 = winner(s1h, s1a);
  const w2 = winner(s2h, s2a);

  let homeSets = 0;
  let awaySets = 0;

  if (w1 === "H") homeSets += 1;
  if (w1 === "A") awaySets += 1;

  if (w2 === "H") homeSets += 1;
  if (w2 === "A") awaySets += 1;

  // Se dopo 2 set non è 1-1, il terzo NON conta
  if (homeSets === 1 && awaySets === 1) {
    const w3 = winner(s3h, s3a);
    if (w3 === "H") homeSets += 1;
    if (w3 === "A") awaySets += 1;
  }

  const anySetComplete =
    (s1h !== null && s1a !== null) ||
    (s2h !== null && s2a !== null) ||
    (s3h !== null && s3a !== null);

  return {
    homeSets: anySetComplete ? homeSets : null,
    awaySets: anySetComplete ? awaySets : null,
  };
}

function sumGames(...vals: Array<number | null>) {
  const nums = vals.filter((x): x is number => x !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

/* ============================
   BRACKET AUTO-ADVANCE (robusto)
   - round_label + ordine match
   - gestisce anche tabelloni "spurii" (play-in): riempie gli slot null del round successivo
============================ */

function normRound(label?: string | null) {
  return String(label ?? "").trim().toLowerCase();
}

function roundRank(label?: string | null) {
  const s = normRound(label);

  // più basso = round precedente
  if (s.includes("sedices")) return 0;
  if (s.includes("ottav")) return 5;
  if (s.includes("quart")) return 10;
  if (s.includes("semi")) return 20;
  if (s.includes("final")) return 30;

  return 999;
}

type BracketMatchRow = {
  id: string;
  run_id: string;
  stage: string;
  round_label: string | null;
  home_pair_id: string | null;
  away_pair_id: string | null;
  starts_at: string | null;
  created_at: string | null;
};

function stableSortRound(matches: BracketMatchRow[]) {
  return [...matches].sort((a, b) => {
    const sa = a.starts_at ?? "";
    const sb = b.starts_at ?? "";
    if (sa !== sb) return sa.localeCompare(sb);

    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca.localeCompare(cb);

    return String(a.id).localeCompare(String(b.id));
  });
}

function byeWinnerPairId(m: any): string | null {
  const hp = m.home_pair_id ? String(m.home_pair_id) : null;
  const ap = m.away_pair_id ? String(m.away_pair_id) : null;

  if (hp && !ap) return hp; // home vs BYE
  if (!hp && ap) return ap; // BYE vs away
  return null;
}

async function clearScores(sb: ReturnType<typeof supabaseAdmin>, matchId: string) {
  await sb
    .from("tournament_run_matches_fp")
    .update({
      home_games: null,
      away_games: null,
      set1_home_games: null,
      set1_away_games: null,
      set2_home_games: null,
      set2_away_games: null,
      set3_home_games: null,
      set3_away_games: null,
      home_sets: null,
      away_sets: null,
      completed_at: null,
    })
    .eq("id", matchId);
}

// Svuota lo slot del match successivo che era stato riempito da questo match
// ✅ FIX: non usa più targetIdx=floor(i/2) per tabelloni spurii: cerca dov'è finita la coppia
async function clearDownstreamFromMatch(
  sb: ReturnType<typeof supabaseAdmin>,
  runId: string,
  fromMatch: BracketMatchRow
) {
  const curLabel = fromMatch.round_label;
  const curRank = roundRank(curLabel);

  const { data: all, error } = await sb
    .from("tournament_run_matches_fp")
    .select("id,run_id,stage,round_label,home_pair_id,away_pair_id,starts_at,created_at")
    .eq("run_id", runId)
    .eq("stage", "bracket");

  if (error || !all) return;

  const rows = (all as any[]).map((r) => ({
    id: String(r.id),
    run_id: String(r.run_id),
    stage: String(r.stage),
    round_label: r.round_label ?? null,
    home_pair_id: r.home_pair_id ? String(r.home_pair_id) : null,
    away_pair_id: r.away_pair_id ? String(r.away_pair_id) : null,
    starts_at: r.starts_at ?? null,
    created_at: r.created_at ?? null,
  })) as BracketMatchRow[];

  const rounds = new Map<string, BracketMatchRow[]>();
  for (const r of rows) {
    const k = normRound(r.round_label) || "round";
    rounds.set(k, [...(rounds.get(k) ?? []), r]);
  }

  const curKey = normRound(curLabel) || "round";
  const curRound = stableSortRound(rounds.get(curKey) ?? []);
  const curIdx = curRound.findIndex((x) => x.id === fromMatch.id);
  if (curIdx < 0) return;

  // trova round successivo
  const candidates = Array.from(rounds.entries())
    .map(([k, ms]) => ({ k, ms: stableSortRound(ms), rank: roundRank(k) }))
    .filter((x) => x.rank > curRank)
    .sort((a, b) => a.rank - b.rank);

  if (candidates.length === 0) return;

  const next = candidates[0];

  const pA = fromMatch.home_pair_id;
  const pB = fromMatch.away_pair_id;

  // ✅ Cerca nel round successivo dove compare una delle due coppie del match sorgente
  let target: BracketMatchRow | null = null;
  let slotToClear: "home_pair_id" | "away_pair_id" | null = null;

  for (const tm of next.ms) {
    if (tm.home_pair_id && (tm.home_pair_id === pA || tm.home_pair_id === pB)) {
      target = tm;
      slotToClear = "home_pair_id";
      break;
    }
    if (tm.away_pair_id && (tm.away_pair_id === pA || tm.away_pair_id === pB)) {
      target = tm;
      slotToClear = "away_pair_id";
      break;
    }
  }

  if (!target || !slotToClear) return;

  await sb
    .from("tournament_run_matches_fp")
    .update({ [slotToClear]: null } as any)
    .eq("id", target.id);

  await clearScores(sb, target.id);

  // ricorsione downstream
  await clearDownstreamFromMatch(sb, runId, target);
}

async function autoAdvanceBracket(
  sb: ReturnType<typeof supabaseAdmin>,
  runId: string,
  fromMatch: BracketMatchRow,
  winnerPairId: string
) {
  const curLabel = fromMatch.round_label;
  const curRank = roundRank(curLabel);

  const { data: all, error } = await sb
    .from("tournament_run_matches_fp")
    .select("id,run_id,stage,round_label,home_pair_id,away_pair_id,starts_at,created_at")
    .eq("run_id", runId)
    .eq("stage", "bracket");

  if (error || !all) return;

  const rows = (all as any[]).map((r) => ({
    id: String(r.id),
    run_id: String(r.run_id),
    stage: String(r.stage),
    round_label: r.round_label ?? null,
    home_pair_id: r.home_pair_id ? String(r.home_pair_id) : null,
    away_pair_id: r.away_pair_id ? String(r.away_pair_id) : null,
    starts_at: r.starts_at ?? null,
    created_at: r.created_at ?? null,
  })) as BracketMatchRow[];

  // raggruppo per round normalizzato
  const rounds = new Map<string, BracketMatchRow[]>();
  for (const r of rows) {
    const k = normRound(r.round_label) || "round";
    rounds.set(k, [...(rounds.get(k) ?? []), r]);
  }

  const curKey = normRound(curLabel) || "round";
  const curRound = stableSortRound(rounds.get(curKey) ?? []);
  const curIdx = curRound.findIndex((x) => x.id === fromMatch.id);
  if (curIdx < 0) return;

  // round successivo = il primo con rank più grande
  const candidates = Array.from(rounds.entries())
    .map(([k, ms]) => ({ k, ms: stableSortRound(ms), rank: roundRank(k) }))
    .filter((x) => x.rank > curRank)
    .sort((a, b) => a.rank - b.rank);

  if (candidates.length === 0) return; // già in finale

  const next = candidates[0];

  // fallback mapping standard (pari->home, dispari->away)
  const preferred: "home_pair_id" | "away_pair_id" =
    curIdx % 2 === 0 ? "home_pair_id" : "away_pair_id";

  // ✅ Se nel round successivo ci sono slot null, riempio i "buchi" in ordine:
  // hole[0] viene dal match curIdx=0, hole[1] da curIdx=1, ...
  const holes: Array<{ target: BracketMatchRow; slot: "home_pair_id" | "away_pair_id" }> = [];
  for (const tm of next.ms) {
    if (!tm.home_pair_id) holes.push({ target: tm, slot: "home_pair_id" });
    if (!tm.away_pair_id) holes.push({ target: tm, slot: "away_pair_id" });
  }

  let target: BracketMatchRow | null = null;
  let slotToFill: "home_pair_id" | "away_pair_id" = preferred;

  if (holes.length > 0) {
    const h = holes[curIdx];
    if (!h) return;
    target = h.target;
    slotToFill = h.slot;
  } else {
    // bracket classico potenza di 2
    const targetIdx = Math.floor(curIdx / 2);
    target = next.ms[targetIdx] ?? null;
    if (!target) return;

    // se c'è già una TDS da un lato e l'altro è vuoto, non sovrascrivo
    if (target.home_pair_id && !target.away_pair_id) slotToFill = "away_pair_id";
    else if (!target.home_pair_id && target.away_pair_id) slotToFill = "home_pair_id";
    else slotToFill = preferred;
  }

  // se è già dentro, non fare nulla
  if (target.home_pair_id === winnerPairId || target.away_pair_id === winnerPairId) return;

  const prevVal = (target as any)[slotToFill] as string | null;
  const changed = prevVal !== null && prevVal !== winnerPairId;

  await sb
    .from("tournament_run_matches_fp")
    .update({ [slotToFill]: winnerPairId } as any)
    .eq("id", target.id);

  if (changed) {
    await clearScores(sb, target.id);
    await clearDownstreamFromMatch(sb, runId, target);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; matchId: string }> }
) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId, matchId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 });

  const sb = supabaseAdmin();

  try {
    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body) return NextResponse.json({ error: "Body mancante" }, { status: 400 });

    // 1) match (serve run_id + valori correnti per merge)
    const { data: match, error: merr } = await sb
      .from("tournament_run_matches_fp")
      .select(
        `
          id,run_id,
          stage,round_label,home_pair_id,away_pair_id,
          home_games,away_games,
          set1_home_games,set1_away_games,
          set2_home_games,set2_away_games,
          set3_home_games,set3_away_games,
          home_sets,away_sets,
          starts_at,created_at,
          completed_at
        `
      )
      .eq("id", matchId)
      .single();

    if (merr || !match) {
      return NextResponse.json({ error: merr?.message ?? "Match non trovato" }, { status: 404 });
    }

    const runId = String((match as any).run_id);

    // 2) run: controllo torneo + rules.scoring
    const { data: run, error: rerr } = await sb
      .from("tournament_runs")
      .select("id,tournament_id,mode,rules,status")
      .eq("id", runId)
      .single();

    if (rerr || !run) {
      return NextResponse.json({ error: rerr?.message ?? "Run non trovata" }, { status: 404 });
    }

    if (String((run as any).tournament_id) !== String(tournamentId)) {
      return NextResponse.json({ error: "Match non appartiene a questo torneo" }, { status: 400 });
    }
    if (String((run as any).mode) !== "fixed_pairs") {
      return NextResponse.json({ error: "Run non è Coppie fisse" }, { status: 400 });
    }

    const rules = (run as any).rules ?? {};
    const scoring = String(rules.scoring ?? "best_of_3"); // default safe

    const stage = String((match as any).stage ?? "");
    const m: any = match;

    const bracketRow: BracketMatchRow = {
      id: String(m.id),
      run_id: runId,
      stage,
      round_label: m.round_label ?? null,
      home_pair_id: m.home_pair_id ? String(m.home_pair_id) : null,
      away_pair_id: m.away_pair_id ? String(m.away_pair_id) : null,
      starts_at: m.starts_at ?? null,
      created_at: m.created_at ?? null,
    };

    // ✅ blocco: bracket match non ancora definito (ma permetto reset)
    // - se entrambi null => non definito
    // - se solo uno è null => è un BYE (ammesso)
    if (!body.reset && stage === "bracket") {
      const hp = (match as any).home_pair_id;
      const ap = (match as any).away_pair_id;
      if (!hp && !ap) {
        return NextResponse.json({ error: "Partita non ancora definita" }, { status: 400 });
      }
    }

    // 3) reset totale + pulizia downstream
    if (body.reset) {
      if (stage === "bracket") {
        await clearDownstreamFromMatch(sb, runId, bracketRow);
      }

      const { error: uerr } = await sb
        .from("tournament_run_matches_fp")
        .update({
          home_games: null,
          away_games: null,
          set1_home_games: null,
          set1_away_games: null,
          set2_home_games: null,
          set2_away_games: null,
          set3_home_games: null,
          set3_away_games: null,
          home_sets: null,
          away_sets: null,
          completed_at: null,
        })
        .eq("id", matchId);

      if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });
      return NextResponse.json({ ok: true, completed: false });
    }

    // ✅ BYE: se uno dei due è null, la partita è automaticamente vinta dall'altro
    if (!body.reset && stage === "bracket") {
      const byeWinner = byeWinnerPairId(match);

      // BYE match => completo + auto-advance, senza punteggi
      if (byeWinner) {
        // segna completo se non lo è già
        if (!(match as any).completed_at) {
          const { error: byeErr } = await sb
            .from("tournament_run_matches_fp")
            .update({
              completed_at: new Date().toISOString(),
              // punteggi restano null
              home_games: null,
              away_games: null,
              set1_home_games: null,
              set1_away_games: null,
              set2_home_games: null,
              set2_away_games: null,
              set3_home_games: null,
              set3_away_games: null,
              home_sets: null,
              away_sets: null,
            })
            .eq("id", matchId);

          if (byeErr) return NextResponse.json({ error: byeErr.message }, { status: 500 });
        }

        await autoAdvanceBracket(sb, runId, bracketRow, byeWinner);
        return NextResponse.json({ ok: true, completed: true, bye: true });
      }
    }

    // 4) normalizzo input (undefined = non inviato)
    const homeGamesIn = toIntOrNullAllowUndefined((body as any).homeGames);
    const awayGamesIn = toIntOrNullAllowUndefined((body as any).awayGames);

    const set1hIn = toIntOrNullAllowUndefined((body as any).set1Home);
    const set1aIn = toIntOrNullAllowUndefined((body as any).set1Away);
    const set2hIn = toIntOrNullAllowUndefined((body as any).set2Home);
    const set2aIn = toIntOrNullAllowUndefined((body as any).set2Away);
    const set3hIn = toIntOrNullAllowUndefined((body as any).set3Home);
    const set3aIn = toIntOrNullAllowUndefined((body as any).set3Away);

    // 5) merge con valori correnti
    const cur: any = match;

    const set1h = set1hIn !== undefined ? set1hIn : (cur.set1_home_games ?? null);
    const set1a = set1aIn !== undefined ? set1aIn : (cur.set1_away_games ?? null);
    const set2h = set2hIn !== undefined ? set2hIn : (cur.set2_home_games ?? null);
    const set2a = set2aIn !== undefined ? set2aIn : (cur.set2_away_games ?? null);
    const set3h = set3hIn !== undefined ? set3hIn : (cur.set3_home_games ?? null);
    const set3a = set3aIn !== undefined ? set3aIn : (cur.set3_away_games ?? null);

    // per one_set: se l’utente manda homeGames/awayGames li usiamo come set1
    const oneSetH = homeGamesIn !== undefined ? homeGamesIn : undefined;
    const oneSetA = awayGamesIn !== undefined ? awayGamesIn : undefined;

    // 6) payload + complete
    let payload: any = {};
    let isComplete = false;

    // serve per auto-advance
    let winnerPairId: string | null = null;

    if (scoring === "one_set") {
      const h = oneSetH !== undefined ? oneSetH : set1h;
      const a = oneSetA !== undefined ? oneSetA : set1a;

      payload.set1_home_games = h ?? null;
      payload.set1_away_games = a ?? null;

      payload.set2_home_games = null;
      payload.set2_away_games = null;
      payload.set3_home_games = null;
      payload.set3_away_games = null;

      payload.home_sets = null;
      payload.away_sets = null;

      payload.home_games = h ?? null;
      payload.away_games = a ?? null;

      isComplete = h !== null && a !== null && h !== a;
      payload.completed_at = isComplete ? new Date().toISOString() : null;

      if (isComplete && stage === "bracket") {
        const hp = (match as any).home_pair_id ? String((match as any).home_pair_id) : null;
        const ap = (match as any).away_pair_id ? String((match as any).away_pair_id) : null;
        winnerPairId = h! > a! ? hp : ap;
      }
    } else {
      // === BEST OF 3 (smart) =====================================

      const winner = (h: number | null, a: number | null): "H" | "A" | null => {
        if (h === null || a === null) return null;
        if (h === a) return null;
        return h > a ? "H" : "A";
      };

      const w1 = winner(set1h ?? null, set1a ?? null);
      const w2 = winner(set2h ?? null, set2a ?? null);

      const twoSetHome = (w1 === "H" ? 1 : 0) + (w2 === "H" ? 1 : 0);
      const twoSetAway = (w1 === "A" ? 1 : 0) + (w2 === "A" ? 1 : 0);

      // Se non siamo 1-1, set3 non conta
      let finalSet3h = set3h ?? null;
      let finalSet3a = set3a ?? null;
      if (!(twoSetHome === 1 && twoSetAway === 1)) {
        finalSet3h = null;
        finalSet3a = null;
      }

      const { homeSets, awaySets } = computeBo3SetsSmart(
        set1h ?? null,
        set1a ?? null,
        set2h ?? null,
        set2a ?? null,
        finalSet3h,
        finalSet3a
      );

      payload.set1_home_games = set1h ?? null;
      payload.set1_away_games = set1a ?? null;
      payload.set2_home_games = set2h ?? null;
      payload.set2_away_games = set2a ?? null;
      payload.set3_home_games = finalSet3h;
      payload.set3_away_games = finalSet3a;

      payload.home_sets = homeSets;
      payload.away_sets = awaySets;

      payload.home_games = sumGames(set1h ?? null, set2h ?? null, finalSet3h);
      payload.away_games = sumGames(set1a ?? null, set2a ?? null, finalSet3a);

      isComplete =
        homeSets !== null &&
        awaySets !== null &&
        (homeSets === 2 || awaySets === 2) &&
        homeSets !== awaySets;

      payload.completed_at = isComplete ? new Date().toISOString() : null;

      if (isComplete && stage === "bracket") {
        const hp = (match as any).home_pair_id ? String((match as any).home_pair_id) : null;
        const ap = (match as any).away_pair_id ? String((match as any).away_pair_id) : null;
        winnerPairId = homeSets! > awaySets! ? hp : ap;
      }
    }

    // 7) update DB
    const { error: uerr } = await sb
      .from("tournament_run_matches_fp")
      .update(payload)
      .eq("id", matchId);

    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

    // 8) auto-advance bracket
    if (stage === "bracket" && isComplete && winnerPairId) {
      await autoAdvanceBracket(sb, runId, bracketRow, winnerPairId);
    }

    return NextResponse.json({ ok: true, completed: isComplete });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
  }
}
