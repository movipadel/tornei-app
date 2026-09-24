# MOVI App — Media architecture e asset manifest

Stage 0 · 24 settembre 2026. Specifica, nessun asset generato o upload eseguito. Raccomandazioni architetturali locali: nessun costo cloud, quota o prestazione di provider verificato online in questa fase LOCAL ONLY.

## Due librerie distinte

**A. Static brand assets:** logo MOVI/Padelleria, monogramma, eventuale lockup promessa, icone PWA, artwork ufficiali Monday League/circuiti selezionati, sfondo tessera opzionale. File versionati e approvati dal proprietario; non generare loghi sostitutivi. Non cambiare asset condivisi con admin senza verificare che l'admin resti identico; preferire nuovi nomi/versione pubblica.

**B. Media dinamici:** cover tornei, cover circuiti, Succede, È successo, gallery, loghi e cover Partner, foto club. Upload amministrativo su Supabase Storage con originale e derivate; contenuti privati/bozze separati dai pubblicati. Store/reward immagini già dinamiche: mantenere riferimenti e riusare pipeline solo in fase futura autorizzata.

## Dimensioni ricavate dai componenti, non da mockup

Evidenze: contenitore pubblico attuale 1024px con 32px gutter totale; card torneo immagine 190px (`globals.css`) in griglia che passa a due colonne da 768px; Store ratio 1/1.18 e dettaglio quadrato (`store/page.tsx:531,867`), miniature 58px; premio 68px; logo nav alto 28px (`PublicNav.tsx`); logo circuito max 180×44px (`circuiti/[slug]/page.tsx:561`); dettaglio circuito max1200px.

Per v2, rail mobile a viewport 390px: W=358, card≈301px (formula DS), cover 16:9 alta≈169px; DPR2 richiede≈602px. Una card larga 496px richiede≈992px a DPR2. Il dettaglio editoriale proposto largo720px richiede1440px a DPR2. Da qui master condiviso **1600×900**, minimo **960×540** con avviso per dettaglio a grande densità, derivate 320/480/640/960/1440/1600. Una cover ampia desktop oltre800 CSS px non deve richiedere sempre DPR2: usare sizes/qualità e verificare il risultato.

Per quadrati: dettaglio prodotto/modale attuale circa fino a560px di larghezza contenitore; 2×560≈1120, arrotondato al master **1200×1200**, minimo **600×600**. Thumb 58/68px a DPR2→116/136, derivata160px; slot logo/partner circa96–160 CSS px può usare320px. Logo circuito180×44 richiede almeno360×88 raster a DPR2, ma preferire SVG.

L'altezza fissa190px attuale non è un rapporto fotografico da imporre all'owner: il rapporto16:9 è una normalizzazione proposta, con prova crop richiesta nella fase visiva. Non dichiarare misure da screenshot: l'audit è statico.

## Standard riusabili

| Codice | Rapporto | Sorgente raccomandata / minima | Utilizzo |
|---|---|---|---|
| L | 16:9 | 1600×900 / 960×540 | Cover, club, editoriale, poster video, immagini landscape gallery |
| Q | 1:1 | 1200×1200 / 600×600 | Loghi dinamici su canvas, prodotti, premi, gallery quadrata |

Solo **due** rapporti editoriali richiesti. I loghi vettoriali mantengono il viewBox originale e non diventano un terzo formato fotografico. Le foto gallery verticali esistenti possono conservare rapporto intrinseco nel dettaglio/lightbox con thumb Q; non richiedere all'owner un terzo master. La card Store 1/1.18 è uno slot di rendering: usare contain per Q senza ritagliare il prodotto. Poster tornei esistenti in `public/posters` restano separati dalle cover e non vengono convertiti automaticamente.

## Manifest per classe

I limiti sotto sono proposti per futuri upload. Gli endpoint immagini Store/Comunicazioni/Premi oggi ammettono JPEG/PNG/WebP fino a5MiB; upload generico tornei non ha gli stessi controlli nel codice letto. Non dichiarare già applicate le nuove regole.

