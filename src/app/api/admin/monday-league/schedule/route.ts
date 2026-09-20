import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const denied = await guardAdmin(); if (denied) return denied;
  const sb = supabaseAdmin();
  const { data: season } = await sb.from("league_seasons").select("id,name,timezone").neq("status", "archived").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!season) return NextResponse.json({ data: null });
  const { data: phase, error } = await sb.from("league_phases").select("id,status").eq("season_id", season.id).eq("code", "phase1").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [{ data: rounds }, { data: teams }, { data: venues }] = await Promise.all([
    sb.from("league_rounds").select("id,round_number,play_date,status,schedule_version").eq("phase_id", phase.id).order("round_number"),
    sb.from("league_teams").select("id,name").eq("season_id", season.id),
    sb.from("league_venues").select("id,code,name,league_venue_slots(id,local_time,is_active)").eq("is_active", true).order("name"),
  ]);
  const roundIds = (rounds ?? []).map((round) => round.id);
  const { data: matches, error: matchError } = roundIds.length ? await sb.from("league_matches")
    .select("id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,schedule_version,match_status,current_result_id,current_special_outcome_id")
    .in("round_id", roundIds).order("created_at") : { data: [], error: null };
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 });
  return NextResponse.json({ data: { season, phase, rounds: rounds ?? [], matches: matches ?? [], teams: teams ?? [], venues: venues ?? [] } });
}
