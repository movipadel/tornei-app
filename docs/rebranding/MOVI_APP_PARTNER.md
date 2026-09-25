# Partner MOVI — Stage 2

Implementazione locale, 25 settembre 2026. Directory di vantaggi con gestione amministrativa, immagini e lettura pubblica. Il cliente legge il vantaggio, si reca nell'attività e mostra la tessera MOVI; il Partner applica lo sconto manualmente. Nessun QR, controllo automatico della tessera, accesso Partner, coupon, transazione o tracciamento redemption.

## Schema

Migrazione additiva `supabase/migrations/20261006100000_movi_partners.sql`. Una sola tabella `public.movi_partners`:

| Gruppo | Colonne |
| --- | --- |
| Identità | id UUID, name, slug univoco, category |
| Editoriale | short_description, full_description, benefit_title, benefit_description, conditions |
| Media | logo_path, cover_path nullable |
| Contatti | website_url, contact_url, phone, address, locality |
| Visibilità | status draft/active/inactive, valid_from, valid_until, featured, sort_order |
| Audit | created_at, updated_at, deleted_at |

Categorie controllate: Ristorazione, Sport, Benessere, Abbigliamento, Servizi, Altro. Slug ASCII minuscolo con trattini; unicità mantenuta anche dopo soft delete. Indici per stato/ordinamento, validità e cancellazione. Trigger aggiorna updated_at; PUT usa controllo ottimistico della versione e restituisce 409 in caso di conflitto. Non sono introdotte tabelle commerciali.

La migrazione è stata applicata soltanto al DB locale mediante psql e non è stata registrata nella tabella della migration history. Il runner impedisce di ripeterla quando lo schema esiste. Nessun push globale di migrazioni è stato eseguito.

## Validità e timezone

Eligibile se active, deleted_at nullo, valid_from nullo o già raggiunto, valid_until nullo o non ancora superato. Entrambi i confini sono inclusivi; senza fine il vantaggio permane fino alla disattivazione. Nessun cron. La funzione SQL usa statement_timestamp(), anche per le API pubbliche.

Date timestamptz UTC; input/display Europe/Rome, secondi inclusi. Riutilizzati i convertitori Padelleria: le ore inesistenti o ambigue al cambio DST vengono rifiutate. Per l'intera giornata, impostare fine alle 23:59:59. La finestra invertita è rifiutata da API e DB.

## Media e cancellazione

Bucket privato dedicato `movi-partners-media`. Logo e copertina soltanto, nessuna gallery. JPEG/PNG/WebP fino a 5 MiB; verifica MIME/firma binaria, limite richiesta e percorso generato server `<partner UUID>/<image UUID>.<estensione>`, vincolato anche nel DB. Logo quadrato/trasparente consigliato; cover 1200×1200 consigliata, nessuna trasformazione automatica.

Scrittura esclusivamente server/admin. Lettura tramite URL firmati per 300 secondi, creati in un'unica chiamata per pagina; i DTO non espongono i percorsi. Sostituzione e rimozione disassociano l'immagine conservando l'oggetto precedente. Elimina imposta deleted_at e inactive, mantenendo riga e media nel DB/storage per audit; le normali viste admin escludono gli eliminati. Non esiste un'interfaccia di recupero in questo Stage. Gli URL già firmati restano validi fino a scadenza. Una pulizia fisica futura richiede una procedura dedicata. In caso di conflitto dopo upload viene rimosso soltanto il nuovo percorso generato dal server.

## Admin e anteprima

Nuova card Partner MOVI nella dashboard esistente, senza redesign. Lista paginata da 12, filtri Tutti/Attivi/Bozze/Inattivi, logo, categoria, vantaggio, validità, evidenza e ordine. Attivi indica lo stato editoriale: un attivo futuro/scaduto è segnalato come fuori validità. Azioni Modifica, Attiva/Disattiva, Elimina con conferma, Anteprima.

Editor completo con generazione esplicita dello slug, date e Nessuna scadenza. Prima si salva il Partner, poi si caricano le immagini, persistite immediatamente. Avviso modifiche testuali non salvate. Anteprima delle modifiche o della versione salvata con logo, cover, descrizioni, beneficio, condizioni, contatti, validità e «Mostra la tua tessera MOVI». Nessuna relazione tecnica alla tessera.

## API e sicurezza

- GET/POST `/api/admin/partners`: lista amministrativa/creazione.
- GET/PUT/DELETE `/api/admin/partners/[id]`: dettaglio, modifica con updated_at, soft delete.
- POST/DELETE `/api/admin/partners/[id]/media`: upload per role logo/cover, rimozione per solo role; percorsi di cancellazione arbitrari rifiutati.
- GET `/api/partners?limit=12&offset=0`: directory eleggibile.
- GET `/api/partners/[slug]`: dettaglio eleggibile, 404 per bozze/inattivi/futuri/scaduti/eliminati.

