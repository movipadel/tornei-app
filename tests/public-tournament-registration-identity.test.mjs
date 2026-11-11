import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const post = read("src/app/api/tournaments/[id]/registrations/route.ts");
const search = read("src/app/api/tournaments/[id]/players/search/route.ts");
const dialog = read("src/components/tournaments/RegistrationDialog.tsx");
const sql = read("supabase/migrations/20261111160000_public_tournament_registration_identity.sql");

test("self registration uses a service-only atomic RPC and ignores client P1 fields", () => {
  assert.match(post, /getUserIdFromCookie\(\)/);
  assert.match(post, /rpc\("public_tournament_register_self"/);
  assert.doesNotMatch(post, /body\.p1_(name|phone|gender|player_identity_id)/);
  assert.match(sql, /player_profile_resolve_account\(u\.id\)/);
  assert.match(sql, /p1\.account_user_id is distinct from u\.id/);
  assert.match(sql, /insert into public\.tournament_registrations/);
  assert.match(sql, /revoke all on function public\.public_tournament_register_self.*from public,anon,authenticated/);
  assert.match(sql, /grant execute on function public\.public_tournament_register_self.*to service_role/);
});

test("gender conflict is explicit and known genders are snapshotted for all categories", () => {
  assert.match(sql, /p1\.gender<>u\.gender/);
  assert.match(sql, /PLAYER1_GENDER_CONFLICT/);
  assert.match(sql, /g1:=coalesce\(p1\.gender,u\.gender\)/);
  assert.match(sql, /p2\.gender<>p2_account\.gender/);
  assert.match(sql, /g2:=coalesce\(p2\.gender,p2_account\.gender\)/);
  assert.match(sql, /p1\.full_name,p1\.normalized_phone,g1/);
});

test("public search is authenticated and returns only minimal canonical candidate data", () => {
  assert.match(search, /getUserIdFromCookie\(\)/);
  assert.match(search, /if \(!uid\).*401/);
  assert.match(search, /\.eq\("status", "active"\)/);
  assert.match(search, /\.slice\(0, 8\)/);
  assert.match(search, /player_identity_id: row\.id/);
  assert.match(search, /masked_phone: maskPhone/);
  assert.doesNotMatch(search, /email|internal_notes|case_type|auth_migration_state/);
  assert.doesNotMatch(search, /\.select\([^)]*gender/);
});

test("selection is explicit, editing clears it, and typed names never auto-link", () => {
  assert.match(dialog, /setSelectedCompanion\(s\)/);
  assert.match(dialog, /payload\.p2_player_identity_id = selectedCompanion\.player_identity_id/);
  assert.match(dialog, /setSelectedCompanion\(null\)/);
  assert.match(sql, /A typed name is a snapshot only/);
  assert.match(sql, /p2\.id\)/);
  assert.doesNotMatch(sql, /insert into public\.player_identities/);
});

test("historical data and Baraonda ranking remain untouched", () => {
  assert.doesNotMatch(sql, /update public\.tournament_registrations|update public\.circuit_results|delete from public\.circuit_results/i);
  assert.doesNotMatch(sql, /insert into public\.circuit_results/i);
  assert.match(sql, /reserve_flag:=main_count>=floor\(t\.max_participants\/2\)/);
  assert.match(sql, /t\.circuit_ranking_group_id is null and g\.category=t\.category/);
});
