import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261113203000_public_tournament_registration_duplicate_phone_fallback.sql", "utf8");
const acceptance = readFileSync("supabase/tests/public_tournament_duplicate_guard.sql", "utf8");

test("duplicate guard stays in the atomic, service-only registration RPC", () => {
  assert.match(migration, /create or replace function public\.public_tournament_register_self\(/i);
  assert.match(migration, /r\.tournament_id=t\.id/);
  assert.match(migration, /r\.user_id=u\.id/);
  assert.match(migration, /r\.p1_player_identity_id=p1\.id or r\.p2_player_identity_id=p1\.id/);
  assert.match(migration, /p2\.id is not null and \(r\.p1_player_identity_id=p2\.id or r\.p2_player_identity_id=p2\.id\)/);
  assert.match(migration, /grant execute on function public\.public_tournament_register_self.*to service_role/);
});

test("blank phone keys cannot collide and canonical links precede phone fallback", () => {
  assert.match(migration, /key1<>'' and \(/);
  assert.match(migration, /key2<>'' and \(/);
  assert.match(migration, /r\.p1_player_identity_id is null and r\.user_id is null/);
  assert.match(migration, /r\.p2_player_identity_id is null/);
  assert.match(migration, /p2\.id is null or/);
  assert.doesNotMatch(migration, /movi_activity_phone_key\(r\.p[12]_phone\) in \(key1,key2\)/);
  assert.doesNotMatch(migration, /r\.p1_name\s*=|r\.p2_name\s*=/);
});

test("synthetic SQL covers false positives and legitimate duplicates with rollback", () => {
  for (const label of [
    "BLANK_COMPANION_FALSE_DUPLICATE", "SAME_ACCOUNT_OR_IDENTITY_ACCEPTED",
    "RESERVE_DUPLICATE_ACCEPTED", "PROMOTED_RESERVE_DUPLICATE_ACCEPTED",
    "REMOVED_REGISTRATION_STILL_BLOCKED", "SHARED_PHONE_CANONICAL_FALSE_DUPLICATE",
    "UNLINKED_PHONE_DUPLICATE_ACCEPTED", "OTHER_TOURNAMENT_BLOCKED",
    "HISTORY_OR_RESULT_BLOCKED_NEW_REGISTRATION", "NAME_ONLY_FALSE_DUPLICATE",
    "DISTINCT_COMPANION_NOT_LINKED", "EXISTING_P2_ACCEPTED_AS_P1",
    "SELF_COMPANION_ACCEPTED",
  ]) assert.match(acceptance, new RegExp(label));
  assert.match(acceptance, /^begin;/m);
  assert.match(acceptance, /^rollback;/m);
});

test("forward migration does not alter rankings, results, identity tables or schema", () => {
  assert.doesNotMatch(migration, /(?:alter table|create table)\s+public\./i);
  assert.doesNotMatch(migration, /(?:insert into|update|delete from)\s+(?:public\.)?(?:circuit_results|circuit_rankings|player_identities)\b/i);
  assert.match(migration, /insert into public\.tournament_registrations\(/);
});
