# MOVI App — Inventario asset effettivi prima dello Stage 1

Audit locale del 24 settembre 2026. Branch `main`, HEAD `e4fba722d35d04f9fe0fb72a78b620fff6862ecd`.

## 1. Esito, metodo e perimetro

Inventario di tutti i file sotto `public/**`, immagini sotto `src/**`, riferimenti TS/TSX/CSS, metadata/manifest, worker, poster server e pipeline Storage. Dimensioni raster lette dai file locali; favicon analizzato anche come contenitore ICO. Ricerca SHA256: nessun duplicato byte-per-byte fra i file di `public`. Due loghi con dimensioni uguali non sono duplicati identici.

Audit in sola lettura su codice, asset e configurazione. Unica scrittura richiesta: questo documento. Nessuna build, avvio app, modifica immagini, interrogazione DB/Storage, download remoto, accesso produzione, migration, commit, push o deploy. `.env.local` non letto. Non vengono dichiarati nomi file, dimensioni o qualità di oggetti remoti non disponibili localmente: per quelli è riportato il riferimento effettivo nel codice e il modello di path. Le impostazioni DB possono contenere URL legacy non rilevabili dalla sola ricerca sorgente.

Ispezione visiva diretta effettuata su `movi-logo.png`, `movi-logo2.png`, `icon-512.png`, `baraonda-base.png`, `padelseries-maschile-intermedio.png`; gli altri raster sono inventariati tramite metadata, non dichiarati visivamente approvati. La preview su fondo bianco non permette di valutare bene un marchio bianco trasparente: non equivale a un file vuoto.

Questo documento restringe la preparazione owner del precedente manifest: **nessun pacchetto manuale di cover, gallery, Partner, foto club o poster video da preparare ora**. Le dimensioni standard restano approvate, ma quei file saranno caricamenti dinamici nelle fasi competenti. I sette documenti Stage 0 preesistenti non sono stati modificati.

### Legenda decisioni

- **KEEP**: mantenere; una futura ottimizzazione non è una richiesta di sostituzione.
- **REPLACE**: esiste e va riallineato al brand v2 nella fase autorizzata; non sostituire ora. Per il logo condiviso si sostituisce l'uso pubblico, non il file usato dall'admin.
- **CREATE**: nuovo asset statico necessario, ancora assente.
- **DYNAMIC**: URL/media amministrato o futuro caricamento; nessun file manuale richiesto ora.
- **REMOVE LATER**: nessun uso UI/server riscontrato; conservare finché riferimenti DB, precache e vecchie versioni non sono verificati.

“Precache sì” significa presente nel `public/sw.js` attuale, non che un dispositivo lo abbia effettivamente scaricato. “Critico PWA” distingue icone/runtime dagli asset fotografici semplicemente precached. I font non sono raster: dimensioni pixel non applicabili.

## 2. Inventario completo dei file statici

### Brand, icone e vecchie immagini Home

