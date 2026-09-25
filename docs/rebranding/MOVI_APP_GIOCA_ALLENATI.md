# Gioca / Allenati — Stage 3

Fondazione funzionale locale del 25 settembre 2026. Gioca e Allenati sono richieste a MOVI: il personale organizza manualmente e ricontatta il cliente. Non sono prenotazioni confermate né matchmaking automatico. Nessuna Home rebranded o pagina definitiva «Le mie attività» introdotta.

## Moduli e club

Entrambi i moduli raccolgono uno o più club oppure Indifferente, Oggi/Domani/Scegli giorno/Sono flessibile, fascia oraria, orario preferito facoltativo, livello e note. Fasce: Mattina, Pausa pranzo, Pomeriggio, Sera 18:30–23:00, Indifferente. Sono etichette operative, non orari prenotati.

Gioca aggiunge tipo partita Maschile/Femminile/Misto/Indifferente e presenza del compagno. Allenati aggiunge lezione individuale/di coppia/gruppo/consiglio MOVI e obiettivo. Livelli principiante/intermedio/avanzato coerenti con i tornei, con Non saprei al posto di Open, che nel torneo rappresenta una categoria e non l'autovalutazione richiesta qui.

È stata verificata la struttura esistente: `league_venues` contiene tre sedi specifiche Monday League, mentre Prenota e i tornei usano liste locali. Non esiste un'anagrafica condivisa completa sicura dei cinque club. La nuova lista controllata in `moviRequests.ts`, validata anche nel DB, comprende Revello, Saluzzo, Manta, Costigliole, Centallo. Array vuoto significa Indifferente; input libero e duplicati sono rifiutati dalle API. Nessuna modifica alle sedi League o alle pagine esistenti.

## Schema e migrazione

`supabase/migrations/20261007100000_movi_requests.sql` aggiunge una sola tabella `public.movi_requests`:

| Gruppo | Colonne |
| --- | --- |
| Identità | id UUID, user_id FK users.id, client_request_id, request_type |
| Preferenze | clubs, date_mode, requested_date, time_window, preferred_time_text, level |
| Gioca | match_type, has_partner |
| Allenati | training_type, training_goal |
| Gestione | status, notes, admin_notes, created_at, updated_at, cancelled_at, found_at, completed_at |
| Avviso | telegram_state, telegram_attempted_at, telegram_notified_at, telegram_error |

Unicità `(user_id, client_request_id)` impedisce duplicati per retry/doppio invio della stessa richiesta. Il browser genera una chiave per compilazione; il server assegna sempre user_id tramite il resolver esistente. Nessuna creazione utenti o modifica identità nel flusso richieste. Le sole fixture creano utenti sintetici locali.

Indici su utente+data, stato+data e tipo+data; paginazione 1–50, offset massimo 10000, ordine created_at desc/id. Query admin contatti in batch, senza N+1. La migrazione è stata applicata singolarmente tramite psql al DB locale, senza replay di altre migrazioni e senza registrazione automatica nella migration history. Non eseguire un push globale per allinearla.

## Stato, annullamento e storico

| Stato | Testo utente | Passaggi admin consentiti |
| --- | --- | --- |
| received | Richiesta ricevuta | searching, cancelled |
| searching | MOVI sta cercando | found, cancelled |
| found | Trovato | completed, cancelled |
| completed | Conclusa | nessuno |
| cancelled | Annullata | nessuno |

L'utente può annullare soltanto received/searching. Per found deve contattare MOVI; l'admin può annullare found come gestione manuale esplicita. Nessuna riapertura o salto arbitrario. Trigger DB e API validano il lifecycle; timestamp generati dal DB all'ingresso nello stato e preservati negli aggiornamenti successivi. PATCH admin usa updated_at per impedire sovrascritture concorrenti. Annullamento utente atomico condizionato da user_id e stato. Nessuna cancellazione fisica nel prodotto; storico conservato.

## Identità, privacy e RLS

