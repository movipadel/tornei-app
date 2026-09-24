# MOVI App — Nuove funzionalità e proposta dati minima

Stage 0 · 24 settembre 2026 · proposta logica, nessun DDL/migration o modifica schema eseguita.

## Base esistente e confini

Fonti: route e librerie elencate nell'audit; migrazioni locali consultate come sorgenti, nessuna introspezione DB. Riutilizzare `public.users.id`, risolto da `getCurrentMoviUser`/`getUserIdFromCookie`, mai `auth.users.id` passato dal client come proprietario. Membership già in `loyalty_memberships` (`membership_code`, `approved_at`, `created_at`); certificati in `medical_certificates`; saldo nel ledger; comunicazioni in architettura separata. `league_venues` è dominio League e non va assunto come anagrafica universale dei cinque club. Prenota ha oggi i cinque club nel codice.

I nomi sotto sono proposti, da verificare contro schema locale completo prima della futura migration. Non sovrascrivere tabelle o bucket omonimi. Nessuna duplicazione di iscrizioni, ordini, classifica, membership o storico punti.

## A. Richieste Gioca e Allenati

Un'unica famiglia di richieste con `kind=play|training`, validazione discriminata e campi specifici. Nessun matchmaking automatico o motore prenotazione.

| Entità proposta | Campi minimi e vincoli |
|---|---|
| `activity_requests` | id UUID PK; user_id FK users obbligatorio; kind; club_keys text[] non vuoto e deduplicato; date_mode today/tomorrow/date/flexible; requested_date date nullable; time_window morning/lunch/afternoon/evening/any; preferred_time time nullable; level text validato; match_type nullable; has_partner boolean nullable; training_activity individual/pair/group/advise nullable; objective text nullable; notes text nullable max proposto 2000; status received/searching/found/completed/cancelled; scheduled_at timestamptz nullable; created_at/updated_at; version intero; idempotency_key UUID |
| `activity_request_events` | id; request_id FK; from_status/to_status; actor_user_id nullable e riferimento attore operatore secondo sessione esistente; actor_kind user/operator/system; note interna opzionale; created_at; record append-only. Non inventare FK operatore su users se il sistema staff usa altra identità |
| `activity_notification_deliveries` | id; request_id; event_id; channel telegram; state pending/sending/sent/failed; attempts; next_attempt_at; locked_until; sent_at; provider_message_id opzionale; last_error redatto; chiave unica event_id+channel |

Unica request table evita due implementazioni e due storici. `club_keys` usa un vocabolario applicativo stabile revello/saluzzo/manta/costigliole/centallo; FK club rinviata finché non si verifica anagrafica condivisa. Non creare una tabella club solo per cinque label.

**Gioca:** club multipli; Oggi/Domani/Scegli giorno/Sono flessibile; Mattina/Pausa pranzo/Pomeriggio/Sera 18:30–23:00/Indifferente; orario preferito facoltativo; livello; tipo partita; partner sì/no; note opzionali. I limiti orari di mattina/pranzo/pomeriggio non definiti dal brief restano preferenze ampie, non slot prenotabili inventati. Vocaboli match_type da definire con owner prima della UI definitiva, senza derivarli dai tipi torneo.

**Allenati:** club multipli, data (stesso date picker/architettura), fascia ampia, lezione individuale/in coppia/allenamento gruppo/non so consigliatemi voi; livello, obiettivo, note. Validazione vieta campi Gioca incompatibili e richiede activity; eventuale flessibilità data riusa il modello ma non deve essere una regola commerciale implicita.

Oggi/Domani risolti server in Europe/Rome all'invio e salvati come date concrete; flexible ha requested_date null. preferred_time deve essere coerente con fascia sera se scelta. Controlli di lunghezza/tipo lato server, ownership mai dal body. Una unique `(user_id, idempotency_key)` con confronto hash payload permette replay coerente e conflitto per payload diverso.

### Stati e responsabilità proposti

| Stato interno | Label utente | Transizioni consentite |
|---|---|---|
| received | Richiesta ricevuta | operatore → searching/found/cancelled |
| searching | MOVI sta cercando | operatore → found/cancelled |
| found | Trovato | operatore → completed/cancelled; ritorno searching motivato se salta accordo |
| completed | Conclusa | Terminale nel MVP |
| cancelled | Annullata | Terminale nel MVP |

