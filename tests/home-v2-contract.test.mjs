import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { filterHomeTournaments, getHomeTournamentWindow } from "../src/lib/homeTournamentWindow.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home keeps the frozen section order", async () => {
  const source = await read("src/app/page.tsx");
  const markers = [
    'className={home.movibackTitle}', 'aria-label="Azioni principali"', 'title="Tornei in evidenza"',
    'title="Succede in Padelleria"', 'aria-label="Monday League"', 'title="I tuoi circuiti"',
    'title="È successo in Padelleria"', 'aria-label="Servizi rapidi"', 'aria-label="Collegamenti esterni MOVI"',
    "publicLegalLinks.map",
  ];
  const positions = markers.map((marker) => source.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0), `missing Home marker: ${markers[positions.findIndex((position) => position < 0)]}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("Home has exactly the three approved carousel uses", async () => {
  const source = await read("src/app/page.tsx");
  assert.match(source, /EditorialCarousel title="Succede in Padelleria"/);
  assert.match(source, /PublicCarousel label="I tuoi circuiti"/);
  assert.match(source, /EditorialCarousel title="È successo in Padelleria"/);
  assert.doesNotMatch(source, /PublicCarousel label="Tornei/);
  assert.doesNotMatch(source, /PublicCarousel label="Monday League/);
});

test("Home composes existing read models in one parallel load", async () => {
  const source = await read("src/app/page.tsx");
  for (const endpoint of [
    "/api/tournaments?scope=home", "/api/app-settings", "/api/user/me", "/api/circuits",
    "/api/moviback/me", "/api/user/communications", "/api/monday-league/hero",
    "/api/padelleria?kind=succede&limit=6", "/api/padelleria?kind=e_successo&limit=6",
  ]) assert.ok(source.includes(endpoint), `missing ${endpoint}`);
  assert.match(source, /await Promise\.all\(/);
  assert.match(source, /mondayLeagueHero\.visible/);
});

test("Home tournament cards expose only the real level from the public read model", async () => {
  const [home, tournamentType, route] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/components/tournaments/TournamentCard.tsx"),
    read("src/app/api/tournaments/route.ts"),
  ]);
  assert.match(tournamentType, /level\?: string \| null/);
  assert.match(route, /category,\s+level,/);
  assert.match(home, /tournament\.level \? <span>Livello \{tournament\.level\}<\/span> : null/);
  assert.doesNotMatch(home, /tournament\.level \?\?/);
});

test("Home tournament window is the current Italian calendar week plus the following week", () => {
  assert.deepEqual(getHomeTournamentWindow("2026-09-30"), { start: "2026-09-28", end: "2026-10-11" });
  assert.deepEqual(getHomeTournamentWindow("2026-10-04"), { start: "2026-09-28", end: "2026-10-11" });

  const tournaments = [
    { id: "before", date: "2026-09-27", time: "20:00" },
    { id: "monday", date: "2026-09-28", time: "21:00" },
    { id: "earlier-time", date: "2026-10-02", time: "18:00" },
    { id: "later-time", date: "2026-10-02", time: "20:00" },
    { id: "sunday", date: "2026-10-11", time: "23:00" },
    { id: "after", date: "2026-10-12", time: "09:00" },
  ];
  assert.deepEqual(filterHomeTournaments(tournaments, "2026-09-30").map(({ id }) => id), ["monday", "earlier-time", "later-time", "sunday"]);
});

test("Home renders every qualifying tournament in one vertical list while Tornei keeps its catalogue query", async () => {
  const [home, css, route, tournamentsPage] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/HomeV2.module.css"),
    read("src/app/api/tournaments/route.ts"),
    read("src/app/tornei/page.tsx"),
  ]);
  assert.match(home, /fetch\("\/api\/tournaments\?scope=home"/);
  assert.match(home, /filterHomeTournaments\(tournaments\)/);
  assert.doesNotMatch(home, /filterHomeTournaments\(tournaments\)\.slice/);
  assert.match(home, /className=\{home\.tournamentList\}/);
  assert.doesNotMatch(home, /home\.tournamentGrid/);
  assert.match(css, /\.tournamentList \{ display: grid; gap:/);
  assert.doesNotMatch(css, /\.tournamentList[^}]*grid-template-columns:/);
  assert.match(route, /homeScope \? homeWindow\.start : todayRome/);
  assert.match(route, /query = query\.lte\("date", homeWindow\.end\)/);
  assert.match(tournamentsPage, /fetch\("\/api\/tournaments"/);
  assert.doesNotMatch(tournamentsPage, /scope=home/);
});

test("Home tournament cards use a full-card system background, compact date badge, and real circuit label", async () => {
  const [home, css, tournamentType, route] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/HomeV2.module.css"),
    read("src/components/tournaments/TournamentCard.tsx"),
    read("src/app/api/tournaments/route.ts"),
  ]);
  assert.match(tournamentType, /image_url\?: string \| null/);
  assert.match(home, /getTournamentHomeBackground\(tournament\.type, tournament\.category\)/);
  assert.match(home, /className=\{home\.tournamentBackground\} style=\{\{ backgroundImage:/);
  assert.doesNotMatch(home, /tournament\.home_image_url/);
  assert.doesNotMatch(route, /home_image_url/);
  assert.match(css, /\.tournamentBackground \{[^}]*background-position: center[^}]*background-size: cover/);
  assert.match(home, /home\.tournamentDateBadge/);
  assert.match(css, /\.tournamentDateBadge \{[^}]*background: var\(--date-badge-bg\)[^}]*color: var\(--date-badge-text\)/);
  assert.match(css, /\.tournamentScrim \{[^}]*linear-gradient/);
  assert.match(home, /circuit \? <span className=\{home\.tournamentCircuit\}>\{circuit\.name\}<\/span> : null/);
  assert.doesNotMatch(home, /Iscrizioni aperte/);
  assert.match(home, /circuits\.find\(\(circuit\) => circuit\.id === tournament\.circuit_id\)/);
});

test("Home tournament cards stay compact and integrated at normal mobile widths", async () => {
  const css = await read("src/app/HomeV2.module.css");
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.tournamentBody \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.tournamentAction button \{ min-height: 44px/);
  assert.match(css, /\.tournamentInfo h3 \{[^}]*-webkit-line-clamp: 2/);
  assert.doesNotMatch(css.match(/@media \(max-width: 620px\)[\s\S]*?(?=@media \(max-width: 560px\))/)?.[0] ?? "", /\.tournamentBody \{[^}]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 280px\)[\s\S]*\.tournamentBody \{ grid-template-columns: 1fr/);
});

test("date badge reinforces category with four accessible color families without changing geometry", async () => {
  const [home, css] = await Promise.all([read("src/app/page.tsx"), read("src/app/HomeV2.module.css")]);
  assert.match(home, /normalizeTournamentHomeCategory\(tournament\.category\)/);
  for (const suffix of ["Maschile", "Femminile", "Misto", "Open", "Default"]) {
    assert.match(home, new RegExp(`home\\.tournamentDateBadge${suffix}`));
    assert.match(css, new RegExp(`\\.tournamentDateBadge${suffix} \\{[^}]*--date-badge-bg:[^}]*--date-badge-text:[^}]*--date-badge-month:`));
  }
  for (const color of ["#315fd6", "#a83a7a", "#147565", "#895706"]) {
    assert.match(css, new RegExp(`--date-badge-bg: ${color}`));
  }
  assert.match(css, /\.tournamentDateBadge \{[^}]*min-width: 48px; min-height: 50px/);
  assert.match(css, /\.tournamentDateBadge span \{[^}]*color: var\(--date-badge-month\)/);
});

test("obsolete Home upload is removed while catalogue image and locandina remain independent", async () => {
  const [home, form, publicRoute, adminRoute, adminIdRoute, poster, adminList, tournamentsPage, tournamentCard] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/admin/tournaments/_components/TournamentDialogForm.tsx"),
    read("src/app/api/tournaments/route.ts"),
    read("src/app/api/admin/tournaments/route.ts"),
    read("src/app/api/admin/tournaments/[id]/route.ts"),
    read("src/app/api/admin/tournaments/[id]/poster/route.ts"),
    read("src/app/admin/tournaments/ui.tsx"),
    read("src/app/tornei/page.tsx"),
    read("src/components/tournaments/TournamentCard.tsx"),
  ]);
  assert.doesNotMatch(home, /tournament\.home_image_url|tournament-home-images|Immagine Home torneo|tournaments\/home-image/);
  for (const source of [form, publicRoute, adminRoute, adminIdRoute]) assert.doesNotMatch(source, /home_image_url|tournament-home-images|Immagine Home torneo|tournaments\/home-image/);
  await assert.rejects(access(new URL("../src/app/api/admin/tournaments/home-image/route.ts", import.meta.url)));
  await assert.rejects(access(new URL("../supabase/migrations/20261011100000_tournament_home_images.sql", import.meta.url)));
  assert.match(publicRoute, /image_url,/);
  assert.match(adminRoute, /image_url/);
  assert.match(adminIdRoute, /image_url/);
  assert.match(tournamentsPage, /fetch\("\/api\/tournaments"/);
  assert.match(tournamentCard, /tournament\.image_url/);
  assert.doesNotMatch(poster, /image_url/);
  assert.match(poster, /width: 1080/);
  assert.match(poster, /height: 1350/);
  assert.match(adminList, />\s*Locandina\s*</);
  assert.match(adminList, /\/poster/);
});

test("Monday League Home block uses the public fail-closed read model", async () => {
  const [home, css, route, banner] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/HomeV2.module.css"),
    read("src/app/api/monday-league/hero/route.ts"),
    readFile(new URL("../public/branding/home-sections/monday-league-home-banner.png", import.meta.url)),
  ]);
  assert.match(home, /mondayLeagueHero\.visible/);
  assert.match(home, /mondayLeagueHero\.visible \? <section className=\{home\.section\} aria-label="Monday League">/);
  assert.match(home, /<Link className=\{`\$\{home\.leagueBanner\} \$\{home\.leagueBannerLink\}`\} href="\/monday-league" aria-label="Apri Monday League" \/>/);
  assert.doesNotMatch(home, /Apri la League|home\.leagueCta/);
  assert.doesNotMatch(home, /SectionHeader title="Monday League"/);
  assert.doesNotMatch(home, /mondayLeagueHero\.(eyebrow|title|seasonName)\}/);
  assert.match(css, /\.leagueBanner \{[^}]*width: 100%[^}]*height: clamp\(184px, 18vw, 196px\)[^}]*monday-league-home-banner\.png[^}]*background-size: cover/);
  assert.match(css, /\.leagueBannerLink:focus-visible \{[^}]*outline: 3px solid var\(--public-cyan\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.leagueBanner \{[^}]*height: auto[^}]*min-height: 72px[^}]*aspect-ratio: 4 \/ 1[^}]*background-position: left center[^}]*background-size: cover/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.moviback \{[^}]*gap: 10px[^}]*padding: 14px 16px/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.miniAction \{[^}]*min-height: 44px/);
  assert.equal(banner.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(banner.readUInt32BE(16), 2172);
  assert.equal(banner.readUInt32BE(20), 383);
  assert.match(route, /\.eq\("public_visibility", "public"\)/);
  assert.match(route, /\.not\("published_at", "is", null\)/);
  assert.equal((route.match(/visible: false/g) ?? []).length, 2);
});

test("Home reuses shared QR and exposes the exact quick services", async () => {
  const [source, nav, modal] = await Promise.all([read("src/app/page.tsx"), read("src/components/public/PublicBottomNav.tsx"), read("src/components/public/PublicModal.tsx")]);
  assert.match(source, /OPEN_PUBLIC_QR_EVENT/);
  assert.match(nav, /OPEN_PUBLIC_QR_EVENT/);
  assert.match(nav, /onCloseAutoFocus/);
  assert.match(modal, /onCloseAutoFocus/);
  for (const label of ["Le mie attività", "Store MOVI", "Partner", "Contattaci"]) assert.ok(source.includes(label));
  assert.match(source, /<Link className=\{home\.serviceLink\} href="\/partner"><Store[^>]+aria-hidden \/><span className=\{home\.serviceText\}>Partner<\/span><\/Link>/);
  assert.doesNotMatch(source, /Pagina pubblica non ancora disponibile/);
});

test("Home external and legal destinations are centrally scoped", async () => {
  const links = await read("src/components/public/publicLinks.ts");
  for (const url of [
    "https://www.facebook.com/MoviPadel", "https://www.instagram.com/movi_padel_clubs",
    "https://www.movipadel.it", "https://www.youtube.com/@PadelleriaMOVI",
    "/privacy", "/termini", "/cookie",
  ]) assert.ok(links.includes(url), `missing ${url}`);
});

test("editorial cards always open the canonical Padelleria detail", async () => {
  const source = await read("src/app/page.tsx");
  const editorial = source.slice(source.indexOf("function EditorialCarousel"), source.indexOf("function HomeTournamentCard"));
  assert.match(editorial, /<Link[^>]+href=\{`\/padelleria\/\$\{item\.id\}`\}/);
  assert.match(editorial, /aria-label=\{`Apri \$\{item\.title\}`\}/);
  assert.doesNotMatch(editorial, /item\.cta_url|item\.cta_label|target="_blank"|Apri contenuto/);
});

test("circuits omit the redundant availability subtitle", async () => {
  const source = await read("src/app/page.tsx");
  assert.doesNotMatch(source, /I circuiti MOVI disponibili\./);
  assert.match(source, /<SectionHeader title="I tuoi circuiti" \/>/);
});

test("circuit cards are full-card links with one default or custom-image mode", async () => {
  const [source, css, publicCss, publicRoute] = await Promise.all([
    read("src/app/page.tsx"),
    read("src/app/HomeV2.module.css"),
    read("src/components/public/PublicUI.module.css"),
    read("src/app/api/circuits/route.ts"),
  ]);
  assert.match(source, /<PublicCarousel label="I tuoi circuiti">/);
  assert.match(source, /<Link className=\{`\$\{home\.carouselItem\} \$\{home\.circuitCardLink\}`\} href=\{`\/circuiti\/\$\{circuit\.slug\}`\} aria-label=\{`Apri circuito \$\{circuit\.name\}`\}/);
  assert.match(source, /home\.circuitStatus/);
  assert.match(source, /circuit\.ranking_groups_count/);
  assert.match(source, /circuit\.played_stages_count/);
  assert.match(source, /circuit\.home_image_url \? <Image className=\{home\.circuitImage\} src=\{circuit\.home_image_url\} alt=\{`Circuito \$\{circuit\.name\}`\} fill/);
  assert.doesNotMatch(source, /Apri circuito<|home\.circuitLink/);
  assert.match(publicRoute, /home_image_url/);
  assert.match(css, /--home-circuit-height: 148px/);
  assert.match(css, /@media \(min-width: 720px\)[\s\S]*--home-circuit-height: 160px/);
  assert.match(css, /\.circuitCardLink \{[^}]*height: var\(--home-circuit-height\)[^}]*min-height: 0/);
  assert.match(css, /\.circuitCardLink:focus-visible \{[^}]*outline: 3px solid var\(--public-cyan\)/);
  assert.match(css, /\.circuitCard \{[^}]*height: 100%[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto[^}]*background:/);
  assert.match(css, /\.circuitAccent \{[^}]*background: var\(--public-magenta\)/);
  assert.match(css, /\.circuitStatus > span \{[^}]*background: var\(--public-cyan\)/);
  assert.match(css, /\.circuitImage \{[^}]*object-fit: cover/);
  assert.match(publicCss, /\.carousel \{[^}]*grid-auto-flow: column[^}]*overflow-x: auto[^}]*scroll-snap-type: x mandatory/);
  assert.match(publicCss, /grid-auto-columns: calc\(\(100% - 12px\) \/ 1\.15\)/);
});

test("Home card families share a responsive visual rhythm", async () => {
  const css = await read("src/app/HomeV2.module.css");
  assert.match(css, /--home-section-gap: 30px/);
  assert.match(css, /@media \(min-width: 720px\)[\s\S]*--home-section-gap: 36px/);
  assert.match(css, /--home-editorial-height: 344px/);
  assert.match(css, /--home-editorial-media-height: 158px/);
  assert.match(css, /@media \(min-width: 720px\)[\s\S]*--home-editorial-height: 360px[^}]*--home-editorial-media-height: 176px/);
  assert.match(css, /\.editorialCard \{[^}]*height: var\(--home-editorial-height\)[^}]*grid-template-rows: var\(--home-editorial-media-height\) minmax\(0, 1fr\)[^}]*border-radius: var\(--home-card-radius\)/);
  assert.match(css, /\.editorialCard > :first-child \{[^}]*height: var\(--home-editorial-media-height\)/);
});

test("Admin circuits provide the optional Home image upload, replace, remove, and fallback workflow", async () => {
  const [form, adminRoute, adminIdRoute, uploadRoute, migration] = await Promise.all([
    read("src/app/admin/circuits/_components/CircuitDialog.tsx"),
    read("src/app/api/admin/circuits/route.ts"),
    read("src/app/api/admin/circuits/[id]/route.ts"),
    read("src/app/api/admin/circuits/home-image/route.ts"),
    read("supabase/migrations/20261012100000_circuit_home_images.sql"),
  ]);
  assert.match(form, /Immagine Home circuito/);
  assert.match(form, /Formato consigliato: 1600×900 px \(16:9\)/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(form, /Sostituisci immagine/);
  assert.match(form, /Rimuovi immagine/);
  assert.match(form, /home_image_url: homeImageUrl \|\| null/);
  for (const route of [adminRoute, adminIdRoute]) assert.match(route, /home_image_url/);
  assert.match(uploadRoute, /imageExtension\(bytes, file\.type\)/);
  assert.match(uploadRoute, /const BUCKET = "circuit-home-images"/);
  assert.match(uploadRoute, /export async function DELETE/);
  assert.match(migration, /add column if not exists home_image_url text/);
  assert.match(migration, /'circuit-home-images'/);
  assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
});

test("visual correction keeps primary actions distinct and footer icon-only", async () => {
  const [source, css] = await Promise.all([read("src/app/page.tsx"), read("src/app/HomeV2.module.css")]);
  for (const className of ["quickActionPlay", "quickActionTrain", "quickActionBook"]) assert.ok(source.includes(`home.${className}`));
  assert.doesNotMatch(source, /<SectionHeader title="Servizi rapidi"/);
  assert.doesNotMatch(source, /<SectionHeader title="MOVI fuori dall’app"/);
  assert.match(source, /aria-label={`\$\{link\.label\}, si apre in una nuova scheda`}/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("public select options have an explicit dark high-contrast surface", async () => {
  const css = await read("src/components/public/PublicUI.module.css");
  assert.match(css, /select\.control option/);
  assert.match(css, /background: var\(--public-surface-1\); color: var\(--public-text\)/);
});

test("Gioca and Allenati share accessible option tiles without changing request values", async () => {
  const form = await read("src/app/richieste/RequestForm.tsx");
  assert.doesNotMatch(form, /<select/);
  assert.match(form, /function ChoiceGroup/);
  assert.match(form, /type="radio" name=\{name\}/);
  assert.match(form, /type="checkbox"/);
  assert.match(form, /Object\.entries\(windows\)/);
  assert.match(form, /Object\.entries\(levels\)/);
});
