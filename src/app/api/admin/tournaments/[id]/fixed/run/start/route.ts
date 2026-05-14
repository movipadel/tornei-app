import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type WizardPayload = {
  type: "fixed_pairs";
  format: "groups_and_bracket" | "bracket_only" | "group_only";
  scoring: "one_set" | "best_of_3";

  roundRobinLegs?: 1 | 2; // solo girone

  seedsCount?: number; // numero TDS selezionate
  seedRegistrationIds?: string[]; // registration.id ordinate: [seed1, seed2, ...]

  groups?: Array<{
    id: string; // id client-side
    name: string;
    closed: boolean;
    pairIds: string[]; // registration.id
  }>;

  qualifiersCount?: number | null;
    bracketParticipantsCount?: number | null;

  bracketSlots?: Array<string | "BYE" | null>; // registration.id (wizard può mandarli, ma in bracket_only useremo TUTTE le coppie)

  courtsCount?: number;

  matches?: Array<{
    id: string;
    stage: "group" | "bracket";
    groupId?: string;
    roundLabel?: string;
    homePairId: string; // registration.id
    awayPairId: string; // registration.id
    court?: number | null;
    startsAt?: string | null;
  }>;
};

type TournamentRow = {
  id: string;
  type: string | null;
  category: string | null;
  date: string | null; // "YYYY-MM-DD"
};

type RegRow = {
  id: string;
  is_reserve: boolean;
  p1_name: string;
  p2_name: string | null;
};

function mapCategory(raw: string | null | undefined) {
  const cat = String(raw ?? "libero").toLowerCase();
  if (cat === "misto") return "misto";
  if (cat === "maschile") return "maschile";
  if (cat === "femminile") return "femminile";
  return "libero";
}

function pairDisplayName(r: RegRow) {
  const a = String(r.p1_name ?? "").trim();
  const b = String(r.p2_name ?? "").trim();
  if (a && b) return `${a} / ${b}`;
  return a || b || "Coppia";
}

/**
 * ✅ Accetta:
 * - "HH:MM" -> usa la date del torneo => timestamptz ISO
 * - "YYYY-MM-DDTHH:MM" -> ISO
 * - ISO ("...Z") -> normalizza
 */
function normalizeStartsAt(input?: string | null) {
  if (!input) return null;

  const s = String(input).trim();
  if (!s) return null;

  // accetta "HH:MM"
  if (/^\d{2}:\d{2}$/.test(s)) {
    return s;
  }

  // accetta "HH:MM:SS" e riduce a "HH:MM"
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.slice(0, 5);
  }

  return null;
}

function makeKey(gid: string, a: string, b: string) {
  const x = String(a);
  const y = String(b);
  return x < y ? `${gid}:${x}:${y}` : `${gid}:${y}:${x}`;
}

