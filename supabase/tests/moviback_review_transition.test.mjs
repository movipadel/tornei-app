import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { reviewMovibackMembershipCompatible, isMissingMembershipC6 } from '../../src/lib/movibackReviewCompatibility.ts';

const input = {
  membershipId: 'membership', certificateId: 'certificate', userId: 'user',
  action: 'approve', rejectionReason: null, certificateNote: '', actorStaffId: 'operator',
};
const absentC6 = { code: 'PGRST202', message: 'Could not find the function public.review_moviback_membership_c6(p_action, p_certificate_id, p_membership_id) in the schema cache' };

function fakeDb(canonical, legacy, certificates = [{ id: 'certificate', uploaded_at: '2026-11-02T09:00:00Z', status: 'pending_review' }]) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === 'review_moviback_membership_c6' ? canonical : legacy;
    },
    from: (table) => {
      assert.equal(table, 'medical_certificates');
      calls.push({ name: 'certificate-target-check' });
      const query = { select: () => query, eq: () => query, order: () => query,
        limit: async () => ({ data: certificates, error: null }) };
      return query;
    },
  };
}

test('pre-migration approve and reject retry C5 once with its original parameters', async () => {
  for (const action of ['approve', 'reject']) {
    const db = fakeDb({ data: null, error: absentC6 }, { data: { ok: true, membership_status: action === 'approve' ? 'approved' : 'rejected' }, error: null });
    const result = await reviewMovibackMembershipCompatible(db, { ...input, action, rejectionReason: action === 'reject' ? 'reason' : null });
    assert.equal(result.kind, 'SUCCESS');
    assert.equal(result.usedLegacy, true);
    assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6', 'certificate-target-check', 'review_moviback_membership_c5']);
    assert.equal(db.calls[2].args.p_action, action);
    assert.equal(db.calls[2].args.p_membership_id, input.membershipId);
    assert.equal(db.calls[2].args.p_rejection_reason, action === 'reject' ? 'reason' : null);
  }
});

test('post-migration approve and reject use C6 without inspecting or invoking C5', async () => {
  for (const action of ['approve', 'reject']) {
    const db = fakeDb({ data: { ok: true, membership_status: action === 'approve' ? 'approved' : 'rejected' }, error: null });
    const result = await reviewMovibackMembershipCompatible(db, { ...input, action });
    assert.equal(result.kind, 'SUCCESS');
    assert.equal(result.usedLegacy, false);
    assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6']);
    assert.equal(db.calls[0].args.p_certificate_id, input.certificateId);
  }
});

test('C5 never reviews a stale, tied or wrong-status certificate target', async () => {
  for (const certificates of [
    [{ id: 'other', uploaded_at: '2026-11-02T10:00:00Z', status: 'pending_review' }, { id: 'certificate', uploaded_at: '2026-11-02T09:00:00Z', status: 'pending_review' }],
    [{ id: 'certificate', uploaded_at: '2026-11-02T09:00:00Z', status: 'pending_review' }, { id: 'other', uploaded_at: '2026-11-02T09:00:00Z', status: 'approved' }],
    [{ id: 'certificate', uploaded_at: '2026-11-02T09:00:00Z', status: 'rejected' }],
  ]) {
    const db = fakeDb({ data: null, error: absentC6 }, null, certificates);
    const result = await reviewMovibackMembershipCompatible(db, input);
    assert.equal(result.kind, 'BUSINESS_RULE_REJECTED');
    assert.equal(result.code, 'CERTIFICATE_NOT_REVIEWABLE');
    assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6', 'certificate-target-check']);
  }
});

test('C6 business, expiry, state, mismatch and authorization failures never retry C5', async () => {
  for (const code of ['CERTIFICATE_EXPIRED_REPLACEMENT_REQUIRED', 'MEMBERSHIP_NOT_REVIEWABLE', 'CERTIFICATE_MEMBERSHIP_MISMATCH', 'CERTIFICATE_NOT_REVIEWABLE', 'MEMBERSHIP_NOT_ELIGIBLE', 'OPERATOR_INVALID']) {
    const db = fakeDb({ data: { ok: false, error_code: code }, error: null });
    const result = await reviewMovibackMembershipCompatible(db, input);
    assert.equal(result.code, code);
    assert.equal(result.kind, code === 'OPERATOR_INVALID' ? 'AUTHORIZATION_FAILED' : 'BUSINESS_RULE_REJECTED');
    assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6']);
  }
  for (const error of [{ code: '42501', message: 'permission denied' }, { code: 'XX000', message: 'database failure' }, { code: 'PGRST202', message: 'Could not find public.some_other_function()' }]) {
    const db = fakeDb({ data: null, error });
    const result = await reviewMovibackMembershipCompatible(db, input);
    assert.equal(result.kind, error.code === '42501' ? 'AUTHORIZATION_FAILED' : 'UNEXPECTED_DATABASE_ERROR');
    assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6']);
  }
  assert.equal(isMissingMembershipC6(absentC6), true);
});

test('absence of both RPCs is reported, not retried further', async () => {
  for (const error of [{ code: 'PGRST202', message: 'C5 missing' }, { code: '42501', message: 'C5 revoked while C6 schema cache is stale' }]) {
    const db = fakeDb({ data: null, error: absentC6 }, { data: null, error });
    const result = await reviewMovibackMembershipCompatible(db, input);
    assert.equal(result.kind, 'RPC_NOT_INSTALLED');
    assert.equal(db.calls.filter(call => call.name === 'review_moviback_membership_c5').length, 1);
  }
});

test('malformed RPC success responses never retry C5', async () => {
  const db = fakeDb({ data: null, error: null });
  const result = await reviewMovibackMembershipCompatible(db, input);
  assert.equal(result.kind, 'UNEXPECTED_DATABASE_ERROR');
  assert.deepEqual(db.calls.map(call => call.name), ['review_moviback_membership_c6']);
});

test('Admin and Customer Hub routes preserve exact certificate review and server-only fallback', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const queue = read('../../src/app/api/admin/moviback/requests/route.ts');
  const exact = read('../../src/app/api/admin/moviback/certificates/[id]/review/route.ts');
  const player = read('../../src/app/admin/players/[id]/PlayerDetail.tsx');
  const account = read('../../src/app/admin/players/account/[id]/AccountOnlyCustomerDetail.tsx');
  for (const route of [queue, exact]) {
    assert.match(route, /guardAdmin\(\)/);
    assert.match(route, /Origine non consentita/);
  }
  assert.match(queue, /reviewMovibackMembershipCompatible\(sb,/);
  assert.match(queue, /\.rpc\("review_moviback_certificate"/);
  assert.match(exact, /\.rpc\("review_moviback_certificate"/);
  for (const page of [player, account]) assert.match(page, /certificates\/\$\{(?:certificate|hub\.certificate)\.id\}\/review/);
  for (const source of [queue, exact, player, account]) assert.doesNotMatch(source, /review_moviback_membership_c5/);
});
