# Contenuti Padelleria — Stage 1

Implementazione locale del 25 settembre 2026. Un CMS amministrativo per `succede` ed `e_successo`, senza collegamento alla Home pubblica e senza modifiche ai flussi League, Store, Moviback, autenticazione o PWA. L'approvazione visiva dell'utente resta da effettuare.

## Semantica congelata

- `succede`: visibile se pubblicato, non eliminato e `visible_from <= now <= visible_until`; entrambi gli estremi sono opzionali. L'estremo finale è incluso. Senza fine non scade.
- `e_successo`: archivio pubblicato senza scadenza automatica. Le finestre di visibilità devono essere nulle. Nascondi riporta in bozza; Elimina effettua soft delete.
- Testo semplice, nessun HTML interpretato; CTA interna o HTTPS validata. Nessuna nuova logica commerciale.
- Date persistite come timestamptz UTC, editor in Europe/Rome. Conversione con Intl; date impossibili e ore ambigue/inesistenti nei cambi DST rifiutate esplicitamente. Il campo consente secondi: il 6 gennaio completo termina alle 23:59:59 locali.

## Schema e migrazione

`supabase/migrations/20261005100000_padelleria_contents.sql` aggiunge:

| Tabella | Campi principali |
| --- | --- |
| padelleria_contents | id, kind, status, title, excerpt, body, featured, sort_order, cta_label, cta_url, occurred_at, visible_from, visible_until, published_at, created_at, updated_at, deleted_at |
| padelleria_content_media | id, content_id, media_type, role, storage_path, external_url, caption, sort_order, created_at, deleted_at |

Constraint per tipo/stato, lunghezze, finestre, CTA e media; FK, indici per lettura, un'unica copertina attiva. Trigger per pubblicazione/aggiornamento, proprietà immutabile dei media e massimo 30 allegati. RPC per lettura pubblica con clock DB e riordino atomico della lista completa dei media. Aggiornamento testo con controllo ottimistico `updated_at` (409 se obsoleto).

La sola migrazione editoriale è stata applicata al DB locale tramite psql, senza riprodurre migrazioni estranee. Questa esecuzione manuale non registra una versione in `supabase_migrations.schema_migrations`; non eseguire un push globale per allinearla. Il runner rifiuta una seconda applicazione se la tabella esiste.

## Storage e media

Bucket privato `padelleria-content-media`; PNG/JPEG/WebP fino a 5 MiB, controllo MIME e firma binaria, percorso generato `<content UUID>/<media UUID>.<estensione>`. Non si accettano percorsi arbitrari dal client. Raccomandazione editoriale 1600×900, minimo consigliato 960×540; nessun resize automatico. Un cover, gallery ordinata e video esterni YouTube/Vimeo normalizzati; nessun download server dei video, embed soltanto al clic e link alternativo.

Il server carica i media in batch e genera URL firmati di 300 secondi. Nessuna policy di scrittura diretta del bucket per anon/authenticated. Eliminazioni di contenuti/media logiche: gli oggetti restano conservati, senza cancellazioni arbitrarie. Un URL già firmato può funzionare fino alla sua scadenza anche dopo Nascondi/Elimina. La pulizia fisica futura richiede una procedura dedicata. Solo un upload fallito viene ripulito, usando il percorso appena generato dal server.

## Workflow amministrativo

Dashboard → Contenuti Padelleria. Lista paginata (12), filtri per tipo/stato, copertina, finestra, evidenza e ordine; azioni Modifica, Anteprima, Pubblica/Nascondi, Elimina con conferma. L'editor salva prima il contenuto, poi allega media. I media sono salvati immediatamente e riordinabili; per sostituire la copertina rimuovere quella corrente. Le modifiche testuali non salvate hanno avviso di uscita e anteprima separata. Nessun campo club aggiunto in assenza di un modello condiviso sicuro.

L'anteprima amministrativa mostra testo, CTA, immagini, gallery e video senza rappresentare il redesign finale della Home.

## API e sicurezza

