import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();

  const { data: circuits, error: circuitsErr } = await sb
    .from("circuits")
    .select("id,name,slug,tournament_type,status,rules_url,created_at,updated_at")
    .in("status", ["active", "closed"])
    .order("updated_at", { ascending: false });

  if (circuitsErr) {
    return NextResponse.json({ error: circuitsErr.message }, { status: 500 });
  }

  const circuitIds = (circuits ?? []).map((c) => c.id);

  if (!circuitIds.length) {
    return NextResponse.json({ data: [] });
  }

  const { data: groups, error: groupsErr } = await sb
    .from("circuit_ranking_groups")
    .select("id,circuit_id")
    .in("circuit_id", circuitIds);

  if (groupsErr) {
    return NextResponse.json({ error: groupsErr.message }, { status: 500 });
  }

  const groupIds = (groups ?? []).map((g) => g.id);

  let results: Array<{
    ranking_group_id: string;
    source_tournament_id: string | null;
    tournament_name: string;
    tournament_date: string | null;
  }> = [];

  if (groupIds.length) {
    const { data: resultsData, error: resultsErr } = await sb
      .from("circuit_results")
      .select("ranking_group_id,source_tournament_id,tournament_name,tournament_date")
      .in("ranking_group_id", groupIds);

    if (resultsErr) {
      return NextResponse.json({ error: resultsErr.message }, { status: 500 });
    }

    results = resultsData ?? [];
  }

  const groupCountByCircuit = new Map<string, number>();
  for (const g of groups ?? []) {
    groupCountByCircuit.set(
      g.circuit_id,
      (groupCountByCircuit.get(g.circuit_id) ?? 0) + 1
    );
  }

  const groupToCircuit = new Map<string, string>();
  for (const g of groups ?? []) {
    groupToCircuit.set(g.id, g.circuit_id);
  }

  const stageKeysByCircuit = new Map<string, Set<string>>();
  for (const r of results) {
    const circuitId = groupToCircuit.get(r.ranking_group_id);
    if (!circuitId) continue;

    const key = [
      r.source_tournament_id ?? "no-source",
      r.tournament_name ?? "",
      r.tournament_date ?? "",
    ].join("__");

    if (!stageKeysByCircuit.has(circuitId)) {
      stageKeysByCircuit.set(circuitId, new Set());
    }
    stageKeysByCircuit.get(circuitId)!.add(key);
  }

  const payload = (circuits ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    tournament_type: c.tournament_type,
    status: c.status,
    rules_url: c.rules_url ?? null,
    ranking_groups_count: groupCountByCircuit.get(c.id) ?? 0,
    played_stages_count: stageKeysByCircuit.get(c.id)?.size ?? 0,
  }));

  return NextResponse.json({ data: payload });
}