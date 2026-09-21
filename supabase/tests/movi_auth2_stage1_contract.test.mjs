import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../migrations/20260926100000_movi_auth2_stage1_identity_foundation.sql",
    import.meta.url
  ),
  "utf8"
);
const loginRoute = readFileSync(
  new URL("../../src/app/api/user/login/route.ts", import.meta.url),
  "utf8"
);
const meRoute = readFileSync(
  new URL("../../src/app/api/user/me/route.ts", import.meta.url),
  "utf8"
);
const userAuth = readFileSync(
  new URL("../../src/lib/userAuth.ts", import.meta.url),
  "utf8"
);

test("Stage 1 is additive and does not backfill or create Auth identities", () => {
  assert.match(migration, /ADD COLUMN auth_user_id uuid/);
  assert.match(migration, /REFERENCES auth\.users\(id\)[\s\S]*ON DELETE SET NULL/);
  assert.match(migration, /WHERE auth_user_id IS NOT NULL/);
  assert.doesNotMatch(migration, /INSERT INTO auth\.users/i);
  assert.doesNotMatch(migration, /UPDATE public\.users[\s\S]*auth_user_id/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.users/i);
});

test("normalization and canonical resolution helpers are restricted", () => {
  assert.match(migration, /CREATE FUNCTION public\.normalize_user_email/);
  assert.match(migration, /CREATE FUNCTION public\.normalize_user_mobile_e164/);
  assert.match(migration, /CREATE FUNCTION public\.resolve_canonical_user_id/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.resolve_canonical_user_id\(uuid\) FROM PUBLIC, anon, authenticated/
  );
  assert.match(migration, /MOVI_AUTH_ALIAS_DEPTH_EXCEEDED/);
  assert.match(migration, /MOVI_AUTH_ALIAS_CYCLE/);
});

test("alias and journal tables deny browser mutations and enable RLS", () => {
  for (const table of [
    "user_merge_operations",
    "user_identity_aliases",
    "user_merge_journal",
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`)
    );
  }
  assert.match(migration, /MOVI_AUTH_MERGE_JOURNAL_IMMUTABLE/);
  assert.match(migration, /An alias never authenticates a legacy cookie/);
});

test("legacy login and HMAC issuance remain available after the additive foundation", () => {
  assert.match(loginRoute, /\.upsert\(payload, \{ onConflict: "phone" \}\)/);
  assert.match(loginRoute, /createUserSessionToken\(data\.id\)/);
  assert.match(meRoute, /getCurrentMoviUser\(\)/);
  assert.match(meRoute, /identity\.profile/);
  assert.match(userAuth, /exp: now \+ 60 \* 60 \* 24 \* 30/);
  assert.doesNotMatch(loginRoute + meRoute + userAuth, /resolve_canonical_user_id/);
  assert.match(loginRoute, /existing\?\.auth_user_id/);
});