Riutilizzato `getCurrentMoviUser`: Auth 2.0 e legacy risolvono entrambi `public.users.id`; sessione assente → 401, conflitto → 409. user_id/stato/note admin nel payload di creazione vengono rifiutati. I filtri owner sono applicati dal server a lettura e annullamento. Admin guard esistente, staff escluso.

RLS abilitata con accesso diretto anon/authenticated revocato: letture e scritture degli utenti passano esclusivamente dalle API con resolver Auth/legacy. È una scelta esplicita per proteggere anche note interne e metadati Telegram, senza introdurre un secondo mapping identità nelle policy SQL. Service role soltanto server-side. I DTO utente sono allowlist: niente user_id, contatti altrui, admin_notes, chiavi idempotenza o metadati Telegram. Nessun endpoint anonimo espone richieste. Origin verificato per mutazioni quando presente; testo reso come testo React, limiti ed enum validati.

Telefono in admin/Telegram coerente con il modello operativo già usato dalle notifiche MoviBack (nome e telefono al personale). Nessun contatto di altri utenti nelle risposte personali.

## Telegram

Riutilizzati `src/lib/telegram.ts`, TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID. Il helper esistente accetta un'opzione `safe` usata solo dal nuovo flusso: timeout di 8 secondi e log provider generico. I chiamanti esistenti mantengono il comportamento precedente.

Ordine: insert richiesta → claim atomico dell'avviso → invio → registrazione esito. Messaggio testuale operativo con tipo, nome, telefono, club, data/fascia, livello, preferenze, note e ID. Nessun parse_mode HTML. Il DB è la fonte autorevole: errore o timeout non annulla la creazione. Esito failed con codice generico send_failed; nessun token o risposta provider salvata. Errori di bookkeeping generano solo un warning generico e lasciano la riga recuperabile dalla coda.

Retry admin: claim riservato al service role, almeno 60 secondi tra tentativi; non reinvia dopo esito sent e non invia su richieste cancelled/completed. Una claim sending interrotta è recuperabile dopo 60 secondi. Non è una garanzia exactly-once: se Telegram riceve il messaggio ma la risposta o la registrazione DB fallisce, un retry può duplicare l'avviso. Nessun cron/worker aggiunto.

### Sicurezza locale

Il runner costruisce un ambiente pulito, esclude credenziali Telegram e imposta `MOVI_REQUEST_TELEGRAM_MODE=disabled`. Il helper richieste forza comunque disabled quando Supabase è esattamente `http://127.0.0.1:55021`; eventuali credenziali Telegram presenti in tale ambiente producono config_blocked senza inviare. L'avviso locale risulta disabled, notified_at resta nullo, la richiesta è regolarmente ricevuta. Il flag locale associato a URL non locale blocca il trasporto. Nessun messaggio reale è stato inviato durante i test.

## API e UI

- POST `/api/user/requests`: creazione autenticata, 201; retry idempotente 200.
- GET `/api/user/requests`: sole richieste proprie, paginazione limitata.
- POST `/api/user/requests/[id]/cancel`: annullamento proprio eleggibile; 404 per ID estraneo, 409 per stato non cancellabile.
- GET `/api/admin/requests?type=gioca&status=received`: coda filtrabile.
- GET/PATCH `/api/admin/requests/[id]`: dettaglio e gestione stato/nota interna.
- POST `/api/admin/requests/[id]/telegram`: tentativo di retry, esito visibile ricaricando il dettaglio.

Risposte no-store. Card nuova nella dashboard, stile corrente riutilizzato. Coda con tutti i filtri del brief, utente, tipo, preferenze, livello, stato e data; dettaglio con contatto, nota e retry. Moduli utente neutrali su percorsi dedicati, conferme testuali richieste, elenco personale minimo con annullamento e storico. Nessun nuovo link nella Home definitiva.

## Timezone e futura attività

Timestamp UTC/timestamptz; visualizzazione Europe/Rome. requested_date è un `date` senza conversione a mezzanotte UTC. Oggi/Domani vengono risolti sul giorno di Roma al momento dell'invio e mantenuti, con date_mode esplicito. Flexible ha data nulla. Data specifica valida e non nel passato al momento della creazione; DST e passaggio di mezzanotte testati.

