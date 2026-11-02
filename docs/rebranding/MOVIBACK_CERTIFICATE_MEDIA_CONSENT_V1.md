# Certificati MoviBack, avvisi di scadenza e consenso media V1

## Revisione certificati

La coda Admin distingue la richiesta di membership dalla revisione di un certificato di una membership già approvata. Ogni azione porta gli ID espliciti di membership e certificato al database. Un certificato ancora in attesa può essere approvato soltanto se ha un file e la sua data di scadenza è almeno la data corrente del database. Il rifiuto richiede una motivazione. Un nuovo caricamento chiude come `superseded` l'eventuale certificato in attesa precedente; un indice univoco garantisce al massimo un certificato `pending_review` per utente.

Un certificato approvato resta valido nel giorno della scadenza. Dal giorno successivo inizia la tolleranza di 60 giorni, durante la quale tessera, accredito e riscatto restano disponibili. Dal giorno 61 l'accredito si sospende; tessera, saldo e riscatto restano disponibili. Questa tolleranza non autorizza l'approvazione di un certificato già scaduto.

## Avvisi

La scansione giornaliera usa il calendario `Europe/Rome` e crea eventi durevoli a 30 e 7 giorni prima della scadenza, al primo giorno di tolleranza e al giorno 61. Il worker email esistente gestisce preferenze, invio e retry; prima dell'invio verifica che il certificato sia ancora quello corrente e che il contenuto corrisponda ancora allo stato del cliente. La scansione non invia email direttamente. Il workflow GitHub è disabilitato finché la variabile di repository `MOVIBACK_CERTIFICATE_EXPIRY_ENABLED` non viene impostata a `true`; richiede inoltre il segreto cron già previsto dall'applicazione.

## Consenso per foto e video

Il consenso `recognizable_image_video_social_promotional` è facoltativo e separato da privacy, termini e marketing. Gli eventi `granted`, `not_granted` e `revoked` sono append-only. Lo stato corrente è l'evento più recente per data effettiva e ID, includendo la storia degli utenti confluiti in un account canonico. La concessione richiede la conferma 18+ già presente nel profilo. Un Admin può registrare un consenso raccolto offline solo con conferma esplicita e riferimento della prova o nota significativa. La revoca resta sempre disponibile.

Il consenso dei minori richiederà un progetto separato con stato del minore, identità e relazione del tutore, consenso del tutore e revoca del tutore. V1 non deduce l'età dal codice fiscale e non implementa un modello parziale per i tutori.

## Rilascio

La migrazione iniziale è stata divisa perché in produzione esistono quattro gruppi storici con più certificati `pending_review`: la bonifica richiede lo stato `superseded`, mentre l'indice univoco può essere creato solo dopo la bonifica. Nessuna migrazione contiene UPDATE di bonifica o sceglie automaticamente quale certificato conservare.

Ordine obbligatorio di rilascio:

1. **Fase A — abilita solo lo stato.** Applicare `20261102095000_moviback_certificate_superseded_status.sql`. Il file amplia soltanto il vincolo `medical_status_check` per accettare `superseded`; non crea ancora l'indice e non cambia i dati. Questo stato intermedio è intenzionale e temporaneo.
2. **Fase B — bonifica operativa separata.** Eseguire la transazione di remediation dei quattro gruppi solo con decisioni Admin approvate, ID espliciti, snapshot e verifiche. Gate: `MULTIPLE_PENDING_USERS = 0` e `UNIQUE_PENDING_INDEX_SAFE = YES`.
3. **Fase C — nuovo precheck completo.** Rieseguire in sola lettura `PRODUCTION_MOVIBACK_CERTIFICATE_HARDENING_PRECHECK.sql` e verificare tutte le condizioni di rilascio. Un precheck precedente alla bonifica non basta.
4. **Fase D — resto del rilascio.** Solo dopo il PASS applicare, in ordine: `20261102100000_moviback_certificate_review_hardening.sql`, `20261102110000_moviback_certificate_expiry_notifications.sql`, `20261102120000_user_media_consent_v1.sql`, `20261102130000_certificate_email_stale_delivery_guard.sql`, `20261102135318_harden_media_consent_append_only_privileges.sql`.

La migrazione `20261102100000` dipende quindi da `20261102095000` **e** dalla bonifica verificata: conserva trigger di sostituzione, funzioni di revisione e indice univoco, senza ridefinire il vincolo. Questa modifica è soltanto locale; non applica migrazioni, bonifica o configurazioni alla produzione.

Durante l'intervallo fra la bonifica e la creazione dell'indice mantenere in pausa gli scrittori di certificati: il precheck di cardinalità deve restare vero fino al commit della migrazione `20261102100000`.