Utente può richiedere annullamento di received/searching; proposta da confermare prima della fase 3. Per found contatto staff, per evitare annullamento di un accordo senza coordinamento. Nessuna transizione automatica per solo trascorrere del tempo. Salvataggio request+evento+delivery atomico nella futura implementazione. Update concorrenti con version compare; retry non crea una seconda richiesta.

### Telegram e admin

Decisione proposta: **serve una lista admin**, con filtri kind/stato, dettaglio, cambio stato, note interne, azione contatto e stato consegna Telegram/retry. Senza lista e aggiornamento non sarebbe possibile mantenere gli stati utente approvati. Il DB resta fonte autorevole; Telegram è avviso, non archivio né superficie per comandi privilegiati.

Riutilizzare trasporto `src/lib/telegram.ts` e modello post-commit; per le nuove richieste aggiungere outbox durevole con retry/backoff proposto 1/5/30 minuti e limite 5 tentativi, poi gestione manuale. Un timeout ambiguo può duplicare un messaggio Telegram: usare request ID nel testo, non promettere exactly-once. Nessun reinvio della mutazione business. Niente certificati/dati sensibili nel messaggio: solo informazioni operative necessarie e link al dettaglio protetto. Nessun segreto in URL o client. Scheduler/worker futuro da decidere in implementazione, nessun cron creato qui.

Sezioni nuove per sole funzionalità, nessun redesign admin: Contenuti Padelleria, Partner, Gioca/Allenati. Accesso admin esistente inizialmente; estensione a staff richiede decisione esplicita, non ruolo implicito.

## B. Le mie attività

Route proposta `/attivita`, tabs In programma / Da completare / Storico. Read model server aggregato, nessuna tabella agenda che duplichi sorgenti. Envelope comune: `source`, `source_id`, `title`, `status_label`, `starts_at`, `club`, `action`, `detail_url`, `capabilities`; chiave `(source,source_id)`.

| Sorgente | Aggregazione proposta |
|---|---|
| Iscrizioni torneo | Leggere righe autorizzate e riconciliare associazioni legacy con criteri esistenti verificati; date future → In programma, passate ancora disponibili → Storico. Riserva esplicitata; non fare query globali dal client per nome |
| Monday League | Solo squadre/partite del contesto utente effettivo; appuntamenti → In programma, azioni capitano dovute → Da completare, disputate → Storico; nessuna ownership inferita |
| Gioca/Allenati | received/searching e found senza data concordata → Da completare con label “In gestione”; found con scheduled_at futuro → In programma; completed/cancelled → Storico. Data proposta dall'utente non equivale ad appuntamento confermato |
| Booking nativo futuro | Adapter successivo; oggi non importare eventi Wansport o simulare prenotazioni |

Escludere transazioni MoviBack, ordini Store e anagrafica. Ordine stabile per data e source/id; paginazione server. Esito parziale di una sorgente indicato, senza svuotare le altre. La cancellazione torneo distruttiva esistente non produce storico persistente: dichiarare limite, non cambiare cancellazione o aggiungere snapshot senza nuova approvazione.

## C. Partner

`partners`: id UUID, slug unique, name, category opzionale, description, benefit, conditions, logo_media_id, cover_media_id opzionale, contact/link fields validati, is_active, valid_from/valid_until date nullable, display_order integer, created_at/updated_at. Finestra valida se fine >= inizio; date di calendario Europe/Rome inclusive, query converte il giorno successivo a fine esclusiva. Attivo senza date non scade. Nessuna tabella redemption/partner validation.

Route proposta `/partner`: logo/immagine, nome, descrizione, beneficio/sconto, condizioni, validità se presente e contatto/link. Testo “Mostra la tessera MOVI” informativo. Cliente mostra la modale e paga al partner; nessuna verifica automatica o scanner partner. Admin gestisce campi, ordine e attivo/inattivo. Validità Partner e stato membership non vengono trasformati in un nuovo motore sconti Store.

## D. Contenuti Padelleria

Un'unica sezione admin con due destinazioni editoriali, distinta da comunicazioni/notifiche esistenti.

| Entità proposta | Campi |
|---|---|
| `padelleria_contents` | id UUID; slug unique; section upcoming/archive; type event/promo/launch/announcement/campaign/recap/gallery/video/result/opening/story; title; subtitle opzionale; excerpt; cover_media_id; body strutturato; cta_label/cta_url opzionali insieme; club_key opzionale; event_start/event_end opzionali; publication_status draft/published; published_at; visible_from/visible_until timestamptz nullable; featured boolean; display_order integer; created_at/updated_at |
| `padelleria_content_media` | content_id FK; media_id FK; role inline/gallery/video; position; caption opzionale; unique content_id+role+position |
| `public_media_assets` | id UUID; kind image/video_external; bucket/path per immagine oppure provider/external_url per video; width/height/mime/bytes; alt; focal_x/focal_y 0..1; poster_media_id opzionale; created_at; autore operatore secondo identità esistente |

