# MOVI App — Audit frontend Stage 0

24 settembre 2026 · audit statico locale · baseline `3cbdabb2a9c7a113838b7c8d55b3d064821cdc25`.

## Architettura riscontrata

`package.json`: Next 16.1.5, React 19.2.3, TypeScript, Tailwind 4.1.18, Radix, shadcn-style primitives, Sonner, Lucide/react-icons, qrcode.react, next-pwa. Le versioni dichiarate non certificano una build eseguita in questa fase.

```text
src/app/layout.tsx (Geist variable, globals, Toaster, progressive auth, install prompt)
├─ pagine pubbliche/client (PublicNav importato dalle singole pagine)
├─ pagine Auth + callback
├─ admin/layout.tsx (header e shell propri)
└─ staff/layout.tsx (header e shell propri)
src/app/api/** → lib identity/guards/domain → Supabase
worker/index.ts + next.config.ts → service worker generato in public/
```

Non esiste un layout pubblico centralizzato distinto dalla root. Home è una grande pagina client con fetch, timer, login, notifiche, iscrizioni e stili nello stesso file. Store e MoviBack combinano analogamente dati, modali e UI. API server costituiscono il confine da conservare. `src/lib` comprende anche generatori Baraonda/Baraonda-v2, bracket coppie fisse, poster, circuiti via route, League, contratti MoviBack/Store, autenticazione, Telegram/push e strumentazione prestazioni: non sono componenti di design.

## Superfici effettive

| Area | Route presenti | Nota di accesso |
|---|---|---|
| Pubblico | `/`, `/tornei`, `/circuiti/[slug]`, `/prenota`, `/contatti`, `/privacy`, `/termini`, `/cookie` | Azioni personalizzate possono richiedere identità o dati utente; vedere invarianti |
| Servizi utente | `/moviback`, `/moviback/premi`, `/moviback/regolamento`, `/store`, `/riscatto-premio/[token]` | Superfici pubbliche con stato autenticato/gating, non tutte guardate come una singola area privata |
| League | `/monday-league`, `/monday-league/squadre/[slug]` | Pubblicazione e contesto capitano risolti server |
| Auth | `/accedi`, `/registrati`, `/attiva-account`, `/accesso-precedente`, `/password-dimenticata`, `/reset-password` | Componenti Auth condivisi e callback dedicata |
| Admin generale | `/admin`, `/admin/login`, `/admin/users`, `/admin/users/duplicates`, `/admin/comunicazioni` | Layout proprio, nessun redesign |
| Admin tornei/circuiti | `/admin/tournaments`, `/admin/tournaments/[id]/registrations`, `/admin/tournaments/[id]/run`, `/admin/circuits`, `/admin/circuits/[id]` | Motori e classifiche esclusi dal restyling |
| Admin MoviBack | `/admin/moviback`, `/admin/moviback/catalog`, `/admin/moviback/promos`, `/admin/moviback/redemptions`, `/admin/moviback/requests`, `/admin/moviback/users`, `/admin/moviback/users/[id]` | Richieste, premi, membership |
| Admin Store | `/admin/store/products`, `/admin/store-orders`, `/admin/store-economics`, `/admin/store/economica` | Entrambe le superfici economiche esistono; non accorparle |
| Admin League | `/admin/monday-league`, figli `squadre`, `classifica`, `risultati`, `calendario`, `calendario/genera`, `fase-2` | Nessuna variazione di permessi o workflow |
| Staff | `/staff`, `/staff/login`, `/staff/scanner`, `/staff/rewards` | Scanner e consegne protetti |

Assenti come pagine: `/profilo`, `/circuiti` elenco, Le mie attività, Gioca, Allenati, Partner, dettaglio editoriale. Home oggi ospita l'elenco circuiti. La mia tessera v2 sarà una modale, mai una route dedicata. L'inventario completo dei file page/layout è allegato in fondo.

## Componenti e grado di riuso

