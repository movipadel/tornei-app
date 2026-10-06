import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === './playingSide') return { url: new URL('../../src/lib/playingSide.ts', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });

const { parseRequest, romeDay, transitions, userRequestDTO, requestTelegramText } = await import('../../src/lib/moviRequests.ts');
const { notificationAttempt } = await import('../../src/lib/requestNotification.ts');

const base = {
  request_type: 'gioca', clubs: [], date_mode: 'flexible', requested_date: null,
  time_window: 'evening', preferred_time_text: '', level: 'unknown', playing_side: 'left',
  match_type: ['any'], group_size: 1, required_player_side: null,
  training_type: null, training_goal: null, notes: '',
  client_request_id: 'aaaa0000-0000-4000-8000-000000000001',
};

test('request validation, ownership and type-specific fields', () => {
  assert.equal(parseRequest(base).request_type, 'gioca');
  const allenati = { ...base, request_type: 'allenati', match_type: null, group_size: null, training_type: ['advice'], training_goal: ['learn'] };
  assert.equal(parseRequest(allenati).match_type, null);
  for (const value of [
    { user_id: 'other' }, { status: 'found' }, { clubs: ['Other'] }, { clubs: ['Manta', 'Manta'] },
    { date_mode: 'specific', requested_date: '2027-02-30' }, { group_size: null }, { request_type: 'bad' },
    { notes: 'x'.repeat(1001) }, { match_type: [] }, { match_type: ['any', 'mixed'] }, { match_type: ['invalid'] },
  ]) assert.throws(() => parseRequest({ ...base, ...value }));
});

test('Gioca group size and fourth-player side combinations are enforced independently from playing side', () => {
  for (const group_size of [1, 2]) {
    const parsed = parseRequest({ ...base, group_size, playing_side: 'left' });
    assert.equal(parsed.group_size, group_size);
    assert.equal(parsed.required_player_side, null);
    assert.equal(parsed.playing_side, 'left');
  }
  for (const required_player_side of ['right', 'left', 'any']) {
    const parsed = parseRequest({ ...base, group_size: 3, required_player_side, playing_side: 'left' });
    assert.equal(parsed.group_size, 3);
    assert.equal(parsed.required_player_side, required_player_side);
    assert.equal(parsed.playing_side, 'left');
  }
  for (const value of [
    { group_size: 0 }, { group_size: 4 }, { group_size: 1, required_player_side: 'right' },
    { group_size: 2, required_player_side: 'any' }, { group_size: 3, required_player_side: null },
    { group_size: 3, required_player_side: 'center' },
    { request_type: 'allenati', match_type: null, group_size: 1, training_type: ['advice'], training_goal: ['learn'] },
    { request_type: 'allenati', match_type: null, group_size: null, required_player_side: 'right', training_type: ['advice'], training_goal: ['learn'] },
  ]) assert.throws(() => parseRequest({ ...base, ...value }));
});

test('multi-select fields preserve order, deduplicate and enforce catch-all exclusivity', () => {
  assert.deepEqual(parseRequest({ ...base, match_type: ['male', 'mixed', 'male'] }).match_type, ['male', 'mixed']);
  const allenati = { ...base, request_type: 'allenati', match_type: null, group_size: null, training_type: ['individual', 'group', 'individual'], training_goal: ['technique', 'regular', 'other'] };
  assert.deepEqual(parseRequest(allenati).training_type, ['individual', 'group']);
  assert.deepEqual(parseRequest(allenati).training_goal, ['technique', 'regular', 'other']);
  assert.throws(() => parseRequest({ ...allenati, training_type: ['advice', 'group'] }));
});

test('playing side is required and single-valued', () => {
  for (const playing_side of [undefined, null, '', 'center', ['left']]) assert.throws(() => parseRequest({ ...base, playing_side }));
  for (const playing_side of ['right', 'left', 'any']) assert.equal(parseRequest({ ...base, playing_side }).playing_side, playing_side);
});

test('Telegram renders group and fourth side without conflating requester side', () => {
  const common = { ...base, id: 'request-id', user_id: 'user-id', status: 'received', created_at: 'now', updated_at: 'now', cancelled_at: null, found_at: null, completed_at: null };
  const groupThree = requestTelegramText({ ...common, group_size: 3, required_player_side: 'right', match_type: ['male', 'mixed'] }, 'Demo', '123');
  assert.match(groupThree, /Lato del richiedente: Sinistra[\s\S]*Gruppo: Siamo in 3[\s\S]*Quarto cercato: Destra[\s\S]*Tipo partita: Maschile, Misto/);
  const groupOne = requestTelegramText(common, 'Demo', '123');
  assert.match(groupOne, /Gruppo: Sono da solo/);
  assert.doesNotMatch(groupOne, /Quarto cercato/);
  assert.doesNotMatch(requestTelegramText({ ...common, playing_side: null }, 'Demo', '123'), /Lato del richiedente:/);
  const allenati = { ...common, request_type: 'allenati', match_type: null, group_size: null, training_type: ['individual', 'group'], training_goal: ['technique', 'regular'] };
  assert.match(requestTelegramText(allenati, 'Demo', '123'), /Tipo allenamento: Lezione individuale, Gruppo di allenamento · Obiettivi: Migliorare tecnica, Fare attività con continuità/);
});

test('Rome today/tomorrow midnight and DST safe dates', () => {
  const now = new Date('2026-09-25T22:30:00Z');
  assert.equal(romeDay(now), '2026-09-26');
  assert.equal(parseRequest({ ...base, date_mode: 'today' }, now).requested_date, '2026-09-26');
  assert.equal(parseRequest({ ...base, date_mode: 'tomorrow' }, new Date('2026-10-24T23:30:00Z')).requested_date, '2026-10-26');
  assert.throws(() => parseRequest({ ...base, date_mode: 'specific', requested_date: '2026-01-01' }, now));
});

test('user DTO omits internal and other-user information', () => {
  const row = { ...base, id: 'id', user_id: 'secret', status: 'found', created_at: 'now', updated_at: 'now', admin_notes: 'private', telegram_error: 'token', telegram_state: 'failed', user: { phone: 'private' } };
  const dto = userRequestDTO(row);
  assert.equal(dto.can_cancel, false);
  assert.equal(dto.group_size, 1);
  for (const key of ['user_id', 'admin_notes', 'telegram_error', 'telegram_state', 'user', 'client_request_id']) assert.equal(key in dto, false);
  assert.deepEqual(transitions.completed, []);
  assert.ok(requestTelegramText(row, 'Demo', '123').includes('ID: id'));
});

test('notification success/failure keep persistent request and record safe outcomes', async () => {
  for (const fail of [false, true]) {
    const record = { id: 'persisted' };
    await notificationAttempt('live', async () => { if (fail) throw new Error('secret-token'); return { ok: true }; }, async result => Object.assign(record, result));
    assert.equal(record.id, 'persisted');
    assert.equal(record.telegram_state, fail ? 'failed' : 'sent');
    assert.equal(record.telegram_error, fail ? 'send_failed' : null);
    assert.equal(JSON.stringify(record).includes('secret-token'), false);
    if (fail) {
      await notificationAttempt('live', async () => ({ ok: true }), async result => Object.assign(record, result));
      assert.equal(record.telegram_state, 'sent');
    }
  }
});

test('disabled local notification never invokes transport', async () => {
  let called = false;
  let result;
  await notificationAttempt('disabled', async () => { called = true; throw new Error('must not send'); }, async value => { result = value; });
  assert.equal(called, false);
  assert.equal(result.telegram_state, 'disabled');
});
