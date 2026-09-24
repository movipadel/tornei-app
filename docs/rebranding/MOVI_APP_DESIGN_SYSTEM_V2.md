# MOVI App — Design System v2 e architettura UX

Specifica Stage 0, 24 settembre 2026. Nessun token o componente implementato. La struttura Home e il perimetro funzionale provengono dal brief approvato; i valori tecnici sotto sono la proposta esecutiva da validare nella fase successiva.

## Identità

MOVI è il marchio principale; PADELLERIA è la categoria; “Qualcosa trovi.” è la promessa. Superfici navy, blu royal, accenti cyan e piccoli segni magenta/plum. Tono moderno, elegante, sportivo e comunitario. Vietati fumo, scariche elettriche, sfondi gaming e decorazioni che competono con le attività. Fotografie autentiche di persone/club, senza testo essenziale incorporato nelle cover.

## Token proposti, isolati al pubblico

| Token | Valore | Uso |
|---|---|---|
| background/base | `#070D1C` | Fondo app |
| surface/1 | `#101A2F` | Card standard |
| surface/2 | `#182540` | Card in evidenza / pannelli |
| surface/overlay | `#111D34` | Modali |
| brand/royal | `#1010FF` | CTA primaria piena, con testo bianco |
| brand/royal-hover | `#2525FF` | Hover puntatore |
| accent/functional | `#67DFFF` | Link, focus e informazioni operative su navy |
| accent/magenta | `#D76ABB` | Micro-linea, dot, accento editoriale/attivo |
| accent/plum | `#542348` | Piccolo fondo decorativo, non testo lungo |
| text/primary | `#F7F9FF` | Testo principale |
| text/secondary | `#B6C4DC` | Meta e descrizioni |
| text/inverse | `#070D1C` | Testo su cyan chiaro |
| border/subtle | `#2C3A55` | Separazione decorativa |
| border/control | `#7185A7` | Controlli riconoscibili |
| success | `#74E3AD` | Successo + icona/etichetta |
| warning | `#FFD180` | Attesa/attenzione + testo |
| danger | `#FF9DAA` | Errore/cancellazione, sempre nominati |
| disabled | surface/1 + text/secondary | Opacità non usata per rendere il testo illeggibile |

Il royal non è testo piccolo su navy: usare cyan per link. Il bordo subtle non basta da solo a identificare un input. Verificare ogni coppia effettiva WCAG AA prima del rilascio; nessuna dichiarazione di conformità senza verifica. Magenta: una linea 2px o dot 4–6px, dettaglio editoriale/attivo; mai superficie dominante, mai sostituto degli stati semantici.

## Tipografia e geometria

Proposta: Inter locale 400/500/600 come font UI, fallback sistema; ridurre dipendenze/font duplicati solo nella futura fase autorizzata. Bebas facoltativo per artwork ufficiale, non per form o tabelle. Non modificare font admin.

| Ruolo | Mobile | Desktop | Peso / interlinea |
|---|---|---|---|
| H1 / saluto principale | 28px | 36px | 600 / 1.15 |
| H2 sezione | 22px | 26px | 600 / 1.25 |
| H3 card | 18px | 20px | 600 / 1.3 |
| Body / input | 16px | 16px | 400 / 1.5 |
| Meta / label | 14px | 14px | 400–500 / 1.4 |
| Microcopy non essenziale | 12px | 12px | 500 / 1.4 |
| Saldo / dato principale | 32px | 40px | 600 / 1.1, cifre tabulari |

Spazi: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. Gutter 16px mobile, 24px tablet, 32px desktop; contenuto pubblico massimo 1120px proposto, dettagli testuali 720px. Sezioni distanziate 32px mobile/48px desktop, titolo-contenuto 16px. Radius 8 controlli piccoli, 12 bottoni, 16 card, 24 modali; pill 999 solo chip. Bordi 1px. Ombra overlay `0 16px 48px rgba(0,0,0,.28)`; nessun glow permanente o ombra per ogni riga.

Card: standard surface/1; evidenza surface/2 e micro-accento; compatta per torneo; editoriale con MediaFrame; nessuna nuova card può incorporare calcolo saldo, classifica o disponibilità. Tutte hanno titolo, meta e CTA chiara; evitare card link contenenti bottoni annidati.

## Controlli e stati

