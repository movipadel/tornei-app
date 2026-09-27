# MOVI Public UI System — Phase 1

## Fonte e confine

Questa implementazione esegue `MOVI_APP_DESIGN_SYSTEM_V2.md`, `MOVI_APP_FUNCTIONAL_INVARIANTS.md`, `MOVI_APP_IMPLEMENTATION_PLAN.md`, `MOVI_APP_ASSET_MANIFEST.md`, `MOVI_APP_FRONTEND_AUDIT.md`, `MOVI_APP_REGRESSION_PLAN.md` e i documenti funzionali presenti in questa cartella. La Phase 1 introduce il sistema visivo e la shell; non realizza Home v2 e non ridisegna le pagine di funzionalità.

Il sistema pubblico vive in `src/components/public`. Tutte le variabili e le regole visive partono dalla classe CSS Module `root` di `PublicUI.module.css`. Admin e Staff restano fuori dal provider e non ricevono classi, variabili o componenti pubblici. Il tema pubblico è unicamente MOVI Dark e non espone selettori Light/Dark/System.

## Token e tipografia

| Ruolo | Valore |
|---|---|
| base | `#070D1C` |
| surface 1 / 2 / overlay | `#101A2F` / `#182540` / `#111D34` |
| royal / hover | `#1010FF` / `#2525FF` |
| cyan | `#67DFFF` |
| magenta / plum | `#D76ABB` / `#542348` |
| text primary / secondary / inverse | `#F7F9FF` / `#B6C4DC` / `#070D1C` |
| border subtle / control | `#2C3A55` / `#7185A7` |
| success / warning / danger | `#74E3AD` / `#FFD180` / `#FF9DAA` |

Il font è Inter locale, già presente in `public/fonts` nei pesi 400, 500 e 600 e già dichiarato in `globals.css`. Il fallback è il sans-serif di sistema. H1 è 28/36px, H2 22/26px, H3 18/20px, body e input 16px, meta 14px, microcopy 12px e valori principali 32/40px con numeri tabulari. Magenta resta una firma minuta: linea da 2px, punto o indicatore editoriale.

## Geometria

La scala è 4, 8, 12, 16, 20, 24, 32, 40, 48 e 64px. I gutter sono 16px su mobile, 24px su tablet e 32px su desktop. Il contenuto pubblico arriva a 1120px. Le sezioni usano 32px su mobile e 48px su desktop. Raggi: controlli 8px, pulsanti 12px, card 16px, modal 24px e pill solo per badge. I target interattivi sono almeno 44px; CTA e campi sono normalmente 48px.

## Componenti

`PublicButton` offre Primary, Secondary, Tertiary e Danger con default, hover, pressed, focus, disabled e loading. Lo stato loading disabilita il controllo e mostra “Invio…”. Il focus è un contorno ciano da 2px con offset 3px.

`PublicCard` offre Standard, Highlight, Compact ed Editorial. Riceve contenuto e stato dal chiamante e non calcola dati di dominio. La variante Highlight usa surface/2 e una micro-linea magenta.

`MediaFrame` supporta 16:9 e 1:1, crop cover, posizione focale, alt, lazy loading, skeleton, fallback e overlay opzionale. I master approvati restano 1600×900 e 1200×1200; il componente non introduce altri formati sorgente.

`PublicCarousel` usa swipe orizzontale nativo, gap 12px, scroll snap e peek della card successiva. Non viene renderizzato senza elementi e non usa autoplay. Su tablet e desktop mostra rispettivamente circa due e tre card più il peek.

`PublicModal` usa Radix Dialog per focus trap, Escape e restituzione del focus. Offre chiusura visibile, overlay, scroll interno, limite con `100dvh`, safe area e comportamento sheet su mobile. Le transizioni non essenziali si riducono con `prefers-reduced-motion`.

`PublicField` mantiene label visibile, indicazione opzionale ed errore inline. Gli stili condivisi coprono input, select e textarea a 16px/48px, focus e riepilogo errori. Le validazioni e i payload restano responsabilità dei form esistenti.

`PublicState` copre loading, empty, error, success e warning con icona e testo; `StatusBadge` aggiunge badge semantici. Il valore sconosciuto va mostrato come “—”. Toast può supportare una conferma, ma non sostituisce errori bloccanti o conferme persistenti.

## Header, sticky e navigazione