| Componenti | Stato / opportunità |
|---|---|
| `ui/button`, badge, card, input, label, textarea, select, tabs, table, dialog, alert-dialog, collapsible, radio-group | Primitive riusabili, ma condivise con admin: aggiungere varianti/scoping pubblico senza alterare default globali |
| `PublicNav` | Header sticky top 0 z50; logo img 28px, link Home e gear admin; larghezza max 64rem. Non è una bottom nav |
| `MoviAuthForm`, `LegacyAccessForm`, `UserLoginDialog`, `ProgressiveAuthPrompt` | Conservare logica; evitare nuovi form che duplicano onboarding |
| `InstallAppPrompt` | Overlay fixed bottom 14px: collisione potenziale con futura bottom nav/carrello |
| `TournamentCard` + registration/participants/live dialogs | Buon confine dominio, ma card molto accoppiata a Base44/stili e fetch partecipanti; evitare spostamento della logica nel nuovo componente grafico |
| `MyRegistrations`, `PlayerName`, `ResponsiveSheetDialog` | Riusabili con audit CSS; sheet mobile 100dvh e dialog da sm, footer/header sticky |
| `monday-league/PublicLeagueViews` | Vista condivisa specifica di dominio; mantenere il read model |
| `moviback/RewardRequestsQueue`, `RewardDeliveryPanel` | Componenti operativi admin/staff esclusi dal nuovo tema |
| UI locali in Home/Store/MoviBack | Header hero, pill, gradienti, card, modali e pulsanti ripetuti; estrazione futura solo dopo contratti, senza spostare business logic |

## Linguaggio visivo attuale

- Root body chiaro slate; pagine pubbliche spesso sovrascrivono con `#030712`, `#07111f`, `#0f172a`. Accenti indigo `#4f46e5`, cyan/teal, amber, pink e gradienti differenziati per pagina/circuito.
- `globals.css` contiene variabili shadcn HSL, Base44 pubblico e admin, correzioni globali Radix e override ripetuti. Lo stesso `.base44-pill-live` passa da cyan a rosso per ordine CSS; più definizioni di `.base44-player-name`, `.base44-cta`, `.base44-tcard-name`.
- `Geist` è importato in root come variabile, ma body usa stack di sistema. Inter 400/500/600 e Bebas sono dichiarati con font-face locali; `.base44-public` usa `var(--font-inter)` non definita nel CSS letto. Non dichiarare Inter/Geist come font universalmente effettivo senza computed-style runtime.
- Testi tipici 12–18px; titoli Base44 32–36px, hero con clamp e pesi fino a 900/950 inline. Icone Lucide e react-icons, oltre a simboli genere/stelle.
- Radius misti: 12, 14, 16, 18, 28 e pill 999px; token root 0.75rem. Spazi spesso 8/12/16/18/22/24 con valori inline non tokenizzati. Bordi chiari `#e2e8f0` e bianchi traslucidi sul dark. Ombre/blur e gradienti duplicati.
- Button primitive default 36px, small 32px, large 40px; alcuni icon button 36/40px. Target v2 da aumentare solo nella superficie pubblica.
- Tailwind v4/PostCSS convivono con configurazione stile precedente (safelist, direttive @tailwind) e CSS puro con commenti su affidabilità utility. Non migrare toolchain per il rebranding; verificare stili calcolati nella fase 1.

## Responsive e comportamento di shell

Breakpoints osservati: Store `max-width:390px`; globali `max-width:640px`, `max-width:768px` (input 16px anti-zoom), griglia da `min-width:768px`; review duplicati 820px. Utility `sm:` nello sheet, griglie auto-fit minmax(260px,1fr), clamp per hero. Non c'è una politica unica dimostrata.

Contenitori pubblici Base44 max 64rem/1024px con padding 16px, admin 72rem/1152px, dettaglio circuiti max 1200px. Header pubblico sticky z50, admin/staff z60; numerosi modali fixed; Store ha carrello flottante e dialog locale. Regole overlay globali arrivano a z9998–10001 e `body:has([data-radix-portal])::before`: rischio reale di collisione tra nuova shell e portali. Mancano una bottom nav pubblica condivisa e un contratto safe-area comune riscontrato.

## Immagini: evidenze dimensionali

| Fonte locale | Slot attuale | Conseguenza per manifest v2 |
|---|---|---|
| `globals.css`, `.base44-tcard-img` + TournamentCard | img larghezza 100%, altezza 190px, cover; griglia 1/2 colonne in contenitore 64rem | Un master landscape riusabile e crop controllato; altezza fissa attuale non impone un rapporto sorgente unico |
| `store/page.tsx:531`, `:867`, `:1060` | Catalogo 1/1.18, dettaglio 1/1, thumb 58px | Master quadrato con contain per prodotto, senza obbligare a nuovo master verticale |
| `circuiti/[slug]/page.tsx:561` | Logo principale 180×44 max, altri 120×34 max, contain | Artwork trasparente con proporzioni originali, distinto dalla fotografia cover |
| `PublicNav.tsx` | Logo 28px alto | SVG vettoriale o raster trasparente ad alta densità |
| `moviback/page.tsx:1175`, Home notifiche `:1764` | Piccole immagini premio 68px / notifiche 58px | Derivate thumbnail, mai master pieno |
| Home/Store/MoviBack/Prenota/Contatti | Decorazioni hero alte 290/360/420px a seconda della pagina | Non richiedere cinque formati; sostituire decorazione con superfici/tokens ove possibile |

