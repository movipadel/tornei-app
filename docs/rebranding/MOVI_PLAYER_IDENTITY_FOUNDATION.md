# MOVI Player Identity Foundation — Stage 5B.1

## Perimetro

Identità sportiva permanente distinta da Auth e `public.users`: Auth → account canonico → Player Identity → domini sportivi. Il profilo di gioco, i livelli MOVI, le preferenze e il matching non sono implementati. Le attività restano nelle fonti attuali.

Tre migrazioni additive, applicate solo al DB locale tramite il runner, senza registrarle come rollout remoto né riprodurre altre migrazioni:

- `20261009100000_player_identity_foundation.sql`: tabelle, normalizzazioni, circuiti, merge e protezioni account.
- `20261009110000_player_identity_admin_commands.sql`: comandi Admin, revisione e storico delle evidenze.
- `20261009120000_player_identity_key_merge_guard.sql`: correzione atomica delle chiavi legacy con protezione delle identità certificate.

## Identità, account e normalizzazioni

`player_identities`: UUID, full_name, normalized_phone, genere M/F nullable, account_user_id nullable, stato active/archived/merged, canonico e timestamp. Nome e telefono sono il minimo; nessuna email anagrafica modificabile, codice umano, foto o note operative.

Telefono normalizzato con `normalize_user_mobile_e164`, come Auth2. Nome normalizzato conservativamente con trim, spazi compattati e lowercase: niente fuzzy matching. La normalizzazione telefonica non certifica il possesso del numero.

`account_user_id` univoco e FK restrittiva: massimo un'identità per account e un account per identità, anche se archiviata. Accountless è uno stato permanente valido. Link consentito solo verso account active. Il caso concettuale “due account già sullo stesso UUID sportivo” non è rappresentabile con questa relazione 1:1; ripetere il medesimo collegamento è idempotente.

Il comando di collegamento automatico verifica telefono e nome; in presenza di evidenza email certificata verifica invece telefono ed email. Ambiguità, numeri condivisi, account occupati o dati discordanti aprono casi e non creano collegamenti. Un'evidenza proveniente dalla stessa identità Auth candidata non è accettata come prova indipendente per un nuovo link.

`player_identity_email_evidence` è privata. Il comando service/Admin di certificazione accetta un riferimento a un account Auth verificato già collegato, non un testo email arbitrario. Conserva evidenza storica; non serve a giustificare circolarmente lo stesso nuovo link. Non è esposto come campo editabile nella UI. Le evidenze degli alias restano consultabili attraverso il canonico.

Nome/telefono/genere possono essere corretti da Admin senza cambiare automaticamente account o credenziali. Le mutazioni richiedono l'updated_at letto: una schermata obsoleta non sovrascrive silenziosamente una correzione concorrente.

## Bridge circuito e ciclo P1/P2

`circuit_results.player_identity_id` è nullable. player_key, nome, telefono, punti, piazzamento e gruppi restano presenti. `player_identity_identifiers` conserva un riferimento alla sorgente stabile (tappa + iscrizione + lato P1/P2, oppure partecipante run), vecchia chiave e snapshot identitario. La chiave telefonica non è globalmente univoca. Gli identificatori conservano anche il riferimento all'identità sorgente quando viene unita.

L'endpoint run/close mantiene il proprio calcolo sportivo e passa i risultati alla RPC `player_identity_materialize_circuit`. La RPC, sotto lock e transazione:

1. verifica torneo circuito, run, categoria/livello e sorgenti;
2. trova il partecipante P1/P2 o Baraonda;
3. riusa l'identità certificata oppure una corrispondenza non ambigua nome/telefono;
4. crea una nuova identità solo se necessaria per quel risultato e con dati sufficienti;
5. mantiene il genere disponibile;
6. lascia l'UUID nullo e apre un caso quando la sorgente è insufficiente/ambigua;
7. sostituisce i risultati e chiude run/iscrizioni atomicamente.

