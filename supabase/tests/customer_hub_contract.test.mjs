import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read=(path)=>readFileSync(path,'utf8');

test('all eligibility-sensitive operations share the server contract',()=>{
 for(const path of [
  'src/app/api/staff/earn-points/route.ts',
  'src/app/api/moviback/rewards/redeem/route.ts',
  'src/app/api/moviback/reactivate/route.ts',
  'src/app/api/admin/moviback/users/[id]/route.ts',
 ]) assert.match(read(path),/readMovibackEligibility/);
 assert.match(read('src/app/api/moviback/me/route.ts'),/computeMovibackEligibility/);
 assert.match(read('src/app/api/admin/moviback/requests/route.ts'),/computeMovibackEligibility/);
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
