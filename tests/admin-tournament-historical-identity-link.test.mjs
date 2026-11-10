import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261110130432_admin_tournament_historical_identity_link.sql");
const route = read("src/app/api/admin/tournaments/[id]/registrations/[regId]/player-identity/route.ts");
const dialog = read("src/app/admin/tournaments/[id]/registrations/_components/HistoricalIdentityDialog.tsx");
const badge = read("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.tsx");
const badgeStyles = read("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.module.css");
const admin = read("src/app/admin/tournaments/ui.tsx");
const dedicated = read("src/app/admin/tournaments/[id]/registrations/page.tsx");

test("only Da verificare becomes an accessible action in both Admin tables", () => {
  assert.match(badge, /status === "NEEDS_REVIEW" && onVerify/);
  assert.match(badge, /<button type="button" onClick=\{onVerify\}/);
  assert.match(badge, /className=\{styles\.verifyButton\}/);
  assert.match(badgeStyles, /\.verifyButton\s*\{[^}]*min-height:\s*44px/s);
  assert.match(badgeStyles, /\.verifyButton:focus-visible/);
  assert.match(admin, /<HistoricalIdentityDialog/);
  assert.match(dedicated, /<HistoricalIdentityDialog/);
});

test("main and reserve rows open the correct player-one and player-two slot", () => {
  const main = admin.split("{mainRegs.map((r, idx) => (")[1]?.split("{reserveRegs.length > 0")[0] ?? "";
  const reserve = admin.split("{reserveRegs.map((r, idx) => (")[1]?.split("</TableBody>")[0] ?? "";
  for (const rows of [main, reserve]) {
    assert.match(rows, /registrationIdentityTarget\(tid, r, "p1"\)/);
    assert.match(rows, /registrationIdentityTarget\(tid, r, "p2"\)/);
  }
  assert.match(dialog, /currentIdentityId: slot === "p1" \? row\.p1_player_identity_id : row\.p2_player_identity_id/);
  assert.match(dialog, /isReserve: row\.is_reserve/);
  assert.match(dialog, /onLinked=|onLinked\(\)/);
});

test("search, explicit selection, comparison and create-new use the canonical path", () => {
  assert.match(dialog, /\/api\/admin\/tournaments\/players\/search\?q=/);
  assert.match(dialog, /Profilo MOVI.*Identità sportiva.*Account da collegare/);
  assert.match(dialog, /setSelected\(candidate\)/);
  assert.match(dialog, /comparableName\(selectedName\)/);
  assert.match(dialog, /comparablePhone\(selectedPhone\)/);
  assert.match(dialog, /Crea nuovo giocatore/);
  assert.match(dialog, /Collega giocatore/);
  assert.match(dialog, /expected_candidate_name: selected\.display_name/);
});

test("protected endpoint delegates one confirmed mutation to the transactional RPC", () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(route, /p_actor: operator\.sid/);
  assert.match(route, /\.rpc\("admin_tournament_link_registration_identity"/);
  assert.doesNotMatch(route, /\.from\("(?:tournament_registrations|circuit_results)"\)/);
  assert.match(migration, /p_data->>'confirmed'<>'true'/);
  assert.match(migration, /for update/);
  assert.match(migration, /expected_current_identity_id/);
  assert.match(migration, /CANDIDATE_CHANGED/);
});

test("RPC updates only the selected registration FK and preserves circuit and legacy user data", () => {
  assert.match(migration, /set p1_player_identity_id=p\.id where id=r\.id/);
  assert.match(migration, /set p2_player_identity_id=p\.id where id=r\.id/);
  assert.doesNotMatch(migration, /(?:update|insert into|delete from)\s+public\.(?:circuit_results|tournament_run_participants|tournament_run_matches|circuit_ranking_groups)\b/i);
  assert.doesNotMatch(migration, /set\s+user_id\s*=/i);
  assert.match(migration, /SAME_PLAYER_TWICE/);
  assert.match(migration, /PLAYER_ALREADY_REGISTERED/);
  assert.doesNotMatch(migration, /registrations_open/);
});

test("account resolution and new identity creation remain in the same RPC transaction", () => {
  assert.match(migration, /resolved:=public\.player_profile_resolve_account\(u\.id\)/);
  assert.match(migration, /insert into public\.player_identities/);
  assert.match(migration, /insert into public\.player_identity_events/);
  assert.match(migration, /grant execute on function public\.admin_tournament_link_registration_identity\(uuid,uuid,uuid,jsonb\)\s+to service_role/);
  const emailTrigger = read("supabase/migrations/20261021100000_user_email_notifications.sql");
  assert.match(emailTrigger, /after insert or update of is_reserve or delete on public\.tournament_registrations/);
});
