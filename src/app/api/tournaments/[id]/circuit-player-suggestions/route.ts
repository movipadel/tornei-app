import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function normalizeName(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizePhone(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[().-]/g, "");
}

function maskPhone(value?: string | null) {
  const clean = normalizePhone(value);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}••••${clean.slice(-3)}`;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await ctx.params;
  const url = new URL(req.url);
  const q = normalizeName(url.searchParams.get("q"));

  if (!tournamentId) {
    return NextResponse.json({ error: "Torneo mancante" }, { status: 400 });
  }

  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const sb = supabaseAdmin();

  const { data: tournament, error: tournamentErr } = await sb
    .from("tournaments")
    .select("id,circuit_id")
    .eq("id", tournamentId)
    .single();

  if (tournamentErr || !tournament) {
    return NextResponse.json(
      { error: tournamentErr?.message ?? "Torneo non trovato" },
      { status: 404 }
    );
  }

  const circuitId = (tournament as any).circuit_id ?? null;

  if (!circuitId) {
    return NextResponse.json({ data: [] });
  }

  const { data: results, error } = await sb
    .from("circuit_results")
    .select("player_key,player_name,player_phone,created_at")
    .eq("circuit_id", circuitId)
    .ilike("player_name", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byKey = new Map<string, any>();

  for (const row of results ?? []) {
    const key = String((row as any).player_key ?? "").trim();
    const name = normalizeName((row as any).player_name);
    const phone = normalizePhone((row as any).player_phone);

    if (!key || !name || !phone) continue;
    if (byKey.has(key)) continue;

    byKey.set(key, {
      player_key: key,
      player_name: name,
      player_phone: phone,
      masked_phone: maskPhone(phone),
    });
  }

  return NextResponse.json({
    data: Array.from(byKey.values()).slice(0, 8),
  });
}