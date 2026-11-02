import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const sent = [];
const selections = [];
let profile = { email: 'mario@example.invalid', full_name: 'Mario Rossi', identity_status: 'active' };
const source = readFileSync(new URL('../src/lib/userNotificationEmail.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
const mockedRequire = name => {
  if (name === 'server-only') return {};
  if (name === 'resend') return { Resend: class { emails = { send: async message => { sent.push(message); return { data: { id: 'mock-id' }, error: null }; } }; } };
  if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: () => ({ from: table => {
    assert.equal(table, 'users');
    return { select: fields => { selections.push(fields); return { eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }; } };
  } }) };
  if (name === '@/lib/authFlow') return { authRedirect: path => `https://example.invalid${path}` };
  return nativeRequire(name);
};
new Function('require', 'module', 'exports', compiled)(mockedRequire, compiledModule, compiledModule.exports);
const { renderUserNotificationEmail, resolveUserNotificationEmail, sendUserTransactionalEmail } = compiledModule.exports;

const certificateEvents = [
  ['moviback.certificate.expiring_30d', 'Certificato in scadenza'],
  ['moviback.certificate.expiring_7d', 'Certificato in scadenza'],
  ['moviback.certificate.grace_started', 'Certificato scaduto'],
  ['moviback.certificate.standby_started', 'MoviBack in stand-by'],
];
const certificatePayload = {
  expiry_date: '2026-12-01',
  certificate_file_url: 'https://private.example.invalid/certificate.pdf',
  tax_code: 'SYNTHETIC-TAX-CODE',
  phone: '+390000000000',
};

test('certificate templates identify the customer, provide the existing CTA and copy staff', () => {
  for (const [event_type, state] of certificateEvents) {
    const email = renderUserNotificationEmail({ event_type, domain: 'moviback', payload: certificatePayload }, 'Mario Rossi');
    assert.equal(email.subject, `MOVI — ${state} — Mario Rossi`);
    assert.match(email.text, /Ciao Mario Rossi,/);
    assert.match(email.html, /Ciao Mario Rossi,/);
    assert.equal(email.bcc, 'movipadel@gmail.com');
    assert.match(email.html, /Aggiorna certificato/);
    assert.match(email.html, /https:\/\/example\.invalid\/moviback/);
    assert.match(email.text, /Scadenza certificato: 2026-12-01/);
    for (const forbidden of ['certificate.pdf', 'SYNTHETIC-TAX-CODE', '+390000000000']) {
      assert.equal((email.subject + email.text + email.html).includes(forbidden), false);
    }
  }
});

test('missing or unsafe names have a safe fallback and escaped HTML', () => {
  const event = { event_type: 'moviback.certificate.expiring_30d', domain: 'moviback', payload: certificatePayload };
  const missing = renderUserNotificationEmail(event, '  ');
  assert.match(missing.subject, /Cliente MoviBack$/);
  assert.match(missing.text, /Ciao Cliente MoviBack,/);
  const unsafe = renderUserNotificationEmail(event, '<Mario>\r\nRossi');
  assert.match(unsafe.subject, /<Mario> Rossi$/);
  assert.doesNotMatch(unsafe.subject, /[\r\n]/);
  assert.match(unsafe.html, /Ciao &lt;Mario&gt; Rossi,/);
});

test('unrelated notifications retain their copy and never carry BCC', () => {
  for (const [event_type, domain] of [
    ['request_received', 'requests'],
    ['store.order.ready', 'store'],
    ['moviback.agreement.activated', 'moviback'],
    ['tournament_registered', 'tournaments'],
  ]) {
    const email = renderUserNotificationEmail({ event_type, domain, payload: {} }, 'Mario Rossi');
    assert.equal(Object.hasOwn(email, 'bcc'), false);
    assert.doesNotMatch(email.subject + email.text + email.html, /Mario Rossi/);
  }
});

test('recipient lookup reads the canonical customer name with the email', async () => {
  profile = { email: 'Mario@Example.invalid', full_name: 'Mario Rossi', identity_status: 'active' };
  assert.deepEqual(await resolveUserNotificationEmail('synthetic-user'), { email: 'mario@example.invalid', customerName: 'Mario Rossi' });
  assert.equal(selections.at(-1), 'email,full_name,identity_status');
});

test('the mocked Resend transport receives certificate BCC only', async () => {
  const keys = ['SUPABASE_URL', 'USER_EMAIL_TRANSPORT', 'USER_EMAIL_FROM', 'RESEND_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.USER_EMAIL_TRANSPORT = 'resend';
    process.env.USER_EMAIL_FROM = 'MOVI <noreply@example.invalid>';
    process.env.RESEND_API_KEY = 're_synthetic_test';
    delete process.env.SUPABASE_URL;
    const event = { event_type: 'moviback.certificate.expiring_7d', domain: 'moviback', payload: certificatePayload };
    const certificate = renderUserNotificationEmail(event, 'Mario Rossi');
    await sendUserTransactionalEmail({ to: 'mario@example.invalid', ...certificate });
    assert.equal(sent.at(-1).to, 'mario@example.invalid');
    assert.equal(sent.at(-1).bcc, 'movipadel@gmail.com');
    const unrelated = renderUserNotificationEmail({ event_type: 'request_received', domain: 'requests', payload: {} }, 'Mario Rossi');
    await sendUserTransactionalEmail({ to: 'mario@example.invalid', ...unrelated });
    assert.equal(Object.hasOwn(sent.at(-1), 'bcc'), false);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
