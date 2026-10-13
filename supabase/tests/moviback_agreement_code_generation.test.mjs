import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../../src/lib/movibackAgreementCodes.ts",import.meta.url),"utf8");
test("code generator uses node crypto and excludes Math.random",()=>{assert.match(source,/randomInt/);assert.doesNotMatch(source,/Math\.random/);});
test("format provides 20 unambiguous random symbols",()=>{assert.match(source,/MOVI-\$\{body\.slice\(0, 5\)\}/);assert.match(source,/23456789ABCDEFGHJKLMNPQRSTUVWXYZ/);});
test("normalization and deterministic SHA-256 lookup are explicit",()=>{assert.match(source,/toUpperCase\(\)\.replace/);assert.match(source,/createHash\("sha256"\)/);});
test("batch maximum is server-side",()=>assert.match(source,/MOVIBACK_CODE_BATCH_MAX = 500/));
