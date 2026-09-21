import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../migrations/20260924100000_monday_league_prerelease_remediation.sql", import.meta.url), "utf8");
const adminServer = readFileSync(new URL("../../src/lib/monday-league/admin-server.ts", import.meta.url), "utf8");

test("H1 guards generic authoritative replacements and both readiness paths", () => {
  for (const name of ["league_admin_correct_result", "league_set_match_special_outcome", "league_set_match_workflow_state"]) {
    const start = migration.indexOf(`FUNCTION public.${name}`);
    assert.notEqual(start, -1, `${name} replacement missing`);
    assert.match(migration.slice(start, start + 5000), /OPEN_CONTEST_REQUIRES_RESOLUTION/);
  }
  assert.match(migration, /c\.match_id=m\.id AND c\.status='open'/);
  assert.match(migration, /open_contests/);
  assert.match(migration, /FOR UPDATE;[\s\S]*FOR UPDATE OF m/);
  assert.match(adminServer, /OPEN_CONTEST_REQUIRES_RESOLUTION:[\s\S]*Esiste una contestazione aperta/);
});

test("M1 rewrites every installed Monday League team CTA producer", () => {
  assert.match(migration, /p\.prosrc LIKE '%\/monday-league\/team\/%'/);
  assert.match(migration, /replace\(v_definition,'\/monday-league\/team\/','\/monday-league\/squadre\/'\)/);
  assert.match(migration, /ML_NOTIFICATION_TEAM_ROUTE_REMEDIATION_FAILED/);
});

test("L1 revokes exactly the four audited trigger-only grants", () => {
  const expected = ["league_preserve_revealed_lineups_on_reschedule", "league_block_result_reschedule", "league_enqueue_audit_notification", "league_enqueue_reschedule_notification"];
  const revoked = [...migration.matchAll(/REVOKE EXECUTE ON FUNCTION public\.(league_[a-z0-9_]+)\(\) FROM PUBLIC,anon,authenticated;/g)].map((match) => match[1]);
  assert.deepEqual(revoked, expected);
});
