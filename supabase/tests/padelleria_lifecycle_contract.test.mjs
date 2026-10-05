import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261013100000_padelleria_content_lifecycle.sql", "utf8");
const cron = readFileSync("src/app/api/cron/padelleria-content-cleanup/route.ts", "utf8");
const publicRoute = readFileSync("src/app/api/padelleria/route.ts", "utf8");
const editor = readFileSync("src/app/admin/padelleria/ContentEditor.tsx", "utf8");

test("migration is opt-in, Succede-only and database-clock based", () => {
  assert.match(migration, /delete_on_expiry boolean NOT NULL DEFAULT false/);
  assert.match(migration, /kind = 'succede' AND visible_until IS NOT NULL/);
  assert.match(migration, /visible_until < statement_timestamp\(\)/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /RETURNING c\.id/);
  assert.match(migration, /status = 'draft', deleted_at = clock_timestamp\(\)/);
});

test("cleanup is POST-only, secret protected and removes only owned storage paths", () => {
  assert.match(cron, /export async function POST/);
  assert.doesNotMatch(cron, /export async function GET/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /timingSafeEqual/);
  assert.match(cron, /ownedPath\(contentId, path\)/);
  assert.match(cron, /storage\.from\(CONTENT_BUCKET\)\.remove\(ownedPaths\)/);
  assert.match(cron, /padelleria_purge_expired_content/);
});

test("public reads remain side-effect free and hide internal lifecycle metadata", () => {
  assert.doesNotMatch(publicRoute, /claim_expired|purge_expired|\.delete\(|\.update\(/);
  assert.match(publicRoute, /key!=='delete_on_expiry'/);
});

test("Admin exposes clear featured and delete-on-expiry controls", () => {
  assert.match(editor, />In evidenza</);
  assert.match(editor, /Mostra questo contenuto prima degli altri nella Home durante la sua finestra di visibilità/);
  assert.match(editor, />Elimina alla scadenza</);
  assert.match(editor, /Imposta una data di fine per eliminare automaticamente il contenuto/);
  assert.match(editor, /input\.kind==='succede'/);
});
