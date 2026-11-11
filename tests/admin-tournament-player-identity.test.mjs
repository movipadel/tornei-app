import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPublicCircuitRanking } from "../src/lib/circuitPublicRanking.ts";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261110100817_admin_tournament_player_identity.sql");
const form = read("src/app/admin/tournaments/[id]/registrations/RegistrationForm.tsx");
const formStyles = read("src/app/admin/tournaments/[id]/registrations/RegistrationForm.module.css");
const search = read("src/app/api/admin/tournaments/players/search/route.ts");
const admin = read("src/app/api/admin/tournaments/[id]/registrations/route.ts");
const publicPost = read("src/app/api/tournaments/[id]/registrations/route.ts");

test("Admin player search has tournament permission, bounded results, and separate account-only candidates", () => {
  assert.match(search, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(search, /player_identity_identifiers/);
  assert.match(search, /Account da collegare/);
  assert.match(search, /data\.slice\(0, 12\)/);
  assert.match(search, /digits\.length < 4/);
});

test("both slots require explicit selection and clear it when name or phone changes", () => {
  assert.match(form, /<PlayerSlot number=\{1\}/);
  assert.match(form, /<PlayerSlot number=\{2\}/);
  assert.match(form, /selection: null/);
  assert.match(form, /Seleziona o crea ogni giocatore/);
  assert.match(form, /Crea nuovo giocatore/);
  assert.match(form, /aria-autocomplete="list"/);
  assert.match(form, /aria-activedescendant/);
});

test("autocomplete cards stay inside the name column and distinguish player states", () => {
  const dropdown = formStyles.match(/\.suggestions\s*\{([^}]+)\}/)?.[1] ?? "";
  const email = formStyles.match(/\.suggestionEmail\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(form, /className=\{styles\.suggestions\}/);
  assert.match(dropdown, /width:\s*100%/);
  assert.match(dropdown, /max-width:\s*100%/);
  assert.doesNotMatch(dropdown, /position:\s*absolute/);
  assert.match(dropdown, /overflow-x:\s*hidden/);
  assert.match(email, /text-overflow:\s*ellipsis/);
  assert.match(formStyles, /\.suggestionMeta,[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(form, /styles\.profileBadge[\s\S]*styles\.accountBadge[\s\S]*styles\.identityBadge/);
  assert.match(form, /\{candidate\.source\}/);
  assert.match(formStyles, /\.suggestionButton:focus-visible/);
  assert.match(formStyles, /min-height:\s*44px/);
});

test("selection indicator and separate create action preserve keyboard and clear behavior", () => {
  assert.match(form, /selectedLabel && <p className=\{styles\.selectedBadge\} role="status">/);
  assert.match(form, /onChange\(\{ \.\.\.value, \[field\]: text, selection: null \}\)/);
  assert.match(form, /event\.key === "Enter"[\s\S]*select\(candidates\[highlight\]\)/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /className=\{styles\.createAction\}/);
  assert.match(formStyles, /\.createAction\s*\{[^}]*border-top:/);
  assert.match(form, /Crea nuovo giocatore/);
});

test("new identity and registration share one guarded SQL transaction", () => {
  assert.match(migration, /begin;[\s\S]*commit;/);
  assert.match(migration, /admin_tournament_register_players/);
  assert.match(migration, /player_profile_resolve_account/);
  assert.match(migration, /EXISTING_PLAYER_OR_ACCOUNT_SELECT_REQUIRED/);
  assert.match(migration, /SAME_PLAYER_TWICE/);
  assert.match(migration, /on update restrict on delete restrict/);
  assert.match(migration, /grant execute on function public\.admin_tournament_register_players\(uuid,uuid,jsonb\) to service_role/);
  assert.match(admin, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(admin, /p_actor: operator\.sid/);
  assert.doesNotMatch(admin, /getUserIdFromCookie/);
  assert.ok(admin.indexOf('schedulePostCommitNotifications("/api/admin') > admin.indexOf('rpc("admin_tournament_register_players"'));
  assert.match(admin, /tournament\.registration\.created/);
});

test("public registration derives player one from the authenticated account in a single RPC", () => {
  assert.match(publicPost, /getUserIdFromCookie\(\)/);
  assert.match(publicPost, /if \(!uid\).*401/);
  assert.match(publicPost, /rpc\("public_tournament_register_self"/);
  assert.doesNotMatch(publicPost, /body\.p1_name|body\.p1_phone|body\.p1_gender/);
});

test("Baraonda synthetic fixture ranking and materialization remain unchanged", () => {
  const rows = [
    { player_key: "phase2-user", player_name: "Utente Richieste Demo 1", points: 220 },
    { player_key: "phase2-user", player_name: "Utente Richieste Demo 1", points: 300 },
    { player_key: "phase2-other", player_name: "Utente Richieste Demo 2", points: 260 },
  ];
  assert.deepEqual(buildPublicCircuitRanking(rows), [
    { position: 1, player_name: "Utente Richieste Demo 1", total_points: 520, events_played: 2 },
    { position: 2, player_name: "Utente Richieste Demo 2", total_points: 260, events_played: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.player_key), ["phase2-user", "phase2-user", "phase2-other"]);
  assert.doesNotMatch(read("src/app/api/admin/tournaments/[id]/run/close/route.ts"), /p[12]_player_identity_id/);
  assert.doesNotMatch(read("src/lib/circuitPublicRanking.ts"), /p[12]_player_identity_id/);
  assert.doesNotMatch(migration, /(?:update|insert into|delete from)\s+(?:public\.)?circuit_results\b/i);
});
