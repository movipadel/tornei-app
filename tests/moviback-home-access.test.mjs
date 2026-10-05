import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home exposes the existing MoviBack route as an explicit access CTA", async () => {
  const [home, css] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/HomeV2.module.css"),
  ]);

  assert.match(home, /!moviBack\.membership[\s\S]*?<Link className=\{home\.movibackAccessCta\} href="\/moviback">Accedi a MoviBack<ArrowRight/);
  assert.doesNotMatch(home, /Accedi per MoviBack/);
  assert.match(css, /\.movibackAccessCta \{[^}]*min-height: 44px/);
  assert.match(css, /\.movibackAccessCta:focus-visible \{[^}]*outline:/);
});

test("Home keeps active state non-actionable and renders honest membership states", async () => {
  const home = await read("src/app/page.tsx");

  assert.match(home, /hasUsableMoviBack = moviBack\.membershipStatus === "approved" && moviBack\.eligibility\?\.can_use_card === true/);
  assert.match(home, /label: "Tessera attiva"/);
  for (const label of ["In revisione", "Non approvata", "Tessera sospesa", "Tessera non disponibile"]) {
    assert.ok(home.includes(`label: "${label}"`), `missing Home state: ${label}`);
  }
  assert.match(home, /<StatusBadge tone=\{moviBackStatus\.tone\}>\{moviBackStatus\.label\}<\/StatusBadge>/);
});

test("Premi and Storico no longer provide hidden enrollment access", async () => {
  const home = await read("src/app/page.tsx");

  assert.match(home, /canRedeemMoviBackRewards[\s\S]*?href="\/moviback\/premi"[\s\S]*?aria-disabled="true"[\s\S]*?>Premi<\/span>/);
  assert.match(home, /hasUsableMoviBack[\s\S]*?href="\/moviback"[\s\S]*?>Storico<\/Link>[\s\S]*?aria-disabled="true"[\s\S]*?>Storico<\/span>/);
});

test("membership card and shared QR remain separate and unchanged on Home", async () => {
  const home = await read("src/app/page.tsx");

  assert.match(home, /<MembershipCardModal[^>]+user=\{user\}[^>]+membership=\{moviBack\.membership\}/);
  assert.match(home, />La mia tessera<\/button>/);
  assert.match(home, /OPEN_PUBLIC_QR_EVENT/);
  assert.match(home, /membershipCode: moviBack\.membershipCode \?\? undefined/);
});

test("existing MoviBack page remains the authoritative auth and enrollment flow", async () => {
  const page = await read("src/app/moviback/page.tsx");

  assert.match(page, /if \(!loading && !user\)/);
  assert.match(page, /onClick=\{\(\) => setLoginOpen\(true\)\}/);
  assert.match(page, /<UserLoginDialog/);
  assert.match(page, /if \(!json\.membership\) \{\s*setRequestOpen\(true\);/);
  assert.match(page, /onClick=\{startRequest\}/);
  assert.match(page, />\s*Attiva MoviBack\s*<\/button>/);
});