| File esatto repository → URL | Dimensioni / formato / byte | Uso effettivo | Classe e decisione | Duplicato / obsoleto / generato / PWA |
|---|---|---|---|---|
| `public/home/movi-logo.png` → `/home/movi-logo.png` | 252×223, PNG RGBA, 7.952 | PublicNav, hero pubblici, admin e staff; elenco completo §3 | **REPLACE uso pubblico** con SVG v2; **KEEP file** per admin/staff e compatibilità | Non duplicato esatto; attivo; non generato; precache sì, non icona install |
| `public/home/movi-logo2.png` → `/home/movi-logo2.png` | 252×223, PNG RGBA, 1.831 | Solo precache riscontrato | **REMOVE LATER**; non usarlo automaticamente come nuovo monogramma | Variante visiva distinta, non duplicato esatto; candidato legacy; non generato; non critico PWA |
| `public/icon-192.png` → `/icon-192.png` | 192×192, PNG RGB opaco, 12.809 | Manifest, metadata, notifiche admin icon/badge | **REPLACE** bytes mantenendo path e dimensione, in fase autorizzata | Derivata brand distinta, non duplicato esatto; non build artifact; **PWA critica**, precache sì |
| `public/icon-512.png` → `/icon-512.png` | 512×512, PNG RGB opaco, 46.881 | Manifest any e maskable sullo stesso URL; metadata | **REPLACE** con export valido anche maskable, stesso path | Non duplicato esatto; non build artifact; **PWA critica**, precache sì |
| `public/apple-touch-icon.png` → `/apple-touch-icon.png` | 180×180, PNG RGB opaco, 11.871 | metadata apple | **REPLACE** stesso path e formato | Non duplicato esatto; non build artifact; **PWA/iOS critica**, precache sì |
| `src/app/favicon.ico` → `/favicon.ico` | ICO, frame **16×16, 32×32, 48×48, 256×256**, 25.931 | File convention Next e metadata shortcut | **REPLACE** stesso file sorgente/URL, conservando frame | Non generato; browser identity critica, non precached nel SW letto |
| `public/home/hero-bg.jpg` → `/home/hero-bg.jpg` | 1200×800, JPEG, 120.027 | Solo precache riscontrato | **REMOVE LATER** | Nessun riferimento UI/server trovato; non generato; non critico PWA |
| `public/home/movi-store-banner.jpg` → `/home/movi-store-banner.jpg` | 1915×821, JPEG, 301.675 | Solo precache riscontrato; Store attuale usa gradienti | **REMOVE LATER** | Non generato/duplicato; non critico PWA |
| `public/home/moviback.jpg` → `/home/moviback.jpg` | 720×960, JPEG, 99.906 | Solo precache riscontrato | **REMOVE LATER** | Non generato/duplicato; non critico PWA |
| `public/home/padel-court.jpg` → `/home/padel-court.jpg` | 720×960, JPEG, 157.228 | Solo precache riscontrato; non è foto di uno specifico club in Prenota | **REMOVE LATER** | Non generato/duplicato; non critico PWA |
| `public/home/tournaments.jpg` → `/home/tournaments.jpg` | 1200×800, JPEG, 174.854 | Solo precache riscontrato; card torneo usa image_url | **REMOVE LATER** | Non generato/duplicato; non critico PWA |

Le tre PNG installazione appartengono alla vecchia identità MOVI Padel Clubs; la512 ispezionata include nomi club disposti lungo un anello. Non trattarla come monogramma nuovo né presumere che il testo periferico sia al sicuro nel crop maskable.

### Poster ancora utilizzati dal generatore amministrativo

Fonte unica di selezione: `src/app/api/admin/tournaments/[id]/poster/route.ts:55–145`. I file sotto sono **sorgenti statiche**, non output della build e non cover frontend. Il poster finale è generato a runtime con Satori/Resvg e nome `locandina-<nome>.png`; canvas Satori1080×1350. Non ridimensionare le basi senza rivedere il template.

| File esatto | Dimensioni / formato / byte | Uso selezionato | Classe / proprietà |
|---|---|---|---|
| `public/posters/baraonda-base.png` | 1086×1448 PNG RGBA, 2.138.618 | Base standard Baraonda | **KEEP**; attivo, no duplicato, non generato, precache sì, non critico install |
| `public/posters/coppie-fisse-base.png` | 1086×1448 PNG RGBA, 2.278.364 | Base standard Coppie fisse | **KEEP**; attivo, no duplicato, non generato, precache sì |
| `public/posters/padelseries-maschile-avanzato.png` | 1030×1506 PNG RGB, 1.137.734 | Circuito, maschile avanzato | **KEEP**; attivo, no duplicato, non generato, precache sì |
| `public/posters/padelseries-maschile-intermedio.png` | 515×753 PNG RGBA, 535.885 | Circuito, maschile intermedio | **KEEP**; attivo, risoluzione inferiore alle altre basi; **non presente** nel precache letto |
| `public/posters/padelseries-misto-avanzato.png` | 1030×1506 PNG RGB, 1.084.196 | Circuito, misto avanzato | **KEEP**; attivo, no duplicato, non generato, precache sì |
| `public/posters/padelseries-femminile-avanzato.png` | 1030×1506 PNG RGB, 1.454.900 | Circuito, femminile avanzato | **KEEP**; attivo, no duplicato, non generato, precache sì |
| `public/posters/padelseries-femminile-principiante.png` | 1030×1506 PNG RGB, 1.168.906 | Circuito, femminile principiante | **KEEP**; attivo, no duplicato, non generato, precache sì |

Esistono quindi artwork statici Baraonda/PadelSeries, ma sono locandine con testo, sponsor e zone dedicate ai dati, non loghi riusabili di circuito. Il file maschile intermedio ispezionato contiene la scritta “PLAY SERIES” pur chiamandosi padelseries: preservare il contenuto e far verificare all'owner la nomenclatura solo se si decide un futuro rebranding delle locandine. Nessuna loro sostituzione è necessaria per Stage1. Lo stile decorativo delle basi non viene imposto al DS v2.

