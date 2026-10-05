# MOVI — Le mie attività, Stage 4

## Scopo e architettura

Pagina funzionale `/le-mie-attivita`, composizione server da fonti autorevoli attraverso `GET /api/user/activities`. Nessuna tabella attività, copia dei dati di business, modifica delle regole di iscrizione, annullamento, ranking o League. Grafica provvisoria con componenti e CSS esistenti. L'approvazione visiva dell'utente su localhost resta da acquisire.

La migrazione `20261008100000_movi_activity_read_scope.sql` aggiunge esclusivamente tre helper di lettura invoker, accessibili a `service_role`: normalizzazione telefono, scope identità e iscrizioni personali. È stata applicata direttamente al solo DB locale tramite il runner, senza aggiornare la cronologia delle migrazioni Supabase o riprodurre altre migrazioni. Nessuna migrazione su ambienti remoti.

## Fonti e regole delle schede

| Fonte | In programma | Storico |
| --- | --- | --- |
| `movi_requests` Gioca/Allenati | received, searching, found | completed, cancelled |
| `tournament_registrations`, `tournaments` | iscrizioni e riserve personali, data oggi/futura, torneo non chiuso né completato | solo partecipazione provata in run completed |
| Monday League | roster personale attivo e incontri futuri dalla proiezione pubblica esistente | risultati confirmed/special, data durante la permanenza nel roster |
| Circuiti e `circuit_ranking_groups`/`circuit_results` | una scheda per gruppo del circuito active | gruppi del circuito closed |

Il modello pubblico finale espone esclusivamente **In programma** e **Storico**. La precedente scheda **Da completare** è stata rimossa perché era un placeholder sempre vuoto: nessuna fonte certifica oggi un'azione personale obbligatoria. Richieste semplicemente ricevute, certificati medici o compiti inventati non vengono riclassificati. Lo stato vuoto di In programma propone Trova una partita, Allenati e Vedi i tornei.

Gioca/Allenati riusano etichette e DTO certificati. Mostrano club, flessibilità/data, fascia oraria, tipo partita/allenamento e obiettivo. `Vedi richiesta` apre `/le-mie-attivita/richiesta/[id]`, il cui endpoint restituisce solo il DTO utente. Annulla richiama esclusivamente il preesistente `POST /api/user/requests/[id]/cancel`; nessuna nuova logica di mutazione. Una richiesta appartenente a un alias è leggibile ma non annullabile attraverso questa pagina se il proprietario non è l'ID canonico, coerentemente con il controllo del vecchio endpoint.

I tornei vengono deduplicati per ID torneo, preferendo l'iscrizione principale alla riserva. Una semplice iscrizione vecchia non prova la partecipazione: lo storico richiede un run `completed` e una corrispondenza in `tournament_run_participants` oppure `tournament_run_pairs`. Gli oggetti eliminati non superano il join al torneo; lo schema corrente non dispone di un distinto flag torneo nascosto. Lo storico non riapre tornei passati nell'area normale. Il collegamento `/tornei?tournament=[id]` porta il focus alla scheda nella lista pubblica già esistente, senza ampliarne la visibilità o aprire automaticamente il modulo di iscrizione. Verificato nel browser anche il focus effettivo.

Monday League riusa `getPublicLeagueSnapshot`, incluse selezione della stagione pubblica pubblicata, fasi e risultati. Non calcola nuove classifiche o esiti e non espone stagioni nascoste. Il collegamento apre `/monday-league`. Lo scope è la stagione selezionata dal modello pubblico corrente, non un archivio completo di tutte le stagioni. Le partite senza data affidabile o senza collegamento temporale al roster non entrano nello storico.

## Circuiti: categoria, livello e identità

Il circuito è un contenitore; `classification_id` identifica il gruppo categoria/livello. Lo stesso utente può avere più schede dello stesso circuito. Il link `/circuiti/[slug]?group=[id]` seleziona solo un gruppo effettivamente restituito dalla API pubblica.