Ordine featured desc, sort_order asc, name asc, id asc. Limit 1–50, offset 0–10000; parametri fuori intervallo rifiutati. Una query DB e una firma batch immagini, nessun N+1. Risposte no-store. La lettura pubblica usa una RPC limitata, service-only, con filtro temporale nel DB. RLS permette ad anon/authenticated soltanto SELECT eleggibili; nessuna scrittura. Nessuna policy di scrittura pubblica sul bucket.

Guard admin e sessioni esistenti riutilizzati, staff escluso; controllo Origin per mutazioni quando presente. HTML visualizzato come testo React; link solo HTTPS senza credenziali, telefono validato. Nessun fetch server degli URL inseriti e nessuna chiave service nel browser. Nessuna modifica ad Auth o alle regole delle altre aree.

## Ambiente e comandi locali

Usare il runner `scripts/padelleria-local.mjs`, che verifica progetto non collegato, API 127.0.0.1:55021, DB 55022, Studio 55023, Mailpit 55024. L'ambiente viene costruito con le chiavi locali, senza utilizzare i valori di `.env.local`. Non lanciare direttamente Next con l'ambiente di repository. Il wrapper Next esistente resta invariato.

```text
node scripts/padelleria-local.mjs check
node scripts/padelleria-local.mjs partners-migrate
node scripts/padelleria-local.mjs partners-fixtures
node scripts/padelleria-local.mjs partners-sql-test
node scripts/padelleria-local.mjs partners-api-test
node scripts/padelleria-local.mjs dev
node scripts/padelleria-local.mjs build
node scripts/padelleria-local.mjs start
```

`partners-migrate` è una tantum; il test HTTP richiede il server locale e l'admin di prova Stage 1. Fixture separate dalle migrazioni: MÀSE Demo permanente, Sport Shop Demo temporaneo (da ieri a 30 giorni dopo la generazione), Partner Bozza Demo e Partner Inattivo Demo. Testi/offerte sintetici e immagini segnaposto già presenti nel repository, copiate nel nuovo bucket; nessun dato reale di produzione. La rigenerazione fixture ripristina i valori demo.

Login sintetico Stage 1 riutilizzato: `padelleria-admin@example.invalid` / `Padelleria-Local-2026!`.

- Login: http://localhost:3100/admin/login
- Lista: http://localhost:3100/admin/partners
- Nuovo: http://localhost:3100/admin/partners/nuovo
- Modifica: http://localhost:3100/admin/partners/eded4000-0000-4000-8000-000000000001
- Anteprima: http://localhost:3100/admin/partners/eded4000-0000-4000-8000-000000000001/preview
- API lista: http://localhost:3100/api/partners
- API dettaglio: http://localhost:3100/api/partners/mase-demo

## Verifiche

- 213 test Node di contratto passati, inclusi tre nuovi Partner (validazione, matrice temporale/confini e DST).
- SQL Partner transazionale con rollback: bozze/inattivi, permanente, futuro, temporaneo, scaduto, eliminato, unicità slug, ordinamento, confini, percorsi, RLS e bucket privato.
- 28 controlli HTTP Partner: ruoli, CRUD, slug duplicato, logo/cover, MIME invalido, bucket privato, URL/percorso, lettura lista/dettaglio, finestre, inattivi, limiti e conflitti.
- Regressione Padelleria: 26 controlli HTTP e suite SQL passati.
- Browser Edge/Playwright con rete limitata al loopback: lista, creazione, anteprima non salvata e salvata, immagini caricate, mobile 390px senza overflow. Il Partner temporaneo del browser è stato eliminato logicamente.
- TypeScript senza emissione, lint mirato, build di produzione (152 pagine) e diff check passati. Lint conserva un warning img preesistente nella dashboard; build conserva warning preesistenti metadata/themeColor e Browserslist.

I test di contratto sulle altre aree non equivalgono a un collaudo end-to-end completo. Auth, Padelleria, MoviBack, Store, tornei, Monday League, Home e PWA non sono stati modificati. Artefatti PWA generati ripristinati ai byte precedenti; API NetworkOnly e cancellazione cache `apis` nel worker restano invariati. Config, runbook, branding e fixture Home preesistenti sono esclusi dall'intervento.

## Integrazione futura

La futura directory e pagina dettaglio rebranded possono consumare i DTO pubblici e la copy universale della tessera. Devono rispettare eleggibilità DB, limiti e durata degli URL immagini, senza aggiungere verifiche automatiche o redemption. Nessuna UI pubblica definitiva implementata in questo Stage. L'accettazione visiva è dell'utente, da effettuare su localhost prima di qualsiasi commit/push/deploy.