DTO pronto per un aggregatore futuro: id, activity_type, status/status_label, created_at, summary, can_cancel, section e preferenze. section è un'indicazione operativa: pending per ricevuta/ricerca, upcoming per trovata, history per conclusa/annullata; non certifica una prenotazione. Il futuro aggregatore «Le mie attività» potrà unire tornei, Monday League e prenotazioni con namespace per tipo, mantenendo le rispettive autorizzazioni, senza cambiare questa tabella.

## Avvio locale e fixture

Usare `scripts/padelleria-local.mjs`, che controlla progetto unlinked, API 55021, DB 55022, Studio 55023, Mailpit 55024 su 127.0.0.1. I valori di `.env.local` non vengono usati; il banner Next può comunque elencarne il nome. Non avviare Next direttamente con quel file ambiente.

```text
node scripts/padelleria-local.mjs check
node scripts/padelleria-local.mjs requests-migrate
node scripts/padelleria-local.mjs requests-fixtures
node scripts/padelleria-local.mjs requests-sql-test
node scripts/padelleria-local.mjs requests-api-test
node scripts/padelleria-local.mjs dev
node scripts/padelleria-local.mjs build
```

Migrazione una sola volta; test HTTP con server già avviato. Fixture separate dalle migrazioni: Gioca received/searching/found, Allenati received/completed e richiesta cancelled. Due utenti Auth sintetici; nessun dato produzione. Fixture già esistenti non vengono resettate, per preservare le prove manuali. Le due richieste create dal browser di verifica sono state annullate e rimangono nello storico locale.

Login utente: `requests-demo-1@example.invalid` / `Requests-Local-2026!` (secondo utente `requests-demo-2@example.invalid`, stessa password). Admin locale Stage 1: `padelleria-admin@example.invalid` / `Padelleria-Local-2026!`.

- Login utente: http://localhost:3100/accedi
- Gioca: http://localhost:3100/richieste/gioca
- Allenati: http://localhost:3100/richieste/allenati
- Conferma: visibile nello stesso URL dopo invio autenticato.
- Richieste proprie: http://localhost:3100/richieste
- Login admin: http://localhost:3100/admin/login
- Coda: http://localhost:3100/admin/requests
- Dettaglio/stato/retry: http://localhost:3100/admin/requests/eded7000-0000-4000-8000-000000000001

## Verifiche e limiti

218 test Node di contratto passati, inclusi validazione, date Roma/DST, DTO privacy e trasporto notifiche simulato. Suite SQL richieste transazionale con rollback: creazioni, lifecycle, timestamp, storico e accesso diretto negato. 23 controlli HTTP con Auth 2.0 e legacy, isolamento, idempotenza, annullamenti, admin, retry, limiti e RLS. Successo/errore Telegram simulati usando lo stesso helper di esito e righe DB locali persistite: non è un test live del provider.

Regressioni Padelleria: 26 controlli HTTP e SQL passati; Partner: 28 controlli HTTP e SQL passati. Auth, MoviBack, Store, tornei e Monday League coperti dai contratti esistenti e invariati nel codice; non è un collaudo end-to-end completo di tali aree. Il solo helper Telegram condiviso ha l'estensione opzionale descritta sopra.

Browser Edge/Playwright: moduli Gioca/Allenati, conferme, elenco proprio, coda admin e salvataggio nota verificati; layout mobile 390px senza overflow. Rete browser limitata al loopback. TypeScript senza emissione e lint mirato passati (un warning img preesistente nella dashboard). Build di produzione passata, 156 pagine, con i warning preesistenti themeColor/Browserslist. Diff check passato.

Nessuna accettazione visiva dichiarata per conto dell'utente. PWA mantiene GET /api/** NetworkOnly e worker caches.delete("apis"); artefatti generati ripristinati ai byte precedenti. Icone, manifest, branding, config Supabase, fixture Home e runbook preesistenti esclusi dall'intervento.