L'algoritmo già presente nella API pubblica è estratto senza variazioni in `buildPublicCircuitRanking`, richiamato sia dalla API circuiti sia dal compositore. Aggregazione per nome esatto ripulito, somma punti, conteggio risultati, ordinamento punti decrescenti e nome italiano crescente, posizione sequenziale: nessun motore alternativo. Il conteggio delle tappe mantiene la semantica del contatore pubblico, senza introdurre un distinto conteggio eventi.

La corrispondenza personale usa le chiavi telefono certificate. Se la famiglia identitaria ha più nomi nella stessa classifica, oppure lo stesso nome appartiene anche ad altre chiavi, posizione/punti/tappe sono null e si mostra “Classifica personale da verificare”. Non attribuiamo punti di un omonimo e non fondiamo nomi alterando il ranking pubblico.

La prossima tappa è il primo torneo futuro non chiuso dello stesso circuito e categoria/livello. Circuiti active restano In programma anche senza prossima tappa. Circuiti closed vanno nello storico, senza data di chiusura inventata.

## DTO e API

`Activity` contiene id con prefisso tipo, type, source_id, tab, title, subtitle, status, status_label, date, club, category, level, primary_meta, secondary_meta, cta_label, cta_href, can_cancel e sort_at. Per i circuiti: classification_id, position, points, events_played. I tipi realmente prodotti sono Gioca, Allenati, Torneo, Monday League e Circuito; nessun adapter prenotazioni è implementato.

`GET /api/user/activities?tab=upcoming|history&limit=12&offset=0`: limite 1–50, offset 0–10000; deduplicazione e ordinamento globale prima della paginazione, `has_more` per proseguire. In programma crescente, storico decrescente, ID come spareggio stabile. Attività senza data alla fine di In programma; circuiti conclusi senza data alla fine dello storico. Offset non è uno snapshot: aggiornamenti concorrenti possono spostare le pagine. Il vecchio valore `action` non aveva consumatori o dati reali ed è ora rifiutato come parametro non valido.

Identità esclusivamente da `getCurrentMoviUser`, ID canonico attivo e alias certificati active; il parametro browser user_id è rifiutato. 401 senza login, 409 conflitto identità, 400 parametri invalidi, 503 fonte indisponibile/oltre soglia. Risposte `Cache-Control: no-store`. Nessun telefono, chiave ranking, nota admin o metadato Telegram nel DTO.

Le chiavi telefono seguono la normalizzazione circuiti esistente. Un numero condiviso con un profilo esterno alla famiglia non autorizza letture personali tramite quel numero; rimangono valide le relazioni esplicite user_id. Alias pending/revoked esclusi. Le funzioni SQL non sono eseguibili da anon/authenticated.

## Query, limiti e deduplicazione

Scope identità massimo 50 profili. Prima fase in parallelo: richieste, iscrizioni, roster, risultati personali. Run e partecipazioni sono caricati per insiemi; circuiti, gruppi, risultati completi e prossime tappe sono caricati per insiemi. Nessuna query per singola scheda.

Ogni sorgente ordinaria ha un limite di 500 righe più sentinella. Risultati delle classifiche rilevanti: 900 più sentinella, inferiore al limite PostgREST locale di 1000. Oltre soglia si restituisce 503 invece di una classifica troncata o un successo parziale. Questo è un limite esplicito dell'implementazione attuale: per volumi superiori occorrerà paginare internamente le fonti o introdurre una lettura SQL aggregata equivalente.

La League riusa la snapshot pubblica esistente; al massimo tre snapshot, una per fase pertinente (numero limitato dal modello corrente), mai una per partita. La dimensione della League segue i vincoli esistenti.

ID finali: richiesta per ID richiesta, torneo per ID torneo, League per ID partita, circuito per ID gruppo. Alias e membri di coppia non duplicano le schede. Richieste distinte restano distinte: non si fondono in base al testo.

## Ambiente locale e fixture

Usare esclusivamente `scripts/padelleria-local.mjs` e `scripts/padelleria-next-local.cjs`: API 127.0.0.1:55421, DB 55422, Studio 55423, Mailpit 55424, progetto unlinked. Il runner scavalca i file env repository (il `.env.local` contiene riferimenti produzione) e disabilita il trasporto Telegram. L'etichetta `.env.local` eventualmente stampata da Next non cambia il caricamento isolato predisposto dal wrapper.

