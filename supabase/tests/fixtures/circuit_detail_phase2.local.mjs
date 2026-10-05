import { createClient } from "@supabase/supabase-js";
if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") throw new Error("Local runner required");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const check = ({ error }) => { if (error) throw error; };
const circuit = "31000000-0000-4000-8000-000000000001", otherCircuit = "31000000-0000-4000-8000-000000000002";
const group = "32000000-0000-4000-8000-000000000001", otherGroup = "32000000-0000-4000-8000-000000000005";
const user = "eded6000-0000-4000-8000-000000000001", otherUser = "eded6000-0000-4000-8000-000000000002";
const profiles = await db.from("users").select("id,full_name").in("id", [user, otherUser]); check(profiles);
const identities = await db.from("player_identities").select("id,account_user_id").in("account_user_id", [user, otherUser]).neq("status", "merged"); check(identities);
const profile = new Map(profiles.data.map((row) => [row.id, row])), identity = new Map(identities.data.map((row) => [row.account_user_id, row.id]));
if (!profile.get(user) || !identity.get(user) || !identity.get(otherUser)) throw new Error("Run request and identity fixtures first");
const tournaments = [
  { id: "33000000-0000-4000-8000-000000000002", circuit_id: circuit, name: "Tappa storica Manta", type: "Baraonda", category: "Maschile", level: "intermedio", date: "2026-09-12", time: "20:00", location: "MOVI Club Manta", max_participants: 16, registrations_open: false },
  { id: "33000000-0000-4000-8000-000000000003", circuit_id: circuit, name: "Tappa storica Revello", type: "Baraonda", category: "Maschile", level: "intermedio", date: "2026-09-19", time: "21:00", location: "MOVI Club Revello", max_participants: 16, registrations_open: false },
  { id: "33000000-0000-4000-8000-000000000004", circuit_id: otherCircuit, name: "Tappa altro circuito", type: "Baraonda", category: "Libero", level: "principiante", date: "2026-09-20", time: "19:00", location: "MOVI Club Saluzzo", max_participants: 16, registrations_open: false },
];
check(await db.from("tournaments").upsert(tournaments));
check(await db.from("circuit_results").upsert([
  { id: "34000000-0000-4000-8000-000000000001", circuit_id: circuit, ranking_group_id: group, source_tournament_id: tournaments[0].id, tournament_name: tournaments[0].name, tournament_type: "Baraonda", tournament_date: tournaments[0].date, player_key: "phase2-user", player_name: profile.get(user).full_name, player_identity_id: identity.get(user), placement: 2, points: 220 },
  { id: "34000000-0000-4000-8000-000000000002", circuit_id: circuit, ranking_group_id: group, source_tournament_id: tournaments[1].id, tournament_name: tournaments[1].name, tournament_type: "Baraonda", tournament_date: tournaments[1].date, player_key: "phase2-user", player_name: profile.get(user).full_name, player_identity_id: identity.get(user), placement: 1, points: 300 },
  { id: "34000000-0000-4000-8000-000000000003", circuit_id: circuit, ranking_group_id: group, source_tournament_id: tournaments[0].id, tournament_name: tournaments[0].name, tournament_type: "Baraonda", tournament_date: tournaments[0].date, player_key: "phase2-other", player_name: profile.get(otherUser).full_name, player_identity_id: identity.get(otherUser), placement: 1, points: 260 },
  { id: "34000000-0000-4000-8000-000000000004", circuit_id: otherCircuit, ranking_group_id: otherGroup, source_tournament_id: tournaments[2].id, tournament_name: tournaments[2].name, tournament_type: "Baraonda", tournament_date: tournaments[2].date, player_key: "phase2-other", player_name: profile.get(otherUser).full_name, player_identity_id: identity.get(otherUser), placement: 1, points: 100 },
]));
console.log("Circuit detail Phase 2 LOCAL fixtures ready.");
