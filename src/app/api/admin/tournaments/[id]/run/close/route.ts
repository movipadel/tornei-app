import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type TournamentRow = {
  id: string;
  name: string | null;
  type: string | null;
  category: string | null;
  level: string | null;
  date: string | null;
  circuit_id: string | null;
};

type RunRow = {
  id: string;
  mode: string | null;
  status: string | null;
  rules: any;
  created_at: string | null;
};

type CircuitRuleRow = {
  id: string;
  circuit_id: string;
  min_admissions: number;
  max_admissions: number;
  rule_type: "placement" | "stage";
  placement: number | null;
  stage: string | null;
  points: number;
};

type RankingGroupRow = {
  id: string;
};

type BaraondaParticipantRow = {
  id: string;
  name: string;
  phone: string | null;
};

type BaraondaMatchRow = {
  id: string;
  p1_id: string;
  p2_id: string;
  p3_id: string;
  p4_id: string;
  team1_games: number | null;
  team2_games: number | null;
  completed_at: string | null;
};

type FixedPairRunRow = {
  id: string;
  registration_id: string;
  name: string;
};

type TournamentRegistrationRow = {
  id: string;
  p1_name: string;
  p1_phone: string;
  p1_gender: string | null;
  p2_name: string | null;
  p2_phone: string | null;
  p2_gender: string | null;
};

type FixedMatchRow = {
  id: string;
  stage: string;
  round_label: string | null;
  home_pair_id: string | null;
  away_pair_id: string | null;
  completed_at: string | null;
};

type CircuitResultInsertRow = {
  circuit_id: string;
  ranking_group_id: string;
  source_tournament_id: string;
  tournament_name: string;
  tournament_type: string;
  tournament_date: string | null;
  player_key: string;
  player_name: string;
  player_phone: string | null;
  placement: number | null;
  points: number;
};

const normalizePhone = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[().-]/g, "");

const buildPlayerKey = (phone: string) =>
  normalizePhone(phone)
    .replace(/^(\+39|0039)/, "")
    .replace(/[^\d]/g, "");

