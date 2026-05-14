// src/app/api/admin/tournaments/[id]/run/bracket/route.ts
import { NextResponse } from "next/server";
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
  const denied = await guardAdmin();
  if (denied) return denied;

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

    type QualifiedEntry = {
    kind: "pair";
    seed: number;
    pairId: string;
    name: string;
    groupId: string;
    groupName: string;
    groupPosition: number;
    groupRank: number;
    pt: number;
    dg: number;
    gw: number;
    gl: number;
    drawKey: number;
  };

  type PlaceholderEntry = {
    kind: "placeholder";
    placeholderId: string;
  };

  type BracketEntry = QualifiedEntry | PlaceholderEntry;

  const makeMatchRow = (
    roundLabel: string,
    home: string | null,
    away: string | null
  ) => ({
    run_id: runId,
    stage: "bracket",
    group_id: null,
    round_label: roundLabel,
    home_pair_id: home,
    away_pair_id: away,
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

  function entryPairId(entry: BracketEntry) {
    return entry.kind === "pair" ? entry.pairId : null;
  }

  function sameGroup(a: BracketEntry, b: BracketEntry) {
    if (a.kind !== "pair" || b.kind !== "pair") return false;
    return a.groupId === b.groupId;
  }

  function buildBalancedPairings(entries: BracketEntry[]) {
    const half = entries.length / 2;
    const top = entries.slice(0, half);
    const bottom = entries.slice(half).reverse();

    const pairings: Array<{ home: BracketEntry; away: BracketEntry }> = [];

    for (const home of top) {
      let index = bottom.findIndex((candidate) => !sameGroup(home, candidate));

      if (index < 0) index = 0;

      const [away] = bottom.splice(index, 1);
      pairings.push({ home, away });
    }

    return pairings;
  }

  // ============================================================
  // QUALIFICAZIONE CORRETTA A FASCE
  // 1) tutte le prime
  // 2) tutte le seconde
  // 3) tutte le terze
  // 4) eventuali quarte...
  //
  // Se l'ultima fascia non entra tutta:
  // Pt desc, DG desc, GW desc, sorteggio
  //
  // Questo risolve:
  // - 7 coppie, passano 6: 1/2/3 dei due gironi, fuori la 4ª
  // - 10 coppie 3+3+4: prima fuori la 4ª del girone da 4
  // - 11 coppie 3+4+4: prima fuori le 4ª dei gironi da 4
  // ============================================================

  const groupsRanked = groupsList.map((g) => {
    const gid = String(g.id);
    const groupRows = (standingsByGroup[gid] ?? [])
      .map((x) => ({
        ...x,
        groupId: gid,
        groupName: String(g.name ?? ""),
        groupPosition: Number(g.position ?? 0),
        drawKey: drawKeyByPair.get(String(x.pairId)) ?? 999999,
      }))
      .sort(sortSeeds)
      .map((x, index) => ({
        ...x,
        groupRank: index + 1,
      }));

    return {
      group: g,
      rows: groupRows,
    };
  });

  const maxGroupSize = Math.max(0, ...groupsRanked.map((g) => g.rows.length));
  const qualifiedRaw: any[] = [];

  for (let rank = 1; rank <= maxGroupSize; rank++) {
    const band = groupsRanked
      .flatMap((g) => g.rows.filter((row) => row.groupRank === rank))
      .sort(sortSeeds);

    if (band.length === 0) continue;

    const remaining = qualifiersCount - qualifiedRaw.length;
    if (remaining <= 0) break;

    if (band.length <= remaining) {
      qualifiedRaw.push(...band);
    } else {
      qualifiedRaw.push(...band.slice(0, remaining));
      break;
    }
  }

  if (qualifiedRaw.length < qualifiersCount) {
    return NextResponse.json(
      { error: "Coppie insufficienti per il tabellone" },
      { status: 400 }
    );
  }

  const qualified: QualifiedEntry[] = qualifiedRaw.map((q, index) => ({
    kind: "pair",
    seed: index + 1,
    pairId: String(q.pairId),
    name: q.name,
    groupId: String(q.groupId),
    groupName: String(q.groupName),
    groupPosition: Number(q.groupPosition ?? 0),
    groupRank: Number(q.groupRank ?? 0),
    pt: Number(q.pt ?? 0),
    dg: Number(q.dg ?? 0),
    gw: Number(q.gw ?? 0),
    gl: Number(q.gl ?? 0),
    drawKey: Number(q.drawKey ?? 999999),
  }));

  const q = qualified.length;
  const size = nextPow2(q);

  // Se q è già potenza di 2, niente play-in.
  // Se q NON è potenza di 2:
  // mainSize = potenza precedente
  // le peggiori qualificate fanno play-in.
  const isPowerOfTwo = size === q;
  const mainSize = isPowerOfTwo ? q : size / 2;
  const playInMatches = isPowerOfTwo ? 0 : q - mainSize;
  const playInPlayersCount = playInMatches * 2;
  const directCount = q - playInPlayersCount;

  if (mainSize < 2) {
    return NextResponse.json(
      { error: "Tabellone non valido: servono almeno 2 qualificate" },
      { status: 400 }
    );
  }

  if (directCount < 0) {
    return NextResponse.json(
      { error: "Tabellone non valido: qualificate/play-in incoerenti" },
      { status: 400 }
    );
  }

  const directEntries = qualified.slice(0, directCount);
  const playInEntries = qualified.slice(directCount);

  const placeholders: PlaceholderEntry[] = Array.from({
    length: playInMatches,
  }).map((_, index) => ({
    kind: "placeholder",
    placeholderId: `PLAYIN_WINNER_${index + 1}`,
  }));

  const mainEntries: BracketEntry[] = [...directEntries, ...placeholders];

  if (mainEntries.length !== mainSize) {
    return NextResponse.json(
      { error: "Errore costruzione tabellone principale" },
      { status: 500 }
    );
  }

  const rows: any[] = [];

  // ============================================================
  // PLAY-IN
  // Le peggiori qualificate giocano il play-in.
  // Pairing: migliore del play-in vs peggiore del play-in.
  // Es. 3 gironi da 3, passano 9:
  // - migliore terza diretta
  // - peggiori due terze nel play-in
  // ============================================================

  if (playInMatches > 0) {
    const playInLabel = roundLabelForSize(size);
    const playInPairings: Array<{ home: QualifiedEntry; away: QualifiedEntry }> = [];
const playInTop = playInEntries.slice(0, playInMatches);
const playInBottom = playInEntries.slice(playInMatches).reverse();

for (let i = 0; i < playInMatches; i++) {
  const home = playInTop[i];
  const away = playInBottom[i];

      if (!home || !away) {
        return NextResponse.json(
          { error: "Errore costruzione play-in" },
          { status: 500 }
        );
      }

      playInPairings.push({ home, away });
    }

    for (const p of playInPairings) {
      rows.push(makeMatchRow(playInLabel, p.home.pairId, p.away.pairId));
    }
  }

  // ============================================================
  // MAIN ROUND
  // Pairing bilanciato:
  // - prima metà seed vs seconda metà invertita
  // - evita stesso girone ove possibile
  //
  // Caso 2 gironi / 4 qualificate:
  // qualified = 1A, 1B, 2A, 2B
  // pairing = 1A vs 2B, 1B vs 2A
  // ============================================================

  const mainLabel = roundLabelForSize(mainSize);
  const mainPairings = buildBalancedPairings(mainEntries);

  for (const p of mainPairings) {
    rows.push(
      makeMatchRow(
        mainLabel,
        entryPairId(p.home),
        entryPairId(p.away)
      )
    );
  }

  // ============================================================
  // ROUND SUCCESSIVI VUOTI
  // ============================================================

  let curSize = mainSize;
  while (curSize > 2) {
    const nextSize = curSize / 2;
    const label = roundLabelForSize(nextSize);

    for (let i = 0; i < nextSize / 2; i++) {
      rows.push(makeMatchRow(label, null, null));
    }

    curSize = nextSize;
  }

  // 11) INSERT + SALVO DRAW IN RULES
  const { error: insErr } = await sb.from("tournament_run_matches_fp").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const seeds = qualified.map((q) => ({
    seed: q.seed,
    pairId: q.pairId,
    name: q.name,
    groupId: q.groupId,
    groupName: q.groupName,
    groupPosition: q.groupPosition,
    groupRank: q.groupRank,
    pt: q.pt,
    dg: q.dg,
    gw: q.gw,
    gl: q.gl,
    drawKey: q.drawKey,
  }));

  const bracketDraw = {
    generated_at: new Date().toISOString(),
    qualifiersCount,
    seeds,
    structure: {
      type: "group_rank_band_seeded",
      size,
      mainSize,
      playInMatches,
      directCount,
      rules: [
        "Qualificazione per fasce: prime, seconde, terze, quarte...",
        "Ultima fascia parziale ordinata per Pt, DG, GW, sorteggio",
        "Play-in tra le peggiori qualificate quando il numero non è potenza di 2",
        "Primo turno evita stesso girone ove possibile",
      ],
    },
  };

  const mergedRules = { ...(rules ?? {}), bracketDraw };

  const { error: ruleErr } = await sb
    .from("tournament_runs")
    .update({ rules: mergedRules })
    .eq("id", runId);

  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });

  return NextResponse.json(
    {
      ok: true,
      runId,
      generated: true,
      qualifiersCount,
      structure: {
        type: "group_rank_band_seeded",
        size,
        mainSize,
        playInMatches,
        directCount,
      },
    },
    { status: 200 }
  );
}