`PublicHeader` mostra il marchio completo `movi-padelleria.png`, accesso notifiche e profilo. Supporta uno slot opzionale, destinato in Phase 2 al saluto Home. Un `IntersectionObserver` osserva il sentinel esterno `public-sticky-sentinel` quando la pagina lo fornisce e usa il proprio fallback di layout nelle pagine attuali; quando il sentinel esce dalla viewport mostra l’header compatto con `movi-monviso.png`. Non usa soglie arbitrarie di scroll.

`PublicBottomNav` è fissa e identica sulle route incluse. L’ordine è Home, Tornei, QR, Circuiti, Profilo; usa `aria-current`, target adeguati e safe-area-bottom. Il contenuto della shell ha padding sufficiente a non finire sotto la barra. Circuiti punta all’ancora dell’elenco Home esistente perché non esiste una route indice `/circuiti`.

Il QR centrale è un’azione modale. Solo all’apertura legge `/api/moviback/me`; per membership approvata conserva esattamente il payload esistente `mb:<membership_code>`. Utente anonimo, membership non approvata ed errore ricevono stati espliciti senza inventare identità o semantiche. Nello showcase l’azione usa una stringa dichiaratamente demo e non esegue fetch.

L’accesso notifiche invoca lo stato notifiche già presente in Home tramite evento UI; dalle altre pagine porta a `/#notifiche`. Non aggiunge endpoint o stato di dominio. Profilo usa la route esistente `/profilo`. La shell non espone scorciatoie Admin o Staff.

## Scope delle route

La shell copre tutte le normali route pubbliche e utente: Home, Tornei, dettaglio Circuiti, MoviBack e figli, Store, Gioca, Allenati, richieste, Le mie attività e dettaglio, Profilo, Prenota, Contatti, Monday League e squadre, pagine legali e showcase locale.

Eccezioni esplicite:

- `/admin/**`: shell Admin indipendente;
- `/staff/**`: shell operativa Staff indipendente;
- `/accedi`, `/registrati`, `/attiva-account`, `/accesso-precedente`, `/password-dimenticata`, `/reset-password`: flussi Auth focalizzati e potenzialmente a schermo intero;
- `/riscatto-premio/[token]`: flusso operativo di riscatto in cui una navigazione fissa interferirebbe con la consegna;
- `/auth/callback`: route handler, non superficie pagina.

`PublicNav` resta nei file legacy per ridurre il rischio di regressione, ma legge `PublicShellContext` e restituisce `null` quando la shell nuova è attiva. Fuori dalla shell conserva il comportamento precedente. I prompt installazione e migrazione account ricevono un offset sopra la bottom nav; il prompt account non effettua fetch nella route demo.

## Safe area, PWA e accessibilità pratica

La viewport abilita `viewport-fit=cover`. Header, bottom nav e modal consumano gli inset top, bottom, left e right; le altezze usano `100dvh`. La root impedisce overflow orizzontale e la griglia usa minimi compatibili con 320px. Il modal ha una sola regione scrollabile e il form non nasconde la CTA sotto la nav.

Restano invariati `GET /api/** → NetworkOnly`, `caches.delete("apis")`, manifest, favicon, apple-touch icon e icone di installazione. Gli artefatti PWA generati dalla build vanno rimossi o ripristinati dopo la verifica.

Il sistema include skip link, struttura heading nel catalogo, focus ciano, target da 44px, testo esplicativo oltre al colore, label persistenti, `aria-current`, `aria-busy`, ruoli live per stati, alt dei loghi e riduzione del movimento. È un obiettivo pratico in stile WCAG AA e richiede comunque collaudo assistivo dedicato prima di qualunque dichiarazione formale.

## Showcase e Phase 2

In sviluppo lo showcase è disponibile a `http://localhost:3100/dev/public-ui`. In `NODE_ENV=production` chiama `notFound()` e non diventa una destinazione pubblica. Contiene solo contenuti demo per branding, tipografia, pulsanti, card, media, badge, form, carousel, modal, QR, header, nav e stati.

Home v2 dovrà usare la stessa shell, passare il saluto nello slot dell’header e collocare il sentinel reale dopo le azioni primarie. I componenti visuali dovranno ricevere i dati e gli stati dai controller esistenti, senza spostare calcoli, fetch, regole di accesso o mutazioni nei componenti di presentazione.
