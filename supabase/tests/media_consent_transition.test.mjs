import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consumeMediaConsentIntentIfAvailable, mediaConsentRpcMissing,
  mediaConsentSchemaAvailable, mediaConsentViewMissing } from '../../src/lib/mediaConsentCompatibility.ts';

const missingRpc = name => ({ code: 'PGRST202', message: `Could not find the function public.${name}(p_user_id) in the schema cache` });
const missingIntents = { code: 'PGRST205', message: "Could not find the table 'public.user_media_signup_intents' in the schema cache" };

function fakeDb(rpcError = null, tableError = null) {
  const calls = [];
  return {
    calls,
    rpc: async (name) => { calls.push(name); return { data: [], error: rpcError }; },
    from: (name) => {
      calls.push(name);
      const query = { select: () => query, limit: async () => ({ data: [], error: tableError }) };
      return query;
    },
  };
}

test('pre-120000 schema hides optional consent without blocking Auth linking', async () => {
  const missing = missingRpc('current_user_media_consent');
  const db = fakeDb(missing);
  assert.equal(await mediaConsentSchemaAvailable(db), false);
  assert.deepEqual(db.calls, ['current_user_media_consent']);
  const linker = fakeDb(missingRpc('consume_user_media_signup_intent'));
  await consumeMediaConsentIntentIfAvailable(linker, 'auth-id');
  assert.deepEqual(linker.calls, ['consume_user_media_signup_intent']);
  assert.equal(mediaConsentViewMissing({ code: 'PGRST205', message: "Could not find the table 'public.user_media_consent_current'" }), true);
});

test('post-120000 schema enables consent and consumes signup intent', async () => {
  const db = fakeDb();
  assert.equal(await mediaConsentSchemaAvailable(db), true);
  await consumeMediaConsentIntentIfAvailable(db, 'auth-id');
  assert.deepEqual(db.calls, ['current_user_media_consent', 'user_media_signup_intents', 'consume_user_media_signup_intent']);
});

test('missing intent table and unrelated database errors fail safely', async () => {
  assert.equal(await mediaConsentSchemaAvailable(fakeDb(null, missingIntents)), false);
  const other = { code: '42501', message: 'permission denied' };
  await assert.rejects(mediaConsentSchemaAvailable(fakeDb(other)), error => error === other);
  await assert.rejects(consumeMediaConsentIntentIfAvailable(fakeDb(other), 'auth-id'), error => error === other);
  assert.equal(mediaConsentRpcMissing({ code: 'PGRST202', message: 'missing public.another_rpc()' }, 'current_user_media_consent'), false);
});

test('pre-migration route and UI guards keep Customer Hub, signup and profile available', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(read('../../src/lib/customerHubServer.ts'), /mediaConsentRpcMissing/);
  assert.match(read('../../src/app/api/admin/players/route.ts'), /mediaConsentViewMissing/);
  assert.match(read('../../src/app/admin/players/page.tsx'), /customer\.media_consent_available \?/);
  assert.match(read('../../src/app/api/auth/signup/route.ts'), /mediaConsentSchemaAvailable\(admin\)/);
  assert.match(read('../../src/components/MoviAuthForm.tsx'), /mediaConsentAvailable \? <Check name="media_consent"/);
  assert.match(read('../../src/components/MediaConsentAdmin.tsx'), /!available \?/);
  assert.match(read('../../src/components/MediaConsentCard.tsx'), /!state\.available \?/);
});
