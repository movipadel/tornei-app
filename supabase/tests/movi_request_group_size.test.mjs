import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261020100000_movi_request_group_size.sql', 'utf8');

test('atomic migration backfills every historical Gioca request before removing has_partner', () => {
  assert.match(migration, /add column group_size smallint/);
  assert.match(migration, /when has_partner then 2[\s\S]*else 1/);
  assert.match(migration, /where request_type = 'gioca'/);
  assert.ok(migration.indexOf('update public.movi_requests') < migration.indexOf('drop column has_partner'));
  assert.match(migration, /drop column has_partner/);
});

test('migration encodes group, fourth-player side and Allenati invariants', () => {
  assert.match(migration, /group_size in \(1,\s*2,\s*3\)/);
  assert.match(migration, /required_player_side in \('right',\s*'left',\s*'any'\)/);
  assert.match(migration, /group_size in \(1,\s*2\) and required_player_side is null/);
  assert.match(migration, /group_size = 3 and required_player_side is not null and required_player_side in \('right',\s*'left',\s*'any'\)/);
  assert.match(migration, /request_type = 'allenati'[\s\S]*group_size is null[\s\S]*required_player_side is null/);
});