- Primario: royal/bianco, altezza 48px, padding 16px, un'azione dominante per blocco. Secondario: surface/2 e bordo/control. Terziario: testo cyan con target completo. Distruttivo: danger con conferma già prevista dal flusso.
- Icon button almeno 44×44px, preferibilmente 48×48; icone Lucide 20/24px, stesso stroke. Icona + label per Prenota, Iscriviti, QR, invio richiesta e annullamento; X cancellazione torneo con nome accessibile “Cancella iscrizione a …”.
- Chip filtro: min-height 44px se interattivo; badge stato non interattivo può essere 24–28px. Stati distinti Iscritto/In riserva/Iscrizioni chiuse/Disponibile, senza sostituire logiche correnti.
- Focus: outline cyan 2px, offset 3px, visibile anche su CTA royal con separazione navy. Link semantici per navigazione, button per azione; selected espresso con aria-current/aria-selected/aria-pressed secondo il controllo.
- Loading: skeleton che conserva altezza/aspect-ratio; saldo non disponibile → trattino e stato di caricamento, mai 0 inventato. Invio disabilita reinvio, testo “Invio…” e annunci aria-live polite; retry non duplica la richiesta.
- Empty: frase specifica + prossima azione utile, es. “Nessun torneo disponibile” con filtri ripristinabili. Non mostrare carrusello vuoto né inventare dati.
- Errore: messaggio inline vicino al campo + riepilogo per errori multipli; errore sezione isolato con Riprova. Toast complementare, non unica fonte per errore bloccante.
- Successo: conferma testuale persistente dove necessario. Gioca/Allenati: “Richiesta inviata. Ci pensiamo noi.” Nessuna promessa di partita o allenamento già confermati.
- Movimento: 120–180ms per microinterazioni, nessun auto-advance. `prefers-reduced-motion`: niente smooth programmatico, pulse o transizioni di altezza animate.

## Home v2 — ordine congelato

| Ordine | Sezione | Contratto |
|---|---|---|
| 1 | Header | MOVI/Padelleria; “Ciao [Nome].”, “Che facciamo oggi?”; notifiche/profilo. Anonimo: saluto neutro e accesso esistente. Shortcut operatore futuro escluso |
| 2 | MoviBack | Punti, Premi, Storico, La mia tessera. Mostra QR secondario; QR principale nella nav. Stati membership correnti, nessun saldo anonimo fittizio |
| 3 | Azioni | Gioca, Allenati, Prenota un campo; tre azioni visibili senza scroll orizzontale |
| 4 | Tornei in evidenza | Card compatte con cover e attuali CTA/stati. Filtro futuro/data secondo contratto; niente carousel |
| 5 | Succede in Padelleria | Attuale/futuro/promozionale, finestra opzionale; carousel con peek |
| 6 | Circuiti | Container circuiti; carousel dove utile, peek; una card per circuito |
| 7 | Monday League | Solo quando API/read model la rendono pubblica/rilevante; mantenere failure hidden |
| 8 | È successo in Padelleria | Archivio community, senza scadenza automatica, carousel |
| 9 | Servizi rapidi | 1 Le mie attività, 2 Store MOVI, 3 Partner, 4 Contattaci |
| 10 | Footer | Instagram, Facebook, Privacy, Termini, Cookie; mantenere URL correnti |
| persistente | Bottom nav | Home, Tornei, QR centrale, Circuiti, Profilo. QR è azione modale, non una pagina fittizia |

Mostrare le sezioni con dati pubblicabili; nessun placeholder promozionale inventato in produzione. Le tre sezioni carousel ammesse sono Succede, Circuiti ed È successo: Partner resta nei servizi rapidi. Se in futuro Partner entra in carousel Home, una delle altre deve usare layout statico; tetto massimo 3, preferenza 2 quando una sezione ha pochi elementi.

## Carousel: regola esecutiva

Obiettivo percepito: 80–90% dello spazio utile dedicato alla card principale e 10–20% alla successiva, tolto il gap. La card attiva resta leggibile interamente; non tagliare intenzionalmente il suo testo per interpretare alla lettera “80–90% della card”.

Mobile: gap 12px; se W è larghezza utile del rail, card C = `(W - 12) / 1.15`. Ne segue W = C + gap + 15% C visibile della prossima. A 390px con gutter 16, W=358, C≈301px e peek≈45px. Snap start con padding equivalente al gutter, overflow solo del rail, ultimo item raggiungibile interamente. Smooth solo quando motion consentito, swipe nativo e navigazione tastiera; nessun testo “scorri”. Dots solo se aiutano una lista molto breve, non per feed lunghi.

Tablet/desktop: griglia statica se tutti gli elementi entrano; altrimenti 2/3 card intere e 15% della successiva, controlli avanti/indietro etichettati. Formula `C=(W-n*gap)/(n+0.15)` per n card intere. Nessun carousel su MoviBack, azioni primarie, tornei o servizi rapidi.

## Header e area azioni sticky proposta