Dettaglio proposto `/padelleria/[slug]`: titolo, sottotitolo/excerpt, cover, body formattato sanificato, immagini interne, gallery, video, CTA, club e data evento facoltativi. Blocchi ammessi invece di HTML arbitrario o iframe libero. URL interni relativi o HTTPS provider ammessi; niente javascript/data URL. Galley/video ereditano la visibilità del contenuto; bozze non esposte dai read endpoint pubblici.

**Succede:** pubblicato e `(visible_from null oppure <= now)` e `(visible_until null oppure now < visible_until)`. “Nessuna scadenza” è un controllo UI che salva null, non un booleano contraddittorio. featured e display_order ordinano, non scavalcano le finestre. Tie-break proposto display_order, published_at desc, id.

Evento 4–6 gennaio: editor imposta fine visibilità 7 gennaio ore 00:00 Europe/Rome, salvata come istante UTC; sparisce il 7 anche se utente non è in Italia. Data evento da sola non deve imporre scadenza a una promozione. Sponsor senza fine resta. Gestire DST tramite zona, non offset +01 fisso.

**È successo:** pubblicazione esplicita e nessuna scadenza automatica; `visible_until` deve restare null per archivio. Ammessa pubblicazione differita tramite visible_from. Nessun trasferimento automatico di un evento scaduto nell'archivio: serve recap editoriale selezionato dall'admin. In admin mostrare campi finestre per Succede e disabilitare fine per archivio.

Admin Contenuti: type/section, titolo, excerpt/sottotitolo, cover/body/gallery/video, CTA/link, club/date evento, draft/published, finestre/no expiry, featured, ordine. La preview draft non deve essere una route pubblica non protetta.

## E. Storage e autorizzazioni della proposta

Riutilizzare Supabase Storage e guardAdmin, non provider nuovo. Bucket correnti riscontrati: tournaments, store-images, reward-images, communication-images, monday-league-media. Certificati medici restano privati nel percorso attuale. Proposta minimo: un nuovo bucket media editoriale/partner per contenuti pubblici più staging privato delle bozze, oppure staging privato con copie pubblicate nello stesso modello già in uso. La scelta esatta dei bucket è un gate prima del DDL: un URL pubblico di bozza non deve diventare accessibile solo perché indovinato.

Asset statici di brand rimangono versionati; media amministrativi hanno UUID, originale e derivate. Validare MIME reale, dimensioni, peso, URL provider e rimuovere EXIF non necessario. Formati e limiti nel manifest. Non riusare bucket documenti sanitari.

Tabelle nuove con RLS deny-by-default: utente legge solo proprie richieste/eventi pubblicabili, mai note interne/delivery; insert/update via API con identità risolta server e controlli. Admin opera tramite guard attuale, chiave service role mai esposta. Contenuti/partner leggibili solo se pubblicabili; storage segue stessa separazione bozze/pubblicati. Indici proposti user_id+created_at, status+updated_at, next_attempt_at per delivery pending, section+publication_status+display_order, partner is_active+display_order. Nessun job di cancellazione automatica introdotto.

## F. Tessera e prenotazione

La mia tessera non richiede nuova tabella: nome da users, numero da membership_code, member since da approved_at se valido (altrimenti omesso), QR personale esistente, stato membership rispettato. Non esporre codice fiscale, certificato o token premio sulla tessera partner. Se serve un nuovo numero commerciale, è una decisione ulteriore, non parte del MVP.

Prenota conserva URL Wansport per club. Proposta frontend di confine `BookingAction(club)` che apre il link attuale; un futuro adapter nativo potrà sostituire il motore finale senza ridisegnare Home o scheda club. Nessuna tabella booking o integrazione Wansport nuova ora.

## Gate prima di implementare

Confermare vocabolario tipo partita, annullamento richieste, policy conservazione dati operativi e accesso staff; verificare schema/bucket reali solo dopo target guard; risolvere personalizzazione circuito e storico attività legacy senza alterare motori. Approvare migrations/RLS/storage separatamente. Nessun DDL eseguibile incluso e nessun invio Telegram effettuato in Stage 0.
