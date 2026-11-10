import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registrationAccountStatus } from "../src/lib/tournamentRegistrationAccountStatus.ts";

const identity = { id: "player-1", status: "active", merged_into_player_id: null, account_user_id: "account-1" };
const account = { id: "account-1", identity_status: "active", merged_into_user_id: null };

test("active canonical identity with an existing active account is linked", () => {
  assert.equal(registrationAccountStatus(identity.id, identity, account), "ACCOUNT_LINKED");
});

test("active canonical identity without an account remains identity only", () => {
  assert.equal(registrationAccountStatus(identity.id, { ...identity, account_user_id: null }, undefined), "IDENTITY_ONLY");
});

test("legacy, missing, non-canonical and uncertified links need review", () => {
  assert.equal(registrationAccountStatus(null, undefined, undefined), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, undefined, undefined), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, { ...identity, status: "merged", merged_into_player_id: "player-2" }, account), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, { ...identity, status: "archived" }, account), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, identity, undefined), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, identity, { ...account, identity_status: "merged", merged_into_user_id: "account-2" }), "NEEDS_REVIEW");
  assert.equal(registrationAccountStatus(identity.id, identity, { ...account, id: "account-2" }), "NEEDS_REVIEW");
});

test("two player slots are classified independently", () => {
  const playerOne = registrationAccountStatus(identity.id, identity, account);
  const playerTwoIdentity = { ...identity, id: "player-2", account_user_id: null };
  const playerTwo = registrationAccountStatus(playerTwoIdentity.id, playerTwoIdentity, undefined);
  assert.deepEqual([playerOne, playerTwo], ["ACCOUNT_LINKED", "IDENTITY_ONLY"]);
});

test("Admin list uses read-only identity/account evidence and distinct badges", () => {
  const route = readFileSync("src/app/api/admin/tournaments/[id]/registrations/route.ts", "utf8");
  const table = readFileSync("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.tsx", "utf8");
  const tableStyles = readFileSync("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.module.css", "utf8");
  const get = route.split("export async function GET")[1]?.split("export async function DELETE")[0] ?? "";
  assert.match(get, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(get, /p1_player_identity_id,p2_player_identity_id/);
  assert.match(get, /from\("player_identities"\)\.select\("id,status,merged_into_player_id,account_user_id"\)/);
  assert.match(get, /from\("users"\)\.select\("id,identity_status,merged_into_user_id"\)/);
  assert.match(get, /p1_account_status: registrationAccountStatus/);
  assert.match(get, /p2_account_status: row\.p2_name/);
  assert.doesNotMatch(get, /\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(table, /Account MOVI/);
  assert.match(table, /Senza account/);
  assert.match(table, /Da verificare/);
  assert.match(table, /showP2 && r\.p2_name/);
  assert.match(table, /aria-hidden="true"/);
  assert.match(tableStyles, /@media \(min-width: 640px\)/);
  assert.match(tableStyles, /\.phoneColumn\s*\{\s*display: table-cell;/);
  assert.match(tableStyles, /\.phoneInline\s*\{\s*display: none;/);
});

test("actual Admin tournament accordion renders each player status in main and reserve rows", () => {
  const page = readFileSync("src/app/admin/tournaments/page.tsx", "utf8");
  const ui = readFileSync("src/app/admin/tournaments/ui.tsx", "utf8");
  const table = readFileSync("src/app/admin/tournaments/[id]/registrations/_components/RegistrationsTable.tsx", "utf8");
  assert.match(page, /import ClientTournaments from "\.\/ui"/);
  assert.match(ui, /import \{ AccountStatusBadge \} from "\.\/\[id\]\/registrations\/_components\/RegistrationsTable"/);
  assert.match(table, /export function AccountStatusBadge/);
  assert.match(ui, /fetch\(`\/api\/admin\/tournaments\/\$\{tournamentId\}\/registrations`, \{ cache: "no-store" \}\)/);
  assert.match(ui, /p1_account_status: RegistrationAccountStatus/);
  assert.match(ui, /p2_account_status: RegistrationAccountStatus \| null/);

  const main = ui.split("{mainRegs.map((r, idx) => (")[1]?.split("{reserveRegs.length > 0")[0] ?? "";
  const reserve = ui.split("{reserveRegs.map((r, idx) => (")[1]?.split("</TableBody>")[0] ?? "";
  for (const rows of [main, reserve]) {
    assert.match(rows, /<AccountStatusBadge status=\{r\.p1_account_status \?\? "NEEDS_REVIEW"\} onVerify=/);
    assert.match(rows, /r\.p2_name \? \(/);
    assert.match(rows, /<AccountStatusBadge status=\{r\.p2_account_status \?\? "NEEDS_REVIEW"\} onVerify=/);
    assert.doesNotMatch(rows, /<TableHead>Account<\/TableHead>/);
  }
});