- `/api/admin/padelleria`: GET lista, POST creazione.
- `/api/admin/padelleria/[id]`: GET dettaglio, PUT modifica, DELETE soft delete.
- `/api/admin/padelleria/[id]/media`: POST upload/video, PATCH riordino completo, DELETE per ID media appartenente al contenuto.
- `/api/padelleria`: GET pubblica; `kind=succede|e_successo` opzionale, `limit` 1–50, `offset` 0–10000. Ordine featured desc, sort_order asc, published_at desc, id. Media caricati con query unica e firma batch; risposte no-store.

Guard admin esistente, staff escluso; controllo Origin sulle mutazioni quando presente, sessione HttpOnly/SameSite esistente. RLS concede ad anon/authenticated soltanto letture di contenuti e media eleggibili; niente scritture dirette. RPC operative riservate a service_role. La chiave service resta server-side. Validazione CTA, video canonici e testo escapato; nessuna richiesta server verso URL inseriti dall'utente. Le API pubbliche non restituiscono storage_path. Limiti su body, paginazione, file e numero media.

## Avvio e verifica locale

Usare esclusivamente `node scripts/padelleria-local.mjs <modalità>` dalla root. Il runner verifica progetto non collegato e target esatti API 127.0.0.1:55021, DB 55022, Studio 55023, Mailpit 55024. Costruisce un ambiente consentito esplicito con chiavi locali ottenute da Supabase status e segreti di test. Il wrapper Next neutralizza il caricamento dei valori `.env` (la CLI può comunque elencare il nome `.env.local` nel banner). Non usare direttamente `npm run dev` con il file ambiente corrente.

Modalità: `check`, `migrate` (una volta), `sql-test`, `fixtures`, `api-test`, `dev`, `build`, `start`. Avvio ispezionabile: `node scripts/padelleria-local.mjs dev`, porta 3100. La build ripristina gli artefatti PWA ai byte precedenti.

Fixture idempotenti soltanto locali: 3 giorni Fluo (4–6 gennaio 2027, fine inclusiva 23:59:59 Roma), Partner MOVI senza fine, Open Day Junior in archivio con gallery/video, bozza. Sono esempi sintetici con immagini segnaposto già presenti nel repository, copiate nel bucket locale. Utente amministrativo sintetico `padelleria-admin@example.invalid`, password `Padelleria-Local-2026!`.

URL sul PC:

- Login: http://localhost:3100/admin/login
- Lista: http://localhost:3100/admin/padelleria
- Nuovo: http://localhost:3100/admin/padelleria/nuovo
- Modifica: http://localhost:3100/admin/padelleria/eded2000-0000-4000-8000-000000000003
- Anteprima: http://localhost:3100/admin/padelleria/eded2000-0000-4000-8000-000000000003/preview
- Lettura pubblica: http://localhost:3100/api/padelleria

## Risultati di verifica

- Tutti i test `supabase/tests/*contract.test.mjs`: 210/210, inclusi 6 nuovi casi editoriali (visibilità, DST, validazione, media e limiti).
- `padelleria_contents.sql`: PASS, transazione annullata; vincoli, RLS, confini inclusivi, ordine, lifecycle e storage privato.
- `padelleria_http_acceptance.mjs`: 26 verifiche PASS; ruoli anon/utente/staff, CRUD, pubblicazione, media, RLS, URL, file, isolamento e conflitti. Pulizia dati e oggetti generati dal test.
- Browser Edge/Playwright con rete limitata a loopback: login, lista e immagini caricate, creazione dall'editor, anteprima non salvata, anteprima archivio, layout mobile senza overflow. Contenuto temporaneo del browser eliminato logicamente. Video esterno non caricato durante il test.
- TypeScript senza emissione PASS; ESLint mirato senza errori (un warning no-img preesistente nella dashboard); production build PASS, 150 pagine. Warning preesistenti themeColor e Browserslist.
- `git diff --check` PASS. Artefatti PWA ripristinati; configurazione API NetworkOnly e worker `caches.delete("apis")` invariati. Config Supabase, fixture Home, branding e runbook auth preesistenti preservati.

Le verifiche sui moduli preesistenti sono test di contratto, non un collaudo runtime completo di League/Store/Moviback. La Home non consuma ancora queste API. La futura integrazione deve riusare la lettura eleggibile server-side senza duplicare finestre, bypassare RLS o introdurre cache API offline. L'accettazione visiva spetta all'utente.
