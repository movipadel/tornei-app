# MOVI App — Piano contratti di regressione

Stage 0 · 24 settembre 2026. **Piano, non risultati di esecuzione.** Nessun test applicativo/DB, benchmark, build o test su produzione eseguito in questa fase documentale.

## Strategia e ambiente

Congelare baseline HEAD `3cbdabb2a9c7a113838b7c8d55b3d064821cdc25` e fixture sintetiche note prima della prima modifica futura. Separare tre prove: equivalenza funzionale, nuova funzionalità approvata, regressione visuale. Uno screenshot simile non dimostra invarianti di saldo/stock; una risposta200 non dimostra identità/ownership.

Prima di test DB: `npx supabase status`, target esatti API `http://127.0.0.1:55021`, DB `127.0.0.1:55022`, Studio55023, Mailpit55024, linked_project null. Target hosted o dubbio → STOP. Non usare `.env.local` per selezionare ambiente. Harness HTTP/SQL da leggere prima dell'esecuzione; provider Telegram/push/email reali disabilitati o sostituiti da stub locali. Le notifiche della prova non devono raggiungere persone. Nessun reset o fixture load sul DB corrente senza perimetro test autorizzato; preferire istanza/fixture isolata.

Baseline da salvare nella fase futura: risposte API normalizzate, input, identità sessione, righe DB prima/dopo, eventi notifiche stub, screenshot viewport, hash fixture. Normalizzare solo timestamp/UUID non semantici; non normalizzare saldo, punteggi, ordine ranking o stati. Fixture timezone Europe/Rome con orologio congelato e casi DST/mezzanotte. Eseguire stesso scenario prima/dopo e confrontare effetti.

## Contratti funzionali esistenti

