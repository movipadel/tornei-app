import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { getTournamentPosterData } from "../src/lib/posters/getTournamentPosterData.ts";
import { getPosterProductionBackground } from "../src/lib/posters/getPosterProductionBackground.ts";
import * as swc from "next/dist/build/swc/index.js";

const root = resolve(import.meta.dirname, "..");
const postersDir = join(root, "src/lib/posters");
const sourcePath = join(postersDir, "tournamentPoster.tsx");
const layoutSourcePath = join(postersDir, "tournamentPosterLayout.ts");
const compiledPath = join(postersDir, ".poster-production-pilot.tmp.mjs");
const compiledLayoutPath = join(postersDir, ".poster-layout-pilot.tmp.mjs");
const outputDir = join(root, "docs/rebranding/references/verification/poster-production-pilot");

const fixtures = [
  { file: "baraonda-maschile-production.png", id: "pilot-baraonda", name: "Baraonda del Monviso", type: "Baraonda", category: "Maschile", level: "Intermedio", date: "2026-10-03", time: "19:30", club_name: "MOVI Club Revello", max_participants: 20, circuit_name: "Circuito MOVI Piemonte" },
  { file: "coppie-maschile-production.png", id: "pilot-pairs", name: "Coppa MOVI", type: "Coppie fisse", category: "Maschile", level: "Avanzato", date: "2026-10-10", time: "18:00", club_name: "MOVI Club Saluzzo", max_participants: 16 },
];

function dataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function qrDataUrl(value) {
  const svg = renderToStaticMarkup(React.createElement(QRCodeSVG, { value, size: 132, level: "M", bgColor: "#ffffff", fgColor: "#061123", marginSize: 1, xmlns: "http://www.w3.org/2000/svg" }));
  return dataUrl(Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 132 } }).render().asPng()), "image/png");
}

async function main() {
  await swc.loadBindings();
  const [source, layoutSource] = await Promise.all([readFile(sourcePath, "utf8"), readFile(layoutSourcePath, "utf8")]);
  const [transformed, transformedLayout] = await Promise.all([
    swc.transform(source, { filename: sourcePath, jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } }),
    swc.transform(layoutSource, { filename: layoutSourcePath, jsc: { parser: { syntax: "typescript" } }, module: { type: "es6" } }),
  ]);
  await Promise.all([
    writeFile(compiledPath, transformed.code.replace("./tournamentPosterLayout", "./.poster-layout-pilot.tmp.mjs"), "utf8"),
    writeFile(compiledLayoutPath, transformedLayout.code, "utf8"),
  ]);
  try {
    const { TournamentPoster } = await import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`);
    const [interRegular, interMedium, interSemiBold, bebas, logo] = await Promise.all([
      readFile(join(root, "public/fonts/Inter-Regular.ttf")), readFile(join(root, "public/fonts/Inter-Medium.ttf")), readFile(join(root, "public/fonts/Inter-SemiBold.ttf")), readFile(join(root, "public/fonts/BebasNeue-Regular.ttf")), readFile(join(root, "public/branding/movi-padelleria.png")),
    ]);
    await mkdir(outputDir, { recursive: true });
    for (const fixture of fixtures) {
      const backgroundPublicPath = getPosterProductionBackground(fixture.type, fixture.category);
      if (!backgroundPublicPath) throw new Error(`Missing pilot mapping for ${fixture.type} / ${fixture.category}`);
      const [background] = await Promise.all([readFile(join(root, "public", backgroundPublicPath.replace(/^\//, "")))]);
      const qrUrl = `http://127.0.0.1:3101/tornei?tournament=${fixture.id}`;
      const data = getTournamentPosterData({ ...fixture, qr_url: qrUrl });
      const svg = await satori(TournamentPoster({ logo: dataUrl(logo, "image/png"), qrImage: qrDataUrl(qrUrl), data, mode: "production", backgroundImage: dataUrl(background, "image/png") }), { width: 1080, height: 1350, fonts: [
        { name: "Inter", data: interRegular, weight: 400, style: "normal" }, { name: "Inter", data: interMedium, weight: 500, style: "normal" }, { name: "Inter", data: interSemiBold, weight: 600, style: "normal" }, { name: "Bebas", data: bebas, weight: 400, style: "normal" },
      ] });
      const png = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } }).render().asPng();
      await writeFile(join(outputDir, fixture.file), png);
      console.log(`${fixture.file}\t${png.length} bytes\t${backgroundPublicPath}`);
    }
  } finally {
    await Promise.all([unlink(compiledPath).catch(() => {}), unlink(compiledLayoutPath).catch(() => {})]);
  }
}

await main();
