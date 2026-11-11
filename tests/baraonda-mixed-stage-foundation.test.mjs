import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261111123038_baraonda_mixed_stage_ranking_destination.sql");
const openRegistrationMigration = read("supabase/migrations/20261111172126_baraonda_mixed_open_registration_eligibility.sql");
const create = read("src/app/api/admin/tournaments/route.ts");
const edit = read("src/app/api/admin/tournaments/[id]/route.ts");
const publicRegistration = read("src/app/api/tournaments/[id]/registrations/route.ts");
const close = read("src/app/api/admin/tournaments/[id]/run/close/route.ts");
const start = read("src/app/api/admin/tournaments/[id]/run/start/route.ts");
const publicCircuit = read("src/app/api/circuits/[slug]/route.ts");
const publicPage = read("src/app/circuiti/[slug]/page.tsx");
const form = read("src/app/admin/tournaments/_components/TournamentDialogForm.tsx");
const table = read("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.tsx");
const adminRegistration = read("src/app/api/admin/tournaments/[id]/registrations/route.ts");
const originalAdminRegistrationRpc = read("supabase/migrations/20261110100817_admin_tournament_player_identity.sql");
const route = read("src/app/api/admin/tournaments/[id]/mixed-preparation/route.ts");

test("ranking destination is additive with category fallback and hard cross-circuit guard", () => {
  assert.match(migration, /add column circuit_ranking_group_id uuid references public\.circuit_ranking_groups/);
  assert.match(migration, /new\.circuit_id is distinct from g\.circuit_id/);
  assert.match(migration, /t\.circuit_ranking_group_id is null and category=t\.category/);
  assert.doesNotMatch(migration, /update public\.circuit_results|update public\.tournaments set circuit_ranking_group_id/i);
  for (const source of [create, edit, publicRegistration, close]) {
    assert.match(source, /circuit_ranking_group_id/);
    assert.match(source, /\.eq\("category",/);
  }
});

test("Admin registration RPC retains identity logic and changes only ranking destination validation", () => {
  const marker = "create or replace function public.admin_tournament_register_players(";
  const oldFunction = originalAdminRegistrationRpc.split(marker)[1].split("revoke all on function public.admin_tournament_register_players")[0];
  const newFunction = migration.split(marker)[1].split("commit;")[0];
  const oldGuard = "select 1 from public.circuit_ranking_groups g where g.circuit_id=t.circuit_id and g.category=t.category and g.level=lower(t.level)";
  const newGuard = "select 1 from public.circuit_ranking_groups g where g.circuit_id=t.circuit_id and g.level=lower(t.level) and ((t.circuit_ranking_group_id is not null and g.id=t.circuit_ranking_group_id) or (t.circuit_ranking_group_id is null and g.category=t.category))";
  assert.ok(oldFunction.includes(oldGuard));
  assert.equal(newFunction.trim(), oldFunction.replace(oldGuard, newGuard).trim());
});

test("Misto stage retains operative category while using explicit Libero destination", () => {
  assert.match(publicCircuit, /t\.circuit_ranking_group_id === group\.id/);
  assert.match(publicCircuit, /category: t\.category/);
  assert.match(publicPage, /nextStage\.category/);
  assert.match(form, /Classifica di destinazione/);
  assert.match(form, /punti confluiranno nella classifica/);
});

test("unknown gender is explicit and cannot become male during run creation", () => {
  assert.match(table, /Genere iscrizione: \{gender \?\? "Non indicato"\}/);
  assert.match(table, /Profilo MOVI: \{suggestion\}/);
  assert.match(adminRegistration, /p1Identity\?\.status === "active" && !p1Identity\.merged_into_player_id/);
  assert.match(adminRegistration, /p1Account\?\.identity_status === "active" && !p1Account\.merged_into_user_id/);
  assert.match(start, /if \(g !== "M" && g !== "F"\) throw/);
  assert.match(start, /Completa il genere di tutti i giocatori/);
  assert.match(migration, /set p1_gender = p_gender/);
  assert.match(migration, /set p2_gender = p_gender/);
  assert.doesNotMatch(migration, /update public\.users set gender|update public\.player_identities set gender/i);
});

test("conversion is explicit, server checked, and frozen after any run", () => {
  assert.match(route, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(route, /\.rpc\("admin_tournament_prepare_mixed"/);
  assert.match(migration, /unknown_count > 0 then reason := 'GENERE_NON_INDICATO'/);
  assert.match(migration, /male_count <> female_count/);
  assert.match(migration, /if not p_confirm then raise exception 'CATEGORY_CONFIRMATION_REQUIRED'/);
  assert.match(migration, /TOURNAMENT_CATEGORY_FROZEN/);
  assert.match(migration, /old\.closed_at is not null or old\.circuit_snapshot_created/);
  assert.match(migration, /source_tournament_id = old\.id/);
  assert.match(migration, /reason := 'TAPPA_GIA_CONCLUSA'/);
  assert.match(migration, /before insert on public\.tournament_runs/);
});

test("open registrations allow Misto preparation while run insertion revalidates the main roster", () => {
  const preparation = openRegistrationMigration.split("create or replace function public.admin_tournament_prepare_mixed(")[1]
    .split("-- Revalidate the actual main roster")[0];
  assert.ok(preparation);
  assert.doesNotMatch(preparation, /t\.registrations_open/);
  assert.match(preparation, /unknown_count > 0 then reason := 'GENERE_NON_INDICATO'/);
  assert.match(preparation, /male_count <> female_count/);
  assert.match(preparation, /not is_reserve/);
  assert.match(openRegistrationMigration, /create or replace function public\.tournament_run_category_lock\(\)/);
  assert.match(openRegistrationMigration, /where id = new\.tournament_id for update/);
  assert.match(openRegistrationMigration, /raise exception 'MIXED_PARTICIPANTS_INVALID'/);
  assert.match(openRegistrationMigration, /update public\.tournaments set registrations_open = false/);
  assert.match(start, /\.eq\("is_reserve", false\)/);
  assert.match(start, /if \(category === "misto"\)/);
  assert.match(start, /runErr\?\.message\.includes\("MIXED_PARTICIPANTS_INVALID"\)/);
  assert.match(start, /\.update\(\{ registrations_open: false \}\)/);
  assert.doesNotMatch(openRegistrationMigration, /(?:update|delete|insert into) public\.circuit_results/i);
});