| Test | Setup / azione | Oracolo richiesto |
|---|---|---|
| F-AUTH-1 | Anonimo, login corretto/errato, logout | Identico status/shape/sessione; logout rimuove accesso, nessun dato utente rimasto in cache |
| F-AUTH-2 | Signup verifica email, attivazione legacy, resend/resume e doppio invio | Un solo profilo collegato; users.id e relazioni invariati; onboarding identico; nessuna perdita punti/iscrizioni |
| F-AUTH-3 | Legacy valido non collegato, linked, merged, review/conflict; nuova login e sessione preesistente | Distinguere blocco nuovo login dalla validità sessione; AUTH_LOGIN_REQUIRED/LEGACY_REVIEW_REQUIRED invariati |
| F-AUTH-4 | Auth e legacy puntano utenti diversi; Auth non linked | `/api/user/me`409 conflitto; nessun fallback identità errata; user null dove previsto |
| F-AUTH-5 | Reset password corretto, mismatch, password<8, link/sessione scaduta | Stesse validazioni/errori, nessun bypass verifica; recupero UI leggibile |
| F-AUTH-6 | Duplicati admin preview/resolve/execute, utente normale tenta accesso | Stessi guard/merge/report; nessun accesso ampliato dal nuovo tema |
| F-TOR-1 | Ieri/oggi/domani, oggi già finished, cambio mezzanotte Roma | Identico elenco date>=oggi e ordering; oggi finished resta secondo baseline. Home max5/finestra attuale. Non chiamare questo test “non ancora giocati” |
| F-TOR-2 | Torneo aperto posto disponibile, coppie fisse/Baraonda, errori campi/genere | Stessi payload e righe; none→main; conteggi e posizione; no player_key alterato |
| F-TOR-3 | Pieno, riserve esistenti, Baraonda Misto quota M/F | none→reserve; Lista riserva/In riserva; quote e ordine riserva invariati |
| F-TOR-4 | Main cancella dopo conferma; riserva cancella; conferma rifiutata | DELETE solo se confermato; promozione e rinumerazione identiche, stesso genere nel misto; riserva cancellata non promuove |
| F-TOR-5 | Duplicato telefono, iscrizioni chiuse, categoria bloccata, errore rete | Stessi rifiuti, nessun falso Iscritto; aggiornamento vista dopo successo; replay doppio click non mascherato |
| F-TOR-6 | Admin legge torneo passato; eliminazione manuale | Nessuna eliminazione automatica e accessi esistenti invariati; archivi circuito non cancellati dal solo restyling |
| F-CIR-1 | Più categorie/livelli, omonimi, nomi con spazi, parità punti, null placement | Vettore `(group,position,name,total_points,events_played)` identico prima/dopo, stesso sort italiano e conteggio righe |
| F-CIR-2 | Cambio categoria/livello/ricerca; tappe future e giocate; regolamento | Un ranking alla volta, nessuna somma Tutti, ricerca non ricalcola punteggi; stessi link/tappe |
| F-MB-1 | Ledger >20 righe, membership approved/pending/rejected/suspended, certificato diversi stati | Saldo somma di tutte le righe, ultime20 nello storico, gating e messaggi equivalenti |
| F-MB-2 | QR personale, scansione staff, QR premio non ready/ready/già usato | Payload personale `mb:membership_code` invariato; token/codice premio solo ready, monouso e permessi identici |
| F-MB-3 | Riscatto servizio/prodotto/custom/partner, stock esaurito, punti insufficienti, varianti | Stesse scritture e rifiuti; nessun doppio addebito/replay nel ramo smart; verificare ramo legacy separatamente, non inventare garanzie |
| F-MB-4 | Premio richiesto→ready→consegnato o annullato; impegno fornitore; doppio comando | Lifecycle, rimborsi/ledger/reservation e autorizzazioni invariati; QR nascosto dove previsto |
| F-MB-5 | Request membership, replace certificate, leave e reactivate | Stato membership/certificato e cancellazioni QR attivi equivalenti; nessun documento sanitario in media pubblico |
| F-STORE-1 | Linea/categoria inattiva, colori/taglie/stock/null size | Identico catalogo visibile, prezzi e disponibilità; carrello distingue varianti |
| F-STORE-2 | Ordine euro/points/mixed, club ritiro valido/non valido, login mancante | Stesso payload, totals server, pending, stock/ledger;401 apre login, successo svuota carrello e conferma segreteria |
| F-STORE-3 | Ordine fisico/premio: ready/deliver/cancel e stato pagamento | Contratti fulfillment e vincoli origine/fornitore invariati; nessun checkout carta introdotto |
| F-ML-1 | Hidden, pubblicazione futura, public, completed/archived; errore hero | Visibility identica; hidden non trapela da nuova Home; failure hero resta hidden |
| F-ML-2 | Capitano corretto/utente altro team/staff; lineup/risultato/contestazione | RPC/ownership e stati invariati, tabelloni/classifiche/fasi identici |
| F-COM-1 | Feed con unread/read/dismiss; read_all; altro utente | Stesse righe communication_user_states, contatori e targeting; editoriale non marca notifiche lette |
| F-NOT-1 | Mutazioni riuscite, replay e failure Telegram/push stub | Notifiche previste con stessi destinatari/payload funzionali; business non annullato per provider fallito |
| F-PRO-1 | Dati personali, consensi richiesti/marketing, accesso certificato e sicurezza | Stessi endpoint/valori; nessun opt-in nuovo, niente editing dati non previsto |
| F-OPS-1 | Anonimo/user/staff/admin su API admin e staff, sessioni scadute | Stessi403 e capacità; flag device simulato non concede nulla; screenshot admin separati |
| F-BOOK-1 | Prenota e Indicazioni per tutti5 club | URL di ciascun club uguale al codice baseline, nessuna prenotazione locale creata |
| F-CONTACT-1 | Tre WhatsApp/tel e email; footer social/legal | Destinazioni identiche; nessun testo legale modificato |

## PWA: test funzionali dedicati

Build di produzione **solo locale** in ambiente esplicitamente sicuro nella fase6; next dev non registra SW. Prima della build controllare che nessun pre-render legga hosted. Snapshot/hash di `public/sw.js`, workbox e asset generati per non confondere output build con sorgenti da consegnare.

1. Installare vecchia versione su profilo browser isolato, inserire cache `apis` con response sintetica; aggiornare worker e attendere activation: `apis` deve essere eliminata.
2. Intercettare GET `/api/user/me`, tornei, saldo, ordini/letture esistenti e notifiche: NetworkOnly, nessuna copia nella CacheStorage o fallback precache. Non basta controllare il nome strategia nel file.
3. Offline: nessun dato personale obsoleto presentato come aggiornato, nessuna mutazione accodata/reinviata, QR premio non inventato; errori comprensibili.
4. Login userA → logout → userB: nessun dato/QR/stato A riutilizzato. Controllare navigation/back/refresh e app riaperta.
5. Standalone iOS/Android: avvio `/`, deep link, back, aggiornamento, prompt installazione, worker push admin invariato; API caching non alterato da nuove immagini/video.

## Nuove funzionalità: accettazione distinta