function normStage(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normStageKey(value: string | null | undefined) {
  return normStage(value).toLowerCase();
}

function stageRank(value: string | null | undefined) {
  const s = normStageKey(value);

  if (s.includes("girone")) return 0;
  if (s.includes("sedices")) return 10;
  if (s.includes("ottav")) return 20;
  if (s.includes("quart")) return 30;
  if (s.includes("semi")) return 40;
  if (s.includes("final")) return 50;

  return 0;
}

function sortBaraondaStandings(a: any, b: any) {
  // 1) Game vinti
  if (b.gw !== a.gw) return b.gw - a.gw;

  // 2) Punti
  if (b.pt !== a.pt) return b.pt - a.pt;

  // 3) Game persi (meno è meglio)
  if (a.gl !== b.gl) return a.gl - b.gl;

  // 4) Differenza game
  if (b.dg !== a.dg) return b.dg - a.dg;

  // 5) Nome
  return String(a.name).localeCompare(String(b.name));
}

function getPlacementPoints(
  rules: CircuitRuleRow[],
  admissions: number,
  placement: number
) {
  const rule = rules.find(
    (r) =>
      r.rule_type === "placement" &&
      placement === r.placement &&
      admissions >= Number(r.min_admissions) &&
      admissions <= Number(r.max_admissions)
  );

  return rule ? Number(rule.points) : 0;
}

function getStagePoints(
  rules: CircuitRuleRow[],
  admissions: number,
  stage: string
) {
  const normalizedStage = normStageKey(stage);

  const exactRule = rules.find(
    (r) =>
      r.rule_type === "stage" &&
      normStageKey(r.stage) === normalizedStage &&
      admissions >= Number(r.min_admissions) &&
      admissions <= Number(r.max_admissions)
  );

  if (exactRule) return Number(exactRule.points);

  const othersRule = rules.find(
    (r) =>
      r.rule_type === "stage" &&
      normStageKey(r.stage) === "others" &&
      admissions >= Number(r.min_admissions) &&
      admissions <= Number(r.max_admissions)
  );

  return othersRule ? Number(othersRule.points) : 0;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const { id: tournamentId } = await ctx.params;
  if (!tournamentId) {
    return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  try {
    // 1) torneo
    const { data: t, error: terr } = await sb
      .from("tournaments")
      .select("id,name,type,category,level,date,circuit_id")
      .eq("id", tournamentId)
      .single();

    if (terr) {
      return NextResponse.json({ error: terr.message }, { status: 500 });
    }
    if (!t) {
      return NextResponse.json({ error: "Torneo non trovato" }, { status: 404 });
    }

    const tournament = t as TournamentRow;

    // 2) run attiva
    const { data: activeRun, error: rerr } = await sb
      .from("tournament_runs")
      .select("id,mode,status,rules,created_at")
      .eq("tournament_id", tournamentId)
      .in("status", ["locked", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rerr) {
      return NextResponse.json({ error: rerr.message }, { status: 500 });
    }

    if (!activeRun?.id) {
      const { data: lastRun, error: lerr } = await sb
        .from("tournament_runs")
        .select("id,mode,status,rules,created_at")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lerr) {
        return NextResponse.json({ error: lerr.message }, { status: 500 });
      }

      if (lastRun?.status === "completed") {
        return NextResponse.json(
          {
            tournamentId,
            runId: lastRun.id,
            alreadyClosed: true,
            circuit: Boolean(tournament.circuit_id),
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { error: "Nessuna run attiva da chiudere" },
        { status: 400 }
      );
    }

    const run = activeRun as RunRow;
    const runId = String(run.id);
    const mode = String(run.mode ?? "");

    // 3) se circuito, recupera ranking group e regole
    let rankingGroupId: string | null = null;
    let rules: CircuitRuleRow[] = [];

    if (tournament.circuit_id) {
      const { data: group, error: gerr } = await sb
        .from("circuit_ranking_groups")
        .select("id")
        .eq("circuit_id", tournament.circuit_id)
        .eq("category", String(tournament.category ?? ""))
        .eq("level", String(tournament.level ?? "").toLowerCase())
        .maybeSingle();

      if (gerr) {
        return NextResponse.json({ error: gerr.message }, { status: 500 });
      }

      if (!group) {
        return NextResponse.json(
          { error: "Nessun gruppo ranking per questo torneo nel circuito" },
          { status: 400 }
        );
      }

      rankingGroupId = (group as RankingGroupRow).id;

      const { data: prules, error: perr } = await sb
        .from("circuit_points_rules")
        .select("id,circuit_id,min_admissions,max_admissions,rule_type,placement,stage,points")
        .eq("circuit_id", tournament.circuit_id);

      if (perr) {
        return NextResponse.json({ error: perr.message }, { status: 500 });
      }

      rules = (prules ?? []) as CircuitRuleRow[];
    }

    // 4) calcolo risultati finali circuito
    let circuitRows: CircuitResultInsertRow[] = [];

    if (tournament.circuit_id && rankingGroupId) {
      // ======================
      // BARAONDA
      // ======================
      if (mode === "baraonda") {
        const { data: participants, error: perr } = await sb
          .from("tournament_run_participants")
          .select("id,name,phone")
          .eq("run_id", runId);

        if (perr) {
          return NextResponse.json({ error: perr.message }, { status: 500 });
        }

        const plist = (participants ?? []) as BaraondaParticipantRow[];

        const { data: turns, error: terr2 } = await sb
          .from("tournament_run_turns")
          .select("id")
          .eq("run_id", runId);

        if (terr2) {
          return NextResponse.json({ error: terr2.message }, { status: 500 });
        }

        const turnIds = (turns ?? []).map((x: any) => String(x.id));

        const { data: matches, error: merr } = await sb
          .from("tournament_run_matches")
          .select("id,p1_id,p2_id,p3_id,p4_id,team1_games,team2_games,completed_at")
          .in("turn_id", turnIds.length ? turnIds : ["__none__"]);

        if (merr) {
          return NextResponse.json({ error: merr.message }, { status: 500 });
        }

        const mlist = (matches ?? []) as BaraondaMatchRow[];

        const incomplete = mlist.filter(
          (m) =>
            m.completed_at == null ||
            m.team1_games == null ||
            m.team2_games == null
        );

        if (incomplete.length > 0) {
          return NextResponse.json(
            { error: "Impossibile chiudere: ci sono partite Baraonda non completate" },
            { status: 400 }
          );
        }

        const standings = plist.map((p) => ({
          participantId: String(p.id),
          name: String(p.name ?? ""),
          phone: String(p.phone ?? ""),
          pt: 0,
          gw: 0,
          gl: 0,
          dg: 0,
        }));

        const standingById = new Map<string, any>(
          standings.map((s) => [s.participantId, s])
        );

        const tieWinValue = Number(run.rules?.tieWinValue ?? 0.5);

        for (const m of mlist) {
          const team1Ids = [String(m.p1_id), String(m.p2_id)];
          const team2Ids = [String(m.p3_id), String(m.p4_id)];

          const team1Games = Number(m.team1_games ?? 0);
          const team2Games = Number(m.team2_games ?? 0);

          for (const pid of team1Ids) {
            const row = standingById.get(pid);
            if (!row) continue;
            row.gw += team1Games;
            row.gl += team2Games;
          }

          for (const pid of team2Ids) {
            const row = standingById.get(pid);
            if (!row) continue;
            row.gw += team2Games;
            row.gl += team1Games;
          }

          if (team1Games > team2Games) {
            for (const pid of team1Ids) {
              const row = standingById.get(pid);
              if (row) row.pt += 1;
            }
          } else if (team2Games > team1Games) {
            for (const pid of team2Ids) {
              const row = standingById.get(pid);
              if (row) row.pt += 1;
            }
          } else {
            for (const pid of [...team1Ids, ...team2Ids]) {
              const row = standingById.get(pid);
              if (row) row.pt += tieWinValue;
            }
          }
        }

        for (const row of standings) {
          row.dg = row.gw - row.gl;
        }

        const sorted = [...standings].sort(sortBaraondaStandings);
        const admissions = plist.length;

        circuitRows = sorted.flatMap((row, idx) => {
          const placement = idx + 1;
          const points = getPlacementPoints(rules, admissions, placement);
          const playerKey = buildPlayerKey(row.phone);

          if (!playerKey) return [];

          return [
            {
              circuit_id: tournament.circuit_id as string,
              ranking_group_id: rankingGroupId as string,
              source_tournament_id: tournamentId,
              tournament_name: tournament.name ?? "Torneo",
              tournament_type: tournament.type ?? "",
              tournament_date: tournament.date ?? null,
              player_key: playerKey,
              player_name: row.name,
              player_phone: normalizePhone(row.phone) || null,
              placement,
              points,
            },
          ];
        });
      }

      // ======================
      // FIXED PAIRS
      // ======================
      if (mode === "fixed_pairs") {
        const { data: runPairs, error: rperr } = await sb
          .from("tournament_run_pairs")
          .select("id,registration_id,name")
          .eq("run_id", runId);

        if (rperr) {
          return NextResponse.json({ error: rperr.message }, { status: 500 });
        }

        const pairList = (runPairs ?? []) as FixedPairRunRow[];
        const registrationIds = pairList.map((p) => String(p.registration_id));

        const { data: regs, error: regerr } = await sb
          .from("tournament_registrations")
          .select("id,p1_name,p1_phone,p1_gender,p2_name,p2_phone,p2_gender")
          .in("id", registrationIds.length ? registrationIds : ["__none__"]);

        if (regerr) {
          return NextResponse.json({ error: regerr.message }, { status: 500 });
        }

        const regById = new Map<string, TournamentRegistrationRow>(
          ((regs ?? []) as TournamentRegistrationRow[]).map((r) => [String(r.id), r])
        );

        const { data: matches, error: merr } = await sb
          .from("tournament_run_matches_fp")
          .select("id,stage,round_label,home_pair_id,away_pair_id,completed_at")
          .eq("run_id", runId);

        if (merr) {
          return NextResponse.json({ error: merr.message }, { status: 500 });
        }

        const mlist = (matches ?? []) as FixedMatchRow[];

        const incomplete = mlist.filter((m) => {
          const hasAtLeastOneSide = Boolean(m.home_pair_id || m.away_pair_id);
          return hasAtLeastOneSide && !m.completed_at;
        });

        if (incomplete.length > 0) {
          return NextResponse.json(
            { error: "Impossibile chiudere: ci sono partite Coppie fisse non completate" },
            { status: 400 }
          );
        }

        const stageByPairId = new Map<string, string>();

// default: tutti "others"
for (const p of pairList) {
  stageByPairId.set(String(p.id), "others");
}

// chi compare nei vari round prende almeno quello stage
for (const m of mlist) {
  if (String(m.stage) !== "bracket") continue;

  const roundLabel = normStageKey(m.round_label);
  const homeId = m.home_pair_id ? String(m.home_pair_id) : null;
  const awayId = m.away_pair_id ? String(m.away_pair_id) : null;

  if (roundLabel.includes("quart")) {
  if (homeId) stageByPairId.set(homeId, "quarterfinalist");
  if (awayId) stageByPairId.set(awayId, "quarterfinalist");
}

if (roundLabel.includes("semi")) {
  if (homeId) stageByPairId.set(homeId, "semifinalist");
  if (awayId) stageByPairId.set(awayId, "semifinalist");
}

// IMPORTANTISSIMO:
// finale sì, semifinale no
if (roundLabel.includes("final") && !roundLabel.includes("semi")) {
  if (homeId) stageByPairId.set(homeId, "finalist");
  if (awayId) stageByPairId.set(awayId, "finalist");
}
}

const finalMatch = mlist.find(
  (m) => String(m.stage) === "bracket" && normStageKey(m.round_label).includes("final")
);

if (finalMatch && finalMatch.completed_at) {
  const { data: finalScore, error: finalErr } = await sb
    .from("tournament_run_matches_fp")
    .select(`
      id,
      home_pair_id,
      away_pair_id,
      completed_at,
      home_games,
      away_games,
      home_sets,
      away_sets
    `)
    .eq("id", finalMatch.id)
    .single();

  if (finalErr) {
    return NextResponse.json({ error: finalErr.message }, { status: 500 });
  }

  const fm: any = finalScore;
  const homeId = fm.home_pair_id ? String(fm.home_pair_id) : null;
  const awayId = fm.away_pair_id ? String(fm.away_pair_id) : null;

  let winnerPairId: string | null = null;

  if (fm.home_sets != null && fm.away_sets != null) {
    if (Number(fm.home_sets) > Number(fm.away_sets)) winnerPairId = homeId;
    if (Number(fm.away_sets) > Number(fm.home_sets)) winnerPairId = awayId;
  } else if (fm.home_games != null && fm.away_games != null) {
    if (Number(fm.home_games) > Number(fm.away_games)) winnerPairId = homeId;
    if (Number(fm.away_games) > Number(fm.home_games)) winnerPairId = awayId;
  }

  if (winnerPairId) {
    stageByPairId.set(winnerPairId, "winner");
  }
}

        const admissions = pairList.length;

        circuitRows = pairList.flatMap((pair) => {
          const reg = regById.get(String(pair.registration_id));
          if (!reg) return [];

          const stage = stageByPairId.get(String(pair.id)) ?? "Girone";
          const points = getStagePoints(rules, admissions, stage);

          const rows: CircuitResultInsertRow[] = [];

          const p1Key = buildPlayerKey(reg.p1_phone);
          if (p1Key) {
            rows.push({
              circuit_id: tournament.circuit_id as string,
              ranking_group_id: rankingGroupId as string,
              source_tournament_id: tournamentId,
              tournament_name: tournament.name ?? "Torneo",
              tournament_type: tournament.type ?? "",
              tournament_date: tournament.date ?? null,
              player_key: p1Key,
              player_name: reg.p1_name,
              player_phone: normalizePhone(reg.p1_phone) || null,
              placement: null,
              points,
            });
          }

          const p2Key = buildPlayerKey(String(reg.p2_phone ?? ""));
          if (p2Key && reg.p2_name) {
            rows.push({
              circuit_id: tournament.circuit_id as string,
              ranking_group_id: rankingGroupId as string,
              source_tournament_id: tournamentId,
              tournament_name: tournament.name ?? "Torneo",
              tournament_type: tournament.type ?? "",
              tournament_date: tournament.date ?? null,
              player_key: p2Key,
              player_name: reg.p2_name,
              player_phone: normalizePhone(String(reg.p2_phone ?? "")) || null,
              placement: null,
              points,
            });
          }

          return rows;
        });
      }
    }

    // 5) scrittura circuito idempotente
    if (tournament.circuit_id && rankingGroupId) {
      const { error: derr } = await sb
        .from("circuit_results")
        .delete()
        .eq("source_tournament_id", tournamentId);

      if (derr) {
        return NextResponse.json({ error: derr.message }, { status: 500 });
      }

      if (circuitRows.length > 0) {
        const { error: ierr } = await sb
          .from("circuit_results")
          .insert(circuitRows);

        if (ierr) {
          return NextResponse.json({ error: ierr.message }, { status: 500 });
        }
      }
    }

    // 6) chiusura run SOLO alla fine
    const { error: uerr } = await sb
      .from("tournament_runs")
      .update({ status: "completed" })
      .eq("id", runId);

    if (uerr) {
      return NextResponse.json({ error: uerr.message }, { status: 500 });
    }

    // 7) iscrizioni restano chiuse
    const { error: terr2 } = await sb
      .from("tournaments")
      .update({ registrations_open: false })
      .eq("id", tournamentId);

    if (terr2) {
      return NextResponse.json({ error: terr2.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        tournamentId,
        runId,
        closed: true,
        circuit: Boolean(tournament.circuit_id),
        pointsAssigned: Boolean(tournament.circuit_id),
        circuitRowsInserted: circuitRows.length,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore" },
      { status: 500 }
    );
  }
}