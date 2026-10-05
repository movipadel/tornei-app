import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildVenueList, getTournamentPosterData, MOVI_VENUES } from "../src/lib/posters/getTournamentPosterData.ts";
import { showSponsorPlaceholder, TOURNAMENT_POSTER_LAYOUT } from "../src/lib/posters/tournamentPosterLayout.ts";
import { getPosterProductionBackground } from "../src/lib/posters/getPosterProductionBackground.ts";

test("matrix maps the certified date, capacity, circuit and QR fields", () => {
  const baraonda = getTournamentPosterData({ name: "Baraonda MOVI", type: "Baraonda", category: "Maschile", level: "intermedio", date: "2026-10-03", time: "19:30:00", club_name: "MOVI Padel Club Revello", max_participants: 20, qr_url: "https://movi.test/tornei?tournament=1" });
  assert.deepEqual([baraonda.dateDayName, baraonda.dateDayNumber, baraonda.dateMonth], ["SAB", "03", "OTT"]);
  assert.equal(baraonda.capacityLabel, "MAX");
  assert.equal(baraonda.capacity, "20");
  assert.equal(baraonda.qrUrl, "https://movi.test/tornei?tournament=1");
  assert.equal(baraonda.venues.find((venue) => venue.active)?.name, "Revello");

  const pairs = getTournamentPosterData({ type: "Coppie fisse", max_participants: 16, circuit_name: "Circuito Piemonte" });
  assert.equal(pairs.capacityLabel, "MAX COPPIE");
  assert.equal(pairs.capacity, "16");
  assert.equal(pairs.circuitName, "Circuito Piemonte");
});

test("matrix covers every category and every certified MOVI venue", () => {
  for (const category of ["Maschile", "Femminile", "Misto", "Libero"]) {
    assert.equal(getTournamentPosterData({ category }).category, category.toUpperCase());
  }
  assert.deepEqual(MOVI_VENUES, ["Revello", "Saluzzo", "Manta", "Costigliole", "Centallo"]);
  for (const venue of MOVI_VENUES) {
    const list = buildVenueList(`MOVI CLUB ${venue}`);
    assert.equal(list.length, 5);
    assert.equal(list.filter((item) => item.active).length, 1);
    assert.equal(list.find((item) => item.active)?.name, venue);
  }
});

test("long and short names remain exact while missing level stays empty", () => {
  const longName = "Trofeo Autunno MOVI per giocatori e giocatrici di tutto il Piemonte";
  assert.equal(getTournamentPosterData({ name: longName }).name, longName);
  assert.equal(getTournamentPosterData({ name: "Sprint MOVI" }).name, "Sprint MOVI");
  assert.equal(getTournamentPosterData({ level: null }).level, "");
});

test("review and production modes share one reserved sponsor zone", () => {
  assert.equal(showSponsorPlaceholder("review"), true);
  assert.equal(showSponsorPlaceholder("production"), false);
  assert.deepEqual(TOURNAMENT_POSTER_LAYOUT.sponsorZone, { top: 918, height: 122, bottom: 1040 });
  assert.ok(TOURNAMENT_POSTER_LAYOUT.dynamicContentBottom < TOURNAMENT_POSTER_LAYOUT.sponsorZone.top);
  assert.ok(TOURNAMENT_POSTER_LAYOUT.footerTop > TOURNAMENT_POSTER_LAYOUT.sponsorZone.bottom);
});

test("temporary production background policy depends on type, not category", () => {
  const categories = ["Maschile", "Femminile", "Misto", "Open", "Libero"];
  for (const category of categories) {
    assert.equal(getPosterProductionBackground("Baraonda", category), "/posters/backgrounds/poster-baraonda-maschile.png");
    assert.equal(getPosterProductionBackground("  COPPIE   FISSE ", category), "/posters/backgrounds/poster-coppie-maschile.png");
  }
  assert.equal(getPosterProductionBackground("PadelSeries", "Maschile"), null);
  assert.equal(getPosterProductionBackground(null, "Femminile"), null);
});

test("pilot background assets are exact 1080x1350 PNG canvases", async () => {
  for (const file of ["poster-baraonda-maschile.png", "poster-coppie-maschile.png"]) {
    const asset = await readFile(`public/posters/backgrounds/${file}`);
    assert.equal(asset.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(asset.readUInt32BE(16), 1080);
    assert.equal(asset.readUInt32BE(20), 1350);
  }
});

test("route and shared renderer preserve the endpoint while isolating legacy raster families", async () => {
  const [route, renderer, reviewScript] = await Promise.all([
    readFile("src/app/api/admin/tournaments/[id]/poster/route.ts", "utf8"),
    readFile("src/lib/posters/tournamentPoster.tsx", "utf8"),
    readFile("scripts/render-poster-matrix-review.mjs", "utf8"),
  ]);
  assert.match(route, /guardOperatorPermission\("tournaments\.manage"\)/);
  assert.match(route, /width: 1080/);
  assert.match(route, /height: 1350/);
  assert.match(route, /new URL\("\/tornei", req\.url\)/);
  assert.match(route, /import QRCode from "qrcode"/);
  assert.match(route, /await QRCode\.toString\(value/);
  assert.match(route, /qrImage: await qrDataUrl\(posterData\.qrUrl\)/);
  assert.doesNotMatch(route, /qrcode\.react|QRCodeSVG|renderToStaticMarkup|createRequire/);
  assert.match(route, /mode: "production"/);
  assert.match(route, /getPosterProductionBackground\(t\.type, t\.category\)/);
  assert.doesNotMatch(route, /getPosterProductionBackground\([^)]*circuit/i);
  assert.match(route, /backgroundImage: backgroundData/);
  assert.match(route, /\.from\("circuits"\)[\s\S]*\.select\("name"\)/);
  assert.doesNotMatch(route, /padelseries-|baraonda-base|coppie-fisse-base/);
  for (const field of ["circuitName", "data.name", "data.category", "data.level", "data.time", "capacityLabel", "data.venues", "qrImage"]) assert.match(renderer, new RegExp(field.replace(".", "\\.")));
  assert.match(renderer, /ISCRIVITI SU MOVI APP/);
  assert.match(renderer, /CATEGORIA/);
  assert.match(renderer, /LIVELLO/);
  assert.doesNotMatch(renderer, /MOVI CLUBS/);
  assert.match(renderer, /MATRICE V1 · AREA SPONSOR/);
  assert.match(renderer, /mode = "production"/);
  assert.match(renderer, /showSponsorReviewLayer \?/);
  assert.match(reviewScript, /mode: "review"/);
  assert.ok(existsSync("docs/rebranding/references/MOVI_POSTER_MASTER_REFERENCE.png"));
  assert.ok(existsSync("docs/rebranding/references/MOVI_POSTER_MASTER_ANNOTATED.png"));
});