// genera round-robin: tutte le coppie contro tutte (i<j)
function generateRoundRobinPairs(ids: string[], legs: 1 | 2) {
  const out: Array<{ home: string; away: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push({ home: ids[i], away: ids[j] });
      if (legs === 2) out.push({ home: ids[j], away: ids[i] });
    }
  }
  return out;
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ordine “classico” dei seed lungo la griglia
function bracketOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const prev = bracketOrder(size / 2);
  const out: number[] = [];
  for (const s of prev) out.push(s, size + 1 - s);
  return out;
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  const sb = supabaseAdmin();

  try {
    const body = (await req.json().catch(() => null)) as WizardPayload | null;
    if (!body) return NextResponse.json({ error: "Body mancante" }, { status: 400 });
    if (body.type !== "fixed_pairs") return NextResponse.json({ error: "Tipo non supportato" }, { status: 400 });

    // 1) torneo
    const { data: t, error: terr } = await sb
      .from("tournaments")
      .select("id,type,category,date")
      .eq("id", tournamentId)
      .single();

    if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tr = t as TournamentRow;

    if (String(tr.type) !== "Coppie fisse") {
      return NextResponse.json({ error: "Torneo non supportato (solo Coppie fisse)" }, { status: 400 });
    }

    const category = mapCategory(tr.category);

    // 2) no reuse: se esiste run attiva -> errore
    const { data: existingRun, error: exErr } = await sb
      .from("tournament_runs")
      .select("id,status,created_at,mode")
      .eq("tournament_id", tournamentId)
      .in("status", ["locked", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    if (existingRun?.id) {
      return NextResponse.json({ error: "Esiste già una run attiva. Usa Ricrea (reset) per rigenerare." }, { status: 400 });
    }

    // 3) iscritti principali
    const { data: regs, error: rerr } = await sb
      .from("tournament_registrations")
      .select("id,is_reserve,p1_name,p2_name")
      .eq("tournament_id", tournamentId)
      .eq("is_reserve", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

    const main = (regs ?? []) as RegRow[];
    if (main.length < 2) {
      return NextResponse.json({ error: "Servono almeno 2 coppie in lista principale" }, { status: 400 });
    }

    // 4) validazione base
    const format = body.format;
    const scoring = body.scoring;

    if (!["groups_and_bracket", "bracket_only", "group_only"].includes(format)) {
      return NextResponse.json({ error: "Formato non valido" }, { status: 400 });
    }
    if (!["one_set", "best_of_3"].includes(scoring)) {
      return NextResponse.json({ error: "Scoring non valido" }, { status: 400 });
    }

    const courtsCount = Math.max(1, Math.min(16, Number(body.courtsCount ?? 1)));

    // ✅ seeds validation (solo formato che le usa: bracket_only / groups_and_bracket)
    const seedsCount = Math.max(0, Math.trunc(Number(body.seedsCount ?? 0)));
    const seedRegistrationIdsRaw = Array.isArray(body.seedRegistrationIds) ? body.seedRegistrationIds : [];
    const seedRegistrationIds = seedRegistrationIdsRaw.map((x) => String(x || "")).filter(Boolean);

    if (seedsCount !== seedRegistrationIds.length) {
      // allow seedsCount=0 with empty
      if (!(seedsCount === 0 && seedRegistrationIds.length === 0)) {
        return NextResponse.json({ error: "TDS non valide: seedsCount != seedRegistrationIds.length" }, { status: 400 });
      }
    }
    const uniqSeeds = new Set(seedRegistrationIds);
    if (uniqSeeds.size !== seedRegistrationIds.length) {
      return NextResponse.json({ error: "TDS non valide: duplicati" }, { status: 400 });
    }

    const mainRegIds = new Set(main.map((r) => String(r.id)));
    for (const sid of seedRegistrationIds) {
      if (!mainRegIds.has(String(sid))) {
        return NextResponse.json({ error: `TDS non valida: registration_id non presente tra gli iscritti (${sid})` }, { status: 400 });
      }
    }

    // 5) crea run
    const rules = {
      mode: "fixed_pairs",
      category,
      format,
      scoring,
      courtsCount,
      qualifiersCount: format === "groups_and_bracket" ? Number(body.qualifiersCount ?? 0) : null,
      roundRobinLegs: format === "group_only" ? Number(body.roundRobinLegs ?? 1) : null,

      // ✅ salva anche i seed nel rules (utile in futuro lato UI/GET)
      seedsCount: format === "bracket_only" || format === "groups_and_bracket" ? seedsCount : 0,
      seedRegistrationIds: format === "bracket_only" || format === "groups_and_bracket" ? seedRegistrationIds : [],
    };

    const { data: run, error: runErr } = await sb
      .from("tournament_runs")
      .insert({
        tournament_id: tournamentId,
        mode: "fixed_pairs",
        category,
        status: "locked",
        locked_at: new Date().toISOString(),
        rules,
      })
      .select("id")
      .single();

    if (runErr || !run) return NextResponse.json({ error: runErr?.message ?? "Run error" }, { status: 500 });
    const runId = String((run as any).id);

    // 6) snapshot coppie
    const pairsPayload = main.map((r) => ({
      run_id: runId,
      registration_id: r.id,
      name: pairDisplayName(r),
    }));

    const { data: insertedPairs, error: pInsErr } = await sb
      .from("tournament_run_pairs")
      .insert(pairsPayload)
      .select("id,registration_id");

    if (pInsErr) return NextResponse.json({ error: pInsErr.message }, { status: 500 });

    const runPairIdByRegistrationId = new Map<string, string>();
    for (const rp of (insertedPairs ?? []) as any[]) {
      runPairIdByRegistrationId.set(String(rp.registration_id), String(rp.id));
    }

    const mapRegToRunPair = (registrationId: string) => {
      const v = runPairIdByRegistrationId.get(String(registrationId));
      if (!v) throw new Error(`Coppia non trovata: registration_id=${registrationId}`);
      return v;
    };

    // 7) GIR0NI: crea gruppi + group_pairs e poi genera match DAL DB
    const groups = body.groups ?? [];

    if (format === "group_only" || format === "groups_and_bracket") {
      if (groups.length < 1) throw new Error("Gironi mancanti");
      if (format === "groups_and_bracket" && groups.some((g) => !g.closed)) {
        throw new Error("Chiudi tutti i gironi prima di generare");
      }

      const groupsPayload = groups.map((g, idx) => ({
        run_id: runId,
        name: String(g.name || `Girone ${String.fromCharCode(65 + idx)}`),
        position: idx + 1,
      }));

      const { data: insertedGroups, error: gErr } = await sb
        .from("tournament_run_groups")
        .insert(groupsPayload)
        .select("id,position,name");

      if (gErr) throw new Error(gErr.message);

      const groupDbIdByClientId = new Map<string, string>();
      for (const row of (insertedGroups ?? []) as any[]) {
        const pos = Number(row.position);
        if (!Number.isFinite(pos) || pos < 1) continue;
        const g = groups[pos - 1];
        if (!g) continue;
        groupDbIdByClientId.set(String(g.id), String(row.id));
      }
      if (groupDbIdByClientId.size !== groups.length) {
        throw new Error("Errore mapping gironi (clientId -> dbId).");
      }

      const gpPayload = groups.flatMap((g) => {
        const dbGroupId = groupDbIdByClientId.get(String(g.id));
        if (!dbGroupId) return [];
        const pids = Array.isArray(g.pairIds) ? g.pairIds : [];
        return pids.map((registrationId) => ({
          group_id: dbGroupId,
          pair_id: mapRegToRunPair(String(registrationId)),
        }));
      });

      if (gpPayload.length) {
        const { error: gpErr } = await sb.from("tournament_run_group_pairs").insert(gpPayload);
        if (gpErr) throw new Error(gpErr.message);
      }

      const wizardMatchMeta = new Map<string, { court: number | null; starts_at: string | null; round_label: string | null }>();
      for (const m of body.matches ?? []) {
        if (m.stage !== "group") continue;
        if (!m.groupId) continue;
        const dbGid = groupDbIdByClientId.get(String(m.groupId));
        if (!dbGid) continue;

        const k = makeKey(dbGid, mapRegToRunPair(m.homePairId), mapRegToRunPair(m.awayPairId));
        wizardMatchMeta.set(k, {
          court: m.court ?? null,
          starts_at: normalizeStartsAt(m.startsAt),
          round_label: m.roundLabel ? String(m.roundLabel) : "Girone",
        });
      }

      const { data: dbGp, error: dbGpErr } = await sb
        .from("tournament_run_group_pairs")
        .select("group_id,pair_id")
        .in(
          "group_id",
          (insertedGroups ?? []).map((x: any) => String(x.id))
        );

      if (dbGpErr) throw new Error(dbGpErr.message);

      const pairIdsByGroup = new Map<string, string[]>();
      for (const row of (dbGp ?? []) as any[]) {
        const gid = String(row.group_id);
        const pid = String(row.pair_id);
        const arr = pairIdsByGroup.get(gid) ?? [];
        arr.push(pid);
        pairIdsByGroup.set(gid, arr);
      }

      const matchesToInsert: any[] = [];
      let autoCourt = 1;

      for (const gRow of (insertedGroups ?? []) as any[]) {
        const gid = String(gRow.id);
        const pids = pairIdsByGroup.get(gid) ?? [];
        if (pids.length < 2) continue;

        const legs: 1 | 2 =
          format === "group_only" ? (Number(body.roundRobinLegs ?? 1) === 2 ? 2 : 1) : 1;

        const combos = generateRoundRobinPairs(pids, legs);

        for (const c of combos) {
          const k = makeKey(gid, c.home, c.away);
          const meta = wizardMatchMeta.get(k);

          matchesToInsert.push({
            run_id: runId,
            stage: "group",
            group_id: gid,
            round_label: meta?.round_label ?? "Girone",
            home_pair_id: c.home,
            away_pair_id: c.away,
            court: meta?.court ?? ((autoCourt - 1) % courtsCount) + 1,
            starts_at: meta?.starts_at ?? null,

            // punteggi null
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
          });

          autoCourt++;
        }
      }

      if (matchesToInsert.length === 0) {
        throw new Error("Nessuna partita generata: controlla che ogni girone abbia almeno 2 coppie.");
      }

      const { error: mErr } = await sb.from("tournament_run_matches_fp").insert(matchesToInsert);
      if (mErr) throw new Error(mErr.message);

      if (format === "groups_and_bracket") {
  const q = Math.trunc(Number(body.qualifiersCount ?? 0));
  if (!q || q < 2) throw new Error("Qualificate tabellone non valide");

  // non puoi qualificare più di quante coppie ci sono nei gironi
  const totalInGroups = (body.groups ?? []).reduce((acc, g) => acc + (Array.isArray(g.pairIds) ? g.pairIds.length : 0), 0);
  if (q > totalInGroups) throw new Error("Qualificate tabellone non valide: > coppie nei gironi");
}

    }

        // 8) SOLO TABELLONE (BRACKET_ONLY)
    // TDS rispettate:
    // - Seed 1 e Seed 2 in lati opposti
    // - Seed 3/4 distribuiti
    // - se non potenza di 2: play-in tra seed basse / non-TDS
    // - ordine match deterministico tramite created_at progressivo
    if (format === "bracket_only") {
      const requestedParticipants = Math.trunc(
        Number(body.bracketParticipantsCount ?? main.length)
      );

      const participantsCount = Math.max(
        2,
        Math.min(main.length, requestedParticipants || main.length)
      );

      if (participantsCount < 2) {
        throw new Error("Servono almeno 2 coppie");
      }

      const allMainRegistrationIds = main.map((r) => String(r.id));

      const selectedSeedRegistrationIds = seedRegistrationIds.filter((rid) =>
        allMainRegistrationIds.includes(String(rid))
      );

      if (selectedSeedRegistrationIds.length > participantsCount) {
        throw new Error("Numero TDS superiore ai partecipanti del tabellone");
      }

      const seedRunPairIds = selectedSeedRegistrationIds.map((rid) =>
        mapRegToRunPair(String(rid))
      );

      const seedSet = new Set(seedRunPairIds);

      const nonSeedRegistrationIds = allMainRegistrationIds.filter(
        (rid) => !selectedSeedRegistrationIds.includes(rid)
      );

      const shuffledNonSeedRunPairIds = shuffle(
        nonSeedRegistrationIds.map((rid) => mapRegToRunPair(rid))
      );

      const allSeededPlayers = [
        ...seedRunPairIds,
        ...shuffledNonSeedRunPairIds,
      ].slice(0, participantsCount);

      const q = allSeededPlayers.length;
      const size = nextPow2(q);
      const isPowerOfTwo = size === q;

      const mainSize = isPowerOfTwo ? q : size / 2;
      const playInMatches = isPowerOfTwo ? 0 : q - mainSize;
      const playInPlayersCount = playInMatches * 2;
      const directCount = q - playInPlayersCount;

      if (mainSize < 2) {
        throw new Error("Tabellone non valido");
      }

      if (directCount < 0) {
        throw new Error("Tabellone non valido: play-in incoerente");
      }

      const directPlayers = allSeededPlayers.slice(0, directCount);
      const playInPlayers = allSeededPlayers.slice(directCount);

      const rows: any[] = [];
      const orderBase = Date.now();
      let orderIndex = 0;

      const makeMatchRow = (
        roundLabel: string,
        home: string | null,
        away: string | null
      ) => {
        orderIndex += 1;

        return {
          run_id: runId,
          stage: "bracket",
          group_id: null,
          round_label: roundLabel,
          home_pair_id: home,
          away_pair_id: away,
          court: null,
          starts_at: null,

          // serve per ordinare in modo stabile auto-advance
          created_at: new Date(orderBase + orderIndex * 1000).toISOString(),

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
        };
      };

      // ==========================
      // PLAY-IN
      // ==========================
      if (playInMatches > 0) {
        const playInLabel = roundLabelForSize(size);

        const playInTop = playInPlayers.slice(0, playInMatches);
        const playInBottom = playInPlayers.slice(playInMatches).reverse();

        for (let i = 0; i < playInMatches; i++) {
          const home = playInTop[i] ?? null;
          const away = playInBottom[i] ?? null;

          if (!home || !away) {
            throw new Error("Errore costruzione play-in");
          }

          rows.push(makeMatchRow(playInLabel, home, away));
        }
      }

      // ==========================
      // ==========================
// MAIN ROUND
// ==========================
const placeholders: Array<{ type: "placeholder"; index: number }> =
  Array.from({ length: playInMatches }).map((_, index) => ({
    type: "placeholder",
    index,
  }));

const mainSeeds: Array<string | { type: "placeholder"; index: number } | null> = [
  ...directPlayers,
  ...placeholders,
];

if (mainSeeds.length !== mainSize) {
  throw new Error("Errore costruzione tabellone principale");
}

function mainSeed(seedNumber: number) {
  return mainSeeds[seedNumber - 1] ?? null;
}

function mainPairId(entry: string | { type: "placeholder"; index: number } | null) {
  return typeof entry === "string" ? entry : null;
}

function buildMainRoundSeedPairs(size: number): Array<[number, number]> {
  if (size === 2) return [[1, 2]];

  if (size === 4) {
    return [
      [1, 4],
      [2, 3],
    ];
  }

  if (size === 8) {
    return [
      [1, 8],
      [4, 5],
      [3, 6],
      [2, 7],
    ];
  }

  if (size === 16) {
    return [
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],

      [3, 14],
      [6, 11],
      [7, 10],
      [2, 15],
    ];
  }

  // fallback semplice
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= size / 2; i++) {
    out.push([i, size + 1 - i]);
  }
  return out;
}

const mainLabel = roundLabelForSize(mainSize);
const mainSeedPairs = buildMainRoundSeedPairs(mainSize);

for (const [homeSeed, awaySeed] of mainSeedPairs) {
  const homeEntry = mainSeed(homeSeed);
  const awayEntry = mainSeed(awaySeed);

  rows.push(
    makeMatchRow(
      mainLabel,
      mainPairId(homeEntry),
      mainPairId(awayEntry)
    )
  );
}

      // ==========================
      // ROUND SUCCESSIVI VUOTI
      // ==========================
      let curSize = mainSize;

      while (curSize > 2) {
        const nextSize = curSize / 2;
        const label = roundLabelForSize(nextSize);

        for (let i = 0; i < nextSize / 2; i++) {
          rows.push(makeMatchRow(label, null, null));
        }

        curSize = nextSize;
      }

      const { error: bmErr } = await sb
        .from("tournament_run_matches_fp")
        .insert(rows);

      if (bmErr) throw new Error(bmErr.message);

      const pairNameByRunPairId = new Map<string, string>();
      for (const rp of (insertedPairs ?? []) as any[]) {
        pairNameByRunPairId.set(
          String(rp.id),
          pairDisplayName(
            main.find((r) => String(r.id) === String(rp.registration_id)) as RegRow
          )
        );
      }

      const bracketDraw = {
        generated_at: new Date().toISOString(),
        participantsCount: q,
        seeds: allSeededPlayers.map((pairId, index) => ({
          seed: index + 1,
          pairId,
          name: pairNameByRunPairId.get(pairId) ?? pairId,
          isTds: seedSet.has(pairId),
        })),
        structure: {
          type: "bracket_only_seeded",
          size,
          mainSize,
          playInMatches,
          directCount,
          rules: [
            "TDS ordinate prima dei non-TDS",
            "Non-TDS sorteggiate",
            "Seed 1 e Seed 2 su lati opposti del tabellone",
            "Play-in solo se i partecipanti non sono potenza di 2",
          ],
        },
      };

      const mergedRules = { ...(rules ?? {}), bracketDraw };

      const { error: ruleErr } = await sb
        .from("tournament_runs")
        .update({ rules: mergedRules })
        .eq("id", runId);

      if (ruleErr) throw new Error(ruleErr.message);
    }

    // 9) running
    const { error: uerr } = await sb
      .from("tournament_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", runId);

    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

    return NextResponse.json({ tournamentId, runId, reused: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
  }
}