| Classe / scopo | Master e minimo | Formato / trasparenza | Safe area e crop | Peso massimo proposto / output | Nome manuale |
|---|---|---|---|---|---|
| Logo MOVI principale con Padelleria | SVG viewBox nativo; fallback altezza≥192px, minimo96px | SVG statico approvato + PNG; sì | Margine libero≥10% altezza logo, contain, mai crop | SVG≤150KB, PNG≤500KB; vettore o raster 1×/2× | `movi-padelleria-primary-v2.svg` |
| Monogramma compatto | SVG canvas Q, fallback512×512 minimo192×192 | SVG + PNG; sì | Segno entro80% canvas, contain | SVG≤100KB; PNG≤300KB | `movi-monogram-v2.svg` |
| Icone installazione | 512×512 master, export192×192,512×512,Apple180×180; favicon32/48 | PNG opaco + ICO | Maskable segno entro cerchio centrale80% diametro, nessun testo minuto | Ogni PNG≤300KB; export dedicati | `movi-icon-192-v2.png`, `movi-icon-512-v2.png`, `movi-apple-180-v2.png` |
| Artwork ufficiale League/circuito | SVG nativo preferito; raster largo≥1200, minimo2×slot effettivo, ad es360×88 per logo180×44 | SVG statico o PNG; sì per loghi | Contain, clearspace10%; cover fotografica separata | Statico≤1MiB, vettore≤200KB; raster derivato slot2× | `monday-league-mark-v2.svg`, `<circuito>-mark-v2.svg` |
| Fondo tessera opzionale | L1600×900/min960×540 | WebP/JPEG, no alpha | Crop cover, 10% margine, nessun testo/QR stampato | Input≤2MiB; output≤120KB | `movi-card-background-v2.webp` |
| Cover torneo | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | Soggetto nel70% centrale; crop cover con focal point | Input≤5MiB; card≤120KB, dettaglio≤250KB | `torneo-<slug>-cover-<yyyymmdd>.jpg` |
| Cover circuito | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | 70% centrale; cover, logo in layer separato | ≤5MiB; card≤120KB/detail≤250KB | `circuito-<slug>-cover-v1.jpg` |
| Succede cover | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | 70% centrale; focal point, niente data/testo essenziale baked-in | ≤5MiB; card≤100KB/detail≤250KB | `succede-<slug>-cover-v1.jpg` |
| È successo cover | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | Come Succede | ≤5MiB; card≤100KB/detail≤250KB | `successo-<slug>-cover-v1.jpg` |
| Immagini interne/gallery | L1600×900 o Q1200×1200; minL960×540/Q600×600; originale verticale conservabile | JPEG/WebP/PNG; no alpha | Thumb crop controllato, dettaglio contain/intrinseco; non tagliare volti | ≤5MiB ciascuna; thumb≤40KB, vista≤250KB; proposta max20 immagini/contenuto | `<content-slug>-gallery-01.jpg` |
| Logo Partner | Q1200×1200/min600×600 oppure vettore sanitizzato da pipeline dedicata futura | PNG/WebP alpha; SVG dinamico escluso dal MVP upload | Contain, 10% margine, nessun taglio logo | ≤2MiB; derivata320≤50KB | `partner-<slug>-logo.png` |
| Cover Partner | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | 70% centrale, cover; condizioni scritte in UI | ≤5MiB; card≤100KB/detail≤250KB | `partner-<slug>-cover.jpg` |
| Foto club | L1600×900/min960×540 | JPEG/WebP/PNG; no alpha | Focal point campo/ingresso, cover, 10% bordo libero | ≤5MiB; card≤120KB/detail≤250KB | `club-<club-key>-01.jpg` |
| Store e premi esistenti | Q1200×1200/min600×600 per nuovi file | PNG/WebP alpha o JPEG; alpha se prodotto scontornato | Prodotto entro80%, contain nello slot1/1.18; non obbligare reupload legacy | ≤5MiB; card≤100KB, dettaglio≤250KB, thumb≤30KB | `product-<slug>-<color>-01.png` |
| Poster video | L1600×900/min960×540, Q solo video quadrato | JPEG/WebP; no alpha | Focal point, play button HTML accessibile | ≤5MiB; card≤100KB | `<content-slug>-video-poster.jpg` |

Output dinamico: `<domain>/<entity-uuid>/<asset-uuid>/original.ext` e `<width>.<format>`. Il nome manuale aiuta il caricamento, non è chiave DB. Conservare nome originale come metadata se utile, senza numeri telefono/nomi clienti nei path. SVG statici revisionati senza script/link remoti. QR generati a runtime con contrasto e quiet zone, mai forniti dall'owner come immagine.

## Cosa deve preparare manualmente il proprietario