- Sotto 768px: header iniziale nel flusso 72–104px più safe-area-top (può crescere per testo ingrandito); saluto e MoviBack scorrono. Quando le azioni primarie escono dalla viewport, header compatto: riga 48px con monogramma, punti, notifiche/profilo; seconda riga 48px con Gioca/Allenati/Prenota. Massimo ordinario 96px + safe-area-top. Label Prenota con nome accessibile completo. Non comprimere i controlli sotto 44px.
- 768–1023px: stesso modello, contenuti più larghi, massimo 96px. Da 1024px: compatto su una riga 64px + eventuale inset; azioni 44–48px, punti e accessi. Header iniziale max ordinario 112px.
- Trigger tramite sentinel dopo azioni, non soglia magica dipendente da foto; area riservata per evitare salti. Niente header sovrapposti. Con zoom/testo 200% o viewport bassa, preferire header semplice 48px e azioni nel flusso: il limite altezza non deve tagliare contenuti.
- Bottom nav 64px + safe-area-bottom, QR target 52px senza invadere il contenuto; padding contenuto almeno nav+16px. Desktop nav compatibile con gli stessi cinque accessi, in shell allineata al contenitore. Carrello Store sopra la nav, mai sulla voce QR.
- Con tastiera aperta nei form: azioni sticky secondarie sospese, footer form nel dialog scrollabile; nessun resize che perda i dati. Install prompt e progressive auth non coprono invio o nav. Gerarchia proposta: header 30, nav 40, prompt 50, modal 100, toast 120, subordinata all'audit dei portali correnti senza alterare admin.

## Pagine esistenti da riallineare

**Tornei:** cover, data, nome, livello, categoria, club, ora, iscritti/max, stato. Riga livello Tutti/Principiante/Intermedio/Avanzato; riga categoria Maschile/Femminile/Misto/Open. “Tutti” ripristina l'elenco futuro completo e azzera il filtro categoria; categoria selezionabile/deselezionabile con stato esplicito. Non rimappare “Open” a un valore DB senza verificare i valori legacy (es. Libero). Conservare eventuali valori fuori elenco con fallback, non nasconderli. Rimuovere solo il blocco esplicativo “Solo tornei in programma”. Stati riserva e chiusura restano.

**Circuiti:** hero compatto → categoria realmente disponibile → livello realmente disponibile → un gruppo selezionato. “Tutti” toglie il filtro livello e offre scelta del singolo gruppo, non produce somma. Default: scelta esplicita dell'utente; al primo ingresso gruppo personale solo con associazione server affidabile, altrimenti primo gruppo nell'ordine attuale. Cambio categoria conserva livello se supportato altrimenti primo valido. Posizione/punti/tappe personali solo se attribuibili; sempre ranking, ricerca, riga evidenziata se certa, prossima tappa, Le tue tappe (tappa/piazzamento/punti), regolamento. Omonimia → nessuna attribuzione automatica. Il dettaglio oggi non restituisce rules_url: riusare la fonte elenco/adapter di lettura senza modificare motore.

**MoviBack:** saldo come dato principale; QR e premi accessibili; storico rimane qui, membership e redemption conservano i workflow. La mia tessera è una modale nuova con brand, nome/cognome, membership_code, member since se disponibile, QR e chiudi. Non introdurre QR validazione partner né nuovi numeri tessera. Stato non approvato non viene presentato come tessera valida.

**Store:** visual-only su linee, categorie, prodotti, varianti, carrello e feedback ordine; mantenere ritiro, euro/punti/misto e segreteria. Non aggiungere pagina ordini utente se non esiste la lettura sottostante approvata.

**Contatti:** stessi tre referenti, WhatsApp, telefono, email MOVI; descrizione leggibile e pochi chip ruolo.

**Profilo v2:** nuova route aggregatrice `/profilo` proposta; dati personali in lettura dove non esiste editing, certificato e upload/review attuali, privacy/consensi, sicurezza mediante flussi Auth esistenti, riferimenti membership/card. Il certificato lascia i servizi Home; nessuna duplicazione file o workflow.

## Mobile/PWA e accessibilità minima

Usare insets safe-area top/bottom/left/right su iPhone e Android senza assumere valori fissi; `viewport-fit=cover` da valutare nella futura shell, non presente come contratto già verificato. Altezza dinamica 100dvh, modal con max-height sottratti insets, body scroll-lock e singola regione scrollabile. Ripristinare posizione/focus alla chiusura; Escape e back mobile chiudono prima la modale ove compatibile con routing. Tab trap Radix verificata, titolo e descrizione associati.

Input >=16px, label persistenti, errori associati, autocomplete/inputmode corretti, date locali esplicite; richiesta flessibile non obbliga data arbitraria. Nessun overflow pagina a 320px; tabelle e rail hanno scroll interno nominato. Foto crop con focal point e fallback, titoli non dentro immagini.

Target AA: contrasto testo 4.5:1, grande 3:1, controlli/focus 3:1; informazioni mai solo colore. Reflow 320px, testo 200%, tastiera completa, ordine DOM coerente con lettura, skip link, un H1, heading gerarchici. Alt descrittivi per immagini informative, alt vuoto per decorative, loghi con nome brand; video con sottotitoli e alternativa testuale. Nessun autoplay audio. Conferme critiche leggibili senza toast e icon-only con aria-label.

SW: mantenere NetworkOnly GET `/api/**` e purge `apis`; mai cache saldo/QR/ordini/identità o replay offline di mutazioni. Offline mostra indisponibilità dati attuali, non QR premio presunto valido. Validare installazione, aggiornamento e logout con vecchio worker nelle fasi future.