### Font, template inutilizzati e file worker

| File esatto | Formato / misura | Uso | Classe / stato |
|---|---|---|---|
| `public/fonts/Inter-Regular.ttf` | TTF, 342.732 byte, no dimensioni raster | `globals.css` font-face400; generatore poster | **KEEP**; non duplicato, non generato; precache sì |
| `public/fonts/Inter-Medium.ttf` | TTF, 342.936 byte | font-face500; poster | **KEEP**; stesso criterio |
| `public/fonts/Inter-SemiBold.ttf` | TTF, 343.244 byte | font-face600; poster | **KEEP**; stesso criterio |
| `public/fonts/BebasNeue-Regular.ttf` | TTF, 57.676 byte | font-face Bebas; poster | **KEEP**; stesso criterio; non obbliga a usare Bebas nella nuova UI |
| `public/file.svg` | SVG viewBox0 0 16 16, 391 byte | Solo precache | **REMOVE LATER**; template, non generato/duplicato, non critico PWA |
| `public/globe.svg` | SVG viewBox0 0 16 16, 1.035 byte | Solo precache | **REMOVE LATER**; stesso criterio |
| `public/window.svg` | SVG viewBox0 0 16 16, 385 byte | Solo precache | **REMOVE LATER**; stesso criterio |
| `public/next.svg` | SVG viewBox0 0 394 80, 1.375 byte | Solo precache | **REMOVE LATER**; logo template Next, non generato/duplicato |
| `public/vercel.svg` | SVG viewBox0 0 1155 1000, 128 byte | Solo precache | **REMOVE LATER**; logo template Vercel, non generato/duplicato |
| `public/sw.js` | JS, 25.693 byte | Worker PWA generato, precache e runtime routes | **KEEP infrastruttura**, rigenerare solo con build futura verificata; build artifact tracciato, **PWA critico**, non asset grafico |
| `public/workbox-f1770938.js` | JS, 23.579 byte | Dipendenza `define(["./workbox-f1770938"])` del SW corrente | **KEEP** fino a transizione worker sicura; build artifact tracciato, **PWA critico** |
| `public/admin-push-sw.js` | JS, 1.156 byte | Worker notifiche admin, default icon/badge192 | **KEEP**, sorgente operativo non generato da next-pwa; critico push, non grafica da ridisegnare |

Totale rilevato: **29 file in public + favicon in src/app = 30 file**, inclusi4 font e3 JS;23 file visuali (raster/vector/ICO). Nessun'altra immagine fisica trovata in `src`. Icone Lucide/react-icons e QR generati sono elencati separatamente: non aggiungere file raster per sostituirli.

## 3. Riferimenti attuali esatti

### `/home/movi-logo.png`

| Sorgente | Contesto |
|---|---|
| `src/components/PublicNav.tsx:64` | img nav, altezza28px, contain |
| `src/app/page.tsx:655` | backgroundImage hero Home |
| `src/app/tornei/page.tsx:273` | backgroundImage hero Tornei |
| `src/app/store/page.tsx:389` | backgroundImage hero Store |
| `src/app/moviback/page.tsx:613` | backgroundImage hero MoviBack |
| `src/app/prenota/page.tsx:83` | backgroundImage hero Prenota |
| `src/app/contatti/page.tsx:92` | backgroundImage hero Contatti |
| `src/app/admin/layout.tsx:41` | img shell admin |
| `src/app/admin/page.tsx:215` | img dashboard admin |
| `src/app/admin/login/page.tsx:91` | backgroundImage login admin |
| `src/app/staff/layout.tsx:46` | img shell staff |
| `src/app/staff/login/page.tsx:78` | backgroundImage login staff |
| `public/sw.js` | precache revisionato |

**Strategia:** creare SVG pubblico in path nuovo e mantenere PNG legacy al suo posto. Sostituire direttamente questo PNG ridisegnerebbe anche admin/staff, contrari al freeze. Non usare la variante `movi-logo2.png` come prova che esista già un monogramma MOVI v2 approvato.

`app_settings.home_logo_url` è selezionato da `src/app/api/app-settings/route.ts:11` e presente nei tipi/stato Home, ma non risulta usato nel rendering corrente del logo. È un campo dinamico latente, non un file statico da preparare.

### Metadata / OpenGraph / social