1. Logo ufficiale MOVI/Padelleria e monogramma in SVG + fallback PNG, diritti/licenze e variante leggibile su navy. Lockup “Qualcosa trovi.” solo se approvato; la frase può restare testo HTML.
2. Master icona PWA512 e export192/512/180/favicon, con variante maskable verificata.
3. Artwork ufficiale Monday League e di ciascun circuito che si intende mostrare; non necessario un nuovo logo per ogni categoria/livello.
4. Cinque fotografie club: Revello, Saluzzo, Manta, Costigliole, Centallo; nominare con club-key. Nessuna foto fittizia sostitutiva.
5. Una cover per ciascun torneo/circuito selezionato, oppure autorizzazione a riutilizzare l'esistente; fallback di superficie neutra se manca, non bloccare iscrizione.
6. Per ciascun Partner: logo Q/PNG trasparente, cover opzionale, testi beneficio/condizioni/validità e contatti verificati.
7. Per ciascun contenuto: cover L, titolo/excerpt/body, immagini gallery ordinate con didascalie/alt, eventuale URL video e poster, sottotitoli/trascrizione, CTA e date visibilità. Fotografie con permessi d'uso adeguati.
8. Sfondo tessera opzionale; **non servono** immagini diverse per Home/card/detail, QR tessera raster, grafica per saldo, screenshot di classifiche o nuove foto prodotto se le attuali sono adeguate.

## Ottimizzazione immagini proposta

- Usare `next/image` dove compatibile con origini controllate, dimensions/fill e `sizes` corrispondenti agli slot; introdurre remotePatterns stretti solo per origini effettive, evitando wildcard globali. La config attuale non li contiene.
- Derivate pre-generate su upload/publish o pipeline server controllata; non assumere Supabase image transformations attive o incluse nel piano. Imgproxy locale fermo significa che questa capacità non è stata verificata.
- Master conservato, EXIF rimosso nelle copie pubbliche. Upload JPEG/PNG/WebP nel MVP compatibile con endpoint esistenti; output WebP default, AVIF se pipeline verificata lo produce e il costo encoding è accettabile, fallback JPEG/PNG. Mai ingrandire artificialmente sorgenti sotto minimo.
- Lazy load immagini sotto fold e gallery; precaricare soltanto l'immagine effettivamente LCP. Nel carousel caricare visibile/peek, non tutte le immagini originali; nessun preload video.
- Dimensioni/aspect-ratio riservati per evitare CLS. Errori: superficie navy con label testuale, logo fallback approvato; iscrizioni e contatti restano disponibili.
- Cache immagini pubbliche con path versionati/immutabili; rimozioni editoriali/bozze richiedono policy coerente con storage e cache. Non applicare caching media alla route API o a certificati/QR.
- Budget proposto Home primo viewport: immagini≤300KB totali su mobile, cover card80–120KB, loghi≤50KB, nessun video caricato prima del tap. Primo caricamento editoriale visibile e peek≤400KB; verificare su device/rete reale prima di fissare soglie definitive. Obiettivi futuri LCP≤2.5s, CLS≤0.1, INP≤200ms al percentile75, non misurati ora.

## Video: valutazione e raccomandazione

| Soluzione | Prestazioni/PWA | Storage/costi | Admin |
|---|---|---|---|
| URL/embed esterno | Provider gestisce playback; iframe solo dopo tap, dipendenza rete/provider | Evita grandi video nel bucket; quote/privacy provider da verificare in implementazione | Incolla URL ammesso, poster e sottotitoli; disponibilità dipende provider |
| Upload Supabase diretto | Download/seek di file, nessuna pipeline ABR/transcoding riscontrata | Originali grandi e traffico a carico storage; nessun prezzo stimato | Upload semplice ma encoding/codec/peso e derivati da gestire |
| Ibrido | Foto/poster locali, playback esterno on demand | Costo storage immagini controllabile, nessuna duplicazione video | Un solo campo URL e poster nel MVP |

**Raccomandazione: ibrido**, immagini/poster su Supabase, video tramite URL provider approvato con embed click-to-load. Proposta allowlist YouTube/Vimeo da verificare con esigenze di privacy e disponibilità nella fase editoriale; nessuna inclusione iframe arbitraria. Link esterno di fallback se embed non disponibile, offline mostra poster e indisponibilità; niente caching SW dei video. Sottotitoli e alternativa testuale obbligatori per contenuto parlato significativo. No autoplay, preload none.

Upload video diretto rinviato: richiede una decisione su encoding, limiti, costi/quote e moderazione; non aggiungerlo come semplice file upload illimitato. La raccomandazione non afferma che un piano commerciale o servizio di transcoding sia già disponibile.
