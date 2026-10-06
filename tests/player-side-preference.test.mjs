import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261019100000_player_side_preferences.sql');
const profile=read('src/lib/playerProfile.ts');
const profileUi=read('src/components/PlayerProfileFields.tsx');
const request=read('src/lib/moviRequests.ts');
const form=read('src/app/richieste/RequestForm.tsx');
const matching=read('src/lib/playerMatching.ts');
const activities=read('src/lib/activitiesServer.ts');
const telegram=read('src/lib/moviRequests.ts');

test('migration adds separate nullable constrained profile and request fields without defaults, indexes or backfill',()=>{
  assert.match(migration,/add column preferred_side text/);
  assert.match(migration,/add column playing_side text/);
  assert.match(migration,/preferred_side is null or preferred_side in \('right','left','any'\)/);
  assert.match(migration,/playing_side is null or playing_side in \('right','left','any'\)/);
  assert.doesNotMatch(migration,/create index[\s\S]*(preferred_side|playing_side)/i);
  assert.doesNotMatch(migration,/update public\.(player_profiles|movi_requests) set (preferred_side|playing_side)/i);
});

test('profile contract is optional, shared and merge-safe without changing completeness',()=>{
  assert.match(profile,/preferred_side:PlayingSide\|null/);
  assert.match(profile,/preferred_side:null/);
  assert.match(profileUi,/Lato di gioco preferito/);
  assert.match(profileUi,/type="radio"/);
  assert.match(migration,/player_profile_write_user/);
  assert.match(migration,/player_profile_write_operator/);
  assert.match(migration,/select new\.merged_into_player_id,descriptive_level,preferred_side/);
  assert.doesNotMatch(read('src/lib/playerProfileCompleteness.ts'),/preferred.?side/i);
});

test('new requests require a single side and the form prefill never overwrites a touched choice',()=>{
  assert.match(request,/if\(!isPlayingSide\(b\.playing_side\)\)throw/);
  assert.match(form,/sideTouched\.current/);
  assert.match(form,/!sideTouched\.current/);
  assert.match(form,/playing_side: null/);
  assert.match(form,/name="playing_side"/);
  assert.match(form,/required onChange/);
  assert.doesNotMatch(form,/playing_side.*checkbox/);
});

test('side remains private to owned and operator surfaces',()=>{
  assert.match(activities,/playingSideLabel\(r\.playing_side\)/);
  assert.match(telegram,/r\.playing_side\?\[\x60Lato del richiedente:/);
  assert.doesNotMatch(read('src/app/api/partners/[slug]/route.ts')+read('src/app/api/tournaments/route.ts'),/preferred_side|playing_side/);
});

test('matching implements the audited soft score and keeps the existing threshold and cap',()=>{
  assert.match(matching,/score: 10, max: 10, detail: "Lato complementare"/);
  assert.match(matching,/score: 7, max: 10, detail: "Disponibile su entrambi i lati"/);
  assert.match(matching,/score: 5, max: 10, detail: "Lato candidato non indicato"/);
  assert.match(matching,/score: 2, max: 10, detail: "Stesso lato preferito"/);
  assert.match(matching,/PLAYER_MATCH_THRESHOLD = 50/);
  assert.match(matching,/PLAYER_MATCH_LIMIT = 20/);
});
