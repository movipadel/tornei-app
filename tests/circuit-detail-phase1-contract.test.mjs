import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/circuiti/[slug]/page.tsx", "utf8");
const api = readFileSync("src/app/api/circuits/[slug]/route.ts", "utf8");

test("detail exposes and conditionally renders the existing regulation URL",()=>{assert.match(api,/theme_key,rules_url,created_at/);assert.match(api,/rules_url: circuit\.rules_url \?\? null/);assert.match(page,/circuit\.rules_url \?/);assert.match(page,/Regolamento circuito/)});
test("separate selectors resolve existing ranking groups",()=>{assert.match(page,/const categories = useMemo/);assert.match(page,/groups\.filter\(\(group\) => group\.category === selectedCategory\)/);assert.match(page,/function chooseCategory/);assert.match(page,/function chooseGroup\(group: RankingGroup\)/);assert.match(page,/aria-pressed=\{selectedCategory === category\}/);assert.match(page,/aria-pressed=\{group\.id === selectedGroupId\}/);assert.doesNotMatch(page,/>Tutti</)});
test("next stage reuses the first ordered upcoming stage",()=>{assert.match(page,/selectedGroup\?\.upcoming_stages\?\.\[0\]/);assert.match(page,/nextStage\.registrations_open/);assert.match(page,/nextStage\.location/);assert.match(page,/nextStage\.time/)});
test("phase 1 public ranking and archive semantics remain intact",()=>{assert.match(page,/selectedGroup\?\.ranking \?\? \[\]/);assert.match(page,/Podium rows=\{ranking\.slice\(0, 3\)\}/);assert.match(page,/Risultati delle tappe/);assert.doesNotMatch(api,/player_identity_id|auth_user_id/)});
test("Home image is not repurposed in circuit detail",()=>{assert.doesNotMatch(page,/home_image_url/);assert.match(page,/hero_logo_url/);assert.match(page,/hero_logo_2_url/);assert.match(page,/hero_logo_3_url/)});