Le iscrizioni generiche non creano identità. P2 può creare un'identità senza account. Per P1 l'eventuale user_id viene risolto al canonico, ma usato per il link solo se nome/telefono dello snapshot sono coerenti. Non si assume che tutti gli user_id storici provino P1. Nei run Baraonda dove manca user_id si conserva prudentemente l'identità accountless.

La richiusura riusa il riferimento sorgente, non il volatile UUID della riga risultato. La decisione Admin su una sorgente invariata sopravvive alla cancellazione/reinserimento dei risultati. Se cambia la sorgente si apre una nuova revisione dello stesso caso. La risoluzione controlla anche lo snapshot corrente dell'iscrizione/partecipante: una decisione stale viene rifiutata.

La RPC serializza le mutazioni identitarie con un advisory lock globale. È una scelta conservativa per il volume attuale, non una soluzione per throughput elevati. I calcoli avvengono nell'endpoint preesistente: questo stage non riscrive i motori torneo.

## Classifiche e vecchie chiavi

Aggregazione Admin per player_key e pubblica per nome invariate. Nessun nuovo motore punti, nessuna migrazione del ranking all'UUID. Il test HTTP confronta entrambi i ranking prima/dopo la rimaterializzazione.

La vecchia correzione merge-player-keys passa a una RPC atomica che mantiene le operazioni di correzione legacy, ma blocca chiavi collegate a UUID sportivi diversi, creando un caso. Le correzioni sono registrate nel journal. Per le sorgenti torneo null la ricerca della collisione usa confronto null-safe, evitando di trattare NULL come un UUID passato a PostgREST. Questo è un dettaglio della correzione manuale, non una modifica del ranking.

## Merge e archiviazione

Sporting merge: anteprima con fingerprint, conferma esplicita, lock, canonico active. Account distinti, risultati nella stessa tappa/gruppo e roster sovrapposti bloccano il merge. Nessuna somma/deduplica implicita dei risultati in conflitto. I collegamenti sicuri vengono spostati; sorgente conservata come merged, riferimenti legacy conservati e azione registrata. Nessun merge Auth implicito.

Auth2: wrapper additivi mantengono i controlli precedenti di preview/esecuzione; le vecchie implementazioni rinominate non sono invocabili direttamente da service_role. Un trigger sulla transizione account→merged trasferisce l'unico link sportivo al canonico o blocca due identità diverse. La preview apre il relativo caso correttivo. Le nuove associazioni partecipano al fingerprint.

Nessuna identità può essere cancellata dal normale workflow; le merged non sono modificabili/riattivabili e non possono creare cicli. Archive conserva account e storico; exclude dai suggerimenti e dalla ricerca active. Unarchive è esplicito. Le attività personali possono continuare a leggere i risultati delle identità archiviate.

## Casi correttivi e unica UI

`player_identity_cases` è separata dai gruppi Auth2. Tipi: sporting_duplicate, ambiguous_account_link, circuit_identity_ambiguity, league_identity_confirmation, identity_data_conflict, sporting_merge_conflict. Stati open/in_review/resolved/rejected/superseded.

Chiave di deduplicazione stabile tipo+fonte+riferimento; evidenza, candidati, account, versione, decisione e Admin. La ripetizione senza variazioni non duplica casi. I cambiamenti di evidenza/decisione conservano prima/dopo nel journal append-only `player_identity_events`.

La pagina `/admin/users/duplicates` contiene la sezione sportiva e quella Auth preesistente, sotto il titolo “Duplicati e identità da verificare”. La riconciliazione Auth non tratta casi sportivi. Ricerca limitata a 100 risultati, per nome/telefono/UUID account/stato; casi recenti fino a 100. Il limite è esplicito: per code maggiori servirà paginazione prima del rollout.

