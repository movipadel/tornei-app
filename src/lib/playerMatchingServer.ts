import "server-only";
import { emptySharedProfile, type SharedPlayerProfile } from "@/lib/playerProfile";
import { rankPlayerMatches, type PlayerMatchCandidate, type PlayerMatchCriteria } from "@/lib/playerMatching";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const COARSE_CANDIDATE_LIMIT = 500;

export async function findPlayerMatches(criteria: PlayerMatchCriteria) {
  const sb = supabaseAdmin();
  const players = await sb.from("player_identities")
    .select("id,full_name,normalized_phone,gender,account_user_id,status")
    .eq("status", "active")
    .is("merged_into_player_id", null)
    .order("full_name")
    .order("id")
    .limit(COARSE_CANDIDATE_LIMIT);
  if (players.error) throw new Error("Registro giocatori non disponibile");
  const ids = (players.data ?? []).map((player) => player.id);
  if (!ids.length) return [];

  const [profiles, adminProfiles, availability, cases] = await Promise.all([
    sb.from("player_profiles").select("player_identity_id,descriptive_level,preferred_side,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute").in("player_identity_id", ids),
    sb.from("player_admin_profiles").select("player_identity_id,movi_level").in("player_identity_id", ids),
    sb.from("player_profile_availability").select("player_identity_id,weekday,time_window").in("player_identity_id", ids),
    sb.from("player_identity_cases").select("player_ids").in("status", ["open", "in_review"]).overlaps("player_ids", ids),
  ]);
  if (profiles.error || adminProfiles.error || availability.error || cases.error) throw new Error("Profili giocatore non disponibili");

  const shared = new Map((profiles.data ?? []).map((profile) => [profile.player_identity_id, profile]));
  const numeric = new Map((adminProfiles.data ?? []).map((profile) => [profile.player_identity_id, profile.movi_level === null ? null : Number(profile.movi_level)]));
  const slots = new Map<string, SharedPlayerProfile["availability"]>();
  for (const slot of availability.data ?? []) {
    const current = slots.get(slot.player_identity_id) ?? [];
    current.push({ weekday: slot.weekday, time_window: slot.time_window as SharedPlayerProfile["availability"][number]["time_window"] });
    slots.set(slot.player_identity_id, current);
  }
  const warningIds = new Set<string>();
  for (const item of cases.data ?? []) for (const playerId of item.player_ids ?? []) warningIds.add(playerId);

  const candidates: PlayerMatchCandidate[] = (players.data ?? []).map((player) => {
    const profile = shared.get(player.id);
    const sharedProfile = profile ? {
      descriptive_level: profile.descriptive_level,
      preferred_side: profile.preferred_side,
      preferred_clubs: profile.preferred_clubs,
      available_other_clubs: profile.available_other_clubs,
      preferred_match_types: profile.preferred_match_types,
      available_last_minute: profile.available_last_minute,
      availability: slots.get(player.id) ?? [],
    } as SharedPlayerProfile : emptySharedProfile();
    return {
      id: player.id,
      fullName: player.full_name,
      normalizedPhone: player.normalized_phone,
      gender: player.gender,
      accountLinked: player.account_user_id !== null,
      status: player.status as PlayerMatchCandidate["status"],
      moviLevel: numeric.get(player.id) ?? null,
      profile: sharedProfile,
      identityWarning: warningIds.has(player.id),
    };
  });
  return rankPlayerMatches(candidates, criteria);
}
