import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read=(path)=>readFileSync(path,'utf8');

test('eligibility-sensitive operations use their canonical authority',()=>{
 for(const path of [
  'src/app/api/moviback/rewards/redeem/route.ts',
  'src/app/api/moviback/reactivate/route.ts',
  'src/app/api/admin/moviback/users/[id]/route.ts',
 ]) assert.match(read(path),/readMovibackEligibility/);

 const staffCreditRoute=read('src/app/api/staff/earn-points/route.ts');
 assert.match(staffCreditRoute,/\.rpc\("credit_moviback_points"/);
 assert.doesNotMatch(staffCreditRoute,/readMovibackEligibility/);
 for(const errorCode of [
  'ACCOUNT_INACTIVE',
  'MEMBERSHIP_NOT_APPROVED',
  'TAX_CODE_INVALID',
  'CERTIFICATE_',
  'ENTITLEMENT_CARDINALITY',
 ]) assert.match(staffCreditRoute,new RegExp(errorCode));

 const creditMigration=read('supabase/migrations/20261029100000_moviback_credit_post_lock_event_time.sql');
 assert.match(creditMigration,/CREATE OR REPLACE FUNCTION public\.credit_moviback_points/i);
 assert.match(creditMigration,/FROM public\.loyalty_memberships[\s\S]*?FOR UPDATE/i);
 assert.match(creditMigration,/MOVIBACK_CREDIT_ACCOUNT_INACTIVE/);
 assert.match(creditMigration,/MOVIBACK_CREDIT_MEMBERSHIP_NOT_APPROVED/);
 assert.match(creditMigration,/MOVIBACK_CREDIT_CERTIFICATE_STANDBY/);
 assert.match(creditMigration,/MOVIBACK_CREDIT_ENTITLEMENT_CARDINALITY/);
 assert.ok(
  creditMigration.indexOf('v_event_at := clock_timestamp();') > creditMigration.indexOf('FOR UPDATE;'),
  'credit event time must be captured after the membership lock',
 );

 assert.match(read('src/app/api/moviback/me/route.ts'),/computeMovibackEligibility/);
 const adminReviewRoute=read('src/app/api/admin/moviback/requests/route.ts');
 assert.match(adminReviewRoute,/\.rpc\("review_moviback_membership_c5"/);
 assert.doesNotMatch(adminReviewRoute,/computeMovibackEligibility/);
 assert.match(
  read('supabase/migrations/20261026100000_moviback_corporate_conventions_new_member.sql'),
  /CREATE OR REPLACE FUNCTION public\.review_moviback_membership_c5/i,
 );
});

test('standby separates earning from redemption and card use',()=>{
 const source=read('src/lib/movibackEligibility.ts');
 assert.match(source,/const usable = operational \|\| eligibilityState === "standby"/);
 assert.match(source,/can_earn_points: operational/);
 assert.match(source,/can_redeem: usable/);
 assert.match(source,/can_use_card: usable/);
 assert.match(source,/STANDBY_EARN_MESSAGE/);
});

test('user DTO omits raw certificate storage paths',()=>{
 const source=read('src/app/api/moviback/me/route.ts');
 const certificateSelect=source.match(/from\("medical_certificates"\)[\s\S]*?\.select\("([^"]+)"\)/)?.[1]??'';
 assert.ok(certificateSelect);
 assert.doesNotMatch(certificateSelect,/file_path/);
});

test('customer list is bounded and does not require a query',()=>{
 const api=read('src/app/api/admin/players/route.ts');
 assert.match(api,/Math\.min\(50/);
 assert.doesNotMatch(api,/if\s*\(!q\).*query_required/);
 const page=read('src/app/admin/players/page.tsx');
 assert.match(page,/useEffect/);
 assert.doesNotMatch(page,/full fiscal|file_path|tax_code/);
});

test('certificate review records actor and time and checks storage',()=>{
 const source=read('src/app/api/admin/moviback/certificates/[id]/review/route.ts');
 assert.match(source,/createSignedUrl/);
 assert.match(source,/reviewed_at: now/);
 assert.match(source,/reviewed_by: session!\.sid/);
});

test('grace warning is view-scoped without localStorage persistence',()=>{
 const source=read('src/app/moviback/page.tsx');
 assert.match(source,/Certificato medico scaduto/);
 assert.match(source,/Continua su MoviBack/);
 assert.doesNotMatch(source,/localStorage/);
});
