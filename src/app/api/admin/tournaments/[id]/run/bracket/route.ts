// src/app/api/admin/tournaments/[id]/run/bracket/route.ts
import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function safeInt(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeWinnerAndGames(match: any) {
  const hasSets =
    "set1_home_games" in match ||
    "set2_home_games" in match ||
    "set3_home_games" in match ||
    "set1_away_games" in match ||
    "set2_away_games" in match ||
    "set3_away_games" in match;

  if (!hasSets) {
    const hg = safeInt(match.home_games);
    const ag = safeInt(match.away_games);
    const complete = match.completed_at != null || (hg !== null && ag !== null);
    if (!complete || hg === null || ag === null || hg === ag) {
      return { completed: false, winner: null as "home" | "away" | null, hg: 0, ag: 0 };
    }
    return { completed: true, winner: hg > ag ? "home" : "away", hg, ag };
  }

  const s1h = safeInt(match.set1_home_games);
  const s1a = safeInt(match.set1_away_games);
  const s2h = safeInt(match.set2_home_games);
  const s2a = safeInt(match.set2_away_games);
  const s3h = safeInt(match.set3_home_games);
  const s3a = safeInt(match.set3_away_games);

  const sets = [
    { h: s1h, a: s1a },
    { h: s2h, a: s2a },
    { h: s3h, a: s3a },
  ].filter((s) => s.h !== null && s.a !== null);

  const hg = sets.reduce((sum, s) => sum + (s.h ?? 0), 0);
  const ag = sets.reduce((sum, s) => sum + (s.a ?? 0), 0);

  let hs = 0;
  let as = 0;
  for (const s of sets) {
    if ((s.h ?? 0) > (s.a ?? 0)) hs++;
    else if ((s.a ?? 0) > (s.h ?? 0)) as++;
  }

  const complete = match.completed_at != null || sets.length > 0;
  if (!complete || hs === as) return { completed: false, winner: null, hg, ag };

  return { completed: true, winner: hs > as ? "home" : "away", hg, ag };
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundLabelForSize(size: number) {
  if (size === 2) return "Finale";
  if (size === 4) return "Semifinali";
  if (size === 8) return "Quarti";
  if (size === 16) return "Ottavi";
  if (size === 32) return "Sedicesimi";
  return `Round ${size}`;
}

// ordine “classico” dei seed lungo la griglia
function bracketOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const prev = bracketOrder(size / 2);
  const out: number[] = [];
  for (const s of prev) out.push(s, size + 1 - s);
  return out;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =======================================
// Seed order richiesto:
// Pt desc, DG desc, GW desc, sorteggio
// =======================================
function sortSeeds(a: any, b: any) {
  if (b.pt !== a.pt) return b.pt - a.pt;
  if (b.dg !== a.dg) return b.dg - a.dg;
  if (b.gw !== a.gw) return b.gw - a.gw;
  return a.drawKey - b.drawKey;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  const sb = supabaseAdmin();

  // 1) run attiva fixed_pairs
  const { data: run, error: rerr } = await sb
    .from("tournament_runs")
    .select("id,tournament_id,mode,status,rules,created_at")
    .eq("tournament_id", tournamentId)
    .eq("mode", "fixed_pairs")
    .in("status", ["running", "locked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });
  if (!run?.id) return NextResponse.json({ error: "Nessuna run attiva (fixed_pairs)" }, { status: 400 });

  const runId = String(run.id);
  const rules = (run as any).rules ?? {};

  if (String(rules.format ?? "") !== "groups_and_bracket") {
    return NextResponse.json({ error: "Formato run non supportato (serve groups_and_bracket)" }, { status: 400 });
  }

  const qualifiersCount = Math.trunc(Number(rules.qualifiersCount ?? 4));
  if (!qualifiersCount || qualifiersCount < 2) {
    return NextResponse.json({ error: `qualifiersCount non valido: ${qualifiersCount}` }, { status: 400 });
  }

  // 2) idempotenza: se bracket già generato, non rigenero
  const { data: existingBracket, error: exerr } = await sb
    .from("tournament_run_matches_fp")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "bracket")
    .limit(1);

  if (exerr) return NextResponse.json({ error: exerr.message }, { status: 500 });
  if ((existingBracket ?? []).length > 0) {
    return NextResponse.json({ ok: true, alreadyGenerated: true }, { status: 200 });
  }

  // 3) pairs
  const { data: runPairs, error: perr } = await sb
    .from("tournament_run_pairs")
    .select("id,name,created_at")
    .eq("run_id", runId);

  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  const pairsList = (runPairs ?? []) as any[];
  const pairById = new Map<string, any>(pairsList.map((p) => [String(p.id), p]));

  // 4) groups
  const { data: groups, error: gerr } = await sb
    .from("tournament_run_groups")
    .select("id,name,position")
    .eq("run_id", runId)
    .order("position", { ascending: true });

  if (gerr) return NextResponse.json({ error: gerr.message }, { status: 500 });

  const groupsList = (groups ?? []) as any[];
  const groupIds = groupsList.map((g) => String(g.id));

  // 5) group_pairs
  const { data: gp, error: gperr } = await sb
    .from("tournament_run_group_pairs")
    .select("group_id,pair_id")
    .in("group_id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"]);

  if (gperr) return NextResponse.json({ error: gperr.message }, { status: 500 });

  const groupPairs = (gp ?? []) as any[];
  const pairIdsByGroupId = new Map<string, string[]>();
  for (const row of groupPairs) {
    const gid = String(row.group_id);
    const pid = String(row.pair_id);
    const arr = pairIdsByGroupId.get(gid) ?? [];
    arr.push(pid);
    pairIdsByGroupId.set(gid, arr);
  }

  // 6) matches group
  const { data: groupMatches, error: merr } = await sb
    .from("tournament_run_matches_fp")
    .select("*")
    .eq("run_id", runId)
    .eq("stage", "group");

  if (merr) return NextResponse.json({ error: merr.message }, { status: 500 });

  const mlist = (groupMatches ?? []) as any[];

  // 7) verifica: TUTTI i match group completati con winner valido
  for (const m of mlist) {
    const w = computeWinnerAndGames(m);
    if (!w.completed || !w.winner) {
      return NextResponse.json({ error: "Gironi non conclusi: ci sono match senza risultato valido" }, { status: 400 });
    }
  }

  // 8) standings per girone -> poi MERGE globale
  const standingsByGroup: Record<string, any[]> = {};
  for (const g of groupsList) {
    const gid = String(g.id);
    const pids = pairIdsByGroupId.get(gid) ?? [];
    standingsByGroup[gid] = pids.map((pid) => ({
      pairId: pid,
      name: pairById.get(pid)?.name ?? pid,
      pt: 0,
      gw: 0,
      gl: 0,
      dg: 0,
      played: 0,
    }));
  }

  const idxByGroup = new Map<string, Map<string, any>>();
  for (const gid of Object.keys(standingsByGroup)) {
    const mp = new Map<string, any>();
    for (const row of standingsByGroup[gid]) mp.set(String(row.pairId), row);
    idxByGroup.set(gid, mp);
  }

  for (const m of mlist) {
    const gid = m.group_id ? String(m.group_id) : null;
    if (!gid) continue;
    const idx = idxByGroup.get(gid);
    if (!idx) continue;

    const homeId = String(m.home_pair_id);
    const awayId = String(m.away_pair_id);

    const comp = computeWinnerAndGames(m);
    if (!comp.completed || !comp.winner) continue;

    const homeRow = idx.get(homeId);
    const awayRow = idx.get(awayId);
    if (!homeRow || !awayRow) continue;

    homeRow.gw += comp.hg;
    homeRow.gl += comp.ag;
    awayRow.gw += comp.ag;
    awayRow.gl += comp.hg;

    homeRow.dg = homeRow.gw - homeRow.gl;
    awayRow.dg = awayRow.gw - awayRow.gl;

    homeRow.played += 1;
    awayRow.played += 1;

    if (comp.winner === "home") homeRow.pt += 1;
    else awayRow.pt += 1;
  }

  // 9) sorteggio (puoi renderlo "stabile" salvandolo in rules se vuoi, qui lo rigenero a ogni call)
  const allRows: any[] = [];
  for (const gid of Object.keys(standingsByGroup)) {
    for (const r of standingsByGroup[gid]) allRows.push(r);
  }

  const drawPool = shuffle(allRows.map((x) => String(x.pairId)));
  const drawKeyByPair = new Map<string, number>();
  drawPool.forEach((pid, i) => drawKeyByPair.set(pid, i + 1));

  const candidates = allRows.map((x) => ({
    ...x,
    drawKey: drawKeyByPair.get(String(x.pairId)) ?? 999999,
  }));

  // ✅ QUALIFICATE = TOP N globale con ordine Pt, DG, GW, sorteggio
  candidates.sort(sortSeeds);
  const qualified = candidates.slice(0, qualifiersCount);

  if (qualified.length < qualifiersCount) {
    return NextResponse.json({ error: "Coppie insufficienti per il tabellone" }, { status: 400 });
  }

  // ✅ SEEDS finali (1..N) = qualified già ordinato
  const seeds = qualified.map((q, i) => ({
    seed: i + 1,
    pairId: String(q.pairId),
    name: q.name,
    pt: q.pt,
    dg: q.dg,
    gw: q.gw,
    drawKey: q.drawKey,
  }));

  // =======================================
  // 10) BRACKET SPURIO (play-in + main)
  //      con PLAY-IN ordinato come i "buchi"
  //      del main round (così auto-advance è perfetto)
  // =======================================
  const q = qualifiersCount;
  const size = nextPow2(q); // es. 10 -> 16
  const prevPow = size / 2; // es. 16 -> 8
  const playInMatches = q - prevPow; // es. 10-8 = 2
  const directCount = prevPow - playInMatches; // es. 8-2 = 6

  const seedByNum = new Map<number, string>();
  for (const s of seeds) seedByNum.set(s.seed, s.pairId);

  const rows: any[] = [];
  let fakeOrderTime = Date.now();

  const makeMatchRow = (roundLabel: string, home: string | null, away: string | null) => ({
    run_id: runId,
    stage: "bracket",
    group_id: null,
    round_label: roundLabel,
    home_pair_id: home,
    away_pair_id: away,
    court: null,
    starts_at: new Date(fakeOrderTime).toISOString(),
    home_games: null,
    away_games: null,
    completed_at: null,
    set1_home_games: null,
    set1_away_games: null,
    set2_home_games: null,
    set2_away_games: null,
    set3_home_games: null,
    set3_away_games: null,
    home_sets: null,
    away_sets: null,
  });

  // 10a) MAIN ROUND (prevPow) con placeholder null dove entrerà il vincitore del play-in
  const mainLabel = roundLabelForSize(prevPow); // es. 8 -> "Quarti"
  const order = bracketOrder(prevPow);

  const slots: Array<string | null> = Array.from({ length: prevPow }).map(() => null);

  // seed 1..directCount entrano diretti, seed (directCount+1..prevPow) sono BUCHI per play-in
  for (let seedNum = 1; seedNum <= prevPow; seedNum++) {
    if (seedNum <= directCount) slots[seedNum - 1] = seedByNum.get(seedNum) ?? null;
    else slots[seedNum - 1] = null;
  }

  // Calcolo l'ordine ESATTO dei buchi come li “vedrà” l'autoAdvance:
  // iteriamo i match del main in ordine inserimento, e per ogni match: prima home poi away.
  const holeSeeds: number[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i];
    const b = order[i + 1];
    if (a > directCount) holeSeeds.push(a);
    if (b > directCount) holeSeeds.push(b);
  }

  // 10b) PLAY-IN (se serve) — creati nello stesso ordine dei buchi
  if (playInMatches > 0) {
    const playInLabel = roundLabelForSize(size); // es. 16 -> "Ottavi"
    for (let k = 0; k < playInMatches; k++) {
      const holeSeed = holeSeeds[k];   // seed del "buco" da riempire
      const oppSeed = q - k;           // dal fondo: q, q-1, ...

      rows.push(
        makeMatchRow(
          playInLabel,
          seedByNum.get(holeSeed) ?? null,
          seedByNum.get(oppSeed) ?? null
        )
      );
      fakeOrderTime += 60000;
    }
  }

  // 10c) Inserisco i match del MAIN (con null dove serve)
  for (let i = 0; i < order.length; i += 2) {
    const home = slots[order[i] - 1] ?? null;
    const away = slots[order[i + 1] - 1] ?? null;
    rows.push(makeMatchRow(mainLabel, home, away));
    fakeOrderTime += 60000;
  }

  // 10d) ROUND SUCCESSIVI (vuoti) fino alla finale
  let curSize = prevPow;
  while (curSize > 2) {
    const nextSize = curSize / 2;
    const label = roundLabelForSize(nextSize);

    for (let i = 0; i < nextSize / 2; i++) {
      rows.push(makeMatchRow(label, null, null));
      fakeOrderTime += 60000;
    }
    curSize = nextSize;
  }

  // 11) INSERT + SALVO DRAW IN RULES
  const { error: insErr } = await sb.from("tournament_run_matches_fp").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const bracketDraw = {
    generated_at: new Date().toISOString(),
    qualifiersCount,
    seeds,
    structure: { size, prevPow, playInMatches, directCount },
  };

  const mergedRules = { ...(rules ?? {}), bracketDraw };

  const { error: ruleErr } = await sb.from("tournament_runs").update({ rules: mergedRules }).eq("id", runId);
  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });

  return NextResponse.json(
    { ok: true, runId, generated: true, qualifiersCount, structure: { size, prevPow, playInMatches, directCount } },
    { status: 200 }
  );
}