Prerequisiti: schema e fixture locali degli Stage 1–3 già presenti. Poi:

```powershell
node scripts/padelleria-local.mjs activities-migrate
node scripts/padelleria-local.mjs activities-fixtures
node scripts/padelleria-local.mjs dev
```

Le fixture sono esclusivamente sintetiche, con ID dedicati edee*. Riutilizzano l'utente richieste demo dello Stage 3 e creano un torneo futuro iscritto, un torneo passato con partecipazione certificata, Gioca concluso, due classifiche PadelSeries (Maschile/intermedio: 1° e 820; Misto/avanzato: 2° e 430), una stagione League pubblica e una prossima partita. Le date dei tornei sono relative al momento della fixture. Gioca searching, Allenati received e Allenati completed sono mantenuti dalle fixture richieste precedenti. La seconda identità demo è l'avversario League: può quindi vedere legittimamente la stessa partita.

La stagione demo, pubblicata adesso, diventa quella selezionata dal modello pubblico locale. Non modifica le altre stagioni. I test che nascondono temporaneamente stagione/circuito o creano duplicati ripristinano le sole righe fixture in finally.

Login: http://localhost:3100/accedi

Email: `requests-demo-1@example.invalid`

Password locale: `Requests-Local-2026!`

Pagina: http://localhost:3100/le-mie-attivita

Classifiche: http://localhost:3100/circuiti/padelseries-demo-attivita

League: http://localhost:3100/monday-league

## Verifica

Eseguiti: 221 test Node dei contratti (inclusi tre nuovi), SQL attività/identità/privilegi con rollback, 26 controlli HTTP attività; regressioni richieste 23, Padelleria 26, Partner 28 e relativi SQL. Smoke autenticati su tornei, circuiti, Monday League, Auth, MoviBack, Store e comunicazioni, oltre ai contratti esistenti. Non equivale a ripetere manualmente ogni flusso amministrativo dei sistemi congelati.

La verifica HTTP confronta posizioni/punti/tappe con la API pubblica, controlla isolamento tra utenti, assenza campi riservati, deduplica, paginazione, circuito draft/closed e stagione nascosta. La UI finale usa le viste In programma/Storico e mantiene classifiche, selezione del gruppo e dettaglio richiesta. L'accettazione visiva finale resta dell'utente.

TypeScript `--noEmit --incremental false` e build produzione locale passati. ESLint del codice nuovo passato. Nei tre file legacy integrati permangono 8 errori no-explicit-any e 5 warning preesistenti; confronto con HEAD: nessun nuovo diagnostico. La build segnala warning preesistenti themeColor/Browserslist.

Il runner build ripristina gli asset PWA ai byte precedenti. `GET /api/**` resta NetworkOnly e il worker personalizzato mantiene `caches.delete("apis")`. Icone di installazione non modificate. Nessun accesso produzione, commit, push o deploy.

## File dello Stage 4

- `src/lib/activities.ts`, `activitiesServer.ts`, `circuitPublicRanking.ts`
- `src/app/api/user/activities/route.ts`, `request/[id]/route.ts`
- `src/app/le-mie-attivita/page.tsx`, `richiesta/[id]/page.tsx`, `Detail.tsx`
- Integrazioni minime: `src/app/api/circuits/[slug]/route.ts`, `src/app/circuiti/[slug]/page.tsx`, `src/app/tornei/page.tsx`
- Runner: `scripts/padelleria-local.mjs`
- Migrazione: `supabase/migrations/20261008100000_movi_activity_read_scope.sql`
- Test: `supabase/tests/activities.sql`, `activities_contract.test.mjs`, `activities_http_acceptance.mjs`
- Fixture: `supabase/tests/fixtures/activities.local.mjs`, `activities-league.local.sql`
- Questo documento.

File protetti e modifiche preesistenti lasciati invariati: `supabase/config.toml`, runbook Auth produzione, fixture home sections e `public/branding/`.