`src/app/layout.tsx` definisce icon192, icon512, apple180 e shortcut `/favicon.ico`; OpenGraph e Twitter contengono titolo/descrizione e `summary_large_image`, **nessun campo images**. Nessun `opengraph-image.*`/`twitter-image.*` o generatore immagine social trovato in `src/app`.

Quindi nessuna cover social esistente da sostituire e nessun file OpenGraph obbligatorio per Stage1. Se un futuro brief richiederà una social card, sarà un asset separato esplicitamente autorizzato; non aggiungerlo al lavoro owner attuale. I link social del footer non sono immagini OpenGraph.

### Visuali prodotti da codice

- Lucide/react-icons: simboli navigazione, sport, azioni, contatti, social. **KEEP**, vettoriali generati dai componenti, nessuna preparazione manuale. Non confondere questi con le PNG installazione.
- QR personale/premio: `QRCodeCanvas` in MoviBack e componenti che usano il relativo payload. **KEEP comportamento**, canvas runtime, nessun file statico richiesto; tessera digitale deve comporre il QR esistente, non stamparlo nel background.
- Gradienti e decorazioni: Home/Store/MoviBack/Prenota/Contatti e temi circuito; League in `src/app/monday-league/MondayLeague.module.css`. **KEEP come fallback / riallineamento CSS futuro**, non sono immagini mancanti.
- Font Geist da `next/font/google` in root: asset di build framework, non un file owner in public; nessuna nuova consegna font richiesta.
- Poster `locandina-<nome>.png`: output runtime di endpoint admin, **KEEP**, non aggiungere file generati al repository come cover.

## 4. Media dinamici realmente collegati

Dimensioni remote **non determinate**: nessun bucket/listing remoto è stato consultato. DYNAMIC non significa sostituire tutte le immagini esistenti. URL esatti dipendenti dai record DB non sono inventati.

| Dominio e riferimento sorgente | Storage / campo effettivo | Dove appare / crop | Decisione |
|---|---|---|---|
| Tornei | `tournaments.image_url`; `/api/admin/upload` usa bucket dal form, default `tournaments`, `<UUID>.<ext>`, restituisce URL pubblico | `TournamentCard.tsx:704`, `.base44-tcard-img`100%×190px cover | **DYNAMIC**, mantenere esistenti; nuove cover L |
| Circuiti logo1/2/3 | `circuits.hero_logo_url`, `hero_logo_2_url`, `hero_logo_3_url`, URL inseriti da CircuitDialog; nessun bucket specifico imposto dal form URL | `circuiti/[slug]/page.tsx:558,573,586`,180×44/120×34 max, contain | **DYNAMIC**, proporzioni native, nessun nuovo marchio statico obbligatorio |
| Circuiti Home | Temi gradienti e testo; nessuna cover statica consumata dal rendering attuale | `page.tsx:945+` | Cover v2 **DYNAMIC futura**, non chiedere immagini adesso |
| Store colore prodotto | `store_product_colors.image_path`; bucket `store-images`; `<Date.now()>-<nome-sanificato>` | Catalogo, modale prodotto, carrello | **DYNAMIC**, KEEP immagini utilizzabili; dettaglio §8 |
| Premi | `rewards_catalog.image_path` e reward relazionato alle redemption; bucket `reward-images`, endpoint `/api/admin/moviback/rewards/image` | Premi pubblico+preview, MoviBack redemption, riscatto token, catalogo admin+preview | **DYNAMIC**; thumbnail/card, nessun rework generale |
| Comunicazioni | `communications.image_path`; bucket `communication-images`, endpoint `/api/admin/comunicazioni/image` | Home notifiche img58px, admin comunicazioni e preview; API MoviBack fornisce lo stesso campo | **DYNAMIC**, mantenere workflow e riferimenti |
| Monday League squadre | `league_teams.logo_path/image_path`; bucket `monday-league-media`, `monday-league/<season-id>/<team-id>/<logo|hero>/<UUID>.<png|jpg|webp>` | `PublicLeagueViews.tsx:102,150`; loghi52/76px quadrati cover, team hero background cover min280px,230mobile | **DYNAMIC**, upload capitano autorizzato/admin; logo max2MiB, hero5MiB; nessun file owner ora |
| Certificati medici | `medical_certificates.file_path`; bucket privato `medical-certificates`; URL firmato admin | Preview file in admin user detail, può essere immagine/documento | **DYNAMIC protetto**, non asset di brand, non migrare in media pubblici |
| Home logo configurabile | `app_settings.home_logo_url`, letto ma non renderizzato nella Home corrente | Nessun consumo visuale attivo trovato | **DYNAMIC latente**, non usare per giustificare cancellazioni di file |