Prevalgono `<img>` e background inline, non una pipeline responsive `next/image` condivisa. `next.config.ts` non definisce attualmente remotePatterns immagini. Asset locali in `public/home`, font e poster; upload a Supabase con URL pubblici e bucket specifici. Nessuna trasformazione immagini runtime verificata; imgproxy locale risulta fermo.

## Loading, errori, accessibilità: stato dell'audit

Loading ed errori sono spesso stati locali e toast Sonner; nessun `loading.tsx`/`error.tsx` nel rilevamento route. Home carica sezioni in parallelo; non trasformare un errore feed in una conferma di saldo zero. Modali Radix e modali custom convivono: focus trap, ritorno focus, lettore schermo, tastiera e scroll-lock richiedono verifica runtime. PWA dev disabilitata: un semplice smoke test `next dev` non copre il SW.

Questa fase non ha prodotto screenshot, misure LCP/CLS, contrasto misurato dell'interfaccia corrente, scansioni axe o collaudo su dispositivo. Dimensioni nuove nel manifest sono specifiche derivate dai vincoli sorgente, non misure di rendering. Nessuna ispezione della produzione.

## Priorità architetturali per le fasi successive

1. Introdurre tema pubblico isolato e primitive composabili mantenendo admin/staff invariati.
2. Shell con Nav/Header/Section/MediaFrame/Carousel/Status/Modal; mantenere adapter e controller di dominio correnti.
3. Controllare collisioni portali, prompt installazione/Auth e carrello prima della bottom nav.
4. Non unificare motori, endpoint o cache durante estrazioni visive.
5. Bloccare personalizzazione circuito finché non esiste un'associazione sicura; distinguere nuove superfici da funzionalità già disponibili.

## Inventario file page/layout rilevato

- `src/app/accedi/page.tsx`
- `src/app/accesso-precedente/page.tsx`
- `src/app/admin/circuits/[id]/page.tsx`
- `src/app/admin/circuits/page.tsx`
- `src/app/admin/comunicazioni/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/login/page.tsx`
- `src/app/admin/monday-league/calendario/genera/page.tsx`
- `src/app/admin/monday-league/calendario/page.tsx`
- `src/app/admin/monday-league/classifica/page.tsx`
- `src/app/admin/monday-league/fase-2/page.tsx`
- `src/app/admin/monday-league/page.tsx`
- `src/app/admin/monday-league/risultati/page.tsx`
- `src/app/admin/monday-league/squadre/page.tsx`
- `src/app/admin/moviback/catalog/page.tsx`
- `src/app/admin/moviback/page.tsx`
- `src/app/admin/moviback/promos/page.tsx`
- `src/app/admin/moviback/redemptions/page.tsx`
- `src/app/admin/moviback/requests/page.tsx`
- `src/app/admin/moviback/users/[id]/page.tsx`
- `src/app/admin/moviback/users/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/store-economics/page.tsx`
- `src/app/admin/store-orders/page.tsx`
- `src/app/admin/store/economica/page.tsx`
- `src/app/admin/store/products/page.tsx`
- `src/app/admin/tournaments/[id]/registrations/page.tsx`
- `src/app/admin/tournaments/[id]/run/page.tsx`
- `src/app/admin/tournaments/page.tsx`
- `src/app/admin/users/duplicates/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/attiva-account/page.tsx`
- `src/app/circuiti/[slug]/page.tsx`
- `src/app/contatti/page.tsx`
- `src/app/cookie/page.tsx`
- `src/app/layout.tsx`
- `src/app/monday-league/page.tsx`
- `src/app/monday-league/squadre/[slug]/page.tsx`
- `src/app/moviback/page.tsx`
- `src/app/moviback/premi/page.tsx`
- `src/app/moviback/regolamento/page.tsx`
- `src/app/page.tsx`
- `src/app/password-dimenticata/page.tsx`
- `src/app/prenota/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/registrati/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/riscatto-premio/[token]/page.tsx`
- `src/app/staff/layout.tsx`
- `src/app/staff/login/page.tsx`
- `src/app/staff/page.tsx`
- `src/app/staff/rewards/page.tsx`
- `src/app/staff/scanner/page.tsx`
- `src/app/store/page.tsx`
- `src/app/termini/page.tsx`
- `src/app/tornei/page.tsx`
