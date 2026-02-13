import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RegRow = {
  tournament_id: string;
  is_reserve: boolean;
  p1_gender: "M" | "F" | null;
  p2_gender: "M" | "F" | null;
};

export async function GET(_req: Request) {
  const sb = supabaseAdmin();

  // 1) Lista tornei
  const { data: tournaments, error: tErr } = await sb
    .from("tournaments")
    .select(
      `
      id,
      name,
      type,
      category,
      level,
      date,
      time,
      location,
      max_participants,
      image_url,
      notes,
      created_at,
      updated_at
    `
    )
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const list = (tournaments ?? []) as any[];
  const ids = list.map((t) => String(t.id));

  // 2) hasLive (run running/finished)
  const hasLiveByTournamentId = new Map<string, boolean>();
  if (ids.length) {
    const { data: runs, error: rErr } = await sb
      .from("tournament_runs")
      .select("tournament_id,status")
      .in("tournament_id", ids)
      .in("status", ["running", "finished"]);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    for (const r of runs ?? []) {
      hasLiveByTournamentId.set(String((r as any).tournament_id), true);
    }
  }

  // 3) Iscrizioni: 1 query sola per tutti i tornei → aggrego in JS
  const countsByTournamentId = new Map<
    string,
    { main: number; reserve: number; male: number; female: number }
  >();

  // init a 0
  for (const tid of ids) {
    countsByTournamentId.set(tid, { main: 0, reserve: 0, male: 0, female: 0 });
  }

  if (ids.length) {
    const { data: regs, error: regErr } = await sb
      .from("tournament_registrations")
      .select("tournament_id,is_reserve,p1_gender,p2_gender")
      .in("tournament_id", ids);

    if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

    for (const row of (regs ?? []) as RegRow[]) {
      const tid = String(row.tournament_id);
      const c = countsByTournamentId.get(tid);
      if (!c) continue;

      if (row.is_reserve) {
        c.reserve += 1;
      } else {
        c.main += 1;

        const g1 = row.p1_gender;
        const g2 = row.p2_gender;

        if (g1 === "M") c.male += 1;
        else if (g1 === "F") c.female += 1;

        if (g2 === "M") c.male += 1;
        else if (g2 === "F") c.female += 1;
      }
    }
  }

  // 4) Output: HOME si aspetta { data: [...] }
  const out = list.map((t) => {
    const tid = String(t.id);
    const c = countsByTournamentId.get(tid) ?? { main: 0, reserve: 0, male: 0, female: 0 };

    return {
      ...t,
      hasLive: hasLiveByTournamentId.get(tid) ?? false,
      registrations_count: c.main,
      reserves_count: c.reserve,
      counts: { main: c.main, reserve: c.reserve, male: c.male, female: c.female },
    };
  });

  return NextResponse.json({ data: out });
}
