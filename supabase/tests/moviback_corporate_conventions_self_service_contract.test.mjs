import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../migrations/20261025100000_moviback_corporate_conventions_self_service.sql",import.meta.url),"utf8");
const route=readFileSync(new URL("../../src/app/api/moviback/agreements/activate/route.ts",import.meta.url),"utf8");
const helper=readFileSync(new URL("../../src/lib/movibackAgreementActivation.ts",import.meta.url),"utf8");
const me=readFileSync(new URL("../../src/app/api/moviback/me/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../src/components/public/MovibackAgreementActivation.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../../src/components/public/MovibackAgreementActivation.module.css",import.meta.url),"utf8");

test("C4 claim is service-only, atomic and safe for self replay",()=>{
 assert.match(migration,/claim_moviback_agreement_code/);
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/replayed', true/);
 assert.match(migration,/ACTIVE_ENTITLEMENT_EXISTS/);
 assert.match(migration,/status = 'used'/);
 assert.match(migration,/entitlement_activated/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.claim_moviback_agreement_code\(uuid,text\) FROM PUBLIC,anon,authenticated/);
});

test("public activation resolves identity server-side and never accepts ownership IDs",()=>{
 assert.match(route,/getCurrentMoviUser/);
 assert.match(route,/hashMovibackAgreementCode/);
 assert.match(route,/consume_legacy_login_rate_limit/);
 assert.doesNotMatch(route,/body\.(?:membership_id|user_id|agreement_id|entitlement_id)/);
 assert.doesNotMatch(route,/agreement:\s*\{[^}]*code_hash/s);
 assert.match(helper,/createHmac/);
});

test("public response and UI expose safe agreement fields with accessible controls",()=>{
 assert.match(me,/active_agreement/);
 assert.doesNotMatch(me,/code_hash|code_suffix/);
 assert.match(ui,/htmlFor="moviback-agreement-code"/);
 assert.match(ui,/role=\{message\.kind === "error" \? "alert" : "status"\}/);
 assert.match(css,/min-height: 46px/);
 assert.match(css,/:focus-visible/);
});
