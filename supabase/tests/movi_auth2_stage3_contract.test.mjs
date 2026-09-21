import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/20260928100000_movi_auth2_stage3_merge_engine.sql");
const resolver = read("../../src/lib/currentMoviUser.ts");
const queue = read("../../src/app/api/admin/users/duplicates/route.ts");
const preview = read("../../src/app/api/admin/users/duplicates/preview/route.ts");
const execute = read("../../src/app/api/admin/users/duplicates/execute/route.ts");
const ui = read("../../src/app/admin/users/duplicates/page.tsx");
const legacyLogin = read("../../src/app/api/user/login/route.ts");
const captainSearch = read("../../src/app/api/admin/monday-league/users/search/route.ts");

test("candidate discovery uses strong normalized signals and excludes invalid phones", () => {
  assert.match(migration, /normalize_user_email\(email\).*HAVING count\(\*\)>1/s);
  assert.match(migration, /normalize_user_mobile_e164\(phone\).*HAVING count\(\*\)>1/s);
  assert.match(migration, /lower\(regexp_replace\(btrim\(full_name\).*'manual-review'/s);
  assert.match(migration, /generate_series\(1,length\(n\.normalized_phone\)\).*masked_phone.*weak_identity_signal/s);
});

test("preview fingerprints profile state, auth links, domain counts, and conflicts", () => {
  assert.match(migration, /CREATE FUNCTION public\.user_merge_fingerprint/);
  assert.match(migration, /updated_at.*auth.*status/s);
  assert.match(migration, /same_team.*same_tournament.*same_run/s);
  assert.match(migration, /STALE_PREVIEW/);
});

test("merge is locked, transactional, replay-safe, journaled, and soft-only", () => {
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /IF op\.status='completed'.*idempotent/s);
  assert.match(migration, /EXCEPTION WHEN OTHERS.*rolled_back/s);
  assert.match(migration, /identity_status='merged'/);
  assert.match(migration, /INSERT INTO public\.user_identity_aliases/);
  assert.doesNotMatch(migration, /DELETE FROM public\.users/i);
});

test("domain policies are explicit and preserve historical evidence", () => {
  for (const domain of ["business_idempotency", "communications", "monday_league", "moviback", "medical_certificates", "store", "tournaments", "profile_and_consent"]) {
    assert.match(migration, new RegExp(`'${domain}'`));
  }
  assert.match(migration, /historical_actor_ids','preserved'/);
  assert.match(migration, /snapshots','unchanged'/);
  assert.match(migration, /phones_names_player_keys','unchanged'/);
  assert.match(migration, /marketing_accepted=\(c\.marketing_accepted AND s\.marketing_accepted\)/);
});

test("merged legacy users do not gain canonical authorization", () => {
  assert.match(resolver, /eq\("identity_status", "active"\)/g);
  assert.match(migration, /MOVI_AUTH_MERGED_USER_CANNOT_LINK_AUTH/);
  assert.match(migration, /OLD\.identity_status = 'merged' AND NEW IS DISTINCT FROM OLD/);
  assert.match(migration, /'authorization',false/);
  assert.doesNotMatch(resolver, /resolve_canonical_user_id/);
  assert.match(legacyLogin, /existing\?\.identity_status === "merged"/);
  assert.match(captainSearch, /eq\("identity_status", "active"\)/);
});

test("duplicate APIs are admin-only and execution requires explicit confirmation", () => {
  for (const route of [queue, preview, execute]) assert.match(route, /guardAdmin\(\)/);
  assert.match(execute, /confirmation !== "MERGE"/);
  assert.match(execute, /preview_reviewed_user_merge/);
  assert.match(execute, /create_reviewed_user_merge_operation/);
});

test("admin UI exposes review, exclusion, preview, conflicts and explicit merge", () => {
  assert.match(ui, /Incluso/);
  assert.match(ui, /Usa come canonico/);
  assert.match(ui, /Aggiorna preflight/);
  assert.match(ui, /Merge bloccato/);
  assert.match(ui, /Digita MERGE/);
  assert.match(ui, /reference_counts/);
});

test("Stage 3 never changes session precedence or implements automatic merge", () => {
  assert.doesNotMatch(migration, /CREATE TRIGGER[^;]*execute_user_merge/is);
  assert.doesNotMatch(queue + preview, /execute_user_merge/);
  assert.match(execute, /create_(?:reviewed_)?user_merge_operation/);
});