Endpoint premi/comunicazioni/Store accettano JPEG/PNG/WebP fino a5MiB. Non assumere uguali validazioni nel generic upload tornei (nel codice letto non impone quella whitelist/limite). Circuiti accettano URL: un'immagine potrebbe risiedere fuori Storage. Il resolver League ammette anche URL HTTPS o path assoluti locali; non certificare che tutti i record rispettino il path moderno.

### Monday League e artwork ufficiali circuiti

**Monday League:** non esiste un file statico dedicato al marchio della competizione nel repository. Hero Home e pagina League sono testo/gradienti CSS; logo/hero squadra sono dinamici. Pertanto mantenere la rappresentazione attuale, nessuna sostituzione artwork necessaria per Stage1. Un eventuale marchio ufficiale futuro è facoltativo e fuori checklist attuale.

**Baraonda/PadelSeries:** esistono le sette basi poster sopra; nessun logo circuito statico separato individuato. Gli hero circuito hanno fino a tre URL dinamici. Mantenere le basi admin; non estrarre loghi/sponsor dai poster e non trasformarli in cover orizzontali. Non è possibile approvare qualità/licenza/brand dei loghi remoti senza vedere i file, ma non serve richiederne sostituzione preventiva.

## 5. Standard dinamici confermati

| Classe | Rapporto | Dimensioni raccomandate / minime | Formato sorgente / comportamento |
|---|---|---|---|
| L — tornei, circuiti cover, Succede, È successo, club, Partner cover, video poster | **16:9** | **1600×900 / 960×540** | JPEG/WebP; PNG ammesso se necessario, cover con focal point e safe area centrale |
| Q — logo Partner/squadra su canvas, nuovo prodotto/premio quadrato, thumb gallery | **1:1** | **1200×1200 / 600×600** | PNG/WebP alpha per loghi/prodotti, JPEG per foto; loghi contain nella futura UI, no deformazione |
| Gallery e logo a rapporto originale | Nativo | Originale adeguato al dettaglio, derivate L/Q dove utili | Gallery verticale ammessa nel dettaglio; logo con viewBox nativo, niente obbligo di ritaglio al quadrato |

**Adeguatezza ai componenti:** immagine torneo attuale alta190px in griglia pubblica, larghezza variabile;1600 copre2× una card larga fino800 CSSpx. Una card del rail v2 circa301px a viewport390 richiede circa602px a DPR2; L960 minimo è adeguato al rail, L1600 al dettaglio editoriale proposto720px a DPR2. Una card torneo mobile vicina al breakpoint768 può superare il fabbisogno2× del minimo960: usare il master1600, non vietare il minimo per card più piccole.

Il rapporto16:9 è lo standard del nuovo frame, non quello implicito delle immagini attuali alte190px; non deformare l'immagine per adeguarla. Store già contiene l'immagine in frame verticale/quadrato, quindi Q funziona senza sostituzione dei master legacy. Loghi circuito180×44 vanno mantenuti native/contain e non tagliati in L. Poster amministrativi verticali sono un'eccezione esistente separata dalla libreria media v2, non un terzo formato da richiedere ora.

Per nuovi upload: preservare master, generare derivate responsive nelle fasi media autorizzate; nessuna pipeline di resize attualmente dimostrata dagli upload letti. Non dichiarare ottimizzazione Next Image o trasformazioni Storage già attive. Home non deve scaricare i master per ogni card. Nessuna foto necessaria per la tessera digitale: superficie CSS sufficiente.

## 6. PWA / browser icon replacement matrix

| Sorgente corrente → URL stabile | Riferimenti | Export futuro allo stesso path | Maskable / precache / azione |
|---|---|---|---|
| `public/icon-192.png` → `/icon-192.png` | manifest.ts:28; layout.tsx:62; lib/adminPush.ts:65–66; public/admin-push-sw.js | PNG192×192 opaco, marchio compatto v2 | purpose any implicito; precache sì; preservare anche come fallback notifiche |
| `public/icon-512.png` → `/icon-512.png` | manifest.ts:33 e38; layout.tsx:67 | PNG512×512 opaco; composizione valida sia any sia maskable | **Stesso URL usato due volte**, non due file; segno essenziale nel cerchio centrale raggio40% lato |
| `public/apple-touch-icon.png` → `/apple-touch-icon.png` | layout.tsx:75 | PNG180×180 opaco, senza angoli arrotondati pre-disegnati | precache sì; iOS può conservare icona installata finché il sistema non la aggiorna |
| `src/app/favicon.ico` → `/favicon.ico` | Next file convention + layout shortcut | ICO con16/32/48/256, simbolo leggibile piccolo | non precached nel SW corrente; non creare un secondo public/favicon.ico concorrente |

