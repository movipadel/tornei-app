import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("membership card uses real identity, public membership code and authoritative usability", async () => {
  const source = await read("src/components/public/MembershipCardModal.tsx");
  assert.match(source, /user\?\.full_name\?\.trim\(\)/);
  assert.match(source, /membership\?\.membership_code\?\.trim\(\)/);
  assert.match(source, /membership\?\.status === "approved" && eligibility\?\.can_use_card === true/);
  assert.match(source, /Identificativo tessera/);
  assert.match(source, />Attiva</);
});

test("membership card contains no scanning, points, reward, wallet or Partner navigation", async () => {
  const source = await read("src/components/public/MembershipCardModal.tsx");
  assert.doesNotMatch(source, /QRCode|Mostra QR|barcode|NFC|contactless|punti|premi|reward|Apple Wallet|Google Wallet/i);
  assert.doesNotMatch(source, /<Link|href=|\/partner/i);
  assert.match(source, /Mostrala nei club MOVI e presso i partner aderenti/);
});

test("membership card reuses the official MOVI monogram as a cropped decorative background", async () => {
  const [source, css] = await Promise.all([
    read("src/components/public/MembershipCardModal.tsx"),
    read("src/components/public/MembershipCardModal.module.css"),
  ]);
  assert.match(source, /src="\/branding\/movi-monviso\.png"/);
  assert.match(source, /className=\{styles\.brandMark\}/);
  assert.match(source, /alt=""/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(css, /\.brandMark \{[^}]*position: absolute[^}]*right: -13%[^}]*pointer-events: none[^}]*opacity: \.12/s);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.brandMark \{[^}]*right: -22%/);
  assert.match(css, /@media \(max-width: 350px\)[\s\S]*\.brandMark \{[^}]*right: -28%/);
  assert.doesNotMatch(css, /\.card:before|\.card:after/);
});

test("membership modal has an explicit close action and honest unavailable states", async () => {
  const source = await read("src/components/public/MembershipCardModal.tsx");
  assert.match(source, /<Dialog.Close asChild>/);
  assert.match(source, />Chiudi<\/button>/);
  for (const label of ["Accesso richiesto", "Tessera non disponibile", "Tessera in revisione", "Tessera non approvata", "Tessera sospesa", "Tessera non utilizzabile"]) {
    assert.ok(source.includes(label), `missing state: ${label}`);
  }
});

test("Home separates La mia tessera from the existing shared QR event", async () => {
  const home = await read("src/app/page.tsx");
  assert.match(home, /<MembershipCardModal[^>]+user=\{user\}[^>]+membership=\{moviBack\.membership\}/);
  assert.match(home, />La mia tessera<\/button>/);
  assert.match(home, /OPEN_PUBLIC_QR_EVENT/);
  assert.match(home, />Mostra QR<ArrowRight/);
});

test("MoviBack keeps the existing personal QR renderer outside the membership card", async () => {
  const [page, card, nav] = await Promise.all([
    read("src/app/moviback/page.tsx"),
    read("src/components/public/MembershipCardModal.tsx"),
    read("src/components/public/PublicBottomNav.tsx"),
  ]);
  assert.match(page, /<MembershipCardModal/);
  assert.match(page, /<QRCodeCanvas\s+value=\{`mb:\$\{membership\.membership_code\}`\}/);
  assert.match(nav, /<QRCodeCanvas value=\{demo \? qr\.code : `mb:\$\{qr\.code\}`\}/);
  assert.doesNotMatch(card, /QRCodeCanvas|mb:/);
});