Admin può creare/correggere identità, archiviare, verificare il collegamento account, ispezionare casi, confermare circuito/League, respingere, visualizzare preview e fondere identità sicure. La selezione di una nuova identità si effettua creando prima l'anagrafica e poi riaprendo il caso. I conflitti di fusione non hanno un pulsante di bypass: richiedono correzione dei dati/collegamenti o una futura procedura specifica.

## Monday League

`league_player_identity_links` associa un UUID roster a un UUID sportivo, con Admin, data e caso. I nomi roster, captain_player_id, formazioni e risultati non vengono modificati. FK restrittive impediscono di cancellare silenziosamente un roster già certificato.

“Verifica roster League” scandisce fino a 500 membri attivi non associati e propone casi/candidati per nome normalizzato. Nessuna conferma automatica per nome. La conferma Admin ricontrolla updated_at del roster e l'eventuale account già assegnato. La mappa persiste per lo stesso UUID roster; un nuovo record richiede nuova conferma. Nessuna scansione automatica nascosta nei normali comandi League.

## Attività personali

Il compositore legge le identità collegate alla famiglia account certificata. Un player_identity_id presente prevale sulle chiavi: un risultato certificato a un'altra identità non può essere acquisito per una coincidenza telefonica. Per righe senza UUID resta il fallback prudente precedente.

Posizioni e punti continuano a provenire dal ranking pubblico per nome. Omonimi o più nomi che rendono inaffidabile l'attribuzione mantengono “Classifica personale da verificare”. I dati di correzione non vengono esposti all'utente.

## Sicurezza

RLS su tutte le nuove tabelle, nessun accesso diretto anon/authenticated. API e funzioni sensibili service-only, search_path fissato, guardAdmin e verifica Admin attivo nel DB, allowlist del payload e controllo Origin sulle mutazioni. Nessuna API di scrittura utente Stage 5B.1. I player_id ricevuti dall'Admin sono scelte di revisione autorizzate, non prove di proprietà di un utente.

Audit immutabile per merge, link, creazione e decisioni. Dati email e casi restano privati. La futura UI profilo userà DTO propri e non esporrà queste tabelle direttamente.

### Risoluzione di due account durante una fusione sportiva

La scelta dell'anagrafica sportiva e la scelta dell'account sono decisioni distinte. Differenze di nome, telefono o genere non bloccano la fusione: restano i dati dell'identità sportiva scelta dall'Admin. Se entrambe le identità hanno account diversi, il caso passa `in_review`, conserva coppia, scelta, versione e fingerprint e apre il gruppo della coda duplicati account.

L'account viene unito esclusivamente dal motore Auth2 esistente. Un ponte transazionale riconosce solo un caso sportivo esplicitamente preparato e l'account scelto dall'Admin; durante l'unione Auth libera il collegamento dell'account sorgente, registra l'evento e mantiene il caso sportivo aperto. Il caso viene poi riletto, rivalidato e completato con una nuova anteprima. Collisioni di risultati o roster restano bloccanti.

## Fixture e accesso locale

Solo runner verificato: API 127.0.0.1:55021, DB 55022, Studio 55023, Mailpit 55024, Next localhost:3100, Supabase unlinked. `.env.local` repository non usato dal wrapper Next. Nessuna chiamata Telegram live.

Prerequisiti: schema locale e fixture Stage 1–4 esistenti. Comandi:

```powershell
node scripts/padelleria-local.mjs check
node scripts/padelleria-local.mjs identity-migrate
node scripts/padelleria-local.mjs identity-fixtures
node scripts/padelleria-local.mjs identity-sql-test
node scripts/padelleria-local.mjs identity-api-test
node scripts/padelleria-local.mjs identity-analyze
node scripts/padelleria-local.mjs dev
```

`identity-migrate` applica anche il ponte di risoluzione account su un database nuovo e si ferma se la fondazione esiste già. Non reimposta il DB.

Login Admin: http://localhost:3100/admin/login