Non occorrono `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `site.webmanifest` o una nuova `/manifest.json`: non sono riferimenti correnti. Il manifest è generato da `src/app/manifest.ts` come `/manifest.webmanifest`. Nessun file separato maskable obbligatorio: produrre la512 adatta a entrambi gli usi. Un path maskable separato sarebbe una scelta futura opzionale con aggiornamento coordinato manifest, non un requisito owner attuale.

### Discrepanza worker riscontrata, da non nascondere

- Sorgenti correnti: `next.config.ts` richiede GET `/api/**` **NetworkOnly**; `worker/index.ts` elimina `caches.delete("apis")` in activate.
- Artefatto tracciato `public/sw.js`: **zero occorrenze NetworkOnly**, runtime API **NetworkFirst** con cacheName `apis`; nessun `caches.delete` e dipendenza solo Workbox riscontrata. Non è allineato ai sorgenti attuali. Non indica quale worker sia servito in produzione, che non è stata consultata.
- Precache visuale: apple,192,512, tutti7 file Home,5 SVG template,4 font e6 delle7 basi poster. La base maschile intermedio è assente. Favicon assente. Esiste inoltre un chunk JS `_next/.../manifest.webmanifest/route-...js`: un chunk non è il manifest URL precached.
- I poster pesanti e immagini non usate dalle pagine sono ancora nella lista: il fatto che siano “solo precache” non rende sicura la cancellazione immediata.

### Procedura sicura futura, non eseguita

1. Conservare path icone, id/start_url/scope del manifest, percorso worker e logica push. Cambiare solo i bytes approvati degli export; per logo UI usare i nuovi SVG evitando impatto admin/staff.
2. Nella fase implementativa eseguire build locale controllata, rigenerando insieme SW/Workbox/precache dalla configurazione corrente; mai editing manuale del file minificato o semplice copia delle vecchie revision.
3. Verificare worker generato: API NetworkOnly, custom activate con purge `apis`, revision icone aggiornate, nessun riferimento locale mancante; controllare presenza/assenza poster deliberatamente. Non considerare lo SW tracciato attuale baseline funzionale corretta.
4. Provare su installazione vecchia in profilo test: update/activate, cache icone nuova, rimozione `apis`, offline, riapertura, notifica admin e badge. Non forzare reinstallazione o reset sessione per mostrare il brand nuovo. L'aggiornamento dell'icona launcher può dipendere dal sistema, non garantire immediatezza.
5. Conservare dipendenze del worker vecchio durante una futura transizione di rilascio; non eliminare subito `workbox-f1770938.js` se vecchi client possono ancora richiederlo. Nessun deploy autorizzato da questo documento.

Safe-area maskable: per512, cerchio centrale diametro409,6px e raggio204,8px; non basta lasciare10% per lato in un quadrato, perché gli angoli di quel quadrato possono cadere fuori dal cerchio. Il vecchio anello testuale periferico va eliminato nel nuovo export compatto. PNG opache con fondo brand continuo fino al bordo.

## 7. Foto club — raccomandazione

`src/app/prenota/page.tsx` ha un array hardcoded di5 club con `name/address/maps/wansport`, nessun campo foto, nessun upload/admin media club. Oggi **non esistono cinque asset foto club da sostituire**. Il file generico `padel-court.jpg` non è consumato dalla pagina e non può essere attribuito ai cinque club.

**Raccomandazione B: foto gestite dinamicamente dall'admin** nella futura fase Prenota/media. Motivazione: le immagini cambiano indipendentemente dai link Wansport e non devono richiedere una nuova build. Collegare media per chiavi stabili `revello`, `saluzzo`, `manta`, `costigliole`, `centallo`; mantenere i link esistenti e ordine v2. L'architettura admin non esiste ancora: è una proposta da includere nella fase appropriata, non una funzionalità dichiarata disponibile.

Non richiedere adesso `revello.jpg`, `saluzzo.jpg`, `manta.jpg`, `costigliole.jpg`, `centallo.jpg` o creare una directory di foto statiche. Fino alla futura gestione media, il layout può mantenere il fallback senza foto. Quando attiva, ciascun club usa classe L1600×900/min960×540; contenuto e selezione delle foto avvengono in quel momento.

## 8. Store — pipeline e raccomandazione

Upload: `src/app/api/admin/store/products/image/route.ts`, guardAdmin, JPEG/PNG/WebP≤5MiB, nome sanificato preceduto da timestamp, bucket `store-images`, nessun ridimensionamento/transcoding nel codice della route. Restituisce `path` relativo e `url` pubblico; il form admin salva `image_path` sulla variante colore.

Lettura: `/api/store/products` restituisce `colors.image_path`. `store/page.tsx:103` restituisce direttamente i path che iniziano con http oppure costruisce `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/store-images/${path}`. L'audit ha letto la funzione, non il valore env né gli oggetti remoti.

Crop effettivo:

- Catalogo `store/page.tsx:531–555`: frame **1:1.18**, immagine **contain**, padding12px, non cover.
- Modale `:867–890`: frame **1:1**, max-height360px, immagine **contain**, padding16px; il cap può limitare il rapporto effettivo del contenitore a larghezze grandi, verificare nel futuro test visuale.
- Carrello `:1060`: thumbnail **58×58**, **cover**, radius15px.

**Decisione:** Q1:1 come standard per nuovi upload, mantenendo contain sul prodotto e composizione centrata con margine. Nessuna sostituzione immediata delle immagini prodotto utilizzabili e nessuna richiesta massiva di scontorno/re-export. Le immagini remote non sono state ispezionate: solo eventuali file problematici riscontrati in seguito richiederanno intervento mirato. Il vecchio `movi-store-banner.jpg` è scollegato dall'attuale rendering, non rappresenta la pipeline prodotti.

## 9. Contatti — nessun nuovo asset necessario

`src/app/contatti/page.tsx`: componenti Lucide `Mail`, `Phone`, `MessageCircle`, `UserRound`; `UserRound` identifica le card dei referenti. **Nessun avatar o ritratto fotografico** e nessun path foto dei tre referenti. L'unica immagine locale è il logo MOVI di hero/nav.

Mantenere icone e informazioni di Claudio/Erika/Massimiliano. **Zero fotografie statiche nuove richieste.** Il rebranding di card e chip è CSS/componenti.

## 10. FILES MASSIMILIANO MUST PREPARE NOW

Minimo necessario: **due master SVG + quattro export icone = sei file**. Gli export possono essere prodotti dal grafico a partire dallo stesso monogramma; non sono sei progetti grafici diversi. I path sotto sono destinazioni della futura implementazione, non file creati in questo audit.

| File da consegnare / futura destinazione | Scopo | Rapporto e dimensione | Formato / trasparenza | Safe area | Testo incorporato |
|---|---|---|---|---|---|
| `movi-padelleria.svg` → `public/brand/movi-padelleria.svg` | Logo principale UI pubblica | **Rapporto nativo ufficiale**, non deformarlo né imporre252:223 del vecchio PNG. SVG con viewBox aderente; prova a28–44px di altezza. Se serve fallback raster successivo: altezza176px per slot44 a4×, larghezza proporzionale | SVG vettoriale autosufficiente, **trasparente** | Clearspace almeno10% altezza marchio nella composizione, contain; niente padding enorme nel viewBox | Solo lettering ufficiale MOVI/Padelleria convertito in tracciati; slogan e saluto restano HTML |
| `movi-monviso.svg` → `public/brand/movi-monviso.svg` | Marchio compatto sticky, QR/nav e master icone | Canvas **1:1**, viewBox0 0 512 512; segno mantiene rapporto nativo | SVG vettoriale, **trasparente** | Segno entro cerchio centrale80% diametro se riusato nelle icone | Nessun testo piccolo, nomi club o slogan |
| `icon-192.png` → `public/icon-192.png` | PWA e fallback notifiche | **1:1,192×192** esatti | PNG, **opaco** | Segno dentro cerchio centrale80% diametro; fondo pieno al bordo | Nessuno |
| `icon-512.png` → `public/icon-512.png` | PWA any + maskable | **1:1,512×512** esatti | PNG, **opaco** | Cerchio centrale diametro409,6px; fondo continuo fino ai bordi | Nessuno |
| `apple-touch-icon.png` → `public/apple-touch-icon.png` | Installazione iOS | **1:1,180×180** esatti | PNG, **opaco** | Segno centrale80%, nessun angolo arrotondato precalcolato | Nessuno |
| `favicon.ico` → `src/app/favicon.ico` | Tab browser/shortcut | **1:1**, frame **16,32,48,256px** nel medesimo file | ICO, alpha ammesso; simbolo leggibile su tab chiaro/scuro | Margine ottico1–2px alla16, proporzionale agli altri; controllo pixel per ciascun frame | Nessuno |

Per il logo principale un rapporto numerico nuovo non è ricavabile dal solo marchio ufficiale futuro, che non è fornito: **rapporto nativo è il requisito esatto**, non un dato mancante da inventare. Il componente userà contain. Non serve un secondo PNG manuale del logo se l'SVG è disponibile; SVG senza font esterni, script o immagini remote. Se l'owner possiede già un SVG ufficiale conforme, consegnarlo: non ridisegnarlo inutilmente.

**Non preparare ora:** background tessera (CSS sufficiente), artwork nuovo Monday League (nessun consumer statico), nuovi loghi Baraonda/PadelSeries (URL dinamici e basi poster esistenti), cover social (non configurata), badge push separato (non richiesto dal flusso corrente), fotografie Contatti, nuove font, poster admin rifatti. Un futuro badge monocromatico potrà essere valutato separatamente senza toccare ora il worker.

### FILES THAT SHOULD NOT BE PREPARED NOW — media dinamici

| Futuri caricamenti | Standard |
|---|---|
| Cover torneo/circuito | L16:9,1600×900/min960×540 |
| Succede / È successo cover | L |
| Gallery e immagini editoriali | L/Q, originale nativo ammesso nel dettaglio |
| Partner logo / cover | Q o logo nativo / L |
| Foto dei5 club | L, futura gestione admin, non repository |
| Poster video | L, caricamento con contenuto |
| Squadre League logo / hero | Q o nativo / L; mantenere pipeline esistente |
| Nuove immagini prodotto/premio | Q futuro, nessun rifacimento obbligatorio delle esistenti |

## 11. Rischi e verifiche prima dell'implementazione

1. **Worker generato non allineato:** verificare build locale e API caching prima di dichiarare sicuro qualsiasi aggiornamento PWA. Non corretto in questo audit.
2. **Logo condiviso admin/staff:** nuovo path SVG pubblico; mantenere PNG legacy fino a decisione separata. Icon192 condivisa con notifiche: provare leggibilità icon/badge, senza cambiare payload o auth.
3. **Maskable corrente:** il testo periferico della512 non è garantito dentro safe area; nuova512 compatta valida per entrambi i purpose, senza nuovi URL obbligatori.
4. **File senza consumer sorgente ancora precached:** REMOVE LATER non autorizza cancellazione; verificare anche URL DB/dati admin e vecchi worker nella fase futura. Nessun duplicato esatto da eliminare automaticamente.
5. **Storage non ispezionato:** dimensioni/qualità/URL degli upload reali restano non verificati; nessuna falsa certificazione di asset hosted.
6. **Poster:** basi ancora necessarie al generatore, dimensioni diverse e sponsor incorporati. Non convertirle a16:9 o rimuoverle durante pulizia Home.
7. **Club dinamici non implementati:** serve gestione media additiva autorizzata, senza cambiare Wansport; non mostrare broken image mentre manca la funzionalità.
8. **Icon cache OS:** path stabili evitano rotture ma non garantiscono aggiornamento visivo immediato del launcher. Test su installazione esistente, nessun reset account.

## 12. Stato Git e integrità

Stato iniziale: ` M supabase/config.toml`; `?? docs/auth/MOVI_AUTH_2_PRODUCTION_ROLLOUT_RUNBOOK.md`; `?? supabase/tests/fixtures/home_sections_visual.local.sql`. I sette documenti Stage0 sono già tracciati alla baseline di questo audit; nessun commit è stato eseguito qui.

Unica aggiunta rilevata: `?? docs/rebranding/MOVI_APP_CURRENT_ASSET_INVENTORY.md`. Nulla staged. Nessun asset/codice/configurazione modificato. Verifica integrità finale su380 file preesistenti (public/src/worker/documenti Stage0 e file protetti/config) mediante digest SHA256 aggregato, escludendo il nuovo documento: **PASS**, digest iniziale e finale uguali a `5512C6DE47499AC0A8D9C685EF4F5709EC2E98D000FFF3E292EDC8270E093B50`. Controllo completezza: nessun file di public omesso dall'inventario.