| Test | Atteso |
|---|---|
| N-REQ | Tutti campi Gioca/Allenati, data flessibile e oggi/domani Roma, errori fascia sera; idempotency key uguale non duplica; update version concorrente rifiutato |
| N-REQ-DELIVERY | Request+evento+delivery atomici; Telegram fallito lascia richiesta ricevuta; retry indipendente e dati privati non mostrati all'utente |
| N-ACT | Tabs e ordinamento corretti con fonti miste, errore parziale, utente legacy; nessun ordine/ledger nel feed; limiti storico dichiarati |
| N-PARTNER | Active/date boundaries/no expiry, condizioni e link; tessera solo mostrata, nessuna verifica/operazione partner |
| N-CARD | Modale da Home/MoviBack, chiusura/focus; nome/numero/QR attuali, member since solo disponibile; non approved non appare approvato |
| N-CONTENT | Bozza non pubblica anche da URL media, published con finestre null; evento4–6 gen visibile6 e non7 Roma; sponsor senza fine rimane; archivio non scade |
| N-MEDIA | Upload formato/peso/dimensioni invalidi, focal crop, fallback broken image, gallery limite, video click-to-load e link alternativo |
| N-CIR-PERSONAL | Associazione certa evidenzia riga corretta, omonimia/non link non attribuisce posizione; classifica identica al contratto F-CIR |

## Test visuali e accessibilità, separati dai funzionali

Viewport:320×568,360×800,390×844,430×932,768×1024,1024×768,1440×900; landscape mobile e tastiera virtuale su iPhone/Android reali. Screenshot deterministici con fixture sintetiche, font caricati, tempo congelato, animazioni disabilitate. Nessuna fixture protetta caricata o alterata in questa fase.

Copertura: Home anonimo/linked/legacy/no membership/errori; lista tornei tutti gli stati; ranking multi-gruppo; MoviBack pending/approved/premio ready; Store carrello/modale/varianti/errori; Contatti/Prenota; Profile; richieste; Partner; contenuti; modali QR. Confrontare admin/staff con baseline **invariata**.

Asserzioni: ordine Home e nav, no più3 rail, peek10–20%, nessuna card troncata in verticale, rail finale raggiungibile, nessun overflow documento, gutter/radius coerenti, safe-area e header entro limiti salvo reflow accessibile. Test contrasto coppie reali, focus visibile, Tab/Shift+Tab/Escape, ritorno focus, lettore schermo, aria per X/QR, zoom/testo200%, reduced-motion, input16px e form non coperto da tastiera. axe può aiutare ma non sostituisce test manuali.

Performance: budget immagini nel manifest, dimensioni riservate/CLS, niente iframe prima del tap, lazy gallery/rail, coperture sotto fold non tutte prioritarie. Misurare LCP/CLS/INP su app locale con dati realistici e rete mobile simulata, poi dispositivo reale; riportare distribuzioni e limiti, non un solo score sintetico.

## Suite locali già presenti da valutare nella fase esecutiva

- Auth: `supabase/tests/movi_auth2_stage1_contract.test.mjs` fino ai contratti stage5b, unified_onboarding, onboarding_hotfix, final_remediation e admin_duplicate_ux; harness HTTP e SQL separati.
- League: `monday_league_stage1_contract.test.mjs` … stage9, SQL e concurrency; prerelease remediation.
- MoviBack: `pf08b2c5_route_contract.test.mjs`, `pf08b2c6_staff_queue_contract.test.mjs`, `pf08b2c10_route_contract.test.mjs`, `pf08b2c11_notification_contract.test.mjs`, SQL lifecycle/idempotency/varianti.
- Store: `phase1_physical_fulfillment_route_contract.test.mjs`, `phase2_store_orders_ui_contract.test.mjs`, `phase2b_supplier_export_contract.test.mjs`, `phase2c_unified_physical_cancellation_contract.test.mjs`.

Sono candidati riusabili, non attestati come verdi. Controllare guardrail/effetti di ogni script prima dell'esecuzione e annotare se un test confronta sorgente anziché comportamento. Aggiungere contratti dove il piano non è coperto, senza snapshot che codificano soltanto l'implementazione nuova.

## Criteri di uscita

Zero differenze business non approvate nei contratti esistenti; nuove funzionalità conformi a specifica e ownership; admin/staff invariati; API mai in cache; nessun bug bloccante mobile/accessibilità; budget media verificato. Ogni esito deve riportare PASS/FAIL/NOT RUN, commit, fixture e ambiente. Difetti preesistenti e decisioni ambigue tracciati separatamente. Nessuna autorizzazione a deploy è implicita nel superamento dei test.