Email `padelleria-admin@example.invalid`, password `Padelleria-Local-2026!`.

Revisione: http://localhost:3100/admin/users/duplicates

Circuito demo: http://localhost:3100/circuiti/circuito-identita-demo

Attività: http://localhost:3100/le-mie-attivita ; login utente http://localhost:3100/accedi con `requests-demo-1@example.invalid` / `Requests-Local-2026!`.

Namespace fixture efee*: account collegato, P2 senza account, due gruppi per la stessa identità, archiviata, merged/canonica, omonimi ambigui, League da confermare e già confermata, conflitto account e merge con un solo link, autolink deterministico. Il merge sicuro è eseguito nei test con rollback, mantenendo la coppia demo ispezionabile. È presente una nuova richiesta Allenati ricevuta di regressione; nessuna vecchia richiesta viene riportata a uno stato precedente.

## Backfill e Stage 5B.2

L'analyzer è esclusivamente locale e read-only; distingue righe già collegate, candidati deterministici verso identità esistenti, revisioni e dati intenzionalmente irrisolti. Non ha opzione apply. Soglia massima 900 righe/identità: oltre soglia fallisce esplicitamente. Non ricostruisce un telefono affidabile dal solo player_key.

Nessun backfill reale o produzione. Un futuro job richiederà inventario, dry-run revisionato, snapshot delle sorgenti, lotti idempotenti e report delle righe lasciate scollegate. La completezza non è un criterio per forzare collegamenti.

Stage 5B.2 potrà aggiungere un profilo opzionale 1:1 all'UUID sportivo, mantenendo separati preferenze condivise, livello MOVI e dati Admin. Nessuno di questi campi è anticipato qui.

## Verifica e limiti

Test mirati SQL: vincoli 1:1, archive/alias/cicli, matching nome/telefono ed email indipendente, link occupati, reclose, P2, decisione circuito persistente, blocco chiavi conflittuali, collisioni sportive, mapping League, merge account e privilegi. Tutti i dati di prova SQL sono annullati tramite rollback.

HTTP: autenticazione, ricerca/stati/casi, protezione scritture, preview, equivalenza ranking pubblico/Admin, attività certificate, fallback legacy, omonimia e smoke degli altri domini. Test Node verificano anche la precedenza negativa dell'UUID certificato sul telefono.

Risultati: 223 test Node passati; 24 suite SQL passate (Auth2, duplicati/merge, League, richieste, attività, Padelleria, Partner e identità). HTTP Player Identity: 26 controlli, inclusi endpoint reale run/close, richiusura e due rimaterializzazioni concorrenti; attività 26, richieste 23, Padelleria 26, Partner 28. Passate anche le due suite HTTP Auth2 legacy cutover e unified onboarding. La prima esecuzione attività rilevava una fixture Allenati non più received: copertura ripristinata con una nuova richiesta dedicata, senza modificare gli stati precedenti.

Browser Edge locale: identità collegate/accountless, archiviate, casi e anteprima merge; mobile 390 px senza overflow. L'accettazione visiva finale resta dell'utente: le verifiche automatiche browser non costituiscono approvazione.

TypeScript ed ESLint del codice nuovo passati. Sui file integrati nessun nuovo diagnostico; run/close conserva 7 errori no-explicit-any e 1 warning preesistenti. La migrazione della vecchia correzione chiavi a RPC elimina i suoi 5 errori lint precedenti. Nessuna correzione fuori perimetro per azzerare il lint legacy.

Build di produzione completata con successo; restano gli avvisi preesistenti themeColor/Browserslist. Asset PWA generati ripristinati ai byte precedenti alla build. Verificati GET /api/** NetworkOnly e caches.delete("apis") nel worker personalizzato. git diff --check passato.

Nessun cambiamento ai file protetti, icone PWA, algoritmi ranking o configurazione locale. Nessun accesso alla produzione, commit, push o deploy.
